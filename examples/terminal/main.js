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

const child_process = require('child_process');
const carlo = require('carlo');
const path = require('path');
const { rpc, rpc_process } = require('carlo/rpc');

class TerminalApp {
  constructor() {
    this.lastTop_ = 50;
    this.lastLeft_ = 50;
    this.launch_();
    this.handle_ = rpc.handle(this);
  }

  async launch_() {
    this.app_ = await carlo.launch({
      bgcolor: '#2b2e3b',
      title: 'Terminal App',
      width: 800,
      height: 800,
      channel: ['canary', 'stable'],
      icon: 'app_icon.png',
      top: this.lastTop_,
      left: this.lastLeft_ });
    this.app_.on('exit', () => process.exit());
    this.app_.serveFolder(path.join(__dirname, 'www'));
    this.app_.serveFolder(path.join(__dirname, 'node_modules'), 'node_modules');
    this.initUI_(this.app_.mainWindow());
  }

  async newWindow() {
    this.lastTop_ = (this.lastTop_ + 50) % 200;
    this.lastLeft_ += 50;
    const options = { top: this.lastTop_, left: this.lastLeft_ };
    this.initUI_(await this.app_.createWindow(options));
  }

  async initUI_(win) {
    const term = await rpc_process.spawn('worker.js');
    return win.load('index.html', this.handle_, term);
  }
}

new TerminalApp();
