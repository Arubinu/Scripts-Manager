class Communication {
  store = {};
  instance = null;

  constructor(_class, sender) {
    this.name = __dirname.replaceAll('\\', '/').split('/').slice(-1)[0];
    this.hash = Buffer.from(this.name).toString('hex');
    this.class = _class;
    this.sender = sender;

    if (this.sender) {
      process.on('message', module.exports);
    }
  }

  #send(data) {
    if (this.sender) {
      this.sender(data);
    } else {
      process.send(data);
    }
  }

  send(event, name, method, property, data, reponse_id) {
    let id = reponse_id;
    const promise = new Promise((resolve, reject) => {
      if (typeof event !== 'string' || (name && typeof name !== 'string') || typeof method !== 'string' || (property && typeof property !== 'string')) {
        return reject('bad arguments: ' + JSON.stringify({ event, name, method, property }));
      }

      if (typeof id === 'undefined') {
        id = 'TN:' + this.hash + Math.random().toString(16).slice(2);
        this.store[id] = {
          done: resolve,
          error: reject
        };
      }

      this.#send({ event, id, name, method, property, data });
    });

    promise.catch(() => {});
    return promise;
  }

  broadcast(method, property, data) {
    this.send('broadcast', false, method, property, data);
  }

  authorization(type, name, method) {
    return this.send('authorization', type, name, method);
  }

  async receive(_data) {
    const { event, id, name, method, property, data } = _data;
    if (!this.instance) {
      if (event === 'initialize') {
        this.instance = new this.class(...data);
      }

      return;
    }

    if (event === 'broadcast') {
      if (typeof this.instance[event] !== 'undefined') {
        const { from } = _data;
        return await this.instance[event](from, method, property, data);
      }

      return;
    } else if (method === 'response') {
      if (typeof this.store[id] !== 'undefined') {
        const fn = this.store[id];
        delete this.store[id];
        fn[event](data);
      }

      return;
    }

    try {
      let result;
      if (event === 'authorization') {
        if (typeof this.instance[event] !== 'undefined' && await this.instance[event](id, name, method, property)) {
          result = property;
        } else {
          return this.#send({
            event: 'error',
            id,
            data: 'request denied'
          });
        }
      } else {
        result = await this.instance[method](id, property, data);
      }

      if (id) {
        this.#send({
          event: 'done',
          id,
          data: result
        });
      }
    } catch (e) {
      if (e.message === 'NO_RESPONSE') {
        return;
      } else if (e.message === 'this.instance[method] is not a function') {
        e.message = `method "${method}" not found`;
      }

      e.message = `${this.name}: ${e.message}`;
      this.#send({
        event: 'error',
        id,
        data: e
      });
    }
  }
}

module.exports = Communication;