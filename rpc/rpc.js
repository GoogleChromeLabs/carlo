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

/** @typedef { !Array<string> } Address */
/** @typedef {{ name: string, isFunc: boolean }} Descriptor */
/** @typedef {function(function(data)): function(data)} Transport */

const handleSymbol = Symbol('handle');

/**
 * Handle to the object. This handle has methods matching the methods of the
 * target object. Calling these methods calls them remotely over the low level
 * messaging transprot. Return values are delivered to the caller.
 */
class Handle {
  /**
   * @param {string} localAddress Address of this handle.
   * @param {string} address Address of the primary handle this handle refers
   *                 to. Primary handle is the one that lives in the same world
   *                 as the actual object it refers to.
   * @param {!Object} descriptor Target object spec descriptor (list of methods, etc.)
   * @param {!Rpc} rpc
   */
  constructor(localAddress, address, descriptor, rpc) {
    this.localAddress_ = localAddress;
    this.address_ = address;
    this.descriptor_ = descriptor;
    this.rpc_ = rpc;
    this.object_ = null;

    const target = {};
    target[handleSymbol] = this;
    this.proxy_ = new Proxy(target, { get: Handle.proxyHandler_ });
  }

  /**
   * We always return proxies to the user to encapsulate handle and marshall
   * calls automatically.
   */
  static proxyHandler_(target, methodName, receiver) {
    const handle = target[handleSymbol];
    if (methodName === handleSymbol)
      return handle;
    if (typeof methodName !== 'string')
      return;
    if (methodName === 'then')
      return target[methodName];
    return handle.callMethod_.bind(handle, methodName);
  }

  /**
   * Calls method on the target object.
   *
   * @param {string} method Method to call on the target object.
   * @param {!Array<*>} args Call arguments. These can be either primitive
   *                    types, other handles or JSON structures.
   * @return {!Promise<*>} result, also primitive, JSON or handle.
   */
  async callMethod_(method, ...args) {
    const message = {
      m: method,
      p: this.rpc_.wrap_(args)
    };
    const response = await this.rpc_.sendCommand_(this.address_, this.localAddress_, message);
    return this.rpc_.unwrap_(response);
  }

  /**
   * Dispatches external message on this handle.
   * @param {string} message
   * @return {!Promise<*>} result, also primitive, JSON or handle.
   */
  async dispatchMessage_(message) {
    if (this.descriptor_.isFunc) {
      const result = await this.object_(...this.rpc_.unwrap_(message.p));
      return this.rpc_.wrap_(result);
    }
    if (message.m.startsWith('_') || message.m.endsWith('_'))
      throw new Error(`Private members are not exposed over RPC: '${message.m}'`);

    if (!(message.m in this.object_))
      throw new Error(`There is no member '${message.m}' in '${this.descriptor_.name}'`);
    const value = this.object_[message.m];
    if (typeof value !== 'function') {
      if (message.p.length)
        throw new Error(`'${message.m}' is not a function, can't pass args '${message.p}'`);
      return this.rpc_.wrap_(value);
    }

    const result = await this.object_[message.m](...this.rpc_.unwrap_(message.p));
    return this.rpc_.wrap_(result);
  }

  /**
   * Returns the proxy to this handle that is passed to the userland.
   */
  proxy() {
    return this.proxy_;
  }
}

/**
 * Main Rpc object. Keeps all the book keeping and performs message routing
 * between handles beloning to different worlds. Each 'world' has a singleton
 * 'rpc' instance.
 */
class Rpc {
  constructor() {
    this.lastHandleId_ = 0;
    this.lastWorldId_ = 0;
    this.worlds_ = new Map();
    this.idToHandle_ = new Map();
    this.lastMessageId_ = 0;
    this.callbacks_ = new Map();

    this.worldId_ = '.';
    this.sendToParent_ = null;
    this.cookieResponseCallbacks_ = new Map();
    this.debug_ = false;
  }

  /**
   * Each singleton rpc object has the world's parameters that parent world sent
   * to them.
   *
   * @return {*}
   */
  params() {
    return this.worldParams_;
  }

