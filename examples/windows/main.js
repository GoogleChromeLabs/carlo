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

const carlo = require('carlo');
const { rpc, rpc_process } = require('carlo/rpc');

class Backend {
  constructor(app) {
    this.app_ = app;
    this.windows_ = new Map();
  }

  showMyWindow(url) {
    let windowPromise = this.windows_.get(url);
    if (!windowPromise) {
      windowPromise = this.createWindow(url);
      this.windows_.set(url, windowPromise);
    }
    windowPromise.then(w => w.bringToFront());
  }

  async createWindow(url) {
    const window = await this.app_.createWindow({width: 800, height: 600, top: 200, left: 10});
    window.on('close', () => this.windows_.delete(url));
    window.load(url);
    return window;
  }
}

(async() => {
  const app = await carlo.launch(
    {title: 'Main', width: 300, height: 100, top: 10, left: 10 });
  app.on('exit', () => process.exit());
  const mainWindow = app.mainWindow();
  mainWindow.on('close', () => process.exit());
  mainWindow.serveFolder(__dirname);
  mainWindow.load('main.html', rpc.handle(new Backend(app)));
})();
