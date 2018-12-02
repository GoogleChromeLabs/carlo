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

const path = require('path');

module.exports.addTests = function({testRunner, expect}) {

const {describe, xdescribe, fdescribe} = testRunner;
const {it, fit, xit} = testRunner;
const {beforeAll, beforeEach, afterAll, afterEach} = testRunner;
const carlo = require('../lib/carlo');

let app;

beforeEach(async({server, httpsServer}) => {
  try { await app.exit(); } catch(e) {}
});

describe('app', () => {
  it('evaluate', async(state, test) => {
    app = await carlo.launch();
    const ua = await app.evaluate('navigator.userAgent');
    expect(ua).toContain('HeadlessChrome');
  });
  it('exposeFunction', async(state, test) => {
    app = await carlo.launch();
    await app.exposeFunction('foobar', () => 42);
    const result = await app.evaluate('foobar()');
    expect(result).toBe(42);
  });
  it('load', async(state, test) => {
    app = await carlo.launch();
    await app.load('data:text/plain,hello');
    const result = await app.evaluate('document.body.textContent');
    expect(result).toBe('hello');
  });
  it('serveFolder', async(state, test) => {
    app = await carlo.launch();
    await app.serveFolder(path.join(__dirname, 'data'));
    await app.load('index.html');
    const result = await app.evaluate('document.body.textContent');
    expect(result).toBe('hello world');
  });
  it('mainWindow', async(state, test) => {
    app = await carlo.launch();
    await app.serveFolder(path.join(__dirname, 'data'));
    await app.load('index.html');
    expect(app.mainWindow().pageForTest().url()).toBe('https://domain/index.html');
  });
  it('createWindow', async(state, test) => {
    app = await carlo.launch();
    let window = await app.createWindow();
    expect(window.pageForTest().url()).toBe('about:blank?seq=1');
    window = await app.createWindow();
    expect(window.pageForTest().url()).toBe('about:blank?seq=2');
  });
  it('exitEvent', async(state, test) => {
    app = await carlo.launch();
    let exitFired = false;
    app.on('exit', () => exitFired = true);
    await app.mainWindow().close();
    expect(exitFired).toBe(true);
  });
  it('windowEvent', async(state, test) => {
    app = await carlo.launch();
    const windows = [];
    app.on('window', window => windows.push(window))
    const window1 = await app.createWindow();
    const window2 = await app.createWindow();
    expect(window1).toBe(windows[0]);
    expect(window2).toBe(windows[1]);
  });
  it('windowExposeFunction', async(state, test) => {
    app = await carlo.launch();
    await app.exposeFunction('appFunc', () => 'app');
    const w1 = await app.createWindow();
    await w1.exposeFunction('windowFunc', () => 'window');
    const result1 = await w1.evaluate(async() => (await appFunc()) + (await windowFunc()));
    expect(result1).toBe('appwindow');

    const w2 = await app.createWindow();
    const result2 = await w2.evaluate(async() => (await appFunc()) + self.windowFunc);
    expect(result2).toBe('appundefined');
  });
  it('windowServeFolder', async(state, test) => {
    app = await carlo.launch();
    const w1 = await app.createWindow();
    await w1.serveFolder(path.join(__dirname, 'data'));
    await w1.load('index.html');
    const result1 = await w1.evaluate('document.body.textContent');
    expect(result1).toBe('hello world');

    const w2 = await app.createWindow();
    try {
      await w2.load('index.html');
      expect(false).toBeTruthy();
    } catch (e) {
      expect(e.toString()).toContain('domain/index.html');
    }
  });
});

};
