const mongoose = require('mongoose');
const path = require('path');

const User = new mongoose.Schema({
    msid: String, // id for linkage to msft acct
    username: String,
    email: String,
    bio: String,
    img_url: String,
    timeZone: String,
    friends: [String],
    pendingOutbound: [],
    pendingInbound: [],
    events: []
});

mongoose.model('User', User);

const password = process.env.MONGODB_PASS;
const uri = "mongodb+srv://app-user-01:"+password+"@finalprojcluster.ujm0k.mongodb.net/hangdb?retryWrites=true&w=majority";

mongoose.connect(uri);
const connection = mongoose.connection;
connection.once('open', () => {
    console.log("MongoDB database connection established successfully");
});