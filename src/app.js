// Michael Mironidis
// Reference for Azure AD auth + Microsoft graph code: https://docs.microsoft.com/en-us/graph/tutorials/node
require('dotenv').config();
const db = require('./db');
const authRouter = require('./routes/auth');
const calendarRouter = require('./routes/calendar');
const addDays = require('date-fns/addDays');
const formatISO = require('date-fns/formatISO');
const endOfYesterday = require('date-fns/endOfYesterday');
const zonedTimeToUtc = require('date-fns-tz/zonedTimeToUtc');
const iana = require('windows-iana');
const path = require('path');
const flash = require('connect-flash');
const msal = require('@azure/msal-node');
const express = require('express');
const session = require('express-session');
const fileUpload = require("express-fileupload");
const { body, validationResult } = require('express-validator');
const Handlebars = require('hbs');
const mongoose = require('mongoose');
const User = mongoose.model('User');
const hbs = require('hbs');
const parseISO = require('date-fns/parseISO');
const formatDate = require('date-fns/format');
const e = require('connect-flash');
const graph = require('./graph.js');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
app.set('socketio',io);

// MSAL config
const msalConfig = {
    auth: {
      clientId: process.env.OAUTH_CLIENT_ID,
      authority: process.env.OAUTH_AUTHORITY,
      clientSecret: process.env.OAUTH_CLIENT_SECRET
    },
    system: {
      loggerOptions: {
        loggerCallback(loglevel, message, containsPii) {
          console.log(message);
        },
        piiLoggingEnabled: false,
        logLevel: msal.LogLevel.Verbose,
      }
    }
};

// Create msal application object
app.locals.msalClient = new msal.ConfidentialClientApplication(msalConfig);

// Port
const PORT = process.env.PORT || 3000;

const sessionOptions = {
    secret: 'secret for signing session id',
    saveUninitialized: false,
    resave: false,
    unset: 'destroy'
};

app.set('view engine', 'hbs');
app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname,'static')));
app.use(flash());
app.use(session(sessionOptions));
app.use('/auth', authRouter);
app.use('/calendar', calendarRouter);
app.use(fileUpload());

// hbs helpers
hbs.registerHelper('eventDateTime', function(dateTime) {
    const date = parseISO(dateTime);
    return formatDate(date, 'M/d/yy h:mm a');
});
Handlebars.registerHelper('ifEquals', function(a, b, options) {
    return (a === b) ? options.fn(this) : options.inverse(this);
});


// Set up local vars for template layout
app.use(function(req, res, next) {
    // Read any flashed errors and save
    // in the response locals
    res.locals.error = req.flash('error_msg');
  
    // Check for simple error string and
    // convert to layout's expected format
    const errs = req.flash('error');
    for (const i in errs){
      res.locals.error.push({message: 'An error occurred', debug: errs[i]});
    }
  
    // Check for an authenticated user and load
    // into response locals
    if (req.session.userId) {

      User.find({msid: req.session.userId},(err,found) => {
          if (err) { console.log(err); }
          else if (found) {
                req.session.user = found;
            }
      });
    }
    next();
});

