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

const puppeteer = require('puppeteer-core');
const findChrome = require('./find_chrome');
const {rpc} = require('../rpc');
const {Color} = require('./color');
const {InterceptedRequest} = require('./intercepted_request');

const fs = require('fs');
const util = require('util');
const {URL} = require('url');
const EventEmitter = require('events');
const fsReadFile = util.promisify(fs.readFile);

let testMode = false;

class App extends EventEmitter {
  /**
   * @param {!Puppeteer.Browser} browser Puppeteer browser
   * @param {!Puppeteer.Session} browser Puppeteer browser
   * @param {!Object} options
   */
  constructor(browser, session, options) {
    super();
    this.browser_ = browser;
    this.session_ = session;
    this.options_ = options;
    this.windows_ = new Map();
    this.pendingWindows_ = new Map();
    this.windowSeq_ = 0;
  }

  async init_() {
    const page = (await this.browser_.pages())[0];
    this.browser_.on('targetcreated', this.targetCreated_.bind(this));
    this.pendingWindows_.set('', { options: this.options_ });
    this.pageCreated_(page);

  }

  /**
   * Close the app windows.
   */
  async exit() {
    await this.browser_.close();
  }

  /**
   * @return {!<Window>} main window.
   */
  mainWindow() {
    for (const window of this.windows_.values())
      return window;
  }

  /**
   * @param {!Object=} options
   * @return {!Promise<Window>}
   */
  async createWindow(options = {}) {
    options = Object.assign({}, this.options_, options);
    const seq = String(++this.windowSeq_);
    if (!this.windows_.size)
      throw new Error('Needs at least one window to create more.');

    const params = [];
    for (const prop of ['top', 'left', 'width', 'height']) {
      if (typeof options[prop] === 'number')
        params.push(`prop=${options[prop]}`);
    }

    for (const page of this.windows_.keys()) {
      page.evaluate(`window.open('about:blank?seq=${seq}', '', '${params.join(',')}')`);
      break;
    }

    return new Promise(callback => {
      this.pendingWindows_.set(seq, { options, callback });
    });
  }

  /**
   * @return {!Array<!Window>}
   */
  windows() {
    return Array.from(this.windows_.values());
  }

  /**
   * @param {string} name
   * @param {function} func
   * @return {!Promise}
   */
  exposeFunction(name, func) {
    return this.mainWindow().exposeFunction(name, func);
  }

  /**
   * @param {function()|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<*>}
   */
  evaluate(pageFunction, ...args) {
    return this.mainWindow().evaluate(pageFunction, ...args);
  }

  /**
   * @param {string=} www Folder with the web content.
   * @param {string=} path Only serve folder for requests with given prefix.
   */
  serveFolder(folder = '', prefix = '') {
    return this.mainWindow().serveFolder(folder, prefix);
  }

  /**
   * Serves pages from given origin, eg `http://localhost:8080`.
   * This can be used for the fast development mode available in web frameworks.
   *
   * @param {string} origin
   */
  serveOrigin(origin) {
    return this.mainWindow().serveOrigin(origin);
  }

  /**
   * @param {string} uri
   * @param {*} params
   * @return {!Promise<*>}
   */
  async load(uri, params) {
    return this.mainWindow().load(uri, params);
  }

  /**
   * Puppeteer browser object for test.
   * @return {!Puppeteer.Browser}
   */
  browserForTest() {
    return this.browser_;
  }

  async targetCreated_(target) {
    const page = await target.page();
    if (!page)
      return;
    this.pageCreated_(page);
  }

  /**
   * @param {!Puppeteer.Page} page
   */
  pageCreated_(page) {
    let window = this.windows_.get(page);
    if (window)
      return;

    const url = page.url();
    const seq = url.startsWith('about:blank?seq=') ? url.substr('about:blank?seq='.length) : '';
    if (!this.pendingWindows_.has(seq))
      return;

    const { callback, options } = this.pendingWindows_.get(seq);
    this.pendingWindows_.delete(seq);
    window = new Window(this, page, options);
    this.windows_.set(page, window);
    if (callback)
      callback(window);
  }

  /**
   * @param {!Window}
   */
  windowClosed_(window) {
    this.windows_.delete(window.page_);
    if (!this.windows_.size)
      this.emit(App.Events.Exit);
  }
}

