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

const {TestRunner, Reporter, Matchers} = require('@pptr/testrunner');
const rpc = require('./rpc');

// Runner holds and runs all the tests
const runner = new TestRunner({
  parallel: 2, // run 2 parallel threads
  timeout: 1000, // setup timeout of 1 second per test
});
// Simple expect-like matchers
const {expect} = new Matchers();

// Extract jasmine-like DSL into the global namespace
const {describe, xdescribe, fdescribe} = runner;
const {it, fit, xit} = runner;
const {beforeAll, beforeEach, afterAll, afterEach} = runner;

async function createChildWorld(rpc, params, initializer) {
  let sendToParent;
  let sendToChild;
  function transport1(receivedFromChild) {
    sendToParent = receivedFromChild;
    return data => sendToChild(data);
  }
  function transport2(receivedFromParent) {
    sendToChild = receivedFromParent;
    return data => sendToParent(data);
  }
  const childRpc = new rpc.constructor();
  childRpc.initWorld(transport2, p => initializer(p, childRpc));
  const result = rpc.createWorld(transport1, params);
  return result.then(() => childRpc);
}

describe('rpc', () => {
  it('call method', async(state, test) => {
    class Foo {
      sum(a, b) { return a + b; }
    }
    const foo = rpc.handle(new Foo());
    expect(await foo.sum(1, 3)).toBe(4);
  });
  it('call bogus method', async(state, test) => {
    class Foo {
      sum(a, b) { return a + b; }
    }
    const foo = rpc.handle(new Foo());
    try {
      expect(await foo.add(1, 3)).toBe(4);
      expect(true).toBeFalsy();
    } catch (e) {
    }
  });
  it('call method with object', async(state, test) => {
    class Foo {
      sum(a, b) { return { value: a.value + b.value }; }
    }
    const foo = rpc.handle(new Foo());
    const result = await foo.sum({value: 1}, {value: 3});
    expect(result.value).toBe(4);
  });
  it('call method with array', async(state, test) => {
    class Foo {
      sum(arr) { return arr.reduce((a, c) => a + c, 0); }
    }
    const foo = rpc.handle(new Foo());
    const result = await foo.sum([1, 2, 3, 4, 5]);
    expect(result).toBe(15);
  });
  it('call method with objects with handles', async(state, test) => {
    class Foo {
      async call(val) { return await val.a[0].name(); }
      name() { return 'name'; }
    }
    const foo = rpc.handle(new Foo());
    const result = await foo.call({a: [foo]});
    expect(result).toBe('name');
  });
  it('call method with object with recursive link', async(state, test) => {
    class Foo {
      async call(val) { return await val.a[0].name(); }
      name() { return 'name'; }
    }
    const foo = rpc.handle(new Foo());
    const a = {};
    a.a = a;
    try {
      await foo.call({a});
    } catch (e) {
      expect(e.message).toBe('Object reference chain is too long');
    }
  });
  it('call method that does not exist', async(state, test) => {
    class Foo {
    }
    const foo = rpc.handle(new Foo());
    try {
      await foo.sum(1, 3);
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.toString()).toContain('There is no member');
    }
  });
  it('call private method', async(state, test) => {
    const foo = rpc.handle({});
    try {
      await foo._sum(1, 3);
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.toString()).toContain('Private members are not exposed over RPC');
    }
  });
  it('call method exception', async(state, test) => {
    class Foo {
      sum(a, b) { return b + c; }
    }
    const foo = rpc.handle(new Foo());
    try {
      await foo.sum(1, 3);
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.toString()).toContain('c is not defined');
    }
  });
  it('call nested exception', async(state, test) => {
    class Foo {
      sum(a, b) { return rpc.handle(this).doSum(a, b); }
      doSum(a, b) { return b + c; }
    }
    const foo = rpc.handle(new Foo());
    try {
      await foo.sum(1, 3);
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.toString()).toContain('c is not defined');
    }
  });
  it('handle to function', async(state, test) => {
    class Foo {
      call(callback) { return callback(); }
    }
    const foo = rpc.handle(new Foo());
    let calls = 0;
    await foo.call(rpc.handle(() => ++calls));
    expect(calls).toBe(1);
  });
  it('handle to function exception', async(state, test) => {
    class Foo {
      call(callback) { return callback(); }
    }
    const foo = rpc.handle(new Foo());
    const calls = 0;
    try {
      await foo.call(rpc.handle(() => ++calls));
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.toString()).toContain('Assignment to constant');
    }
  });
  it('access property', async(state, test) => {
    const foo = rpc.handle({ value: 'Hello wold' });
    expect(await foo.value()).toBe('Hello wold');
  });
  it('access property with params', async(state, test) => {
    const foo = rpc.handle({ value: 'Hello wold' });
    try {
      expect(await foo.value(1)).toBe('Hello wold');
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.toString()).toContain('is not a function');
    }
  });
  it('materialize handle', async(state, test) => {
    const object = {};
    const handle = rpc.handle(object);
    expect(rpc.object(handle) === object).toBeTruthy();
  });
  it('access disposed handle', async(state, test) => {
    class Foo {
      sum(a, b) { return b + c; }
    }
    const foo = rpc.handle(new Foo());
    rpc.dispose(foo);
    try {
      await foo.sum(1, 2);
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.toString()).toContain('Object has been diposed');
    }
  });
  it('dedupe implicit handles in the same world', async(state, test) => {
    let foo2;
    class Foo { foo(f) { foo2 = f; }}
    const foo = rpc.handle(new Foo());
    await foo.foo(foo);
    expect(foo === foo2).toBeTruthy();
  });
  it('handle to handle should throw', async(state, test) => {
    const handle = rpc.handle({});
    try {
      rpc.handle(handle);
      expect(true).toBeFalsy();
    } catch (e) {
      expect(e.toString()).toContain('Can not return handle to handle');
    }
  });
  it('parent / child communication', async(state, test) => {
    const messages = [];
    class Root {
      hello(message) { messages.push(message); }
    }
    const root = rpc.handle(new Root());
    await createChildWorld(rpc, root, p => p.hello('one'));
    await createChildWorld(rpc, root, p => p.hello('two'));
    expect(messages.join(',')).toBe('one,two');
  });
  it('parent / grand child communication', async(state, test) => {
    const messages = [];
    class Root {
      hello(message) { messages.push(message); }
    }
    const root = rpc.handle(new Root());
    await createChildWorld(rpc, root, async(p, r) => {
      await createChildWorld(r, p, p => p.hello('one'));
    });
    expect(messages.join(',')).toBe('one');
  });
  it('child / child communication', async(state, test) => {
    const messages = [];
    class Parent {
      constructor() { this.children_ = []; }
      addChild(child) {
        this.children_.forEach(c => { c.setSibling(child); child.setSibling(c); });
        this.children_.push(child);
      }
    }
    class Child {
      constructor() {}
      setSibling(sibling) {
        sibling.helloSibling('hello');
      }
      helloSibling(message) {
        messages.push(message);
      }
    }
    const parent = rpc.handle(new Parent());
    await createChildWorld(rpc, parent, (p, r) => p.addChild(r.handle(new Child())));
    await createChildWorld(rpc, parent, (p, r) => p.addChild(r.handle(new Child())));
    expect(messages.join(',')).toBe('hello,hello');
  });
});

// Reporter subscribes to TestRunner events and displays information in terminal
new Reporter(runner);

// Run all tests.
runner.run();
