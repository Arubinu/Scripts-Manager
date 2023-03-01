const querystring = require('node:querystring'),
  twurple = require('./twurple');

const CLIENT_ID = require('./auth.json').client_id;

let _logs = [],
  _vars = {},
  _config = {},
  _sender = null,
  _changes = false,
  _connected = false;

function update_interface() {
  const scope = [
      'bits:read',
      'chat:read',
      'chat:edit',
      'channel:read:goals',
      'channel:read:polls',
      'channel:read:charity',
      'channel:read:hype_train',
      'channel:read:predictions',
      'channel:read:redemptions',
      'channel:read:subscriptions',
      'channel:edit:commercial',
      'channel:manage:polls',
      'channel:manage:raids',
      'channel:manage:broadcast',
      'channel:manage:predictions',
      'channel:manage:redemptions',
      'channel:moderate',
      'moderation:read',
      'moderator:read:chat_settings',
      'moderator:manage:automod',
      'moderator:manage:announcements',
      'moderator:manage:banned_users',
      'moderator:manage:blocked_terms',
      'moderator:manage:chat_messages',
      'moderator:manage:chat_settings',
      'whispers:read',
      'whispers:edit',
      'user:read:follows',
    ],
    token_data = {
      client_id: CLIENT_ID,
      redirect_uri: `${_vars.http}/twitch/authorize`,
      scope: scope.join('+'),
      response_type: 'token'
    },
    authorize = 'https://id.twitch.tv/oauth2/authorize?' + querystring.stringify(token_data);

  _sender('message', 'config', Object.assign({ authorize: authorize.replace(/%2B/g, '+') }, _config));
}

async function global_send(type, obj) {
  _sender('broadcast', type, obj);
  _sender('manager', 'websocket', { name: type, target: 'twitch', data: obj });
}

async function connect() {
  if (_config.connection.token) {
    global_send('Connection', []);
    _connected = true;
    await twurple.connect(CLIENT_ID, _config.connection.token, obj => {
      _logs.unshift(obj);
      for (let i = (_logs.length - 1); i >= 20; --i) {
        delete _logs[i];
      }

      _sender('message', 'logs', obj);
      global_send(obj.type, JSON.parse(JSON.stringify(obj)));
    });
  }
}

async function reconnect() {
  await disconnect(false);
  await connect();
}

async function disconnect(broadcast) {
  if (_connected) {
    _changes = false;
    _connected = false;
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
    if (_config.default.enabled) {
      connect().then();
    }
  },
  receiver: async (id, name, data) => {
    if (id === 'manager') {
      if (name === 'show') {
        if (!data && _changes && _config.default.enabled) {
          try {
            await reconnect();
          } catch (e) {}
        }

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
          if (_config.default.enabled) {
            await reconnect();
          }

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
              _config.connection.token = hash.access_token;
              _sender('manager', 'config', _config);

              update_interface();
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

    let check = false;
    if ((name === 'disconnect' || name === 'reconnect') && (check = true)) {
      await disconnect();
    }
    if ((name === 'connect' || name === 'reconnect') && (check = true)) {
      await connect();
    }

    if (!check) {
      return await twurple.exec(data.type, name, data.args);
    }
  }
};
