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
const findChrome = require('./find-chrome');
const rpc = require('./rpc');
const {Color} = require('./color');

const fs = require('fs');
const util = require('util');
const {URL} = require('url');
const fsReadFile = util.promisify(fs.readFile);

class App {
  /**
   * @param {!Page} page Puppeteer page
   * @param {!RpcServer} rpcServer
   */
  constructor(page, rpcServer) {
    this.www_ = new Map();
    this.page_ = page;
    this.page_.on('request', this.requestIntercepted_.bind(this));
    this.page_.on('close', () => process.exit());
    this.rpcServer_ = rpcServer;
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
    return this.page_.goto(`https://domain/${uri}`, {timeout: 0});
  }

  /**
   * @param {!Request} request Intercepted request.
   */
  async requestIntercepted_(request) {
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
      request.respond({
          status: 200,
          headers: { 'Content-Type': contentType(request, fileName) },
          body: buffer
      });
      return;
    }
    request.continue();
  }
}

const imageContentTypes = new Map([
  ['jpeg', 'image/jpeg'], ['jpg', 'image/jpeg'], ['svg', 'image/svg+xml'], ['gif', 'image/gif'], ['webp', 'image/webp'],
  ['png', 'image/png'], ['ico', 'image/ico'], ['tiff', 'image/tiff'], ['tif', 'image/tif'], ['bmp', 'image/bmp']
]);

const fontContentTypes = new Map([
  ['ttf', 'font/opentype'], ['otf', 'font/opentype'], ['ttc', 'font/opentype'], ['woff', 'application/font-woff']
]);

/**
 * @param {!Request} request
 * @param {!string} fileName
 */
function contentType(request, fileName) {
  const dotIndex = fileName.lastIndexOf('.');
  const extension = fileName.substr(dotIndex + 1);
  switch (request.resourceType()) {
    case 'document': return 'text/html';
    case 'script': return 'text/javascript';
    case 'stylesheet': return 'text/css';
    case 'image':
      return imageContentTypes.get(extension) || 'image/png';
    case 'font':
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
  const bgcolorRGBA = bgcolor.canonicalRGBA();

  const executablePath = findChrome().pop();
  if (!executablePath) {
    console.error('Could not find Chrome installation, please make sure Chrome browser is installed.')
    process.exit(0);
    return;
  }

  const args = [
      `--app=data:text/html,<style>html{background:${bgcolorHex};}</style>`,
      `--enable-features=NetworkService`,
  ];
  if (options.width && options.height)
      args.push(`--window-size=${options.width},${options.height}`);

  const browser = await puppeteer.launch({
      executablePath,
      pipe: true,
      defaultViewport: null,
      headless: false,
      userDataDir: '.profile',
      args });

  const page = (await browser.pages()).find(page => page.url().startsWith('data:text/html,'));
  page.setRequestInterception(true);
  page.target().createCDPSession().then(async session => {
    await session.send('Emulation.setDefaultBackgroundColorOverride',
              {color: {r: bgcolorRGBA[0], g: bgcolorRGBA[1],
                       b: bgcolorRGBA[2], a: bgcolorRGBA[3] * 255}});
    session.detach();
  });
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
  return new App(page, rpcServer);
}

module.exports = { launch };
