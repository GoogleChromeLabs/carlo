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
const child_process = require('child_process');
const os = require('os');
const pty = require('ndb-node-pty-prebuilt');
const carlo = require('carlo');

if (!process.env.CARLO) {
  child_process.spawn(process.argv[0], [__filename], {
     detached: true,
     env: { CARLO: 1, ...process.env }
  });
  process.exit(0);
  return;
}

(async () => {
  const app = await carlo.launch({ bgcolor: '#2b2e3b' });
  app.serveFolder(__dirname + '/www');
  app.serveFolder(__dirname + '/node_modules', 'node_modules');

  // Expose object to the web rendering context.
  await app.exposeObject('terminal', new Terminal());
  // Alternatively, expose factory.
  await app.exposeFactory(Terminal);

  await app.load('index.html');
})();

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
