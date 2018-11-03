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
const rpc = require('./rpc');
const {Color} = require('./color');
const {InterceptedRequest} = require('./intercepted_request');

const fs = require('fs');
const util = require('util');
const {URL} = require('url');
const EventEmitter = require('events');
const fsReadFile = util.promisify(fs.readFile);

class App extends EventEmitter {
  /**
   * @param {!Page} page Puppeteer page
   * @param {!RpcServer} rpcServer
   */
  constructor(page, rpcServer) {
    super();
    this.www_ = new Map();
    this.page_ = page;
    this.page_.on('close', () => this.emit(App.Events.Exit));
    this.rpcServer_ = rpcServer;
  }

  /**
   * @param {!Color} bgcolor
   */
  async init(bgcolor) {
    const bgcolorRGBA = bgcolor.canonicalRGBA();
    this.session_ = await this.page_.target().createCDPSession();
    return Promise.all([
      this.session_.send('Emulation.setDefaultBackgroundColorOverride',
          {color: {r: bgcolorRGBA[0], g: bgcolorRGBA[1],
            b: bgcolorRGBA[2], a: bgcolorRGBA[3] * 255}}),
      this.session_.send('Network.setRequestInterception', {patterns: [{urlPattern: '*'}]}),
      this.session_.on('Network.requestIntercepted', this.requestIntercepted_.bind(this))
    ]);
  }

  async exit() {
    await this.browser_.close();
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
   * @param {function(new:EventEmitter)} c Constructor of the remotely accessible
   *     service object.
   */
  exposeFactory(c) {
    this.rpcServer_.exposeFactory(c);
  }

  /**
   * @param {string} name Service name.
   * @param {!Object} object Service object.
   */
  exposeObject(name, object) {
    this.rpcServer_.exposeObject(name, object);
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
   * @param {string} www Folder with the web content.
   * @param {string=} path Only serve folder for requests with given prefix.
   */
  serveFolder(folder, prefix) {
    this.www_.set(prefix || '', folder);
  }

  /**
   * @param {string} uri
   * @return {!Promise}
   */
  load(uri) {
    if (!this.www_.size) {
      this.page_.close();
      throw new Error('Please call app.serveFolder(__dirname) or point to ' +
                      'other folder(s) with your web files');
    }
    return this.page_.goto(`https://domain/${uri}`, {timeout: 0});
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
    for (const [prefix, folder] of this.www_) {
      let pathname = url.pathname.substr(1);
      if (!pathname.startsWith(prefix))
        continue;
      pathname = pathname.substr(prefix.length);
      const fileName = folder + '/' + pathname;
      if (!fs.existsSync(fileName))
        continue;
      const buffer = await fsReadFile(fileName);
      request.fulfill(200, { 'content-type': contentType(request, fileName) }, buffer);
      return;
    }
    request.continue();
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
 * @return {!Browser}
 */
async function launch(options = {}) {
  if (!options.bgcolor)
    options.bgcolor = '#ffffff';
  const bgcolor = Color.parse(options.bgcolor);
  const bgcolorHex = bgcolor.asString(Color.Format.HEX);

  const executablePath = options.executablePath || findChrome().pop();
  if (!executablePath) {
    console.error('Could not find Chrome installation, please make sure Chrome browser is installed from https://www.google.com/chrome/.');
    process.exit(0);
    return;
  }

  const args = [
    `--app=data:text/html,<style>html{background:${bgcolorHex};}</style>`,
    `--enable-features=NetworkService`,
  ];

  if (options.args)
    args.push(...options.args);

  if (options.width && options.height)
    args.push(`--window-size=${options.width},${options.height}`);

  const browser = await puppeteer.launch({
    executablePath,
    pipe: true,
    defaultViewport: null,
    headless: false,
    userDataDir: options.userDataDir || '.profile',
    args });

  const page = (await browser.pages()).find(page => page.url().startsWith('data:text/html,'));
  const rpcServer = new rpc.Server(page);
  const context = browser.defaultBrowserContext();
  await Promise.all([
    context.overridePermissions('https://domain', [
      'geolocation',
      'midi',
      'notifications',
      'camera',
      'microphone',
      'clipboard-read',
      'clipboard-write']),
    rpcServer.init(page)]);
  const app = new App(page, rpcServer);
  await app.init(bgcolor);
  return app;
}

module.exports = { launch };
