const fs = require('node:fs'),
  path = require('node:path'),
  querystring = require('node:querystring'),
  twurple = require('./twurple'),
  sm = require('./sm-comm');

const {
  client_id: CLIENT_ID,
  scopes: SCOPES,
} = require('./auth.json');

let comm = null;


// Basic methods
function update_interface() {
  const token_data = {
      client_id: CLIENT_ID,
      redirect_uri: `${this.vars.http}/twitch/authorize`,
      scope: SCOPES.join('+'),
      response_type: 'token'
    },
    authorize = 'https://id.twitch.tv/oauth2/authorize?' + querystring.stringify(token_data);

  comm.send('manager', 'interface', 'config', false, Object.assign({
    account_broadcaster: this.accounts ? this.accounts.broadcaster.display : '',
    account_bot: this.accounts ? this.accounts.bot.display : '',
    authorize: authorize.replace(/%2B/g, '+'),
    refresh: this.refresh,
    wait: this.wait_bot_token
  }, this.config));
}

function update_refresh() {
  let scopes = {
    saved: this.config.connection.scopes,
    bot_saved : this.config.connection.bot_scopes,
    current: SCOPES
  };
  scopes.current.sort();
  if (Array.isArray(scopes.saved)) {
    scopes.saved.sort();
  }
  if (Array.isArray(scopes.bot_saved)) {
    scopes.bot_saved.sort();
  }

  const bad_scopes = this.config.connection.token && JSON.stringify(scopes.saved) !== JSON.stringify(scopes.current),
    bot_bad_scopes = this.config.connection.bot_token && JSON.stringify(scopes.bot_saved) !== JSON.stringify(scopes.current);

  if (bad_scopes || bot_bad_scopes) {
    this.refresh = (bad_scopes && bot_bad_scopes) ? 3 : (bad_scopes ? 1 : 2);
    comm.send('manager', 'state', 'set', false, 'warning');
  } else {
    this.refresh = false;
    comm.send('manager', 'state', 'unset');
  }
}


// Shared methods
class Shared {
  logs = [];
  changes = false;
  refresh = false;
  accounts = false;
  connected = false;
  wait_bot_token = false;

  constructor(config, vars) {
    this.vars = vars;
    this.config = config;

    comm.send('method', 'http', 'register', false, [{
      route: '/twitch/authorize',
      code: 200,
      type: 'text/html',
      content: fs.readFileSync(path.join(__dirname, 'autorize.html'), 'utf-8').replace('{{TOKEN}}', this.vars.websocket_token)
    }]);

    if (this.config.connection.token) {
      update_refresh.call(this);
    }

    if (this.config.default.enabled) {
      this.connect().then();
    }
  }

  async show(id, property, data) {
    if (data) {
      this.wait_bot_token = false;
      comm.send('manager', 'interface', 'logs', false, this.logs);
      update_interface.call(this);
    } else if (this.changes && this.config.default.enabled) {
      await this.reconnect();
    }
  }

  async enable(id, property, data) {
    this.config.default.enabled = data;
    if (!this.config.default.enabled) {
      await this.disconnect();
    } else {
      await this.connect();
    }
  }

  async interface(id, property, data) {
    if (property === 'refresh') {
      if (this.config.default.enabled && this.changes) {
        await this.reconnect();
      }

      return;
    } else if (property === 'bot') {
      this.wait_bot_token = data;
      return;
    }

    if (typeof data === typeof this.config.connection[property]) {
      this.changes = true;
      this.config.connection[property] = data;
    }

    comm.send('manager', 'config', 'save', false, this.config);
  }

  async autorize(id, property, data) {
    const url = '/twitch/authorize';
    if (data.url === url && !data.data.indexOf('#')) {
      const hash = querystring.parse(data.data.substring(1));

      if (typeof hash.access_token === 'string') {
        if (this.wait_bot_token) {
          this.config.connection.bot_token = hash.access_token;
          this.config.connection.bot_scopes = SCOPES;
        } else {
          this.config.connection.token = hash.access_token;
          this.config.connection.scopes = SCOPES;
        }

        update_refresh.call(this);
        update_interface.call(this);
        comm.send('manager', 'config', 'save', false, this.config);

        if (this.config.default.enabled) {
          await this.reconnect();
        }
      }
    } else if (data.target === 'twitch' && data.name === 'subscriptions:get') {
      const subscriptions = await twurple.exec('Methods', 'getSubscriptions');
      comm.broadcast('subscriptions', 'get', subscriptions);
    }
  }

  async connect(id, property, broadcast) {
    if (this.config.default.enabled && this.config.connection.token) {
      comm.broadcast('Connection');
      comm.send('manager', 'state', 'set', false, (this.refresh ? 'warning' : 'connected'));

      this.changes = false;
      this.connected = true;
      this.accounts = await twurple.connect(CLIENT_ID, this.config.connection.token, this.config.connection.bot_token, obj => {
        this.logs.unshift(obj);
        for (let i = (this.logs.length - 1); i >= 20; --i) {
          delete this.logs[i];
        }

        comm.send('manager', 'interface', 'logs', false, obj);
        comm.broadcast(obj.type, JSON.parse(JSON.stringify(obj)));
      });

      update_interface.call(this);
    }
  }

  async disconnect(id, property, broadcast) {
    if (this.connected) {
      this.connected = false;

      comm.send('manager', 'state', (this.config.default.enabled ? 'set' : 'unset'), false, (this.refresh ? 'warning' : 'disconnected'));
      await twurple.disconnect();

      const obj = {
        type: 'Disconnected',
        date: Date.now(),
        from: '',
        sub: false,
        vip: false,
        mod: false,
        brd: false
      };
      this.logs.unshift(obj);
      comm.send('manager', 'interface', 'logs', false, obj);

      if (typeof broadcast === 'undefined' || broadcast) {
        comm.broadcast('Disconnection');
      }
    }
  }

  async reconnect(id, property, broadcast) {
    if (this.config.default.enabled) {
      await this.disconnect(false, broadcast);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.connect(false, broadcast);
    }
  }

  async call(id, property, data) {
    if (this.config.default.enabled) {
      if (this.connected) {
        return await twurple.exec(data.type, property, data.args);
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