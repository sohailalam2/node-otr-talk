var dgram = require('dgram'),
	util = require('util'),
	os = require('os'),
	net = require('net'),
	ip = require('ip'),
	EventEmitter = require('events').EventEmitter;

var ssdp = exports;

function Ssdp(interface) {
	EventEmitter.call(this);

	this.multicast = '239.255.255.250';
	this.port = 1900;
	this._bound = false;
	this._boundCount = 0;
	this._closed = false;
	this._queue = [];

	// Create sockets on all external interfaces or specified interface only
	this.createSockets(interface);
}
util.inherits(Ssdp, EventEmitter);

ssdp.create = function create(interface) {
	return new Ssdp(interface);
};

Ssdp.prototype.createSockets = function createSockets(interface) {
	var self = this,
		interfaces = os.networkInterfaces();
	this.sockets = Object.keys(interfaces).reduce(function (a, key) {
		return a.concat(interfaces[key].filter(function (item) {
			return (!item.internal && (interface ? key === interface : true));
		}).map(function (item) {
			return self.createSocket(item);
		}));
	}, []);
};

Ssdp.prototype.search = function search(device, promise) {
	if (!promise) {
		promise = new EventEmitter();
		promise._ended = false;
		promise.once('end', function () {
			promise._ended = true;
		});
	}

	if (!this._bound) {
		this._queue.push({
			action: 'search',
			device: device,
			promise: promise
		});
		return promise;
	}

	// If promise was ended before binding - do not send queries
	if (promise._ended) return;

	var self = this,
		query = new Buffer('M-SEARCH * HTTP/1.1\r\n' +
			'HOST: ' + this.multicast + ':' + this.port + '\r\n' +
			'MAN: "ssdp:discover"\r\n' +
			'MX: 1\r\n' +
			'ST: ' + device + '\r\n' +
			'\r\n');

	// Send query on each socket
	this.sockets.forEach(function (socket) {
		socket.send(query, 0, query.length, this.port, this.multicast);
	}, this);

	function ondevice(info, address) {
		if (promise._ended) return;
		if (info.st !== device) return;

		promise.emit('device', info, address);
	}
	this.on('_device', ondevice);

	// Detach listener after receiving 'end' event
	promise.once('end', function () {
		self.removeListener('_device', ondevice);
	});

	return promise;
};

Ssdp.prototype.createSocket = function createSocket(interface) {
	var self = this,
		socket = dgram.createSocket(interface.family === 'IPv4' ?
			'udp4' : 'udp6');

	socket.on('message', function (message, info) {
		// Ignore messages after closing sockets
		if (self._closed) return;

		// Parse response
		self.parseResponse(message.toString(), socket.address, info);
	});

	// Bind in next tick (sockets should be me in this.sockets array)
	process.nextTick(function () {
		// Unqueue this._queue once all sockets are ready
		function onready() {
			if (self._boundCount === self.sockets.length) return;
			self._bound = true;

			self._queue.forEach(function (item) {
				if (item.action === 'search') {
					return self.search(item.device, item.promise);
				}
			});
		}

		socket.on('listening', function () {
			self._boundCount++;
			onready();
		});

		// On error - remove socket from list and execute items from queue
		socket.once('error', function () {
			self.sockets.splice(self.sockets.indexOf(socket), 1);
			onready();
		});

		socket.address = interface.address;
		socket.bind(self.port, interface.address);
	});

	return socket;
};

Ssdp.prototype.parseResponse = function parseResponse(response, addr, remote) {
	response = response.split(/\r\n/g);
	var status = response[0],
		headers = response.slice(1);

	// Ignore incorrect packets
	if (!/^(HTTP|NOTIFY)/.test(status)) return;

	// Parse headers from lines to hashmap
	headers = headers.reduce(function (headers, line) {
		line.replace(/^([^:]*)\s*:\s*(.*)$/, function (a, key, value) {
			headers[key.toLowerCase()] = value;
		});
		return headers;
	}, {});

	// We do not have interest in headers without location
	if (!headers.location) return;

	this.emit('_device', headers, addr);
};

Ssdp.prototype.close = function close() {
	this.sockets.forEach(function (socket) {
		socket.close();
	});
	this._closed = true;
};
