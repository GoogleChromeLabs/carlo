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

const path = require('path');
const puppeteer = require('puppeteer-core');
const findChrome = require('./find_chrome');
const {rpc} = require('../rpc');
const debugApp = require('debug')('carlo:app');
const debugServer = require('debug')('carlo:server');
const {Color} = require('./color');
const {HttpRequest} = require('./http_request');

const fs = require('fs');
const util = require('util');
const {URL} = require('url');
const EventEmitter = require('events');
const fsReadFile = util.promisify(fs.readFile);

let testMode = false;

class App extends EventEmitter {
  /**
   * @param {!Puppeteer.Browser} browser Puppeteer browser
   * @param {!Object} options
   */
  constructor(browser, options) {
    super();
    this.browser_ = browser;
    this.options_ = options;
    this.windows_ = new Map();
    this.exposedFunctions_ = [];
    this.pendingWindows_ = new Map();
    this.windowSeq_ = 0;
    this.www_ = [];
  }

  async init_() {
    debugApp('Configuring browser');
    let page;
    await Promise.all([
      this.browser_.target().createCDPSession().then(session => {
        this.session_ = session;
        if (this.options_.icon)
          this.setIcon(this.options_.icon);
      }),
      this.browser_.defaultBrowserContext().
          overridePermissions('https://domain', [
            'geolocation',
            'midi',
            'notifications',
            'camera',
            'microphone',
            'clipboard-read',
            'clipboard-write']),
      this.browser_.pages().then(pages => page = pages[0])
    ]);

    this.browser_.on('targetcreated', this.targetCreated_.bind(this));

    // Simulate the pageCreated sequence.
    let callback;
    const result = new Promise(f => callback = f);
    this.pendingWindows_.set('', { options: this.options_, callback });
    this.pageCreated_(page);
    return result;
  }