class Window {
  /**
   * @param {!App} app
   * @param {!Puppeteer.Page} page Puppeteer page
   * @param {!Object} options
   */
  constructor(app, page, options) {
    this.app_ = app;
    this.options_ = Object.assign({}, app.options_, options);
    this.www_ = new Map();
    this.page_ = page;
    this.page_.on('close', this.closed_.bind(this));
    const targetId = this.page_.target()._targetInfo.targetId;

    const bgcolor = Color.parse(this.options_.bgcolor);
    const bgcolorRGBA = bgcolor.canonicalRGBA();
    this.initNetwork_ = page.target().createCDPSession().then(session => {
      this.session_ = session;
      return Promise.all([
        session.send('Emulation.setDefaultBackgroundColorOverride',
            {color: {r: bgcolorRGBA[0], g: bgcolorRGBA[1],
              b: bgcolorRGBA[2], a: bgcolorRGBA[3] * 255}}),
        session.send('Network.setRequestInterception', {patterns: [{urlPattern: '*'}]}),
        session.on('Network.requestIntercepted', this.requestIntercepted_.bind(this)),
        app.session_.send('Browser.getWindowForTarget', { targetId })
            .then(this.initBounds_.bind(this))
      ]);
    });
    this.handle_ = rpc.handle(this);
  }

  /**
   * @param {string} name
   * @param {function} func
   * @return {!Promise}
   */
  exposeFunction(name, func) {
    return this.page_.exposeFunction(name, func);
  }

  /**
   * @param {function()|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<*>}
   */
  evaluate(pageFunction, ...args) {
    return this.page_.evaluate(pageFunction, ...args);
  }

  /**
   * @param {string=} www Folder with the web content.
   * @param {string=} path Only serve folder for requests with given prefix.
   */
  serveFolder(folder = '', prefix = '') {
    let folders = this.www_.get(prefix);
    if (!folders) {
      folders = [];
      this.www_.set(prefix, folders);
    }
    folders.push(folder);
  }

  /**
   * Serves pages from given origin, eg `http://localhost:8080`.
   * This can be used for the fast development mode available in web frameworks.
   *
   * @param {string} origin
   */
  serveOrigin(origin) {
    this.wwwOrigin_ = origin;
  }

  /**
   * @param {string=} uri
   * @param {*=} params
   * @return {!Promise<*>}
   */
  async load(uri = '', params) {
    if (!this.www_.size && !this.wwwOrigin_) {
      this.page_.close();
      throw new Error('Please call app.serveFolder(__dirname) or point to ' +
                      'other folder(s) with your web files');
    }
    this.loadURI_ = uri;
    this.loadParams_ = params;
    await this.initNetwork_;
    await this.page_.goto(`https://domain/${uri}`, {timeout: 0, waitFor: 'domcontentloaded'});
    return this.initializeRpc_();
  }

  async reload() {
    this.load(this.loadURI_, this.loadParams_);
  }

  initBounds_(result) {
    this.windowId_ = result.windowId;
    return this.setBounds({ top: this.options_.top,
      left: this.options_.left,
      width: this.options_.width,
      height: this.options_.height });
  }

  /**
   * Puppeteer page object for test.
   * @return {!Puppeteer.Page}
   */
  pageForTest() {
    return this.page_;
  }

  /**
   * @param {*} params
   */
  async initializeRpc_() {
    const rpcFile = (await fsReadFile(__dirname + '/../rpc/rpc.js')).toString();
    let sendToParent;
    if (!this._receivedFromChildExposed)
      await this.page_.exposeFunction('receivedFromChild', data => sendToParent(data));
    this._receivedFromChildExposed = true;

    await this.page_.evaluate(rpcFile => {
      const module = { exports: {} };
      eval(rpcFile);
      self.rpc = module.exports;
      function transport(receivedFromParent) {
        self.receivedFromParent = receivedFromParent;
        return receivedFromChild;
      }
      self.rpc.initWorld(transport, async params => {
        if (document.readyState === 'loading')
          await new Promise(f => document.addEventListener('DOMContentLoaded', f));

        document.addEventListener('keydown', event => {
          if (event.keyCode === 81 && (event.metaKey || event.ctrlKey)) { // Ctrl+Q
            params.window.closeBrowser();
            event.preventDefault();
          }
          if (event.keyCode === 82 && (event.metaKey || event.ctrlKey)) { // Ctrl+R
            params.window.reload();
            event.preventDefault();
          }
        });

        if (self.load)
          return self.load(params.loadParams);
      });
    }, rpcFile);

    const transport = receivedFromChild => {
      sendToParent = receivedFromChild;
      return data => this.page_.evaluate(data => self.receivedFromParent(data), data);
    };
    if (this._lastWebWorldId)
      rpc.disposeWorld(this._lastWebWorldId);
    const { result, worldId } = await rpc.createWorld(transport, { loadParams: this.loadParams_, window: this.handle_ });
    this._lastWebWorldId = worldId;
    return result;
  }

