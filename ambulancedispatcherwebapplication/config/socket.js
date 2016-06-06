'use strict';

module.exports = function(io, speechToText) {

	var sessions = {};
	var http = require('http');
	var request = require('request');

	// for better geocoding results
	var fixedGeocodingExtention = " London England";

	// settings for node-geocoder (https://www.npmjs.com/package/node-geocoder)
	var geocoderProvider = 'google';
	var geocoderHttpAdapter = 'http';
	// var geocoderProvider = 'openstreetmap';
	// var geocoderHttpAdapter = 'http';
	var geocoder = require('node-geocoder')(geocoderProvider,
			geocoderHttpAdapter);

	// settings for communication with RoutWebApp
	// TODO AJUST TO YOUR ENVIRONMENT!
	var routeWebAppCallURL = 'http://routewebapplication.mybluemix.net/postEmergencyPosition/';
	// var routeWebAppCallURL = 'http://localhost:9080/RouteWebApplication/postEmergencyPosition/';
	// END OF AJUSTMENT TO YOUR ENVIRONMENT!

	// Create a session on socket connection
	io.use(function(socket, next) {
		speechToText.createSession({}, function(err, session) {
			if (err) {
				next(new Error('The server could not create a session'));
			} else {
				sessions[socket.id] = session;
				sessions[socket.id].open = false;
				socket.emit('session', session.session_id);
				next();
			}
		});
	});

	var log = function(id) {
		return [ '[socket.id:', id,
				sessions[id] ? ('session:' + sessions[id].cookie_session) : '',
				']: ' ].join(' ');
	};

	var handle_watson_results = function(watresults) {
		console.log('results raw from watson:', watresults);
		var words = "";
		// use only last chunk of watson result (the other chunks contain
		// previous watson attempts):
		var tempResult = watresults.results[watresults["results"].length - 1];
		if (tempResult == null)
			return;
		var tempAlternatives = tempResult.alternatives;
		if (tempAlternatives == null)
			return;
		words = tempAlternatives[0].transcript;
		console.log('words from watson:', words, '\n');

		geocoder
				.geocode(
						words + fixedGeocodingExtention,
						function(error, results) {
							if (error) {
								console.log(error);
							} else {
								if (results[0]) {
									console.log("Address: ",
											results[0].formattedAddress,
											"GPS-Coordinates: ",
											results[0].latitude, " ",
											results[0].longitude);
									request
											.post(
													{
														headers : {
															'content-type' : 'application/json'
														},
														url : routeWebAppCallURL,
														body : JSON
																.stringify({
																	"latitude" : results[0].latitude,
																	"longitude" : results[0].longitude,
																	"emergencyID": -1
																})
													},
													function(error, response,
															body) {
														if (response.statusCode == 204) {
															console
																	.log("GPS-Coordinates send to "
																			+ routeWebAppCallURL);
														} else {
															console
																	.log('Error during the post request of the coordinates to '
																			+ routeWebAppCallURL);
															console.log(body);
														}
													});

								} else {
									console.log("Address: (?)");
								}
							}
						});
	}

	var observe_results = function(socket, recognize_end) {
		var session = sessions[socket.id];
		return function(err, chunk) {
			if (err) {
				console.log(log(socket.id), 'error:', err);
				socket.emit('onerror', {
					error : err
				});
				session.req.end();
				socket.disconnect();
			} else {
				var transcript = (chunk && chunk.results && chunk.results.length > 0);

				if (transcript && !recognize_end) {

					var tempResult = chunk.results[chunk["results"].length - 1];
					if (tempResult != null) {
						var tempAlternatives = tempResult.alternatives;
						if (tempAlternatives != null) {
							geocoder
									.geocode(
											tempAlternatives[0].transcript
													+ fixedGeocodingExtention,
											function(error, results) {
												var tempAddress;
												if (error) {
													console.log(error);
													tempAddress = "(?)";
												} else if (results[0]) {
													tempAddress = "  ("
															+ results[0].formattedAddress
															+ ")";
													console
															.log(
																	"Address: ",
																	results[0].formattedAddress,
																	"GPS-Coordinates: ",
																	results[0].latitude,
																	" ",
																	results[0].longitude);
												} else {
													tempAddress = "(?)";
												}
												tempAlternatives[0].transcript += tempAddress;
												socket.emit('message', chunk);
											});
						}
					} else {
						socket.emit('message', chunk);
					}
				}
				if (recognize_end) {
					handle_watson_results(chunk);
					socket.disconnect();
				}
			}
		};
	};

	io.on('connection', function(socket) {
		var session = sessions[socket.id];
		socket.on('message', function(data) {
			if (!session.open) {
				session.open = true;
				var payload = {
					session_id : session.session_id,
					cookie_session : session.cookie_session,
					content_type : 'audio/l16; rate=' + (data.rate || 48000),
					continuous : true,
					interim_results : true
				};
				// POST /recognize to send data in every message we get
				session.req = speechToText.recognizeLive(payload,
						observe_results(socket, true));
				// GET /observeResult to get live transcripts
				speechToText.observeResult(payload, observe_results(socket,
						false));

			} else if (data.disconnect) {
				// Client send disconnect message.
				// end the /recognize request
				session.req.end();
			} else {
				session.req.write(data.audio);
			}
		});

		// Delete the session on disconnect
		socket.on('disconnect', function() {
			speechToText.deleteSession(session, function() {
				delete sessions[socket.id];
				console.log(log(socket.id), 'delete_session');
			});
		});
	});

};