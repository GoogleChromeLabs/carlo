## API v0.9

> This is a pre-release API, so it is a subject to change. Please use it at your own risk. Once API is validated, it will be bumped to v1.0 and preserved for backwards compatibility.

##### Table of Contents

- [carlo.launch([options])](#carlolaunchoptions)
- [class: App](#class-app)
  * [event: 'exit'](#event-exit)
  * [App.evaluate(pageFunction, ...args)](#appevaluatepagefunction-args)
  * [App.exit()](#appexit)
  * [App.exposeFactory(factoryConstructor)](#appexposefactoryfactoryconstructor)
  * [App.exposeFunction(name, carloFunction)](#appexposefunctionname-carlofunction)
  * [App.exposeObject(name, object)](#appexposeobjectname-object)
  * [App.load(uri)](#apploaduri)
  * [App.serveFolder(folder, prefix)](#appservefolderfolder-prefix)
  * [App.serveOrigin(origin)](#appserveoriginorigin)

#### carlo.launch([options])
- `options` <[Object]>  Set of configurable options to set on the app. Can have the following fields:
  - `width` <[number]> app window width in pixels.
  - `height` <[number]> app window height in pixels.
  - `bgcolor` <[string]> background color using hex notation, defaults to `#ffffff`.
  - `userDataDir` <[string]> Path to a [User Data Directory](https://chromium.googlesource.com/chromium/src/+/master/docs/user_data_dir.md). This folder is created upon the first app launch and contains user settings and Web storage data. Defaults to `.profile`.
  - `executablePath` <[string]> Path to a Chromium or Chrome executable to run instead of the automatically located Chrome. If `executablePath` is a relative path, then it is resolved relative to [current working directory](https://nodejs.org/api/process.html#process_process_cwd). Carlo is only guaranteed to work with the latest Chrome stable version.
  - `args` <[Array]<[string]>> Additional arguments to pass to the browser instance. The list of Chromium flags can be found [here](https://peter.sh/experiments/chromium-command-line-switches/).
- returns: <[Promise]<[App]>> Promise which resolves to the app instance.

Launches the browser.

### class: App

#### event: 'exit'
Emitted when the App window closes.

#### App.evaluate(pageFunction, ...args)
- `pageFunction` <[function]|[string]> Function to be evaluated in the page context
- `...args` <...[Serializable]> Arguments to pass to `pageFunction`
- returns: <[Promise]<[Serializable]>> Promise which resolves to the return value of `pageFunction`

If the function passed to the `page.evaluate` returns a [Promise], then `page.evaluate` would wait for the promise to resolve and return its value.

If the function passed to the `App.evaluate` returns a non-[Serializable] value, then `page.evaluate` resolves to `undefined`.

Passing arguments to `pageFunction`:
```js
const result = await app.evaluate(() => navigator.userAgent);
console.log(result);  // prints "<UA>" in Node console
```

Passing arguments to `pageFunction`:
```js
const result = await app.evaluate(x => {
  return Promise.resolve(8 * x);
}, 7);
console.log(result);  // prints "56" in Node console
```

A string can also be passed in instead of a function:
```js
console.log(await app.evaluate('1 + 2'));  // prints "3"
const x = 10;
console.log(await app.evaluate(`1 + ${x}`));  // prints "11"
```

#### App.exit()
- returns: <[Promise]>

Closes the browser window.

#### App.exposeFactory(factoryConstructor)
- `factoryConstructor` <[function]> Factory of the objects to make available to Chrome.

The method makes the given object factory available to Chrome.

An example of adding a `world` object into the page:

`main.js`
```js
const carlo = require('carlo');

carlo.launch().then(async app => {
  app.serveFolder(__dirname);
  app.on('exit', () => process.exit());
  await app.exposeFactory(World);  // <-- expose factory to the Web side
  await app.load('index.html');
});

class World {
  hello(name) {
    return 'Hello ' + name;  // <-- return value to the web side.
  }
}
```

`index.html`
```html
<script>
async function start() {
  const world = await rpc.create('World');  // <- create remote instance.
  console.log(await world.hello('Carlo'));  // <-- remote call.
  world.dispose();  // <-- release handle.
}
</script>
<body onload="start()">Open console</body>
```

#### App.exposeFunction(name, carloFunction)
- `name` <[string]> Name of the function on the window object
- `carloFunction` <[function]> Callback function which will be called in Carlo's context.
- returns: <[Promise]>

The method adds a function called `name` on the page's `window` object.
When called, the function executes `carloFunction` in node.js and returns a [Promise] which resolves to the return value of `carloFunction`.

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

#### App.exposeObject(name, object)
- `name` <[string]> Name of the object
- `object` <[Object]> Object to make available to the web surface.

The method makes the given object available to Chrome.

> **NOTE** Communication between Chrome and Node takes place over the wired protocol, so the actual object Chrome is getting is a handle to the original object with the original methods available on that handle via RPC.

An example of adding a `world` object into the page:

`main.js`
```js
const EventEmitter = require('events');
const carlo = require('carlo');

carlo.launch().then(async app => {
  app.serveFolder(__dirname);
  app.on('exit', () => process.exit());
  const world = new World();  // <-- create object
  world.on('happy', console.log);  // <-- subscribe to events
  await app.exposeObject('world', world);  // <-- expose it to the Web side
  await app.load('index.html');
});

class World extends EventEmitter {
  hello(name) {
    this.emit('happy', 'happy event');  // <-- emit event that is handled on the Web side.
    return 'Hello ' + name;  // <-- return value to the Web side.
  }
}
```

`index.html`
```html
<script>
async function start() {
  const world = await rpc.lookup('world');  // <- lookup service by name.
  world.on('happy', console.log);  // <-- remote objects can emit events.
  console.log(await world.hello('Carlo'));
}
</script>
<body onload="start()">Open console</body>
```

#### App.load(uri)
- `uri` <[string]> Path to the resource relative to the folder passed into `serveFolder`.
- returns: <[Promise]>

Navigates the Chrome web app to the given `uri`.

#### App.serveFolder(folder, prefix)
- `folder` <[string]> Folder with web content to make available to Chrome.
- `prefix` <[string]> Prefix of the URL path to serve from the given folder.

Makes the content of the given folder available to the Chrome web app.

An example of adding a local `www` folder along with the `node_modules`:

`main.js`
```js
const carlo = require('carlo');

carlo.launch().then(async app => {
  app.on('exit', () => process.exit());
  app.serveFolder(__dirname + '/www');
  app.serveFolder(__dirname + '/node_modules', 'node_modules');
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

#### App.serveOrigin(origin)
- `origin` <[origin]> Origin to serve web content from.

Fetches Carlo content from the specified origin instead of reading it from the
file system, eg `http://localhost:8080`.
This mode can be used for the fast development mode available in web frameworks.

An example of adding the local `http://localhost:8080` origin:

`main.js`
```js
const carlo = require('carlo');

carlo.launch().then(async app => {
  app.on('exit', () => process.exit());
  app.serveOrigin('http://localhost:8080');  // <-- fetch from the local server
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

[App]: #class-app
[Array]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array "Array"
[Buffer]: https://nodejs.org/api/buffer.html#buffer_class_buffer "Buffer"
[Object]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object "Object"
[Promise]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise "Promise"
[Serializable]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#Description "Serializable"
[boolean]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type "Boolean"
[function]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function "Function"
[number]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type "Number"
[origin]: https://developer.mozilla.org/en-US/docs/Glossary/Origin "Origin"
[string]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type "String"
