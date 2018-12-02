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
const os = require('os');
const path = require('path');
const si = require('systeminformation');

async function run() {
  let app;
  try {
    app = await carlo.launch(
        {
          bgcolor: '#2b2e3b',
          title: 'Systeminfo App',
          width: 1000,
          height: 500,
          channel: ['canary', 'stable'],
          icon: path.join(__dirname, '/app_icon.png'),
          args: process.env.DEV === 'true' ? ['--auto-open-devtools-for-tabs'] : [],
          localDataDir: path.join(os.homedir(), '.carlosysteminfo'),
        });
  } catch(e) {
    // New window is opened in the running instance.
    console.log('Reusing the running instance');
    return;
  }
  app.on('exit', () => process.exit());
  // New windows are opened when this app is started again from command line.
  app.on('window', window => window.load('index.html'));
  app.serveFolder(path.join(__dirname, 'www'));
  await app.exposeFunction('systeminfo', systeminfo);
  await app.load('index.html');
  return app;
}

async function systeminfo() {
  const info = {};
  await Promise.all([
    si.battery().then(r => info.battery = r),
    si.cpu().then(r => info.cpu = r),
    si.osInfo().then(r => info.osInfo = r),
  ]);
  return info;
}

module.exports = { run };
