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

require('carlo').enterTestMode();
const { run } = require('./app');

// Runner holds and runs all the tests
const runner = new TestRunner({
  parallel: 1, // run 2 parallel threads
  timeout: 3000, // setup timeout of 1 second per test
});
// Simple expect-like matchers
const {expect} = new Matchers();

// Extract jasmine-like DSL into the global namespace
const {describe, xdescribe, fdescribe} = runner;
const {it, fit, xit} = runner;
const {beforeAll, beforeEach, afterAll, afterEach} = runner;

describe('test', () => {
  it('test columns', async(state, test) => {
    const app = await run();
    const page = app.mainWindow().pageForTest();
    await page.waitForSelector('.header');
    const columns = await page.$$eval('.header', nodes => nodes.map(n => n.textContent));
    expect(columns.sort().join(',')).toBe('battery,cpu,osInfo');
  });
});

// Reporter subscribes to TestRunner events and displays information in terminal
new Reporter(runner);

// Run all tests.
runner.run();