  /**
   * Close the app windows.
   */
  async exit() {
    debugApp('app.exit...');
    if (this.exited_)
      return;
    this.exited_ = true;
    await this.browser_.close();
    this.emit(App.Events.Exit);
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
        params.push(`${prop}=${options[prop]}`);
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
    this.exposedFunctions_.push({name, func});
    return Promise.all(this.windows().map(window => window.exposeFunction(name, func)));
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
   * @param {string=} folder Folder with the web content.
   * @param {string=} prefix Only serve folder for requests with given prefix.
   */
  serveFolder(folder = '', prefix = '') {
    this.www_.push({folder, prefix: wrapPrefix(prefix)});
  }

  /**
   * Serves pages from given origin, eg `http://localhost:8080`.
   * This can be used for the fast development mode available in web frameworks.
   *
   * @param {string} base
   * @param {string=} prefix Only serve folder for requests with given prefix.
   */
  serveOrigin(base, prefix = '') {
    this.www_.push({baseURL: new URL(base + '/'), prefix: wrapPrefix(prefix)});
  }

  /**
   * Calls given handler for each request and allows called to handle it.
   *
   * @param {function(!Request)} handler to be used for each request.
   */
  serveHandler(handler) {
    this.httpHandler_ = handler;
  }

  /**
   * @param {string=} uri
   * @param {...*} params
   * @return {!Promise<*>}
   */
  async load(uri = '', ...params) {
    return this.mainWindow().load(uri, ...params);
  }

  /**
   * Set the application icon shown in the OS dock / task swicher.
   * @param {string|!Buffer} dockIcon
   */
  async setIcon(icon) {
    const buffer = typeof icon === 'string' ? await fsReadFile(icon) : icon;
    this.session_.send('Browser.setDockTile',
        { image: buffer.toString('base64') }).catch(e => {});
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
  async pageCreated_(page) {
    const url = page.url();
    debugApp('Page created at', url);
    const seq = url.startsWith('about:blank?seq=') ? url.substr('about:blank?seq='.length) : '';
    const params = this.pendingWindows_.get(seq);
    const { callback, options } = params || { options: this.options_ };
    this.pendingWindows_.delete(seq);
    const window = new Window(this, page, options);
    await window.init_();
    this.windows_.set(page, window);
    if (callback)
      callback(window);
    this.emit(App.Events.Window, window);
  }

  /**
   * @param {!Window}
   */
  windowClosed_(window) {
    debugApp('window closed', window.loadURI_);
    this.windows_.delete(window.page_);
    if (!this.windows_.size)
      this.exit();
  }
}

App.Events = {
  Exit: 'exit',
  Window: 'window'
};

class Window extends EventEmitter {
  /**
   * @param {!App} app
   * @param {!Puppeteer.Page} page Puppeteer page
   * @param {!Object} options
   */
  constructor(app, page, options) {
    super();
    this.app_ = app;
    this.options_ = Object.assign({}, app.options_, options);
    this.www_ = [];
    this.page_ = page;
    this.page_.on('close', this.closed_.bind(this));
    this.page_.on('domcontentloaded', this.domContentLoaded_.bind(this));
    this.hostHandle_ = rpc.handle(new HostWindow(this));
  }

  async init_() {
    debugApp('Configuring window');
    const targetId = this.page_.target()._targetInfo.targetId;
    const bgcolor = Color.parse(this.options_.bgcolor);
    const bgcolorRGBA = bgcolor.canonicalRGBA();
    this.session_ = await this.page_.target().createCDPSession();

    await Promise.all([
      this.session_.send('Runtime.evaluate', { expression: 'self.paramsForReuse', returnByValue: true }).
        then(response => { this.paramsForReuse_ = response.result.value; }),
      this.session_.send('Emulation.setDefaultBackgroundColorOverride',
          {color: {r: bgcolorRGBA[0], g: bgcolorRGBA[1],
            b: bgcolorRGBA[2], a: bgcolorRGBA[3] * 255}}),
      this.app_.session_.send('Browser.getWindowForTarget', { targetId })
          .then(this.initBounds_.bind(this)),
      this.configureRpcOnce_(),
      ...this.app_.exposedFunctions_.map(({name, func}) => this.exposeFunction(name, func))
    ]);
  }

  /**
   * @param {string} name
   * @param {function} func
   * @return {!Promise}
   */
  exposeFunction(name, func) {
    debugApp('Exposing function', name);
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
   * @param {string=} prefix Only serve folder for requests with given prefix.
   */
  serveFolder(folder = '', prefix = '') {
    this.www_.push({folder, prefix: wrapPrefix(prefix)});
  }

  /**
   * Serves pages from given origin, eg `http://localhost:8080`.
   * This can be used for the fast development mode available in web frameworks.
   *
   * @param {string} base
   * @param {string=} prefix Only serve folder for requests with given prefix.
   */
  serveOrigin(base, prefix = '') {
    this.www_.push({baseURL: new URL(base + '/'), prefix: wrapPrefix(prefix)});
  }

  /**
   * Calls given handler for each request and allows called to handle it.
   *
   * @param {function(!Request)} handler to be used for each request.
   */
  serveHandler(handler) {
    this.httpHandler_ = handler;
  }

  /**
   * @param {string=} uri
   * @param {...*} params
   * @return {!Promise}
   */
  async load(uri = '', ...params) {
    debugApp('Load page', uri);
    this.loadURI_ = uri;
    this.loadParams_ = params;
    await this.initializeInterception_();
    debugApp('Navigating the page to', this.loadURI_);

    const result = new Promise(f => this.domContentLoadedCallback_ = f);
    // Await here to process exceptions.
    await this.page_.goto(new URL(this.loadURI_, 'https://domain/').toString(), {timeout: 0, waitFor: 'domcontentloaded'});
    // Make sure domContentLoaded callback is processed before we return.
    // That indirection is here to handle debug-related reloads we did not call for.
    return result;
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
   * Returns value specified in the carlo.launch(options.paramsForReuse). This is handy
   * when Carlo is reused across app runs. First Carlo app successfully starts the browser.
   * Second carlo attempts to start the browser, but browser profile is already in use.
   * Yet, new window is being opened in the first Carlo app. This new window returns
   * options.paramsForReuse passed into the second Carlo. This was single app knows what to
   * do with the additional windows.
   *
   * @return {*}
   */
  paramsForReuse() {
    return this.paramsForReuse_;
  }

  async configureRpcOnce_() {
    await this.page_.exposeFunction('receivedFromChild', data => this.receivedFromChild_(data));

    const rpcFile = (await fsReadFile(__dirname + '/../rpc/rpc.js')).toString();
    const features = [ require('./features/shortcuts.js'),
                       require('./features/file_info.js') ];

    await this.page_.evaluateOnNewDocument((rpcFile, features) => {
      const module = { exports: {} };
      eval(rpcFile);
      self.rpc = module.exports;
      self.carlo = {};
      let argvCallback;
      const argvPromise = new Promise(f => argvCallback = f);
      self.carlo.loadParams = () => argvPromise;

      function transport(receivedFromParent) {
        self.receivedFromParent = receivedFromParent;
        return receivedFromChild;
      }

      self.rpc.initWorld(transport, async(loadParams, win) => {
        argvCallback(loadParams);

        if (document.readyState === 'loading')
          await new Promise(f => document.addEventListener('DOMContentLoaded', f));

        for (const feature of features)
          eval(`(${feature})`)(win);
      });
    }, rpcFile, features.map(f => f.toString()));
  }

  async domContentLoaded_() {
    debugApp('Creating rpc world for page...');
    const transport = receivedFromChild => {
      this.receivedFromChild_ = receivedFromChild;
      return data => {
        const json = JSON.stringify(data);
        if (this.session_._connection)
          this.session_.send('Runtime.evaluate', {expression: `self.receivedFromParent(${json})`});
      };
    };
    if (this._lastWebWorldId)
      rpc.disposeWorld(this._lastWebWorldId);
    const { worldId } = await rpc.createWorld(transport, this.loadParams_, this.hostHandle_);
    debugApp('World created', worldId);
    this._lastWebWorldId = worldId;

    this.domContentLoadedCallback_();
  }

  async initializeInterception_() {
    debugApp('Initializing network interception...');
    if (this.interceptionInitialized_)
      return;
    if (this.www_.length + this.app_.www_.length === 0 && !this.httpHandler_ && !this.app_.httpHandler_)
      return;
    this.interceptionInitialized_ = true;
    this.session_.on('Network.requestIntercepted', this.requestIntercepted_.bind(this));
    return this.session_.send('Network.setRequestInterception', {patterns: [{urlPattern: '*'}]});
  }

  /**
   * @param {!Object} request Intercepted request.
   */
  async requestIntercepted_(payload) {
    debugServer('intercepted:', payload.request.url);
    const handlers = [];
    if (this.httpHandler_)
      handlers.push(this.httpHandler_);
    if (this.app_.httpHandler_)
      handlers.push(this.app_.httpHandler_);
    handlers.push(this.handleRequest_.bind(this));
    new HttpRequest(this.session_, payload, handlers);
  }

  /**
   * @param {!HttpRequest} request Intercepted request.
   */
  async handleRequest_(request) {
    const url = new URL(request.url());
    debugServer('request url:', url.toString());

    if (url.hostname !== 'domain') {
      request.deferToBrowser();
      return;
    }

    const urlpathname = url.pathname;
    for (const {prefix, folder, baseURL} of this.app_.www_.concat(this.www_)) {
      debugServer('prefix:', prefix);
      if (!urlpathname.startsWith(prefix))
        continue;

      const pathname = urlpathname.substr(prefix.length);
      debugServer('pathname:', pathname);
      if (baseURL) {
        request.deferToBrowser({ url: String(new URL(pathname, baseURL)) });
        return;
      }
      const fileName = path.join(folder, pathname);
      if (!fs.existsSync(fileName))
        continue;

      const headers = { 'content-type': contentType(request, fileName) };
      const body = await fsReadFile(fileName);
      request.fulfill({ headers, body});
      return;
    }
    request.deferToBrowser();
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
    rpc.dispose(this.hostHandle_);
    this.app_.windowClosed_(this);
    this.emit(Window.Events.Close);
  }

  /**
   * @return {boolean}
   */
  isClosed() {
    return this.page_.isClosed();
  }
}

Window.Events = {
  Close: 'close',
};

const imageContentTypes = new Map([
  ['jpeg', 'image/jpeg'], ['jpg', 'image/jpeg'], ['svg', 'image/svg+xml'], ['gif', 'image/gif'], ['webp', 'image/webp'],
  ['png', 'image/png'], ['ico', 'image/ico'], ['tiff', 'image/tiff'], ['tif', 'image/tif'], ['bmp', 'image/bmp']
]);

const fontContentTypes = new Map([
  ['ttf', 'font/opentype'], ['otf', 'font/opentype'], ['ttc', 'font/opentype'], ['woff', 'application/font-woff']
]);

/**
 * @param {!HttpRequest} request
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
 * @return {!App}
 */
async function launch(options = {}) {
  debugApp('Launching Carlo', options);
  options = Object.assign(options);
  if (!options.bgcolor)
    options.bgcolor = '#ffffff';
  options.localDataDir = options.localDataDir || path.join(__dirname, '.local-data');

  const { executablePath, type } = await findChrome(options);
  if (!executablePath) {
    console.error('Could not find Chrome installation, please make sure Chrome browser is installed from https://www.google.com/chrome/.');
    process.exit(0);
    return;
  }

  const targetPage = `
    <title>${encodeURIComponent(options.title || '')}</title>
    <style>html{background:${encodeURIComponent(options.bgcolor)};}</style>
    <script>self.paramsForReuse = ${JSON.stringify(options.paramsForReuse || undefined)};</script>`;

  const args = [
    `--app=data:text/html,${targetPage}`,
    `--enable-features=NetworkService`,
  ];

  if (options.args)
    args.push(...options.args);
  if (typeof options.width === 'number' && typeof options.height === 'number')
    args.push(`--window-size=${options.width},${options.height}`);
  if (typeof options.left === 'number' && typeof options.top === 'number')
    args.push(`--window-position=${options.left},${options.top}`);

  try {
    const browser = await puppeteer.launch({
      executablePath,
      pipe: true,
      defaultViewport: null,
      headless: testMode,
      userDataDir: options.userDataDir || path.join(options.localDataDir, `profile-${type}`),
      args });
    const app = new App(browser, options);
    await app.init_();
    return app;
  } catch (e) {
    if (e.toString().includes('Target closed'))
      throw new Error('Could not start the browser or the browser was already running with the given profile.');
    else
      throw e;
  }
}

class HostWindow {
  /**
   * @param {!Window} win
   */
  constructor(win) {
    this.window_ = win;
  }

  closeBrowser() {
    // Allow rpc response to land.
    setTimeout(() => this.window_.app_.exit(), 0);
  }

  async fileInfo(expression) {
    const { result } = await this.window_.session_.send('Runtime.evaluate', { expression });
    return this.window_.session_.send('DOM.getFileInfo', { objectId: result.objectId });
  }
}

function enterTestMode() {
  testMode = true;
}

function wrapPrefix(prefix) {
  if (!prefix.startsWith('/')) prefix = '/' + prefix;
  if (!prefix.endsWith('/')) prefix += '/';
  return prefix;
}

module.exports = { launch, enterTestMode };
