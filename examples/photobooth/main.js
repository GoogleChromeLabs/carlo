/**
 * Copyright 2018 Google Inc. All rights reserved.
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
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const app = await carlo.launch(
      {
        bgcolor: '#e6e8ec',
        width: 800,
        height: 648 + 24,
        icon: path.join(__dirname, '/app_icon.png'),
        channel: ['canary'],
        localDataDir: path.join(os.homedir(), '.carlophotobooth'),
      });
  app.on('exit', () => process.exit());
  console.log('This example requires Chrome 72 (Chrome Canary) to function.');
  app.serveFolder(path.join(__dirname, '/www'));
  await app.exposeFunction('saveImage', saveImage);
  await app.load('index.html');
})();

function saveImage(base64) {
  var buffer = Buffer.from(base64, 'base64')
  if (!fs.existsSync('pictures'))
    fs.mkdirSync('pictures');
  const fileName = path.join('pictures', new Date().toISOString().replace(/:/g,'-') + '.jpeg');
  fs.writeFileSync(fileName, buffer);
}
