'use strict';

var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    fs = require('fs'),
    bluemix = require('./config/bluemix'),
    watson = require('watson-developer-cloud'),
    extend = require('util')._extend,
    UAparser = require('ua-parser-js'),
    userAgentParser = new UAparser();

// setup express
require('./config/express')(app);


// Setup credentials - populate the url, username and password.
// if you're running on a local node.js environment

var STT_CREDENTIALS = {
    username: '1592a744-2885-47b8-a029-b2a942aa0d1c',
    password: 'OJFxHSIUCb5d',
    version:'v1'
};

// setup watson services
var speechToText = watson.speech_to_text(STT_CREDENTIALS);

// setup sockets
require('./config/socket')(io, speechToText);

// render index page
app.get('/', function(req, res){
    res.render('index');
});

// Start server
var port = (process.env.VCAP_APP_PORT || 3000);
server.listen(port);
console.log('listening at:', port);