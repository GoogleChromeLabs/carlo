## RPC API

> This is a pre-release API, so it is a subject to change. Please use it at your own risk. Once API is validated, it will be bumped to v1.0 and preserved for backwards compatibility.

In this RPC system one can obtain a handle to the local object and share
it between execution contexts. Obtaining the handle world as follows:

```js
class Foo {
  hello() { console.log('hello'); }
}
const foo = rpc.handle(new Foo());
```

By default, `handle` has access to all the *public* methods of the object.
Public methods are the ones not starting or ending with `_`. 

```js
await foo.hello();  // <-- prints hello
```

> Note how synchronous `Foo` methods become async when accessed through the
handle.

This handle can now be passed between the execution contexts (worlds) as an
argument of the call on another handle.

```js
class Child {}
function(parent) {
  const child = rpc.handle(new Child);
  parent.addChild(child);
}
```

If `parent` above belongs to a different world, `child` handle will be sent
there and the user will be able to call methods on child from that different
world. Return values of those calls will be relivered to the caller seamlessly.

For handles pointing to the local objects, there is a way to fetch the element
from the handle:

```js
const object = handle.object();
```

Following is an end-to-end example of the RPC application:

`family.js` defined Parent and Child classes that are going to be working in
multiple processes and will communicate with each other.

```js
const rpc = require('rpc');

class Parent {
  constructor() {
    this.children_ = [];
  }

  addChild(child) {
    console.log('Adding child #' + this.children_.length);

    // Set child ordinal when it is added to parent.
    child.setOrdinal(this.children_.length);

    // Go over the children and make sure siblings are aware
    // of each other.
    for (const c of this.children_) {
      c.setSibling(child);
      child.setSibling(c);
    }
    this.children_.push(child);
  }
}

class Child {
  constructor() {
    // Obtain handle to self that is used in RPC.
    this.self_ = rpc.handle(this);
  }

  setOrdinal(ordinal) {
    this.ordinal_ = ordinal;
    console.log(`I am now a child #${ordinal}`);
  }

  ordinal() {
    return this.ordinal_;
  }

  async setSibling(sibling) {
    // Say hello to another sibling when it is reported.
    const o = await sibling.ordinal();
    console.log(`I am #${this.ordinal_} and I have a sibling #${o}`);
    await sibling.hiSibling(this.self_);
  }

  async hiSibling(sibling) {
    const o = await sibling.ordinal();
    console.log(`I am #${this.ordinal_} and my sibling #${o} is saying hello`);
  }

  dispose() {
    rpc.dispose(this.self_);
  }
}

module.exports = { Parent, Child };
```

`main.js` main script runs in the main process.
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

`worker.js` worker script runs in a child process.
```js
const rpc = require('rpc');
const rpc_process = require('rpc_process');
const { Child } = require('./family');

rpc_process.init(parent => {
  // Note that parent is available in this context and we can call
  // parent.addChild(rpc.handle(new Child)) here.

  // But we prefer to simply return the handle to the newly created child
  // into the parent world.
  return rpc.handle(new Child());
});
```
