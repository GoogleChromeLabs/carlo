## RPC API

> This is a pre-release API, so it is a subject to change. Please use it at your own risk. Once API is validated, it will be bumped to v1.0 and preserved for backwards compatibility.

### Handles

In Carlo's RPC system one can obtain a `handle` to a local `object` and pass it between the execution
contexts. Execution contexts can be Chrome, Node, child processes or any other JavaScript
execution environment, local or remote.

![rpc](https://user-images.githubusercontent.com/883973/48327354-0d6f1f00-e5f3-11e8-99dc-fef5f4ad53dc.png)

Calling a method on the `handle` results in calling it on the actual `object`:

```js
class Foo {
  hello(name) { console.log(`hello ${name}`); }
}
const foo = rpc.handle(new Foo());  // <-- Obtained handle to object.
await foo.hello('world');  // <-- Prints 'hello world'.
```

> By default, `handle` has access to all the *public* methods of the object.
Public methods are the ones not starting or ending with `_`.

All handle operations are async, notice how synchronous `hello` method became async when accessed
via the handle. The world where `handle` is created can access the actual `object`. When handle is no longer needed, the world that created it can dispose it:

```js
const handle = rpc.handle(object);
const object = rpc.object(handle);
rpc.dispose(handle);
```

Properties of the target object are similarly accessible via the handle:

```js
const foo = rpc.handle({ myValue: 'value' });  // <-- Obtained handle to object.
await foo.myValue();  // <-- Returns 'value'.
```

Handles are passed between the worlds as arguments of the calls on other handles:

`World 1`
```js
class Parent {
  constructor() {
    this.children = [];
  }
  addChild(child) {
    this.children.push(child);
    return this.children.length - 1;
  }
}
```

`World 2`
```js
class Child {}

async function main(parent) {  // parent is a handle to the object from World 1.
  const child = rpc.handle(new Child);
  // Call method on parent remotely, pass handle to child into it.
  const ordinal = await parent.addChild(child);
  console.log(`Added child #${ordinal}`);
}
```

### Example
Following is an end-to-end example of the RPC application that demonstrates the variety of remote
operations that can be performed on handles:

`family.js`

```js
const rpc = require('rpc');

class Parent {
  constructor() {
    this.children = [];
  }

  addChild(child) {
    const ordinal = this.children.length;
    console.log(`Adding child #${ordinal}`);
    child.setOrdinal(ordinal);

    // Go over the children and make siblings aware of each other.
    for (const c of this.children) {
      c.setSibling(child);
      child.setSibling(c);
    }
    this.children.push(child);
    return ordinal;
  }
}

class Child {
  constructor() {
    // Obtain handle to self that is used in RPC.
    this.handle_ = rpc.handle(this);
  }

  setOrdinal(ordinal) { this.ordinal_ = ordinal; }
  ordinal() { return this.ordinal_; }

  async setSibling(sibling) {
    // Say hello to another sibling when it is reported.
    const o = await sibling.ordinal();
    console.log(`I am #${this.ordinal_} and I have a sibling #${o}`);
    await sibling.hiSibling(this.handle_);
  }

  async hiSibling(sibling) {
    const o = await sibling.ordinal();
    console.log(`I am #${this.ordinal_} and my sibling #${o} is saying hello`);
  }

  dispose() {
    rpc.dispose(this.handle_);
  }
}

module.exports = { Parent, Child };
```

`main.js` runs in the main process.
```js
const rpc = require('rpc');
const rpc_process = require('rpc_process');
const { Parent } = require('./family');

(async () => {
  // Create parent object in the main process, obtain the handle to it.
  const parent = rpc.handle(new Parent());

  // Create a child process and load worker.js there. Pass parent object
  // into that new child world, assign return value to a child.
  const child1 = await rpc_process.spawn(__dirname + '/worker.js', parent);
  parent.addChild(child1);

  // Do it again.
  const child2 = await rpc_process.spawn(__dirname + '/worker.js', parent);
  parent.addChild(child2);
})();
```

`worker.js` runs in a child process.
```js
const rpc = require('rpc');
const rpc_process = require('rpc_process');
const { Child } = require('./family');

rpc_process.init(parent => {
  // Note that parent is available in this context and we can call
  // parent.addChild(rpc.handle(new Child)) here.

  // But we prefer to simply return the handle to the newly created child
  // into the parent world for the sake of this demo.
  return rpc.handle(new Child());
});
```
