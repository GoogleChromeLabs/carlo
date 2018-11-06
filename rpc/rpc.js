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

/** @typedef {{ worldId: string, handleId: string }} Address */
/** @typedef {{ methods: !Array<string>, name: string }} Descriptor */
/** @typedef {function(function(data)): function(data)} Transport */

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

    for (const method of descriptor.methods)
      this[method] = this.callMethod_.bind(this, method);

    this.handlers_ = new Map();
    this.handlers_.set('call', this.call_.bind(this));
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
      method: 'call',
      params: {
        method,
        args: this.rpc_.wrap_(args)
      }
    };
    const response = await this.rpc_.sendMessage_({ to: this.address_, from: this.localAddress_, message });
    if (response.error)
      throw new Error(response.error);
    return this.rpc_.unwrap_(response.result);
  }

  /**
   * Dispatches external message on this handle.
   * @param {string} message
   * @return {!Promise<*>} result, also primitive, JSON or handle.
   */
  async dispatchMessage_(message) {
    const handler = this.handlers_.get(message.method);
    return await handler(message.params);
  }

  /**
   * Only called on the primary handle, calls method with the givem arguments
   * on the local object.
   * @param {*} params
   * @return {!Promise<*>} result, also primitive, JSON or handle.
   */
  async call_(params) {
    if (this.descriptor_.isFunction) {
      const result = await this.object_(...this.rpc_.unwrap_(params.args));
      return this.rpc_.wrap_(result);
    }

    if (typeof this.object_[params.method] !== 'function')
      throw new Error(`Can't locate function ${params.method} on ${this.descriptor_.name}`);

    const result = await this.object_[params.method](...this.rpc_.unwrap_(params.args));
    return this.rpc_.wrap_(result);
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
   * @param {*} params Params to pass to the child world.
   * @return {!Promise<*>} returns the handles / parameters that child
   *         world returned during the initialization.
   */
  createWorld(transport, params) {
    const worldId = this.worldId_ + '/' + (++this.lastWorldId_);
    const sendToChild = transport(this.routeMessage_.bind(this));
    this.worlds_.set(worldId, sendToChild);
    sendToChild({cookie: true, params: this.wrap_(params), worldId });
    return new Promise(f => this.cookieResponseCallbacks_.set(worldId, f));
  }

  /**
   * Called in the child world to initialize it.
   * @param {!Transport} transport.
   * @param {function(*):!Promise<*>} initializer
   */
  initWorld(transport, initializer) {
    this.sendToParent_ = transport(this.routeMessage_.bind(this));
    return new Promise(f => this.cookieCallback_ = f)
        .then(initializer ? initializer : () => {})
        .then(response => this.sendToParent_(
            {cookieResponse: true, worldId: this.worldId_, result: this.wrap_(response)}));
  }

  /**
   * Creates a handle to the object.
   * @param {!Object} object Object to create handle for
   * @return {!Handle}
   */
  handle(object) {
    if (!object)
      throw new Error('Can only create handles for objects');
    if (object instanceof Handle)
      throw new Error('Can not return handle to handle.');
    const descriptor = this.describe_(object);
    const address = {
      worldId: this.worldId_,
      handleId: descriptor.name + '#' + (++this.lastHandleId_)
    };
    const handle = new Handle(address, address, descriptor, this);
    handle.object_ = object;
    this.idToHandle_.set(address.handleId, handle);
    return handle;
  }

  /**
   * Returns the object this handle points to. Only works on the local
   * handles, otherwise returns null.
   * @return {?Object}
   */
  object() {
    return this.object_ || null;
  }

  /**
   * Disposes a handle to the object.
   * @param {!Handle} handle Primary object handle.
   */
  dispose(handle) {
    if (!handle.object_)
      throw new Error('Can only dipose handle that was explicitly created with rpc.handle()');
    this.idToHandle_.delete(handle.address_.handleId);
  }

  /**
   * Builds object descriptor. Currently lists 'public' methods of the object
   * along the prototype chain.
   * @return {!Descriptor}
   */
  describe_(o) {
    if (typeof o === 'function')
      return { isFunction: true, methods: ['call'] };

    const methods = [];
    for (let proto = o.__proto__; proto; proto = proto.__proto__) {
      for (const name in Object.getOwnPropertyDescriptors(proto)) {
        if (name === 'constructor' || name.startsWith('_') || name.endsWith('_'))
          continue;
        if (typeof proto[name] === 'function')
          methods.push(name);
      }
    }
    return { methods, name: o.constructor.name };
  }

  /**
   * Wraps call argument as a protocol structures.
   * @param {*} param
   * @return {*}
   */
  wrap_(param) {
    if (!param)
      return param;

    if (param instanceof Handle)
      return { __rpc_a__: param.address_, descriptor: param.descriptor_ };

    if (param instanceof Array)
      return param.map(item => this.wrap_(item));

    if (typeof param === 'object') {
      const result = {};
      for (const key in param)
        result[key] = this.wrap_(param[key]);
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
      if (handle.descriptor_.isFunction)
        return (...args) => handle.call(...args);
      return handle;
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
    if (address.worldId === this.worldId_) {
      const existing = this.idToHandle_.get(address.handleId);
      if (existing)
        return existing;
    }

    const localAddress = {
      worldId: this.worldId_,
      handleId: descriptor.name + '#' + (++this.lastHandleId_)
    };
    const handle = new Handle(localAddress, address, descriptor, this);
    return handle;
  }

  /**
   * Sends message to the target handle and receive the response.
   *
   * @param {!Object} payload
   * @return {!Promise<!Object>}
   */
  sendMessage_(payload) {
    if (this.debug_)
      console.log('\nSEND', payload);
    let result;
    if (payload.from) {
      payload.id = ++this.lastMessageId_;
      result = new Promise(fulfil => this.callbacks_.set(payload.id, fulfil));
    }
    this.routeMessage_(payload);
    return result;
  }

  /**
   * Routes message between the worlds.
   *
   * @param {!Object} payload
   */
  routeMessage_(payload) {
    if (this.debug_)
      console.log(`\nROUTE[${this.worldId_}]`, payload);

    if (payload.cookie) {
      this.worldId_ = payload.worldId;
      this.cookieCallback_(this.unwrap_(payload.params));
      this.cookieCallback_ = null;
      return;
    }

    // If this is a cookie request, the world is being initialized.
    if (payload.cookieResponse) {
      const callback = this.cookieResponseCallbacks_.get(payload.worldId);
      this.cookieResponseCallbacks_.delete(payload.worldId);
      callback(this.unwrap_(payload.result));
      return;
    }

    if (payload.to.worldId === this.worldId_) {
      if (this.debug_)
        console.log(`ROUTED TO SELF`);
      this.dispatchMessageLocally_(payload);
      return;
    }

    for (const [worldId, worldSend] of this.worlds_) {
      if (payload.to.worldId.startsWith(worldId)) {
        if (this.debug_)
          console.log(`ROUTED TO CHILD ${worldId}`);
        worldSend(payload);
        return;
      }
    }

    if (this.debug_)
      console.log(`ROUTED TO PARENT`);
    this.sendToParent_(payload);
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
    if (typeof payload.id === 'number' && !payload.from) {
      this.callbacks_.get(payload.id)(payload.message);
      this.callbacks_.delete(payload.id);
      return;
    }

    let message;
    const handle = this.idToHandle_.get(payload.to.handleId);
    if (!handle) {
      message = { error: 'Object has been diposed.' };
    } else {
      try {
        message = { result: await handle.dispatchMessage_(payload.message) };
      } catch (e) {
        message = { error: e.toString() + '\n' + e.stack };
      }
    }
    message.id = payload.id;
    const response = { id: message.id, to: payload.from, message };
    this.sendMessage_(response);
  }
}

module.exports = new Rpc();
