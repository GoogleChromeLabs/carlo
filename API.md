## API v0.9

> This is a pre-release API, so it is a subject to change. Please use it at your own risk. Once API is validated, it will be bumped to v1.0 and preserved for backwards compatibility.

##### Table of Contents

- [carlo.enterTestMode()](#carloentertestmode)
- [carlo.launch([options])](#carlolaunchoptions)
- [carlo.loadParams()](#carloloadparams)
- [class: App](#class-app)
  * [event: 'exit'](#event-exit)
  * [event: 'window'](#event-window)
  * [App.browserForTest()](#appbrowserfortest)
  * [App.createWindow(options)](#appcreatewindowoptions)
  * [App.evaluate(pageFunction[, ...args])](#appevaluatepagefunction-args)
  * [App.exit()](#appexit)
  * [App.exposeFunction(name, carloFunction)](#appexposefunctionname-carlofunction)
  * [App.load(uri[, ...params])](#apploaduri-params)
  * [App.mainWindow()](#appmainwindow)
  * [App.serveFolder(folder[, prefix])](#appservefolderfolder-prefix)
  * [App.serveHandler(handler)](#appservehandlerhandler)
  * [App.serveOrigin(base[, prefix])](#appserveoriginbase-prefix)
  * [App.setIcon(image)](#appseticonimage)
  * [App.windows()](#appwindows)
- [class: HttpRequest](#class-httprequest)
  * [HttpRequest.abort()](#httprequestabort)
  * [HttpRequest.continue()](#httprequestcontinue)
  * [HttpRequest.fulfill(options)](#httprequestfulfilloptions)
  * [HttpRequest.headers()](#httprequestheaders)
  * [HttpRequest.method()](#httprequestmethod)
  * [HttpRequest.url()](#httprequesturl)
- [class: Window](#class-window)
  * [event: 'close'](#event-close)
  * [Window.bounds()](#windowbounds)
  * [Window.bringToFront()](#windowbringtofront)
  * [Window.close()](#windowclose)
  * [Window.evaluate(pageFunction[, ...args])](#windowevaluatepagefunction-args)
  * [Window.exposeFunction(name, carloFunction)](#windowexposefunctionname-carlofunction)
  * [Window.fullscreen()](#windowfullscreen)
  * [Window.load(uri[, ...params])](#windowloaduri-params)
  * [Window.maximize()](#windowmaximize)
  * [Window.minimize()](#windowminimize)
  * [Window.pageForTest()](#windowpagefortest)
  * [Window.paramsForReuse()](#windowparamsforreuse)
  * [Window.serveFolder(folder[, prefix])](#windowservefolderfolder-prefix)
  * [Window.serveHandler(handler)](#windowservehandlerhandler)
  * [Window.serveOrigin(base[, prefix])](#windowserveoriginbase-prefix)
  * [Window.setBounds(bounds)](#windowsetboundsbounds)

#### carlo.enterTestMode()

Enters headless test mode. In the test mode, Puppeteer browser and pages are available via
[App.browserForTest()](#appbrowserfortest) and [Window.pageForTest()](#windowpagefortest) respectively.
Please refer to the Puppeteer [documentation](https://pptr.dev) for details on headless testing.

#### carlo.launch([options])
- `options` <[Object]> Set of configurable options to set on the app. Can have the following fields:
  - `width` <[number]> App window width in pixels.
  - `height` <[number]> App window height in pixels.
  - `top`: <[number]> App window top offset in pixels.
  - `left` <[number]> App window left offset in pixels.
  - `bgcolor` <[string]> Background color using hex notation, defaults to `'#ffffff'`.
  - `channel` <[Array]<[string]>> Browser to be used, defaults to `['stable']`:
    - `'stable'` only uses locally installed stable channel Chrome.
    - `'canary'` only uses Chrome SxS aka Canary.
    - `'chromium'` downloads local version of Chromium compatible with the Puppeteer used.
    - `'rXXXXXX'` a specific Chromium revision is used.
  - `icon` <[Buffer]|[string]> Application icon to be used in the system dock. Either buffer containing PNG or a path to the PNG file on the file system. This feature is only available in Chrome M72+. One can use `'canary'` channel to see it in action before M72 hits stable.
  - `paramsForReuse` <\*> Optional parameters to share between Carlo instances. See [Window.paramsForReuse](#windowparamsforreuse) for details.
  - `title` <[string]> Application title.
  - `userDataDir` <[string]> Path to a [User Data Directory](https://chromium.googlesource.com/chromium/src/+/master/docs/user_data_dir.md). This folder is created upon the first app launch and contains user settings and Web storage data. Defaults to `'.profile'`.
  - `executablePath` <[string]> Path to a Chromium or Chrome executable to run instead of the automatically located Chrome. If `executablePath` is a relative path, then it is resolved relative to [current working directory](https://nodejs.org/api/process.html#process_process_cwd). Carlo is only guaranteed to work with the latest Chrome stable version.
  - `args` <[Array]<[string]>> Additional arguments to pass to the browser instance. The list of Chromium flags can be found [here](https://peter.sh/experiments/chromium-command-line-switches/).
- `return`: <[Promise]<[App]>> Promise which resolves to the app instance.

Launches the browser.

#### carlo.loadParams()
- `return`: <[Promise]<[Array]>> parameters passed into [window.load()](#windowloaduri-params).

This method is available in the Web world and returns parameters passed into the [window.load()](#windowloaduri-params). This is how Carlo passes initial set of <[rpc]> handles to Node objects into the web world.

### class: App

#### event: 'exit'
Emitted when the last window closes.

#### event: 'window'
- <[Window]>

Emitted when the new window opens. This can happen in the following situations:
- [App.createWindow](#appcreatewindowoptions) was called.
- [carlo.launch](#carlolaunchoptions) was called from the same or another instance of the Node app.
- [window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open) was called from within the web page.

#### App.browserForTest()
- `return`: <[Browser]> Puppeteer browser object for testing.

#### App.createWindow([options])
- `options` <[Object]> Set of configurable options to set on the app. Can have the following fields:
  - `width` <[number]> Window width in pixels, defaults to app width.
  - `height` <[number]> Window height in pixels, defaults to app height.
  - `top` <[number]> Window top in pixels, defaults to app top.
  - `left` <[number]> Window left in pixels, defaults to app left.
  - `bgcolor` <[string]> Background color using hex notation, defaults to app `bgcolor`.
- `return`: <[Promise]<[Window]>> Promise which resolves to the window instance.

Creates a new app window.

#### App.evaluate(pageFunction[, ...args])

Shortcut to the main window's [Window.evaluate(pageFunction[, ...args])](#windowevaluatepagefunction-args).

#### App.exit()
- `return`: <[Promise]>

Closes the browser window.

#### App.exposeFunction(name, carloFunction)
- `name` <[string]> Name of the function on the window object.
- `carloFunction` <[function]> Callback function which will be called in Carlo's context.
- `return`: <[Promise]>

The method adds a function called `name` on the pages' `window` object.
When called, the function executes `carloFunction` in Node.js and returns a [Promise] which resolves to the return value of `carloFunction`.

If the `carloFunction` returns a [Promise], it will be awaited.

> **NOTE** Functions installed via `App.exposeFunction` survive navigations.

An example of adding an `md5` function into the page:

`main.js`
```js
const carlo = require('carlo');
const crypto = require('crypto');

carlo.launch().then(async app => {
  app.on('exit', () => process.exit());
  app.serveFolder(__dirname);
  await app.exposeFunction('md5', text =>  // <-- expose function
    crypto.createHash('md5').update(text).digest('hex')
  );
  await app.load('index.html');
});
```

`index.html`
```html
<script>
md5('digest').then(result => document.body.textContent = result);
</script>
```

#### App.load(uri[, ...params])

Shortcut to the main window's [Window.load(uri[, ...params])](#windowloaduri-params).

#### App.mainWindow()
- `return`: <[Window]> Returns main window.

Running app guarantees to have main window. If current main window closes, a next open window
becomes the main one.

#### App.serveFolder(folder[, prefix])
- `folder` <[string]> Folder with web content to make available to Chrome.
- `prefix` <[string]> Prefix of the URL path to serve from the given folder.

Makes the content of the given folder available to the Chrome web app.

An example of adding a local `www` folder along with the `node_modules`:

`main.js`
```js
const carlo = require('carlo');

carlo.launch().then(async app => {
  app.on('exit', () => process.exit());
  app.serveFolder(`${__dirname}/www`);
  app.serveFolder(`${__dirname}/node_modules`, 'node_modules');
  await app.load('index.html');
});
```
***www***/`index.html`
```html
<style>body { white-space: pre; }</style>
<script>
fetch('node_modules/carlo/package.json')
    .then(response => response.text())
    .then(text => document.body.textContent = text);
</script>
```

#### App.serveHandler(handler)
- `handler` <[Function]> Network handler callback accepting the [HttpRequest](#class-httprequest) parameter.

An example serving primitive `index.html`:
```js
const carlo = require('carlo');

carlo.launch().then(async app => {
  app.on('exit', () => process.exit());
  app.serveHandler(request => {
    if (request.url().endsWith('/index.html'))
      request.fulfill({body: Buffer.from('<html>Hello World</hmtl>')});
    else
      request.continue();  // <-- user needs to resolve each request, otherwise it'll time out.
  });
  await app.load('index.html');  // <-- loads index.html served above.
});
```

Handler function is called with every network request in this app. It can abort, continue or fulfill each request. Only single app-wide handler can be registered.

#### App.serveOrigin(base[, prefix])
- `base` <[string]> Base to serve web content from.
- `prefix` <[string]> Prefix of the URL path to serve from the given folder.

Fetches Carlo content from the specified origin instead of reading it from the file system, eg `http://localhost:8080`. This mode can be used for the fast development mode available in web frameworks.

An example of adding the local `http://localhost:8080` origin:

```js
const carlo = require('carlo');

carlo.launch().then(async app => {
  app.on('exit', () => process.exit());
  app.serveOrigin('http://localhost:8080');  // <-- fetch from the local server
  app.serveFolder(__dirname);  // <-- won't be used
  await app.load('index.html');
});
```

#### App.setIcon(image)
- `image`: <[Buffer]|[string]> Either buffer containing PNG or a path to the PNG file on the file system.

Specifies image to be used as an app icon in the system dock.

> This feature is only available in Chrome M72+. One can use `'canary'` channel to see it in action before M72 hits stable.

#### App.windows()
- `return`: <[Array]<[Window]>> Returns all currently opened windows.

Running app guarantees to have at least one open window.

### class: HttpRequest

Handlers registered via [App.serveHandler](#appservehandlerhandler) and [Window.serveHandler](#windowservehandlerhandler) receive parameter of this upon every network request.

#### HttpRequest.abort()
- `return`: <[Promise]>

Aborts request.

#### HttpRequest.continue()

Proceeds with the default behavior for this request. Either serves it from the filesystem or defers to the browser.

#### HttpRequest.fulfill(options)
- `options`: <[Object]>
  - `status` <[number]> HTTP status code (200, 304, etc), defaults to 200.
  - `headers` <[Object]> HTTP response headers.
  - `body` <[Buffer]> Response body.
- `return`: <[Promise]>

Fulfills the network request with the given data. `'Content-Length'` header is generated in case it is not listed in the headers.

#### HttpRequest.headers()
- `return`: <[Object]> HTTP headers

Network request headers.

#### HttpRequest.method()
- `return`: <[string]> HTTP method

HTTP method of this network request (GET, POST, etc).

#### HttpRequest.url()
- `return`: <[string]> HTTP URL

Network request URL.

### class: Window

#### event: 'close'
Emitted when the window closes.

#### Window.bounds()
- `return`: <[Promise]<[Object]>>
  - `top` <[number]> Top offset in pixels.
  - `left` <[number]> Left offset in pixels.
  - `width` <[number]> Width in pixels.
  - `height` <[number]> Height in pixels.

Returns window bounds.

#### Window.bringToFront()
- `return`: <[Promise]>

Brings this window to front.

#### Window.close()
- `return`: <[Promise]>

Closes this window.

#### Window.evaluate(pageFunction[, ...args])
- `pageFunction` <[function]|[string]> Function to be evaluated in the page context.
- `...args` <...[Serializable]> Arguments to pass to `pageFunction`.
- `return`: <[Promise]<[Serializable]>> Promise which resolves to the return value of `pageFunction`.

If the function passed to the `Window.evaluate` returns a [Promise], then `Window.evaluate` would wait for the promise to resolve and return its value.

If the function passed to the `Window.evaluate` returns a non-[Serializable] value, then `Window.evaluate` resolves to `undefined`.

```js
const result = await window.evaluate(() => navigator.userAgent);
console.log(result);  // prints "<UA>" in Node console
```

Passing arguments to `pageFunction`:
```js
const result = await window.evaluate(x => {
  return Promise.resolve(8 * x);
}, 7);
console.log(result);  // prints "56" in Node console
```

A string can also be passed in instead of a function:
```js
console.log(await window.evaluate('1 + 2'));  // prints "3"
const x = 10;
console.log(await window.evaluate(`1 + ${x}`));  // prints "11"
```

#### Window.exposeFunction(name, carloFunction)
- `name` <[string]> Name of the function on the window object.
- `carloFunction` <[function]> Callback function which will be called in Carlo's context.
- `return`: <[Promise]>

Same as [App.exposeFunction](#appexposefunctionname-carlofunction), but only applies to
the current window.

> **NOTE** Functions installed via `Window.exposeFunction` survive navigations.

#### Window.fullscreen()
- `return`: <[Promise]>

Turns the window into the full screen mode. Behavior is platform-specific.

#### Window.load(uri[, ...params])
- `uri` <[string]> Path to the resource relative to the folder passed into [`serveFolder()`].
- `params` <\*> Optional parameters to pass to the web application. Parameters can be
primitive types, <[Array]>, <[Object]> or <[rpc]> `handles`.
- `return`: <[Promise]> Resolves upon DOMContentLoaded event in the web page.

Navigates the corresponding web page to the given `uri`, makes given `params` available in the web page via [carlo.loadParams()](#carloloadparams).

`main.js`
```js
const carlo = require('carlo');
const { rpc } = require('carlo/rpc');

carlo.launch().then(async app => {
  app.serveFolder(__dirname);
  app.on('exit', () => process.exit());
  await app.load('index.html', rpc.handle(new Backend));
});

class Backend {
  hello(name) {
    console.log(`Hello ${name}`);
    return 'Backend is happy';
  }

  setFrontend(frontend) {
    // Node world can now use frontend RPC handle.
    this.frontend_ = frontend;
  }
}
```

`index.html`
```html
<script>
class Frontend {}

async function load(backend) {
  // Web world can now use backend RPC handle.
  console.log(await backend.hello('from frontend'));
  await backend.setFrontend(rpc.handle(new Frontend));
}
</script>
<body>Open console</body>
```

#### Window.maximize()
- `return`: <[Promise]>

Maximizes the window. Behavior is platform-specific.

#### Window.minimize()
- `return`: <[Promise]>

Minimizes the window. Behavior is platform-specific.

#### Window.pageForTest()
- `return`: <[Page]> Puppeteer page object for testing.

#### Window.paramsForReuse()
- `return`: <\*> parameters.

Returns the `options.paramsForReuse` value passed into the [carlo.launch](#carlolaunchoptions).

These parameters are useful when Carlo app is started multiple times:
- First time the Carlo app is started, it successfully calls `carlo.launch` and opens the main window.
- Second time the Carlo app is started, `carlo.launch` fails with the 'browser is already running' exception.
- Despite the fact that second call to `carlo.launch` failed, a new window is created in the first Carlo app. This window contains `paramsForReuse` value that was specified in the second (failed) `carlo.launch` call.

This way app can pass initialization parameters such as command line, etc. to the singleton Carlo that owns the browser.

#### Window.serveFolder(folder[, prefix])
- `folder` <[string]> Folder with web content to make available to Chrome.
- `prefix` <[string]> Prefix of the URL path to serve from the given folder.

Same as [App.serveFolder(folder[, prefix])](#appservefolderfolder-prefix), but
only applies to current window.

#### Window.serveHandler(handler)
- `handler` <[Function]> Network handler callback accepting the [HttpRequest](#class-httprequest) parameter.

Same as [App.serveHandler(handler)](#appservehandlerhandler), but only applies to the current window requests.
Only single window-level handler can be installed in window.

#### Window.serveOrigin(base[, prefix])
- `base` <[string]> Base to serve web content from.
- `prefix` <[string]> Prefix of the URL path to serve from the given folder.

Same as [App.serveOrigin(base[, prefix])](#appserveoriginbase-prefix), but
only applies to current window.

#### Window.setBounds(bounds)
- `bounds` <[Object]> Window bounds:
  - `top`: <[number]> Top offset in pixels.
  - `left` <[number]> Left offset in pixels.
  - `width` <[number]> Width in pixels.
  - `height` <[number]> Height in pixels.
- `return`: <[Promise]>

Sets window bounds. Parameters `top`, `left`, `width` and `height` are all optional. Dimension or
the offset is only applied when specified.

[`serveFolder()`]: #windowservefolderfolder-prefix
[App]: #class-app
[Array]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array "Array"
[Browser]: https://pptr.dev/#?show=api-class-browser "Browser"
[Buffer]: https://nodejs.org/api/buffer.html#buffer_class_buffer "Buffer"
[Object]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object "Object"
[Page]: https://pptr.dev/#?show=api-class-page "Page"
[Promise]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise "Promise"
[Serializable]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#Description "Serializable"
[Window]: #class-window
[boolean]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type "Boolean"
[function]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function "Function"
[number]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type "Number"
[origin]: https://developer.mozilla.org/en-US/docs/Glossary/Origin "Origin"
[rpc]: https://github.com/GoogleChromeLabs/carlo/blob/master/rpc/rpc.md "rpc"
[string]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type "String"
