# Carlo - headful Node app framework

> Carlo provides Node applications with the rich rendering capabilities powered by the [Google Chrome](https://www.google.com/chrome/) browser.
It uses [Puppeteer](https://github.com/GoogleChrome/puppeteer/) project to communicate with the locally installed browser instance, provides remote call infrastructure for communication between Node and the browser.

###### [FAQ](#faq) | [Contributing](https://github.com/GoogleChromeLabs/carlo/blob/master/CONTRIBUTING.md)

![image](https://user-images.githubusercontent.com/883973/47826256-0531fc80-dd34-11e8-9c8d-c1b93a6ba631.png)

<!-- [START usecases] -->
###### What can I do?

With Carlo, you can create hybrid applications that use Web stack for rendering and Node for capabilities:
- For Node applications, you can visualize dynamic state of your Node app using web rendering stack
- For Web applications, you can expose additional system capabilities accessible from Node
- Bundle your application into a single executable using [pkg](https://github.com/zeit/pkg).

###### How does it work?

- Carlo locates Google Chrome installed locally
- Launches it and establishes connection to Chrome over the process pipe
- Exposes high level API for rendering in Chrome in Node environment
- Carlo is based on the [Puppeteer](https://github.com/GoogleChrome/puppeteer/) project

<!-- [END usecases] -->

<!-- [START getstarted] -->
## Getting Started

### Installation

To use Carlo in your project, run:

```bash
npm i carlo
# or "yarn add carlo"
```

### Usage

Note: Carlo requires at least Node v7.6.0.

**Example** - Visualize local environment:

Save file as **example.js**

```js
const carlo = require('carlo');

(async () => {
  const app = await carlo.launch();
  app.serveFolder(__dirname);
  await app.exposeFunction('env', _ => process.env);
  await app.load('example.html');
})();
```

Save file as **example.html**

```html
<script>
async function run() {
  const data = await env();
  for (const type in data) {
    const div = document.createElement('div');
    div.textContent = `${type}: ${data[type]}`;
    document.body.appendChild(div);
  }
}
</script>
<body onload="run()">
```


Execute script on the command line

```bash
node example.js
```

Check out more examples with richer UI and RPC-based communication between the Web and Node components under the `examples` folder.

<!-- [END getstarted] -->

## Contributing to Carlo

Check out [contributing guide](https://github.com/GoogleChromeLabs/carlo/blob/master/CONTRIBUTING.md) to get an overview of Carlo development.

<!-- [START faq] -->

# FAQ

#### Q: What was the motivation behind this project when we already have Electron and NW.js? How this differs from these platforms, how it helps to achieve something that's not possible/harder with these two?

- One of the motivations is to demonstrate how browser installed locally can be used with Node out of the box.
- Unlike with Electron, Node v8 and Chrome v8 engines are decoupled in Carlo, providing a maintainable model with the ability of the independent updates of the underlying components. Carlo is less about branding and is more about productivity + giving the control over bundling to the user.

#### Q: Can Node app using Carlo be packaged as a Desktop app?

One can use the [pkg](https://github.com/zeit/pkg) project to package their Node app as a Desktop app. Carlo does not provide the branding configurability such as application icon or customizable menus, it focuses on the productivity and Web/Node interoperability instead. Check out the [systeminfo](https://github.com/GoogleChromeLabs/carlo/tree/master/examples/systeminfo) example and call `pkg package.json` in it to see how it works.

<!-- [END faq] -->
