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

const {TestRunner, Reporter, Matchers} = require('@pptr/testrunner');

const path = require('path');
const carlo = require('../lib/carlo');

// Runner holds and runs all the tests
const testRunner = new TestRunner({
  parallel: 1, // run 2 parallel threads
  timeout: 3000, // setup timeout of 1 second per test
});
const {expect} = new Matchers();
const {beforeAll, beforeEach, afterAll, afterEach} = testRunner;
const {describe, xdescribe, fdescribe} = testRunner;
const {it, fit, xit} = testRunner;

describe('app reuse', () => {
  fit('load returns value', async() => {
    app = await carlo.launch();
    let callback;
    const windowPromise = new Promise(f => callback = f);
    app.on('window', callback);

    try {
      await carlo.launch({paramsForReuse: {val: 42}});
      expect(false).toBeTruthy();
    } catch (e) {
      expect(e.toString()).toContain('already running');
    }

    const window = await windowPromise;
    expect(JSON.stringify(window.paramsForReuse())).toBe('{"val":42}');
  });
});

// Reporter subscribes to TestRunner events and displays information in terminal
new Reporter(testRunner);

// Run all tests.
testRunner.run();
