# Carlo

###### [Contributing](https://github.com/GoogleChromeLabs/carlo/blob/master/CONTRIBUTING.md)

> Carlo provides your Node application with the rich rendering capabilities powered by the Google Chrome browser.

![image](https://user-images.githubusercontent.com/883973/47678948-34a00800-db80-11e8-8275-d376145d2f6a.png)

<!-- [START usecases] -->
###### What can I do?

With Carlo, you can create hybrid applications that use Web stack for rendering and Node for capabilities:
- For Node applications, you can visualize dynamic state of your Node app using web rendering stack
- For Web applications, you can expose additional system capabilities accessible from Node

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

Check out more examples with richer UI and RPC-based communication between the Web and Node componenets under the `examples` folder.

<!-- [END getstarted] -->

## Contributing to Carlo

Check out [contributing guide](https://github.com/GoogleChromeLabs/carlo/blob/master/CONTRIBUTING.md) to get an overview of Puppeteer development.

<!-- [START faq] -->

# FAQ

<!-- [END faq] -->
