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

const EventEmitter = require('events');

class Server {
  constructor() {
    this.lastObjectId_ = 0;
    this.factories_ = new Map();
    this.services_ = new Map();
    this.idToObject_ = new Map();
    this.objectToId_ = new Map();
    this.handlers_ = new Map();
    this.handlers_.set('create', this.create_.bind(this));
    this.handlers_.set('lookup', this.lookup_.bind(this));
    this.handlers_.set('call', this.call_.bind(this));
    this.handlers_.set('dispose', this.dispose_.bind(this));
  }

  /**
   * @param {!Page} page
   * @return {!Promise}
   */
  async init(page) {
    this.page_ = page;
    await Promise.all([
      this.page_.exposeFunction('rpcSend', this.onMessage_.bind(this)),
      this.page_.evaluateOnNewDocument(installClient)
    ]);
  }

  /**
   * @param {function(new:EventEmitter)} c Constructor of the remotely accessible
   *     service object.
   */
  exposeFactory(c) {
    this.factories_.set(c.prototype.constructor.name, c);
  }

  /**
   * @param {string} name Service name.
   * @param {!Object} object Service object.
   */
  exposeObject(name, object) {
    this.services_.set(name, object);
  }

  async onMessage_(message) {
    const handler = this.handlers_.get(message.method);
    try {
      const result = await handler(message.params);
      this.sendMessage_({ id: message.id, result });
    } catch (e) {
      this.sendMessage_({ id: message.id, error: e.toString() + '\n' + e.stack });
    }
  }

  create_(params) {
    const factory = this.factories_.get(params.factory);
    if (!factory)
      throw new Error(`Can't locate factory ${params.factory}.`);
    const object = new factory();
    return this.wrap_(object, `create#${params.factory}`);
  }

  lookup_(params) {
    const object = this.services_.get(params.lookup);
    if (!object)
      throw new Error(`Can't locate service ${params.lookup}.`);
    return this.wrap_(object, `locate#${params.lookup}`);
  }

  async call_(params) {
    const object = this.idToObject_.get(params.objectId);
    if (!object)
      throw new Error(`Can't locate object ${params.objectId}.`);
    if (typeof object[params.method] !== 'function')
      throw new Error(`Can't locate function ${params.method}.`);

    let result = await object[params.method](...params.args);
    return this.wrap_(result, `call#${params.method}`);
  }

  dispose_(params) {
    const object = this.idToObject_.get(params.objectId);
    if (!object)
      throw new Error(`Can't locate object ${params.objectId}.`);
    this.idToObject_.delete(params.objectId);
    this.objectToId_.delete(object);
  }

  wrap_(object, domain) {
    if (this.objectToId_.has(object))
      return { objectId: this.objectToId_.get(object) };

    if (object === undefined)
      return { value: null };

    if (object instanceof Array)
      return object.map(item => this.wrap_(item, domain));

    if (!object || typeof object !== 'object' || object.constructor === Object)
      return { value: object };

    const objectId = `${domain}#${++this.lastObjectId_}#`;
    this.idToObject_.set(objectId, object);
    this.objectToId_.set(object, objectId);
    object.emit = (event, ...args) => { this.sendMessage_({ method: 'emit', params: { objectId, event, args }}) };
    return { objectId, methods: this.describe_(object) };
  }

  sendMessage_(message) {
    this.page_.evaluate(message => self.rpc.dispatchMessage(message), message);
  }

  /**
   * @param {!Object} o
   */
  describe_(o) {
    const proto = o.__proto__;
    const methods = [];
    for (const name in Object.getOwnPropertyDescriptors(proto)) {
      if (name === 'constructor')
        continue;
      if (typeof proto[name] === 'function')
        methods.push(name);
    }
    return methods;
  }
}

function installClient() {
  class EventEmitter {
    constructor(objectId) {
      this.objectId_ = objectId;
      this.listeners_ = new Map();
    }

    on(event, handler) {
      let listeners = this.listeners_.get(event);
      if (!listeners) {
        listeners = [];
        this.listeners_.set(event, listeners);
      }
      listeners.push(handler);
    }

    off(event, handler) {
      let listeners = this.listeners_.get(event);
      if (!listeners)
        return;
      listeners = listeners.filter(a => a !== handler);
    }

    emit_(event, ...args) {
      let listeners = this.listeners_.get(event);
      if (!listeners)
        return;
      for (const listener of listeners)
        listener(...args);
    }
  }

  class Client {
    constructor() {
      this.lastId_ = 0;
      this.callbacks_ = new Map();
      this.idToObject_ = new Map();
      this.debug_ = false;
    }

    async create(factory) {
      const result = await this.sendMessage_('create', { factory });
      return this.unwrap_(result);
    }

    async lookup(lookup) {
      const result = await this.sendMessage_('lookup', { lookup });
      return this.unwrap_(result);
    }

    unwrap_(result) {
      if (result instanceof Array)
        return result.map(item => this.unwrap_(item));
      if ('value' in result)
        return result.value;

      const {objectId, methods} = result;
      if (this.idToObject_.has(objectId))
        return this.idToObject_.get(objectId);

      const object = new EventEmitter(objectId);
      this.idToObject_.set(objectId, object);
      for (const method of methods) {
        object[method] = async (...args) => {
          const result = await this.sendMessage_('call', { method, objectId, args });
          return this.unwrap_(result);
        };
      }
      object.dispose = async () => {
        this.sendMessage_('dispose', { objectId });
        this.idToObject_.delete(objectId);
      };
      return object;
    }

    sendMessage_(method, params) {
      const message = { method, params };
      message.id = ++this.lastId_;
      if (this.debug_)
        console.log('SEND: ' + JSON.stringify(message));
      let callback;
      const result = new Promise(fulfil => this.callbacks_.set(message.id, fulfil));
      rpcSend(message);
      return result;
    }

    onMessage_(message) {
      if (this.debug_)
        console.log('RECV: ' + JSON.stringify(message));
      if (message.error)
        throw new Error(message.error);
      if (typeof message.id === 'number') {
        this.callbacks_.get(message.id)(message.result);
        return;
      }
      if (message.method === 'emit') {
        const params = message.params;
        this.idToObject_.get(params.objectId).emit_(params.event, ...params.args);
      }
    }
  }

  const client = new Client();
  self.rpc = {
    create: service => client.create(service),
    lookup: service => client.lookup(service),
    dispatchMessage: message => client.onMessage_(message),
  };
}

module.exports = { Server };
