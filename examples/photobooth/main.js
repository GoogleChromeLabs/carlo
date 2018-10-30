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
const child_process = require('child_process');
const fs = require('fs');

if (!process.env.CARLO) {
  child_process.spawn(process.argv[0], [__filename], {
     detached: true,
     env: { CARLO: 1, ...process.env }
  });
  process.exit(0);
  return;
}

(async () => {
  const app = await carlo.launch(
      {
        bgcolor: '#e6e8ec',
        width: 800,
        height: 710
      });
  app.serveFolder(__dirname + '/www');
  await app.exposeFunction('saveImage', saveImage);
  await app.load('index.html');
})();

function saveImage(base64) {
  var buffer = Buffer.from(base64, 'base64')
  const fileName = new Date().toISOString() + '.jpeg';
  fs.writeFileSync(fileName, buffer);
}