io.on('connect', socket => {
    console.log(socket.id, 'has just connected');
    socket.on('search', data => {
        if (data.content !== '') {
            const searchobj = {'$regex': data.content, '$options':'i'};
            User.find({username: searchobj}, (err, res) => {
                if (err) { console.log(err); }
                else {
                    socket.emit('search-result',{result: res});
                }
            })
            .limit(10); // limit to 10 results to save resources
        }
        else {
            socket.emit('search-result', {result: []});
        }
    });

    socket.on('send-request', async (data) => {
        console.log(data.from,"requests",data.to);
        const from = await User.findOne({msid:data.from});
        const to = await User.findOne({msid:data.to});
        from.pendingOutbound.push(data.to);
        to.pendingInbound.push(data.from);
        const savefrom = await from.save();
        const saveto = await to.save();
        socket.emit('sent-request');
    });

    socket.on('accept-request', async (data) => {
        console.log(data.from, "accepts", data.to, "'s request.");
        const from = await User.findOne({msid:data.from});
        const to = await User.findOne({msid:data.to});
        from.friends.push(data.to);
        to.friends.push(data.from);
        from.pendingInbound.splice(from.pendingInbound.indexOf(data.to),1);
        to.pendingOutbound.splice(to.pendingOutbound.indexOf(data.from),1);
        const savefrom = await from.save();
        const saveto = await to.save();
        socket.emit('accepted-request');
    });

    socket.on('check-already-added', async (data) => {
        if (data.to === data.from) {
            socket.emit('check-already-added-result', {result:true,details:"self"});
        }
        else {
            const from = await User.findOne({msid:data.from});
            const to = await User.findOne({msid:data.to});
            // if user already sent a request to this person
            if (from.pendingOutbound.includes(data.to)) {
                socket.emit('check-already-added-result', {details:"sent"});
            }
            // if user already received a request from this person
            else if (from.pendingInbound.includes(data.to)) {
                socket.emit('check-already-added-result', {details:"mutual"});
            }
            // if user is already friends with this person
            else if (from.friends.includes(data.to)) {
                socket.emit('check-already-added-result', {details:"friends"});
            }
            else {
                socket.emit('check-already-added-result', {details:"validrequest"});
            }
        }
    });

    socket.on('get-pending-requests', (data) => {
        User.findOne({msid:data.msid}, (err,found) => {
            if (err) { console.log(err); }
            else if (found) {
                User.find({msid: {$in: found.pendingInbound}}, (err, result) => {
                    if (err) { console.log(err); }
                    else {
                        socket.emit('pending-requests', {result: result});
                    }
                });
            }
            else {
                console.log("No user found");
            }
        });
    });

    socket.on('get-friends', (data) => {
        User.findOne({msid:data.msid}, (err,found) => {
            if (err) { console.log(err); }
            else if (found) {
                User.find({msid: {$in: found.friends}}, (err, result) => {
                    if (err) { console.log(err); }
                    else {
                        socket.emit('friends', {result: result});
                    }
                });
            }
            else {
                console.log("No user found");
            }
        });
    });

    socket.on('update-cal', async (data) => {
        try {
            // Get the user
            console.log(data.usermsid);
            const user = await User.findOne({msid:data.usermsid});
            if (!(user.timeZone)) {
                user.timeZone = "Eastern Standard Time"; // temporary to deal with acts w/o timezone
            }

            const timeZoneId = iana.findIana(user.timeZone)[0];

            const today = zonedTimeToUtc(endOfYesterday(new Date()), timeZoneId.valueOf());
            const weekEnd = addDays(today, 7);

            // Get the events
            const events = await graph.getCalendarView(
            app.locals.msalClient,
            user.msid,
            formatISO(today),
            formatISO(weekEnd),
            user.timeZone);

            console.log("Events.value",events.value);
            // Save the events to the user's events field in db
            user.events = events.value;
            const saved = await user.save();
            if (saved) { console.log("SAVED USER :)"); }
            socket.emit('updated-cal');
          } catch (err) {
            socket.emit('error_msg', {
                message: 'Could not fetch events',
                debug: JSON.stringify(err, Object.getOwnPropertyNames(err))
            });
          }
    });

    socket.on('get-events', async (data) => {
        try {
            const params = {
                active: { calendar: true },
                events: []
              };
    
            // Get the users
            console.log(data.msids);
            const users = await User.find({msid:{$in: data.msids}});
            users.forEach((user) => {
                console.log("Checking user", user.msid, "for events");
                user.events.map((event) => { // associate each event with their owner
                    event.msid = user.msid;
                });
                params.events.push(...user.events);
            });
            // sort events by datetime
            const sortedevents = params.events.sort((a,b) => b.start.dateTime < a.start.dateTime ? 1: -1);
            sortedevents.map((event) => { // make dates readable
                    event.start.dateTime = formatDate(parseISO(event.start.dateTime), 'M/d/yy h:mm a');
                    event.end.dateTime = formatDate(parseISO(event.end.dateTime), 'M/d/yy h:mm a');
            });

            params.events = sortedevents;
            socket.emit('send-calendars', params);
          } catch (err) {
            socket.emit('error_msg', {
                message: 'Could not fetch events',
                debug: JSON.stringify(err, Object.getOwnPropertyNames(err))
            });
          }
    });

});

// Routing 
app.get('/', (req,res) => {
    const obj = {};
    if (req.session.user) {
        console.log("Session found");
        obj.currentuser = req.session.user;
        obj.userId = req.session.userId;
    }
    res.render('index.hbs', obj);

});

app.get('/login', (req,res) => {
    const obj = {};
    res.render('login.hbs', obj);
});

app.get('/account', (req, res) => {
    const obj = {};
    if (req.session.user) {
        obj.currentuser = req.session.user;
        res.render('account.hbs', obj);
    }
    else {
        res.send("Invalid access to this page.");
    }
});

app.get('/friends', (req,res) => {
    const obj = {};
    if (req.session.user) {
        obj.currentuser = req.session.user;
        obj.userId = req.session.userId;
        res.render('friends.hbs', obj);
    }
    else {
        res.send("Invalid access to this page.");
    }
});

app.get('/editprofile', (req, res) => {
    const obj = {};
    if (req.session.user) {
        obj.currentuser = req.session.user;
        res.render('editprofile.hbs', obj);
    }
    else {
        res.send("Invalid access to this page.");
    }
});

app.post('/editprofile', [
    body('username').escape(),
    body('bio').escape(),
    body('username').notEmpty()
    ], (req,res) => {
    if (req.session.user) {        
        // Check if there are any errors with the form values
        const formErrors = validationResult(req);
        if (!formErrors.isEmpty()) {

            let invalidFields = '';
            formErrors.errors.forEach(error => {
                invalidFields += `${error.param},`;
            });

            const obj = {
                currentuser: req.session.user,
                message: `Invalid input in the following fields: ${invalidFields}`
            };
            return res.render('editprofile', obj);
        }
        
        User.findOne({msid:req.session.userId}, (err, found) => {
            if (err) { console.log(err); }
            if (req.body.username) {
                found.username = req.body.username;
            }
            if (req.body.bio) {
                found.bio = req.body.bio;
            }
            console.log("FILES",req.files);
            if (req.files) {
                const file = req.files.newpic;
                const ext = file.name.split('.');
                file.name = req.session.userId + 'profilepic.' + ext[1];
                const filepath = path.join(__dirname,"static","img",file.name);
                file.mv(filepath, (err) => {
                    if (err) { console.log(err); }
                    else {
                        found.img_url = file.name;
                        found.save((err,saved) => {
                            if (err) { console.log(err); }
                            else {
                                req.session.user = {
                                    username: saved.username,
                                    bio: saved.bio,
                                    img_url: saved.img_url,
                                    calendar_url: saved.calendar_url
                                };
                                res.redirect('/account');
                            }
                        });
                    }
                });
            }
            else {
                found.save((err,saved) => {
                    if (err) { console.log(err); }
                    else {
                        req.session.user = saved;
                        res.redirect('/account');
                    }
                });
            }
        });
    }
    else {
        res.send("Invalid access to this page");
    }
});

server.listen(PORT, () => console.log(`Server is listening on port ${PORT}...`));