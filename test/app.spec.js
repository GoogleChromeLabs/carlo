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
  const {rpc} = require('../rpc');

  let app;

  function staticHandler(data) {
    return request => {
      for (const entry of data) {
        const url = new URL(request.url());
        if (url.pathname === entry[0]) {
          request.fulfill({ body: Buffer.from(entry[1]), headers: entry[2]});
          return;
        }
      }
      request.continue();
    };
  }

  afterEach(async({server, httpsServer}) => {
    try { await app.exit(); } catch (e) {}
  });

  describe('app basics', () => {
    it('evaluate', async() => {
      app = await carlo.launch();
      const ua = await app.evaluate('navigator.userAgent');
      expect(ua).toContain('HeadlessChrome');
    });
    it('exposeFunction', async() => {
      app = await carlo.launch();
      await app.exposeFunction('foobar', () => 42);
      const result = await app.evaluate('foobar()');
      expect(result).toBe(42);
    });
    it('app load', async() => {
      app = await carlo.launch();
      await app.load('data:text/plain,hello');
      const result = await app.evaluate('document.body.textContent');
      expect(result).toBe('hello');
    });
    it('mainWindow accessor', async() => {
      app = await carlo.launch();
      app.serveFolder(path.join(__dirname, 'folder'));
      await app.load('index.html');
      // expect(app.mainWindow().pageForTest().url()).toBe('https://domain/index.html');
    });
    it('createWindow creates window', async() => {
      app = await carlo.launch();
      let window = await app.createWindow();
      expect(window.pageForTest().url()).toBe('about:blank?seq=1');
      window = await app.createWindow();
      expect(window.pageForTest().url()).toBe('about:blank?seq=2');
    });
    it('exit event is emitted', async() => {
      app = await carlo.launch();
      let callback;
      const onexit = new Promise(f => callback = f);
      app.on('exit', callback);
      await app.mainWindow().close();
      await onexit;
    });
    it('window event is emitted', async() => {
      app = await carlo.launch();
      const windows = [];
      app.on('window', window => windows.push(window));
      const window1 = await app.createWindow();
      const window2 = await app.createWindow();
      expect(window1).toBe(windows[0]);
      expect(window2).toBe(windows[1]);
    });
    it('window exposeFunction', async() => {
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
  });

  describe('http serve', () => {
    it('serveFolder works', async() => {
      app = await carlo.launch();
      app.serveFolder(path.join(__dirname, 'folder'));
      await app.load('index.html');
      const result = await app.evaluate('document.body.textContent');
      expect(result).toBe('hello file');
    });
    it('serveFolder prefix is respected works', async() => {
      app = await carlo.launch();
      app.serveFolder(path.join(__dirname, 'folder'), 'prefix');
      await app.load('prefix/index.html');
      const result = await app.evaluate('document.body.textContent');
      expect(result).toBe('hello file');
    });
    it('serveOrigin works', async({server}) => {
      app = await carlo.launch();
      app.serveOrigin(server.PREFIX);
      await app.load('index.html');
      const result = await app.evaluate('document.body.textContent');
      expect(result).toBe('hello http');
    });
    it('serveOrigin prefix is respected', async({server}) => {
      app = await carlo.launch();
      app.serveOrigin(server.PREFIX, 'prefix');
      await app.load('prefix/index.html');
      const result = await app.evaluate('document.body.textContent');
      expect(result).toBe('hello http');
    });
    it('HttpRequest params', async() => {
      app = await carlo.launch();
      app.serveFolder(path.join(__dirname, 'folder'));
      const log = [];
      app.serveHandler(request => {
        log.push({url: request.url(), method: request.method(), ua: ('User-Agent' in request.headers()) });
        request.continue();
      });
      await app.load('index.html');
      expect(JSON.stringify(log)).toBe('[{"url":"https://domain/index.html","method":"GET","ua":true}]');
    });
    it('serveHandler can fulfill', async() => {
      app = await carlo.launch();
      app.serveHandler(request => {
        if (!request.url().endsWith('index.html')) {
          request.continue();
          return;
        }
        request.fulfill({ body: Buffer.from('hello handler') });
      });
      await app.load('index.html');
      const result = await app.evaluate('document.body.textContent');
      expect(result).toBe('hello handler');
    });
    it('serveHandler can continue to file', async() => {
      app = await carlo.launch();
      app.serveHandler(request => request.continue());
      app.serveFolder(path.join(__dirname, 'folder'));
      await app.load('index.html');
      const result = await app.evaluate('document.body.textContent');
      expect(result).toBe('hello file');
    });
    it('serveHandler can continue to http', async({server}) => {
      app = await carlo.launch();
      app.serveOrigin(server.PREFIX);
      app.serveHandler(request => request.continue());
      await app.load('index.html');
      const result = await app.evaluate('document.body.textContent');
      expect(result).toBe('hello http');
    });
    it('serveHandler can abort', async() => {
      app = await carlo.launch();
      app.serveHandler(request => request.abort());
      try {
        await app.load('index.html');
        expect(false).toBeTruthy();
      } catch (e) {
        expect(e.toString()).toContain('domain/index.html');
      }
    });
    it('window serveFolder', async() => {
      app = await carlo.launch();

      const w1 = await app.createWindow();
      await w1.serveFolder(path.join(__dirname, 'folder'));
      await w1.load('index.html');
      const result1 = await w1.evaluate('document.body.textContent');
      expect(result1).toBe('hello file');

      const w2 = await app.createWindow();
      try {
        await w2.load('index.html');
        expect(false).toBeTruthy();
      } catch (e) {
        expect(e.toString()).toContain('domain/index.html');
      }
    });
  });

  describe('rpc', () => {
    it('load params are accessible', async() => {
      const files = [[
        '/index.html',
        `<script>async function load(a, b) { await b.print(await a.val()); }</script>`
      ]];
      const result = [];
      app = await carlo.launch();
      app.serveHandler(staticHandler(files));
      app.mainWindow().pageForTest().on('pageerror', console.error);
      await app.load('index.html',
          rpc.handle({ val: 42 }),
          rpc.handle({ print: v => result.push(v) }));
      expect(result[0]).toBe(42);
    });
  });

};
