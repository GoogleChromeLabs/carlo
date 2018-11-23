#!/usr/bin/env node

/**
 * Copyright 2018 Google Inc., PhantomJS Authors All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const EventEmitter = require('events');
const os = require('os');
const pty = require('ndb-node-pty-prebuilt');
const { rpc, rpc_process } = require('carlo/rpc');

class Terminal extends EventEmitter {
  constructor() {
    super();
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    this.term_ = pty.spawn(shell, [], {
      name: 'xterm-color',
      cwd: process.env.PWD,
      env: process.env
    });
    this.term_.on('data', data => this.emit('data', data));
  }

  on(event, func) {
    // EventEmitter returns heavy object that we don't want to
    // send over the wire.
    super.on(event, func);
  }

  resize(cols, rows) {
    this.term_.resize(cols, rows);
  }

  write(data) {
    this.term_.write(data);
  }

  dispose() {
    process.kill(this._term.pid);
  }
}

rpc_process.init(() => rpc.handle(new Terminal));
