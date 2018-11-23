/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const child_process = require('child_process');
const rpc = require('./rpc');

async function spawn(fileName, ...args) {
  const child = child_process.fork(fileName, [], {
    detached: true, stdio: [0, 1, 2, 'ipc']
  });

  const transport = receivedFromChild => {
    child.on('message', receivedFromChild);
    return child.send.bind(child);
  };
  const { result } = await rpc.createWorld(transport, ...args);
  return result;
}

function init(initializer) {
  const transport = receivedFromParent => {
    process.on('message', receivedFromParent);
    return process.send.bind(process);
  };
  rpc.initWorld(transport, initializer);
}

module.exports = { spawn, init };
