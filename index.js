console.log('Loading function.');

// Load config
var config = require('./config.json');

// Load dependencies
var Promise = require('bluebird');
var rest = require('restler');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');
// var sns = new AWS.SNS();
// var publishQuoteToSns = Promise.promisify(sns.publish, {context: sns});

// Get Hypothes.is highlights
exports.handler = function(event, context) {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // curl -H "X-Annotator-Auth-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJpYXQiOjE0NTM5NjA0OTEsImF1ZCI6Imh0dHBzOi8vaHlwb3RoZXMuaXMiLCJleHAiOjE0NTM5NjQwOTEsInN1YiI6ImFjY3Q6Y3JjQGh5cG90aGVzLmlzIn0.PTXC2fXJP4sBX-kTCyT9Jj7nnnOFWlClsaOgrn8MFKI" \
  //      -H "x-csrf-token: 7aa99adb16a336574f0795879d12c08e93d2a46e" \
  //      "https://hypothes.is/api/search/?user=crc@hypothes.is"

  var url = 'https://hypothes.is/api/search/?user=' + config.user + '&limit=' + config.limit;
  rest.get(url, {
    headers: {
      'X-Annotator-Auth-Token': config.token,
      'x-csrf-token': config.csrf_token
    }
  }).on('success', function(data) {

    var quoteCount = 0;
    Promise.each(data.rows, function(q) {
      // construct quote object
      var quote = {
        text: hypothesisText(q),
        link: null,
        createdAt: Date.parse(q.created),
        post: {
          title: hypothesisPostTitle(q),
          link: q.target[0].source,
          author: {
            name: hypothesisPostAuthorName(q),
            link: null
          },
          siteLink: null
        }
      };

      quoteCount++;
      // return publishQuoteToSns({Message: JSON.stringify(quote), TopicArn: config.snsArn});
      console.log(JSON.stringify(quote, null, 2));

    }).then(function() {
      console.log('' + quoteCount + ' quote(s) published to SNS from hypothes.is');
      process.exit();
      context.succeed();
    }).catch(function(error) {
      console.log(error);
      context.fail();
    });
  });
};

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
var context = {
  fail: function(msg) {
    console.log('Error:');
    console.log(msg);
  },
  succeed: function(msg) {
    console.log(msg);
  }
};

exports.handler(null, context);
