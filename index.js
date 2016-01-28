console.log('Loading function.');

// Load config
var config = require('./config.json');

// Load dependencies
var Promise = require('bluebird');
var rest = require('restler');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');
var sns = new AWS.SNS();
var publishQuoteToSns = Promise.promisify(sns.publish, {context: sns});

// Get Hypothes.is highlights
exports.handler = function(event, context) {

  // make GET request to app url and get cookies
  rest.get(config.appUrl).on('success', function(result, response) {
    var initialCookies = getCookiesFrom(response);
    var auth = { username: config.username, password: config.password };
    var xsrfToken = xsrfTokenFromCookies(initialCookies);

    // make POST request to login url with cookies and username password in body
    rest.postJson(config.appUrl + '?__formid__=login', auth, {
      headers: { cookie: initialCookies.join('; '),
                 'x-csrf-token': xsrfToken
               }
    }).on('success', function(result, response) {

      // make GET request to token url with cookies and assertion parameter to get auth token
      rest.get(config.apiUrl + '/token?assertion=' + xsrfToken, {
        headers: { cookie: initialCookies.join('; '),
                   'x-csrf-token': xsrfToken
                 }
      }).on('success', function(result, response) {

        // make GET request to API url to get highlights JSON
        var authToken = result;
        var url = config.apiUrl + '/search/?user=' + config.username + '@hypothes.is&limit=' + config.limit;
        rest.get(url, {
          headers: { 'X-Annotator-Auth-Token': authToken }
        }).on('success', function(result, response) {

          // send highlights to SNS
          var quoteCount = 0;
          Promise.each(result.rows, function(h) {
            quoteCount++;
            return sendHighlightToSns(h);
          }).then(function() {
            console.log('' + quoteCount + ' quote(s) published to SNS from hypothes.is');
            context.succeed();
          }).catch(function(error) {
            context.fail(error);
          });
        }).on('fail',  handleError)
          .on('error', handleError); // error getting highlights JSON
      }).on('fail',  handleError)
        .on('error', handleError);   // error getting auth token
    }).on('fail',  handleError)
      .on('error', handleError);     // error logging in
  }).on('fail',  handleError)
    .on('error', handleError);       // error in base URL request
}

// Handle HTTP or restler errors
function handleError(result, response) {
  if (result instanceof Error) {
    context.fail('Error: ' + result.message);
  } else {
    context.fail(response.statusCode + ' ' + response.statusMessage + ': ' + JSON.stringify(result));
  }
}

// Format quote object and send to SNS
function sendHighlightToSns(q) {
  // construct quote object
  var quote = {
    text: hypothesisText(q),
    link: null,
    createdAt: Date.parse(q.created),
    post: {
      title: hypothesisPostTitle(q),
      link: hypothesisPostLink(q),
      author: {
        name: hypothesisPostAuthorName(q),
        link: null
      },
      siteLink: null
    }
  };

  return publishQuoteToSns({Message: JSON.stringify(quote), TopicArn: config.snsArn});
}

// Returns xsrf token from cookie array
function xsrfTokenFromCookies(cookies) {
  var xsrfCookies = cookies.filter(function(el) {
    return el.match(/^XSRF-TOKEN=/);
  });

  var xsrfCookie = xsrfCookies[0];
  return xsrfCookie.split('=')[1];
}

// returns array of cookies from restler http response object
// e.g.
// [
//  '__cfduid=d0124397b23e0f5d660034a0f7a19e6a31454007106',
//  'session=776e29c48f17523b3e476b50984e3cc32a36e8fg'
// ]
function getCookiesFrom(httpResponse) {
  var cookies = [];
  if (httpResponse && httpResponse.headers && httpResponse.headers['set-cookie']) {
    for (var i = 0; i < httpResponse.headers['set-cookie'].length; i++) {
      cookies.push(httpResponse.headers['set-cookie'][i].split('; ')[0]);
    }
  }
  return cookies;
}

// Parse the highlight JSON returning the highlighted text, if available
function hypothesisText(j) {
  if (j.target && j.target[0] && j.target[0].selector) {
    var selector = j.target[0].selector;
    for (var i = 0; i < selector.length; i++) {
      if (selector[i].type === 'TextQuoteSelector') {
        return selector[i].exact;
      }
    }
  }
  return null;
}

// Parse the highlight JSON returning the post's title, if available
function hypothesisPostTitle(j) {
  if (j) {
    if (j.document) {
      if (j.document.title) {
        return j.document.title;
      } else if (j.document.facebook && j.document.facebook.title) {
        return j.document.facebook.title[0];
      }
    }
  }
  return null;
}

// Parse the highlight JSON returning the post's link, if available
function hypothesisPostLink(j) {
  if (j) {
    if (j.target && j.target[0] && j.target[0].source) {
      return j.target[0].source;
    }
  }
  return null;
}

// Parse the highlight JSON returning the post's author name, if available
function hypothesisPostAuthorName(j) {
  if (j) {
    if (j.document) {
      if (j.document.facebook && j.document.facebook.author) {
        return j.document.facebook.author[0];
      } else if (j.document.twitter && j.document.twitter.creator) {
        return j.document.twitter.creator[0];
      }
    }
  }
  return null;
}

// FOR TESTING LOCALLY
// var context = {
//   fail: function(msg) {
//     console.log('Error:');
//     console.log(msg);
//   },
//   succeed: function() {
//   }
// };
//
// exports.handler(null, context);
