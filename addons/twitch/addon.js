const querystring = require('node:querystring'),
  twurple = require('./twurple');

const {
  client_id: CLIENT_ID,
  scopes: SCOPES,
} = require('./auth.json');

let _logs = [],
  _vars = {},
  _config = {},
  _sender = null,
  _changes = false,
  _refresh = false,
  _accounts = false,
  _connected = false,
  _wait_bot_token = false;

function update_interface() {
  const token_data = {
      client_id: CLIENT_ID,
      redirect_uri: `${_vars.http}/twitch/authorize`,
      scope: SCOPES.join('+'),
      response_type: 'token'
    },
    authorize = 'https://id.twitch.tv/oauth2/authorize?' + querystring.stringify(token_data);

  _sender('message', 'config', Object.assign({
    account_broadcaster: _accounts ? _accounts.broadcaster.display : '',
    account_bot: _accounts ? _accounts.bot.display : '',
    authorize: authorize.replace(/%2B/g, '+'),
    refresh: _refresh,
    wait: _wait_bot_token
  }, _config));
}

function update_refresh() {
  let scopes = {
    saved: _config.connection.scopes,
    bot_saved : _config.connection.bot_scopes,
    current: SCOPES
  };
  scopes.current.sort();
  if (Array.isArray(scopes.saved)) {
    scopes.saved.sort();
  }
  if (Array.isArray(scopes.bot_saved)) {
    scopes.bot_saved.sort();
  }

  const bad_scopes = _config.connection.token && JSON.stringify(scopes.saved) !== JSON.stringify(scopes.current),
    bot_bad_scopes = _config.connection.bot_token && JSON.stringify(scopes.bot_saved) !== JSON.stringify(scopes.current);

  if (bad_scopes || bot_bad_scopes) {
    _refresh = (bad_scopes && bot_bad_scopes) ? 3 : (bad_scopes ? 1 : 2);
    _sender('manager', 'state', 'warning');
  } else {
    _refresh = false;
    _sender('manager', 'state');
  }
}

async function global_send(type, obj) {
  _sender('broadcast', type, obj);
  _sender('manager', 'websocket', { name: type, target: 'twitch', data: obj });
}

async function connect() {
  if (_config.connection.token) {
    global_send('Connection', []);
    _sender('manager', 'state', (_refresh ? 'warning' : 'connected'));

    _changes = false;
    _connected = true;
    _accounts = await twurple.connect(CLIENT_ID, _config.connection.token, _config.connection.bot_token, obj => {
      _logs.unshift(obj);
      for (let i = (_logs.length - 1); i >= 20; --i) {
        delete _logs[i];
      }

      _sender('message', 'logs', obj);
      global_send(obj.type, JSON.parse(JSON.stringify(obj)));
    });

    update_interface();
  }
}

async function reconnect() {
  await disconnect(false);
  await new Promise(resolve => setTimeout(resolve, 1000));
  await connect();
}

async function disconnect(broadcast) {
  if (_connected) {
    _connected = false;

    _sender('manager', 'state', (_refresh ? 'warning' : 'disconnected'));
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
    _logs.unshift(obj);
    _sender('message', 'logs', obj);

    if (typeof broadcast === 'undefined' || broadcast) {
      global_send('Disconnected', []);
    }
  }
}


module.exports = {
  init: (origin, config, sender, vars) => {
    _vars = vars;
    _sender = sender;
    _config = config;
  },
  initialized: () => {
    if (_config.connection.token) {
      update_refresh();
    }

    if (_config.default.enabled) {
      connect().then();
    }
  },
  receiver: async (id, name, data) => {
    if (id === 'manager') {
      if (name === 'show') {
        if (!data && _changes && _config.default.enabled) {
          await reconnect();
        }

        _wait_bot_token = false;
        _sender('message', 'logs', _logs);
        update_interface();
      } else if (name === 'enabled') {
        _config.default.enabled = data;
        if (!_config.default.enabled) {
          await disconnect();
        } else {
          await connect();
        }
      }

      return;
    } else if (id === 'message') {
      if (typeof data === 'object') {
        const name = Object.keys(data)[0];
        if (name === 'refresh') {
          if (_config.default.enabled && _changes) {
            await reconnect();
          }

          return;
        } else if (name === 'bot') {
          _wait_bot_token = data[name];
          return;
        }

        if (typeof data[name] === typeof _config.connection[name]) {
          _changes = true;
          _config.connection[name] = data[name];
        }
        _sender('manager', 'config', _config);
      }

      return;
    } else if (id === 'methods') {
      const url = '/twitch/authorize';

      if (name === 'http' && data.req && data.req.url === url) {
        data.res.writeHead(200);
        data.res.end(`<script type="text/javascript">
          const socket = new WebSocket('${_vars.websocket}');

          socket.onopen = event => {
            socket.send(JSON.stringify({ url: '${url}', data: document.location.hash }));
            document.body.innerHTML = '<h1 style="font-family: sans-serif;">You can now close this page ...</h1>';
            document.head.innerHTML = '';
          };

          socket.onerror = error => console.error(error);
        </script>`);

        return true;
      } else if (name === 'websocket') {
        if (typeof data === 'object') {
          if (data.url === url && !data.data.indexOf('#')) {
            const hash = querystring.parse(data.data.substr(1));

            if (typeof hash.access_token === 'string') {
              if (_wait_bot_token) {
                _config.connection.bot_token = hash.access_token;
                _config.connection.bot_scopes = SCOPES;
              } else {
                _config.connection.token = hash.access_token;
                _config.connection.scopes = SCOPES;
              }

              update_refresh();
              update_interface();
              _sender('manager', 'config', _config);

              if (_config.default.enabled) {
                await reconnect();
              }
            }

            return true;
          } else if (data.target === 'twitch' && data.name === 'subscriptions:get') {
            const subscriptions = await twurple.exec('Methods', 'getSubscriptions');
            _sender('manager', 'websocket', { name: data.name, target: 'twitch', data: subscriptions });
            return true;
          }
        }
      }

      return;
    }

    if (_config.default.enabled) {
      let check = false;
      if ((name === 'disconnect' || name === 'reconnect') && (check = true)) {
        await disconnect();
      }
      if ((name === 'connect' || name === 'reconnect') && (check = true)) {
        await connect();
      }

      if (!check && _connected) {
        return await twurple.exec(data.type, name, data.args);
      }
    }
  }
};