  /**
   * Called in the parent world.
   * Creates a child world with the given root handle.
   *
   * @param {!Transport} transport
   *        - receives function that should be called upon messages from
   *          the world and
   *        - returns function that should be used to send messages to the
   *          world
   * @param {...*} args Params to pass to the child world.
   * @return {!Promise<{worldId:string, *}>} returns the handles / parameters that child
   *         world returned during the initialization.
   */
  createWorld(transport, ...args) {
    const worldId = this.worldId_ + '/' + (++this.lastWorldId_);
    const sendToChild = transport(this.routeMessage_.bind(this, false));
    this.worlds_.set(worldId, sendToChild);
    sendToChild({cookie: true, args: this.wrap_(args), worldId });
    return new Promise(f => this.cookieResponseCallbacks_.set(worldId, f));
  }

  /**
   * Called in the parent world.
   * Disposes a child world with the given id.
   *
   * @param {string} worldId The world to dispose.
   */
  disposeWorld(worldId) {
    if (!this.worlds_.has(worldId))
      throw new Error('No world with given id exists');
    this.worlds_.delete(worldId);
  }

  /**
   * Called in the child world to initialize it.
   * @param {!Transport} transport.
   * @param {function(...*):!Promise<*>} initializer
   */
  initWorld(transport, initializer) {
    this.sendToParent_ = transport(this.routeMessage_.bind(this, true));
    return new Promise(f => this.cookieCallback_ = f)
        .then(args => initializer ? initializer(...args) : undefined)
        .then(response => this.sendToParent_(
            {cookieResponse: true, worldId: this.worldId_, r: this.wrap_(response)}));
  }

  /**
   * Creates a handle to the object.
   * @param {!Object} object Object to create handle for
   * @return {!Object}
   */
  handle(object) {
    if (!object)
      throw new Error('Can only create handles for objects');
    if (typeof object === 'object' && handleSymbol in object)
      throw new Error('Can not return handle to handle.');
    const descriptor = this.describe_(object);
    const address = [this.worldId_, descriptor.name + '#' + (++this.lastHandleId_)];
    const handle = new Handle(address, address, descriptor, this);
    handle.object_ = object;
    this.idToHandle_.set(address[1], handle);
    return handle.proxy();
  }

  /**
   * Returns the object this handle points to. Only works on the local
   * handles, otherwise returns null.
   *
   * @param {*} handle Primary object handle.
   * @return {?Object}
   */
  object(proxy) {
    return proxy[handleSymbol].object_ || null;
  }

  /**
   * Disposes a handle to the object.
   * @param {*} handle Primary object handle.
   */
  dispose(proxy) {
    const handle = proxy[handleSymbol];
    if (!handle.object_)
      throw new Error('Can only dipose handle that was explicitly created with rpc.handle()');
    this.idToHandle_.delete(handle.address_[1]);
  }

  /**
   * Builds object descriptor.
   * @return {!Descriptor}
   */
  describe_(o) {
    if (typeof o === 'function')
      return { isFunc: true };
    return { name: o.constructor.name };
  }

  /**
   * Wraps call argument as a protocol structures.
   * @param {*} param
   * @param {number=} maxDepth
   * @return {*}
   */
  wrap_(param, maxDepth = 1000) {
    if (!maxDepth)
      throw new Error('Object reference chain is too long');
    maxDepth--;
    if (!param)
      return param;

    if (param[handleSymbol]) {
      const handle = param[handleSymbol];
      return { __rpc_a__: handle.address_, descriptor: handle.descriptor_ };
    }

    if (param instanceof Array)
      return param.map(item => this.wrap_(item, maxDepth));

    if (typeof param === 'object') {
      const result = {};
      for (const key in param)
        result[key] = this.wrap_(param[key], maxDepth);
      return result;
    }

    return param;
  }

  /**
   * Unwraps call argument from the protocol structures.
   * @param {!Object} param
   * @return {*}
   */
  unwrap_(param) {
    if (!param)
      return param;
    if (param.__rpc_a__) {
      const handle = this.createHandle_(param.__rpc_a__, param.descriptor);
      if (handle.descriptor_.isFunc)
        return (...args) => handle.callMethod_('call', ...args);
      return handle.proxy();
    }

    if (param instanceof Array)
      return param.map(item => this.unwrap_(item));

    if (typeof param === 'object') {
      const result = {};
      for (const key in param)
        result[key] = this.unwrap_(param[key]);
      return result;
    }

    return param;
  }