  /**
   * @param {!Object} request Intercepted request.
   */
  async requestIntercepted_(payload) {
    const request = new InterceptedRequest(this.session_, payload);
    const url = new URL(request.url());
    if (url.hostname !== 'domain') {
      request.continue();
      return;
    }
    if (this.wwwOrigin_) {
      request.continue({ url: this.wwwOrigin_ + url.pathname });
      return;
    }

    for (const [prefix, folders] of this.www_) {
      let pathname = url.pathname.substr(1);
      if (!pathname.startsWith(prefix))
        continue;
      pathname = pathname.substr(prefix.length);
      for (const folder of folders) {
        const fileName = folder + '/' + pathname;
        if (!fs.existsSync(fileName))
          continue;
        const buffer = await fsReadFile(fileName);
        request.fulfill(200, { 'content-type': contentType(request, fileName) }, buffer);
        return;
      }
    }
    request.continue();
  }

  /**
   * @return {{left: number, top: number, width: number, height: number}}
   */
  async bounds() {
    const { bounds } = await this.app_.session_.send('Browser.getWindowBounds', { windowId: this.windowId_ });
    return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
  }

  /**
   * @param {{left: (number|undefined), top: (number|undefined), width: (number|undefined), height: (number|undefined)}} bounds
   */
  async setBounds(bounds) {
    await this.app_.session_.send('Browser.setWindowBounds', { windowId: this.windowId_, bounds });
  }

  async fullscreen() {
    const bounds = { windowState: 'fullscreen' };
    await this.app_.session_.send('Browser.setWindowBounds', { windowId: this.windowId_, bounds });
  }

  async minimize() {
    const bounds = { windowState: 'minimized' };
    await this.app_.session_.send('Browser.setWindowBounds', { windowId: this.windowId_, bounds });
  }

  async maximize() {
    const bounds = { windowState: 'maximized' };
    await this.app_.session_.send('Browser.setWindowBounds', { windowId: this.windowId_, bounds });
  }

  bringToFront() {
    return this.page_.bringToFront();
  }

  close() {
    return this.page_.close();
  }

  closed_() {
    rpc.dispose(this.handle_);
    this.app_.windowClosed_(this);
  }

  closeBrowser() {
    this.app_.emit(App.Events.Exit);
  }
}

App.Events = {
  Exit: 'exit',
};

const imageContentTypes = new Map([
  ['jpeg', 'image/jpeg'], ['jpg', 'image/jpeg'], ['svg', 'image/svg+xml'], ['gif', 'image/gif'], ['webp', 'image/webp'],
  ['png', 'image/png'], ['ico', 'image/ico'], ['tiff', 'image/tiff'], ['tif', 'image/tif'], ['bmp', 'image/bmp']
]);

const fontContentTypes = new Map([
  ['ttf', 'font/opentype'], ['otf', 'font/opentype'], ['ttc', 'font/opentype'], ['woff', 'application/font-woff']
]);

/**
 * @param {!InterceptedRequest} request
 * @param {!string} fileName
 */
function contentType(request, fileName) {
  const dotIndex = fileName.lastIndexOf('.');
  const extension = fileName.substr(dotIndex + 1);
  switch (request.resourceType()) {
    case 'Document': return 'text/html';
    case 'Script': return 'text/javascript';
    case 'Stylesheet': return 'text/css';
    case 'Image':
      return imageContentTypes.get(extension) || 'image/png';
    case 'Font':
      return fontContentTypes.get(extension) || 'application/font-woff';
  }
}

/**
 * @param {!Object=} options
 * @return {!Puppeteer.Browser}
 */
async function launch(options = {}) {
  if (!options.bgcolor)
    options.bgcolor = '#ffffff';

  const executablePath = options.executablePath || (await findChrome(options.configurations || ['stable'])).pop();
  if (!executablePath) {
    console.error('Could not find Chrome installation, please make sure Chrome browser is installed from https://www.google.com/chrome/.');
    process.exit(0);
    return;
  }

  const args = [
    `--app=data:text/html,<style>html{background:${options.bgcolor};}</style>`,
    `--enable-features=NetworkService`,
  ];

  if (options.args)
    args.push(...options.args);

  if (typeof options.width === 'number' && typeof options.height === 'number')
    args.push(`--window-size=${options.width},${options.height}`);
  if (typeof options.left === 'number' && typeof options.top === 'number')
    args.push(`--window-position=${options.left},${options.top}`);

  const browser = await puppeteer.launch({
    executablePath,
    pipe: true,
    defaultViewport: null,
    headless: testMode,
    userDataDir: options.userDataDir || '.profile',
    args });
  const session = await browser.target().createCDPSession();
  const context = browser.defaultBrowserContext();
  await context.overridePermissions('https://domain', [
    'geolocation',
    'midi',
    'notifications',
    'camera',
    'microphone',
    'clipboard-read',
    'clipboard-write']);
  const app = new App(browser, session, options);
  await app.init_();
  return app;
}

function enterTestMode() {
  testMode = true;
}

module.exports = { launch, enterTestMode };
