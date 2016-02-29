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
var ctx = null;

// Get Hypothes.is highlights
exports.handler = function(event, context) {
  ctx = context;

  var url = config.apiUrl + '/search?user=' + config.username + '@hypothes.is&limit=' + config.limit;
  console.log('API request URL: ' + url);
  rest.get(url, { headers: { 'Authorization': 'Bearer ' + config.apiToken } })
  .on('success', function(result, response) {
    if (result.total) {
      console.log('Received ' + result.total + ' records from hypothes.is API response');
    } else {
      console.log('Missing or malformatted "total" value in hypothes.is API response');
    }

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
  })
  .on('fail',  handleError)
  .on('error', handleError); // error getting highlights JSON
};

// Handle HTTP or restler errors
function handleError(result, response) {
  if (result instanceof Error) {
    ctx.fail('Error: ' + result.message);
  } else {
    ctx.fail(response.statusCode + ' ' + response.statusMessage + ': ' + JSON.stringify(result));
  }
}

// Format quote object and send to SNS
function sendHighlightToSns(q) {
  // construct quote object
  var quote = {
    text: hypothesisText(q),
    link: null,
    createdAt: Date.parse(q.created),
    annotation: hypothesisAnnotationText(q),
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

// Parse the highlight JSON returning the user-supplied annotation text, if available
function hypothesisAnnotationText(j) {
  if (j && j.text) {
    return j.text;
  }
  return null;
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