  /**
   * Unwraps descriptor and creates a local world handle that will be associated
   * with the primary handle at given address.
   *
   * @param {!Address} address Address of the primary wrapper.
   * @param {!Descriptor} address Address of the primary wrapper.
   * @return {!Handle}
   */
  createHandle_(address, descriptor) {
    if (address[0] === this.worldId_) {
      const existing = this.idToHandle_.get(address[1]);
      if (existing)
        return existing;
    }

    const localAddress = [this.worldId_, descriptor.name + '#' + (++this.lastHandleId_)];
    return new Handle(localAddress, address, descriptor, this);
  }

  /**
   * Sends message to the target handle and receive the response.
   *
   * @param {!Object} payload
   * @return {!Promise<!Object>}
   */
  sendCommand_(to, from, message) {
    const payload = { to, from, message, id: ++this.lastMessageId_ };
    if (this.debug_)
      console.log('\nSEND', payload);
    const result = new Promise((fulfill, reject) =>
      this.callbacks_.set(payload.id, {fulfill, reject}));
    this.routeMessage_(false, payload);
    return result;
  }

  /**
   * Routes message between the worlds.
   *
   * @param {!Object} payload
   */
  routeMessage_(fromParent, payload) {
    if (this.debug_)
      console.log(`\nROUTE[${this.worldId_}]`, payload);

    if (payload.cookie) {
      this.worldId_ = payload.worldId;
      this.cookieCallback_(this.unwrap_(payload.args));
      this.cookieCallback_ = null;
      return;
    }

    // If this is a cookie request, the world is being initialized.
    if (payload.cookieResponse) {
      const callback = this.cookieResponseCallbacks_.get(payload.worldId);
      this.cookieResponseCallbacks_.delete(payload.worldId);
      callback({ result: this.unwrap_(payload.r), worldId: payload.worldId });
      return;
    }

    if (!fromParent && !this.isActiveWorld_(payload.from[0])) {
      // Dispatching from the disposed world.
      if (this.debug_)
        console.log(`DROP ON THE FLOOR`);
      return;
    }

    if (payload.to[0] === this.worldId_) {
      if (this.debug_)
        console.log(`ROUTED TO SELF`);
      this.dispatchMessageLocally_(payload);
      return;
    }

    for (const [worldId, worldSend] of this.worlds_) {
      if (payload.to[0].startsWith(worldId)) {
        if (this.debug_)
          console.log(`ROUTED TO CHILD ${worldId}`);
        worldSend(payload);
        return;
      }
    }

    if (payload.to[0].startsWith(this.worldId_)) {
      // Sending to the disposed world.
      if (this.debug_)
        console.log(`DROP ON THE FLOOR`);
      return;
    }

    if (this.debug_)
      console.log(`ROUTED TO PARENT`);
    this.sendToParent_(payload);
  }

  /**
   * @param {!Address} address
   * @return {boolean}
   */
  isActiveWorld_(worldId) {
    if (this.worldId_ === worldId)
      return true;
    for (const wid of this.worlds_.keys()) {
      if (worldId.startsWith(wid))
        return true;
    }
    return false;
  }

  /**
   * Message is routed from other worlds and hits rpc here.
   *
   * @param {!Object} payload
   */
  async dispatchMessageLocally_(payload) {
    if (this.debug_)
      console.log('\nDISPATCH', payload);
    // Dispatch the response.
    if (typeof payload.rid === 'number') {
      const {fulfill, reject} = this.callbacks_.get(payload.rid);
      this.callbacks_.delete(payload.rid);
      if (payload.e)
        reject(new Error(payload.e));
      else
        fulfill(payload.r);
      return;
    }

    const message = { from: payload.to, rid: payload.id, to: payload.from };
    const handle = this.idToHandle_.get(payload.to[1]);
    if (!handle) {
      message.e = 'Object has been diposed.';
    } else {
      try {
        message.r = await handle.dispatchMessage_(payload.message);
      } catch (e) {
        message.e = e.toString() + '\n' + e.stack;
      }
    }
    this.routeMessage_(false, message);
  }
}

module.exports = new Rpc();
