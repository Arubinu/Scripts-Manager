const path = require('node:path'),
  querystring = require('node:querystring'),
  spotify = require('spotify-web-api-node'),
  WebApiRequest = require(path.join(path.dirname(require.resolve('spotify-web-api-node')), 'webapi-request')),
  HttpManager = require(path.join(path.dirname(require.resolve('spotify-web-api-node')), 'http-manager'));

const {
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
} = require('./auth.json');

let _vars = {},
  _config = {},
  _sender = null,
  instance = new spotify();

instance.getQueue = function(callback) {
  return WebApiRequest.builder(this.getAccessToken())
    .withPath('/v1/me/player/queue')
    .build()
    .execute(HttpManager.get, callback);
};

function update_interface() {
  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'playlist-read-private',
    'playlist-modify-public',
    'playlist-modify-private',
  ];

  _sender('message', 'config', Object.assign({
    authorize: instance.createAuthorizeURL(scopes, ''),
    redirect_url: `${_vars.http}/spotify/authorize`
  }, _config));
}

async function refresh_token(error) {
  try {
    if (error.body.error.message === 'The access token expired') {
      const data = await instance.refreshAccessToken();

      _config.connection.access_token = data.body.access_token;
      instance.setAccessToken(_config.connection.access_token);

      return true;
    }
  } catch (e) {}

  return false;
}

const functions = {
  Search: async function(track) {
    try {
      const data = await instance.searchTracks(track);
      if (typeof data.body === 'object' && typeof data.body.tracks === 'object' && Array.isArray(data.body.tracks.items) && data.body.tracks.items.length) {
        return data.body.tracks.items;
      }
    } catch (e) {
      if (await refresh_token(e)) {
        return functions.Search(...arguments);
      }

      throw e;
    }
  },
  AddToQueue: async function(track, device) {
    try {
      if (!device) {
        device = await functions.GetActiveDevice();
      }

      if (track.indexOf('spotify:')) {
        const tracks = await functions.Search(track);
        if (tracks.length) {
          return await instance.addToQueue(tracks[0].uri, { device_id: device && device.id });
        }
      } else {
        return await instance.addToQueue(track, { device_id: device && device.id });
      }

      return false;
    } catch (e) {
      if (await refresh_token(e)) {
        return functions.AddToQueue(...arguments);
      }

      throw e;
    }
  },
  PlayNow: async function(track, device) {
    try {
      if (!device) {
        device = await functions.GetActiveDevice();
      }
      if (track) {
        if (track.indexOf('spotify:')) {
          const tracks = await functions.Search(track);
          if (tracks.length) {
            return await instance.play({
              device_id: device && device.id,
              uris: [tracks[0].uri]
            });
          }
        } else {
          return await instance.play({
            device_id: device && device.id,
            uris: [track]
          });
        }
      } else {
        return await instance.play({ device_id: device && device.id });
      }

      return false;
    } catch (e) {
      if (await refresh_token(e)) {
        return functions.PlayNow(...arguments);
      }

      throw e;
    }
  },
  PauseNow: async function(device) {
    try {
      if (!device) {
        device = await functions.GetActiveDevice();
      }

      return await instance.pause({ device_id: device && device.id });
    } catch (e) {
      if (await refresh_token(e)) {
        return functions.PauseNow(...arguments);
      }

      throw e;
    }
  },
  GetDevices: async function() {
    try {
      const data = await instance.getMyDevices();

      return data.body.devices;
    } catch (e) {
      if (await refresh_token(e)) {
        return functions.GetDevices(...arguments);
      }

      throw e;
    }
  },
  GetActiveDevice: async function() {
    try {
      const devices = await functions.GetDevices();

      if (devices.length >= 0) {
        for (const device of devices) {
          if (device.is_active) {
            return device;
          }
        }

        return devices[0];
      }
    } catch (e) {
      if (await refresh_token(e)) {
        return functions.GetActiveDevice(...arguments);
      }

      throw e;
    }
  },
  isPlaying: async function() {
    try {
      const data = await instance.getMyCurrentPlaybackState();
      return data.body && data.body.is_playing;
    } catch (e) {
      if (await refresh_token(e)) {
        return functions.GetActiveDevice(...arguments);
      }

      throw e;
    }
  },
  isShuffle: async function() {
    try {
      const data = await instance.getMyCurrentPlaybackState();

      return data.body && data.body.shuffle_state;
    } catch (e) {
      if (await refresh_token(e)) {
        return functions.GetActiveDevice(...arguments);
      }

      throw e;
    }
  }
};


module.exports = {
  init: (origin, config, sender, vars) => {
    _vars = vars;
    _sender = sender;
    _config = config;

    instance.setRedirectURI(`${_vars.http}/spotify/authorize`);
  },
  initialized: () => {
    instance.setClientId(_config.connection.client_id || CLIENT_ID);
    instance.setClientSecret(_config.connection.client_secret || CLIENT_SECRET);
    if (_config.connection.access_token) {
      instance.setAccessToken(_config.connection.access_token);
    }
    if (_config.connection.refresh_token) {
      instance.setRefreshToken(_config.connection.refresh_token);
    }
  },
  receiver: async (id, name, data) => {
    if (id === 'manager') {
      if (name === 'show') {
        update_interface();
      } else if (name === 'enabled') {
        _config.default.enabled = data;
      }

      return;
    } else if (id === 'message') {
      if (typeof data === 'object') {
        const name = Object.keys(data)[0];

        if (typeof data[name] === typeof _config.connection[name]) {
          _config.connection[name] = data[name];

          instance.setClientId(_config.connection.client_id || CLIENT_ID);
          instance.setClientSecret(_config.connection.client_secret || CLIENT_SECRET);
          instance.setAccessToken(_config.connection.access_token);
          instance.setRefreshToken(_config.connection.refresh_token);

          update_interface();
        }
        _sender('manager', 'config', _config);
      }

      return;
    } else if (id === 'methods') {
      const url = '/spotify/authorize';

      if (name === 'http' && data.req && data.req.url.split('?')[0] === url) {
        const search = querystring.parse(data.req.url.split('?')[1]);

        data.res.writeHead(200);
        data.res.end(`<h1 style="font-family: sans-serif;">You can now close this page ...</h1>`);

        if (typeof search.code === 'string') {
          instance.authorizationCodeGrant(search.code).then(data => {
            _config.connection.access_token = data.body.access_token;
            _config.connection.refresh_token = data.body.refresh_token;

            instance.setAccessToken(_config.connection.access_token);
            instance.setRefreshToken(_config.connection.refresh_token);

            _sender('manager', 'config', _config);

            update_interface();
          }, err => {
            console.log('Spotify: Something went wrong!', err);
          });
        }

        return true;
      }

      return;
    }

    if (typeof functions[name] === 'function') {
      if (Array.isArray(data) && data.length) {
        return await functions[name](...data);
      } else {
        return await functions[name]();
      }
    } else if (typeof instance[name] === 'function') {
      try {
        if (Array.isArray(data) && data.length) {
          return await instance[name](...data);
        } else {
          return await instance[name]();
        }
      } catch (e) {
        if (await refresh_token(e)) {
          if (Array.isArray(data) && data.length) {
            return await instance[name](...data);
          } else {
            return await instance[name]();
          }
        }

        throw e;
      }
    }
  }
};
