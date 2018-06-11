'use strict';

const dgram  = require('dgram');
const socket = dgram.createSocket('udp4');

const EventEmitter = require('events').EventEmitter;

const request = {
	info:    Buffer.from('\xFF\xFF\xFF\xFFgetinfo\0', 'binary'),
	status:  Buffer.from('\xFF\xFF\xFF\xFFgetstatus\0', 'binary'),
	servers: Buffer.from('\xFF\xFF\xFF\xFFgetservers 26\0', 'binary'),
};
const response = {
	info:    Buffer.from('\xFF\xFF\xFF\xFFinfoResponse\x0A', 'binary'),
	status:  Buffer.from('\xFF\xFF\xFF\xFFstatusResponse\x0A', 'binary'),
	servers: Buffer.from('\xFF\xFF\xFF\xFFgetserversResponse', 'binary'),
};

const parser = Object.create(EventEmitter.prototype);

parser.getInfo    = Request(request.info);
parser.getStatus  = Request(request.status);
parser.getServers = Request(request.servers);

parser.gameType = type => {
	switch (type){
		case '0': return 'FFA';
		case '3': return 'DUEL';
		case '4': return 'power duel';
		case '6': return 'TDM';
		case '7': return 'SIEDGE';
		case '8': return 'CTF';
		default:  return 'N/A';
	}
};

parser.master = {
	official: {
		address: '104.40.23.123',
		port: 29060
	},
	jkhub: {
		address: '217.182.53.251',
		port: 29060
	}
};

function Request(req) {
	return function(servers) {
		if (typeof servers[Object.keys(servers)[0]] !== 'object')
			sendRequest(req, servers);
		else if (Array.isArray(servers)) {
			servers.forEach(item => {
				sendRequest(req, item); //cb?
			});
		}
		else throw new TypeError('Argument must be an object or array');
	}
}

function sendRequest(request, server, cb = null) {
	let address = null;
	let port    = null;

	if (Array.isArray(server) && server.length > 1) {
		address = server[0];
		port    = server[1];
	}
	else if (typeof server === 'object' && 'address' in server && 'port' in server) {
		address = server.address;
		port    = server.port;
	}
	else throw new TypeError('Second argument must be an object or array with two elements (address and port number)');

	socket.send(request, port, address, cb);
}

function parseInfo(data, address) {
	let infoArr = data.split('\\');
	let info    = {};

	for (let i = 0; i < infoArr.length; i += 2) {
		info[infoArr[i]] = infoArr[i + 1];
	}
	parser.emit('info', info, address);
}

function parseStatus(data, address) {
	let dataArr   = data.split('\n'); // status \n player \n player ...
	let statusArr = dataArr[0].split('\\');
	let status    = {};

	for (let i = 0; i < statusArr.length; i += 2) {
		status[statusArr[i]] = statusArr[i + 1];
	}

	let players = parsePlayers(dataArr);

	Object.defineProperty(status, 'players', {
		enumerable: false,
		value:      players
	});
	parser.emit('status', status, address);
}

function parsePlayers(dataArr) {
	let players = [];

	for (let i = 1; i < dataArr.length - 1; i++) {
		let player = {};
		let playerArr = dataArr[i].split(' '); // score &nbsp ping &nbsp "name"

		if (playerArr.length > 3) {
			player['name'] = playerArr.slice(2).join('').slice(1, -1);
		}
		else {
			player['name'] = playerArr[2].slice(1, -1);
		}

		player['score'] = playerArr[0];
		player['ping'] = playerArr[1];
		players.push(player);
	}
	return players;
}

function parseServers(data, address) {
	let serversArr = [];

	for (let i = 0; i < data.length; i += 7) { // IPaddr:4B port:2B \:1B
		let address = data.slice(i, i + 4).join('.');
		let port    = data.slice(i + 4, i + 6).readUInt16BE(0);

		serversArr.push([address, port]);
	}
	parser.emit('servers', serversArr, address);
}

function parse(data, rinfo) {
	let address = {
		address: rinfo.address,
		port:    rinfo.port
	};
	//let address = [rinfo.address, rinfo.port];
	let index = data.indexOf(0x5c); // 0x5c == '\'
	let type  = data.slice(0, index); // get return type
	let msg   = data.slice(index + 1);

	if (type.compare(response.info) === 0) { // if info
		parseInfo(msg.toString('binary'), address);
	}
	else if (type.compare(response.status) === 0) { // if status
		parseStatus(msg.toString('binary'), address);
	}
	else if (response.servers.compare(data, 0, 22) === 0) { // if servers
		parseServers(msg.slice(0, msg.lastIndexOf(0x5c)), address);
	}
	else parser.emit('error', 'Bad response');
}

socket.on('message', (data, rinfo) => {
	parse(data, rinfo);
});

socket.on('error', (err) => {
	parser.emit('error', err);
});

module.exports = parser;