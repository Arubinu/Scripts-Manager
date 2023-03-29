const ws = require('ws'),
  querystring = require('node:querystring'),
  {
    TYPE_ENUM,
    EVENT_ENUM,
    ACCESS_ENUM,
    RESPONSE_ENUM
  } = require('../enums');


module.exports = (modules, addons, scripts, options, methods) => {
  let password = options.manager.default.local_password || '',
    blocked = {};

  const token = Buffer.from(modules.store.generate('websocket')).toString('base64'),
    server = new ws.Server({
      server: modules.http.instance,
      verifyClient: ({ req }, done) => {
        const ip = req.socket.remoteAddress,
          query = querystring.parse(req.url.split('?').slice(1).join('?'));

        if (query.token) {
          if (typeof blocked[ip] === 'undefined') {
            blocked[ip] = {
              attempts: 0,
              unlocking: 0
            };
          } else {
            const user = blocked[ip];
            ++user.attempts;

            if (user.unlocking) {
              if (user.unlocking > Date.now()) {
                return done(false, 403, 'Too many attempts');
              }

              delete blocked[ip];
            } else if (user.attempts > 10) {
              console.log('Websocket too many attempts:', ip);
              user.unlocking = Date.now() + (3 * 60 * 1000);
              return done(false, 403, 'Too many attempts');
            }
          }

          if (query.token !== token && (!password || query.token !== Buffer.from(password).toString('base64'))) {
            return done(false, 403, 'Not valid token');
          } else if (typeof blocked[ip] !== 'undefined') {
            delete blocked[ip];
          }

          done(true);
        } else {
          done(false, 403, 'Please specify a token');
        }
      }
    });

  /**
   * Set the password to connect to the websocket server
   *
   * @param   {any} _password
   */
  function set_password(_password) {
    password = _password;
  }

  /**
   * Sending data to all clients connected to the WebSocket
   *
   * @param   {any} data  Data to be transmitted
   */
  function send(data) {
    for (const client of server.clients) {
      if (data.to !== 'interface' || client.is_renderer) {
        client.send(JSON.stringify(data));
      }
    }
  }

  /**
   * Sending data to client
   *
   * @param   {any} data  Data to be transmitted
   */
  function send_json(client, data) {
    client.send(JSON.stringify(data));
  }

  server.on('connection', (client, req) => {
    client.is_defined = false;
    client.is_renderer = false;
    client.is_deckboard = false;

    client.on('message', async _data => {
      const is_defined = client.is_defined;
      client.is_defined = true;
      client.send_json = data => send_json(client, data);

      if (typeof _data === 'object') {
        _data = Buffer.from(_data).toString();
      }

      try {
        _data = JSON.parse(_data);
      } catch (e) {}

      if (typeof _data === 'object') {
        if (process.env.NODE_ENV === 'development') {
          console.debug('\u001b[35mwebsocket:\u001b[0m', _data);
        }

        if (_data.method === 'response' && (_data.event === RESPONSE_ENUM.DONE || _data.event === RESPONSE_ENUM.ERROR)) {
          modules.store[_data.event](_data.id, _data.data);
          return;
        }

        const { to, from, id } = _data;
        if (from === 'deckboard' || (from === 'renderer' && modules.communication.is_local())) {
          /**
           * The message is from the client displaying the software interface
           */
          if (to === 'init' && !is_defined) {
            /**
             * Allows the client to pass as a "renderer" only if it is his first message
             */
            if (from === 'renderer') {
              client.is_renderer = true;
              client.send_json({
                to: 'init',
                data: modules.communication.init_data()
              });
            } else if (from === 'deckboard') {
              client.is_deckboard = true;
            }
          } else {
            const { event, name, method, property, data } = _data.data,
              access = client.is_renderer ? ACCESS_ENUM.RENDERER : (client.is_deckboard ? ACCESS_ENUM.DECKBOARD : ACCESS_ENUM.GUEST),
              respond = id && ((error, data) => modules.store[error ? RESPONSE_ENUM.ERROR : RESPONSE_ENUM.DONE](id, error ? error : data));

            if (id) {
              modules.store.tracking(id, data => {
                client.send_json(data);
              }, true);
            }

            switch (to) {
              case TYPE_ENUM.METHOD: modules.communication.to_method(event, name, method, property, data, access, respond); break;
              case TYPE_ENUM.MANAGER: modules.communication.to_manager(event, name, method, property, data, access, respond); break;
              case TYPE_ENUM.EXTENSION: modules.communication.to_extension(event, name, method, property, data, access, respond); break;
              case EVENT_ENUM.BROADCAST: modules.communication.broadcast('websocket', method, property, data, true, false); break;
              default:
                if (id) {
                  modules.store.error(id, 'bad request');
                }
            }
          }
        } else {
          const { event, name, method, property, data } = _data,
            tid = id && modules.store.generate(req.headers['sec-websocket-key']),
            respond = (error, data) => modules.store[error ? RESPONSE_ENUM.ERROR : RESPONSE_ENUM.DONE](tid, error ? error : data);

          if (tid) {
            modules.store.tracking(tid, data => {
              client.send_json(Object.assign(data, { id }));
            }, true);
          }

          if (typeof event !== 'string' || (name && typeof name !== 'string') || (typeof method !== 'string' && to !== TYPE_ENUM.EXTENSION) || (property && typeof property !== 'string')) {
            if (tid) {
              modules.store.error(tid, 'bad request');
            }

            return;
          }

          switch (to) {
            case TYPE_ENUM.METHOD: modules.communication.to_method(event, name, method, property, data, ACCESS_ENUM.GUEST, respond); break;
            case TYPE_ENUM.EXTENSION: modules.communication.to_extension(event, name, 'websocket', property, data, ACCESS_ENUM.GUEST, respond); break;
            case EVENT_ENUM.BROADCAST: modules.communication.broadcast((name || 'websocket'), method, property, data, true, false); break;
            default:
              if (tid) {
                modules.store.error(tid, 'bad request');
              }
          }
        }
      }
    });
  });

  return {
    instance: server,
    token,
    set_password,
    send
  };
};