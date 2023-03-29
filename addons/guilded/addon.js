const {
    constants,
    Client
  } = require('guilded.js'),
  sm = require('./sm-comm');

let comm = null;


// Additional methods
class Additional {
  static async GetServer(client, server_id) {
    return (await client.rest.router.getServer(server_id)).server;
  }

  static async GetChannel(client, channel_id) {
    return (await client.rest.router.getChannel(channel_id)).channel;
  }

  static async GetMember(client, server_id, user_id) {
    return (await client.rest.router.getMember(server_id, user_id)).member;
  }

  static async SendMessage(client, channel_id, content, embed) {
    return (await client.rest.router.createChannelMessage(channel_id, { content, embed: (embed || undefined) }));
  }
}


// Shared methods
class Shared {
  logs = [];
  changes = false;
  connected = false;
  listeners = {};

  constructor(config, vars) {
    this.vars = vars;
    this.config = config;

    setInterval(() => {
      if (this.config.default.enabled && !this.connected) {
        this.reconnect();
      }
    }, 5000);

    if (this.config.default.enabled) {
      this.connect();
    }
  }

  async show(id, property, data) {
    if (data) {
      comm.send('manager', 'interface', 'logs', false, this.logs);
      comm.send('manager', 'interface', 'config', false, this.config);
    } else if (this.changes && this.config.default.enabled) {
      this.reconnect();
    }
  }

  async enable(id, property, data) {
    this.config.default.enabled = data;
    if (!this.config.default.enabled) {
      this.disconnect();
    } else {
      this.connect();
    }
  }

  async interface(id, property, data) {
    if (property === 'refresh') {
      if (this.config.default.enabled && this.changes) {
        this.reconnect();
      }

      return;
    }

    if (typeof data === typeof this.config.connection[property]) {
      this.changes = true;
      this.config.connection[property] = data;
    }

    comm.send('manager', 'config', 'save', false, this.config);
  }

  async connect(id, property, broadcast) {
    if (this.config.default.enabled && this.config.connection && this.config.connection.token) {
      if (typeof broadcast === 'undefined' || broadcast) {
        comm.broadcast('Connection');
      }

      this.changes = false;
      this.instance = new Client({ token: this.config.connection.token });
      this.instance.once('ready', async () => {
        this.connected = true;
        comm.broadcast('Connected');
        comm.send('manager', 'state', 'set', false, 'connected');
      });
      this.instance.onclose = () => {
        if (this.connected) {
          this.connected = false;
          comm.broadcast('Disconnected');
          comm.send('manager', 'state', (this.config.default.enabled ? 'set' : 'unset'), false, 'disconnected');
        }
      };

      for (const method of Object.values(constants.clientEvents)) {
        this.listeners[method] = async data => {
          const obj = {
            type: method,
            date: Date.now()
          };

          this.logs.unshift(obj);
          for (let i = (this.logs.length - 1); i >= 20; --i) {
            delete this.logs[i];
          }

          data = (typeof data !== 'undefined') ? JSON.parse(JSON.stringify(Object.assign({}, data, { client: undefined }))) : data;

          let server = null;
          const want_server = typeof data.serverId === 'string';
          const want_server_raw = typeof data.raw === 'object' && typeof data.raw.serverId === 'string';
          if (want_server || want_server_raw) {
            server = await Additional.GetServer(this.instance, (want_server ? data.serverId : data.raw.serverId));
            if (want_server) {
              data.server = server;
            }
            if (want_server_raw) {
              data.raw.server = server;
            }
          }

          let channel = null;
          const want_channel = typeof data.channelId === 'string';
          const want_channel_raw = typeof data.raw === 'object' && typeof data.raw.channelId === 'string';
          if (want_channel || want_channel_raw) {
            channel = await Additional.GetChannel(this.instance, (want_channel ? data.channelId : data.raw.channelId));
            if (want_channel) {
              data.channel = channel;
            }
            if (want_channel_raw) {
              data.raw.channel = channel;
            }
          }

          let member = null;
          const want_member = typeof data.createdById === 'string';
          const want_member_raw = typeof data.raw === 'object' && typeof data.raw.createdById === 'string';
          if ((want_server || want_server_raw) && (want_member || want_member_raw)) {
            member = await Additional.GetMember(this.instance, (want_server ? data.serverId : data.raw.serverId), (want_member ? data.createdById : data.raw.createdById));
            if (want_member) {
              data.member = member;
            }
            if (want_member_raw) {
              data.raw.member = member;
            }
          }

          let user = null;
          const want_user = typeof data.userId === 'string';
          const want_user_raw = typeof data.raw === 'object' && typeof data.raw.userId === 'string';
          if ((want_server || want_server_raw) && (want_user || want_user_raw)) {
            user = await this.instance.members.cache.get(server.id, (want_user ? data.userId : data.raw.userId));
            if (want_user) {
              data.user = user;
            }
            if (want_user_raw) {
              data.raw.user = user;
            }
          }

          comm.send('manager', 'interface', 'logs', false, obj);
          comm.broadcast(method, data);
        };

        this.instance.on(method, this.listeners[method]);
      }

      this.instance.login();
    }
  }

  async disconnect(id, property, broadcast) {
    if (typeof broadcast === 'undefined' || broadcast) {
      comm.broadcast('Disconnection');
    }

    if (this.instance) {
      if (this.connected) {
        for (const method of Object.values(constants.clientEvents)) {
          this.instance.off(method, this.listeners[method]);
        }

        this.instance.disconnect();
        this.instance.onclose();
      }

      this.instance = null;
      this.connected = false;
    }

    comm.send('manager', 'state', (this.config.default.enabled ? 'set' : 'unset'), false, 'disconnected');
  }

  async reconnect(id, property, broadcast) {
    this.disconnect(broadcast);
    this.connect(broadcast);
  }

  async call(id, property, data) {
    if (this.config.default.enabled) {
      if (this.connected && this.instance) {
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
}

module.exports = sender => {
  comm = new sm(Shared, sender);
  return {
    receive: (data) => {
      return comm.receive(data);
    }
  };
};