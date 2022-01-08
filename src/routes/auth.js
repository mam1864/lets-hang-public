// Reference: https://docs.microsoft.com/en-us/graph/tutorials/node
const router = require('express-promise-router')();
const graph = require('../graph');
const mongoose = require('mongoose');
const User = mongoose.model('User');

/* GET auth callback. */
router.get('/signin',
  async function (req, res) {
    const urlParameters = {
      scopes: ['user.read','calendars.readwrite','mailboxsettings.read'],
      redirectUri: process.env.OAUTH_REDIRECT_URI
    };

    try {
      const authUrl = await req.app.locals
        .msalClient.getAuthCodeUrl(urlParameters);
      res.redirect(authUrl);
    }
    catch (error) {
      console.log(`Error: ${error}`);
      req.flash('error_msg', {
        message: 'Error getting auth URL',
        debug: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
      res.redirect('/');
    }
  }
);

router.get('/callback',
  async function(req, res) {
    const tokenRequest = {
      code: req.query.code,
      scopes: ['user.read','calendars.readwrite','mailboxsettings.read'],
      redirectUri: process.env.OAUTH_REDIRECT_URI
    };

    try {
      console.log("Acquiring token...");
      const response = await req.app.locals
        .msalClient.acquireTokenByCode(tokenRequest);

      console.log(response);

      // Save the user's homeAccountId in their session
      req.session.userId = response.account.homeAccountId;

      const user = await graph.getUserDetails(
        req.app.locals.msalClient,
        req.session.userId
      );

      // Find the user in the db, add the user to mongodb if doesn't exist
      const found = await User.findOne({msid:response.account.homeAccountId});
      if (found) {
        console.log("Found user",found.username);
        req.session.user = found;
      }
      else {
        const newuser = new User({
          msid:response.account.homeAccountId,
          username:user.displayName,
          email: response.account.username,
          bio:'Bio goes here',
          img_url:'default.png',
          timeZone: response.account.timeZone,
          friends:[],
          pendingInbound:[],
          pendingOutbound:[],
          events:[]
        });
        const save = await newuser.save();
        if (save) {
          req.session.user = save;
        }
        else {
          console.log("Error saving user");
        }
      }
    } catch (error) {
      req.flash('error_msg', {
        message: 'Error completing authentication',
        debug: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
    }

    res.redirect('/');
  }
);

router.get('/signout',
  async function(req, res) {
    // Sign out
    if (req.session.userId) {
      // Look up the user's account in the cache
      const accounts = await req.app.locals.msalClient
        .getTokenCache()
        .getAllAccounts();

      const userAccount = accounts.find(a => a.homeAccountId === req.session.userId);

      // Remove the account
      if (userAccount) {
        req.app.locals.msalClient
          .getTokenCache()
          .removeAccount(userAccount);
      }
    }

    // Destroy the user's session
    req.session.destroy(function () {
      res.redirect('/');
    });
  }
);

module.exports = router;