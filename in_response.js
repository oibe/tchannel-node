// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var InArgStream = require('./argstream').InArgStream;
var States = require('./reqres_states');

var emptyBuffer = Buffer(0);

function TChannelInResponse(id, options) {
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.logger = options.logger;
    self.random = options.random;
    self.timers = options.timers;

    self.state = States.Initial;
    self.remoteAddr = null;
    self.id = id || 0;
    self.code = options.code || 0;
    self.checksum = options.checksum || null;
    self.ok = self.code === 0; // TODO: probably okay, but a bit jank
    self.span = options.span || null;
    if (options.streamed) {
        self.streamed = true;
        self._argstream = InArgStream();
        self.arg1 = self._argstream.arg1;
        self.arg2 = self._argstream.arg2;
        self.arg3 = self._argstream.arg3;
        self._argstream.on('error', function passError(err) {
            self.emit('error', err);
        });
        self._argstream.on('finish', function onFinish() {
            self.emit('finish');
        });
    } else {
        self.streamed = false;
        self._argstream = null;
        self.arg1 = emptyBuffer;
        self.arg2 = emptyBuffer;
        self.arg3 = emptyBuffer;
    }

    self.start = self.timers.now();

    self.on('finish', self.onFinish);
}

inherits(TChannelInResponse, EventEmitter);

TChannelInResponse.prototype.type = 'tchannel.incoming-response';

TChannelInResponse.prototype.onFinish = function onFinish() {
    var self = this;
    self.state = States.Done;
    if (self.span) {
        self.emit('span');
    }
};

TChannelInResponse.prototype.handleFrame = function handleFrame(parts) {
    var self = this;
    if (self.streamed) {
        self._argstream.handleFrame(parts);
    } else {
        if (!parts) return;
        if (parts.length !== 3 ||
            self.state !== States.Initial) {
            self.emit('error', new Error(
                'un-streamed argument defragmentation is not implemented'));
        }
        self.arg1 = parts[0] || emptyBuffer;
        self.arg2 = parts[1] || emptyBuffer;
        self.arg3 = parts[2] || emptyBuffer;
        self.emit('finish');
    }
};

module.exports = TChannelInResponse;
