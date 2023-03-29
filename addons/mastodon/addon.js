const { login } = require('masto'),
  sm = require('./sm-comm');

let comm = null;


// Basic methods
function update_interface() {
  comm.send('manager', 'interface', 'config', false, this.config);
}


// Additional methods
class Additional {
  static async CreateStatus(client, status, visibility) {
    return await client.v1.statuses.create({
      visibility, // public, unlisted, private, direct
      status
    });
  }
}


// Shared methods
class Shared {
  instance = null;

  constructor(config, vars) {
    this.vars = vars;
    this.config = config;

    if (this.config.connection.instance_url && this.config.connection.access_token) {
      login({
        url: this.config.connection.instance_url,
        accessToken: this.config.connection.access_token,
      }).catch();
    }
  }

  async show(id, property, data) {
    if (data) {
      update_interface.call(this);
    }
  }

  async enable(id, property, data) {
    this.config.default.enabled = data;
  }

  async interface(id, property, data) {
    if (typeof data === typeof this.config.connection[property]) {
      this.config.connection[property] = data;

      try {
        this.instance = await login({
          url: this.config.connection.instance_url,
          accessToken: this.config.connection.access_token,
        });
      } catch (e) {}

      update_interface.call(this);
    }

    comm.send('manager', 'config', 'save', false, this.config);
  }

  async call(id, property, data) {
    if (this.config.default.enabled) {
      if (typeof Additional[property] === 'function') {
        if (Array.isArray(data) && data.length) {
          return await Additional[property](this.instance, ...data);
        } else {
          return await Additional[property](this.instance);
        }
      } else {
        if (Array.isArray(data) && data.length) {
          return await this.instance[property](...data);
        } else {
          return await this.instance[property]();
        }
      }
    }
  }
}

module.exports = sender => {
  comm = new sm(Shared, sender);
  return {
    receive: (data) => {
      return comm.receive(data);
    }
  };
};