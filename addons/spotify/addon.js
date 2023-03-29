const path = require('node:path'),
  querystring = require('node:querystring'),
  spotify = require('spotify-web-api-node'),
  WebApiRequest = require(path.join(path.dirname(require.resolve('spotify-web-api-node')), 'webapi-request')),
  HttpManager = require(path.join(path.dirname(require.resolve('spotify-web-api-node')), 'http-manager')),
  sm = require('./sm-comm');

const {
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  scopes: SCOPES,
} = require('./auth.json');

let comm = null,
  instance = new spotify();

instance.getQueue = function(callback) {
  return WebApiRequest.builder(this.getAccessToken())
    .withPath('/v1/me/player/queue')
    .build()
    .execute(HttpManager.get, callback);
};


// Basic methods
function update_interface() {
  comm.send('manager', 'interface', 'config', false, Object.assign({
    authorize: instance.createAuthorizeURL(SCOPES, ''),
    redirect_url: `${this.vars.http}/spotify/authorize`,
    refresh: this.refresh
  }, this.config));
}

async function refresh_token(error) {
  try {
    if (error.body.error.message === 'The access token expired') {
      const data = await instance.refreshAccessToken();

      this.config.connection.access_token = data.body.access_token;
      instance.setAccessToken(this.config.connection.access_token);

      return true;
    }
  } catch (e) {}

  return false;
}


// Additional methods
class Additional {
  static async search(track) {
    try {
      const data = await instance.searchTracks(track);
      if (typeof data.body === 'object' && typeof data.body.tracks === 'object' && Array.isArray(data.body.tracks.items) && data.body.tracks.items.length) {
        return data.body.tracks.items;
      }
    } catch (e) {
      if (await refresh_token.call(this, e)) {
        return Additional.search(...arguments);
      }

      throw e;
    }
  }

  static async addToQueue(track, device) {
    try {
      if (!device) {
        device = await Additional.getActiveDevice();
      }

      if (track.indexOf('spotify:')) {
        const tracks = await Additional.search(track);
        if (tracks.length) {
          return await instance.addToQueue(tracks[0].uri, { device_id: device && device.id });
        }
      } else {
        return await instance.addToQueue(track, { device_id: device && device.id });
      }

      return false;
    } catch (e) {
      if (await refresh_token.call(this, e)) {
        return Additional.addToQueue(...arguments);
      }

      throw e;
    }
  }

  static async playNow(track, device) {
    try {
      if (!device) {
        device = await Additional.getActiveDevice();
      }
      if (track) {
        if (track.indexOf('spotify:')) {
          const tracks = await Additional.search(track);
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
      if (await refresh_token.call(this, e)) {
        return Additional.playNow(...arguments);
      }

      throw e;
    }
  }

  static async pauseNow(device) {
    try {
      if (!device) {
        device = await Additional.getActiveDevice();
      }

      return await instance.pause({ device_id: device && device.id });
    } catch (e) {
      if (await refresh_token.call(this, e)) {
        return Additional.pauseNow(...arguments);
      }

      throw e;
    }
  }

  static async getDevices() {
    try {
      const data = await instance.getMyDevices();

      return data.body.devices;
    } catch (e) {
      if (await refresh_token.call(this, e)) {
        return Additional.getDevices(...arguments);
      }

      throw e;
    }
  }

  static async getActiveDevice() {
    try {
      const devices = await Additional.getDevices();

      if (devices.length >= 0) {
        for (const device of devices) {
          if (device.is_active) {
            return device;
          }
        }

        return devices[0];
      }
    } catch (e) {
      if (await refresh_token.call(this, e)) {
        return Additional.getActiveDevice(...arguments);
      }

      throw e;
    }
  }

  static async getCurrentTrack() {
    try {
      const data = await instance.getMyCurrentPlaybackState();
      return data.body && data.body.item;
    } catch (e) {
      if (await refresh_token.call(this, e)) {
        return Additional.getCurrentTrack(...arguments);
      }

      throw e;
    }
  }

  static async isPlaying() {
    try {
      const data = await instance.getMyCurrentPlaybackState();
      return data.body && data.body.is_playing;
    } catch (e) {
      if (await refresh_token.call(this, e)) {
        return Additional.isPlaying(...arguments);
      }

      throw e;
    }
  }

  static async isShuffle() {
    try {
      const data = await instance.getMyCurrentPlaybackState();

      return data.body && data.body.shuffle_state;
    } catch (e) {
      if (await refresh_token.call(this, e)) {
        return Additional.isShuffle(...arguments);
      }

      throw e;
    }
  }
}


// Shared methods
class Shared {
  refresh = false;

  constructor(config, vars) {
    this.vars = vars;
    this.config = config;

    comm.send('method', 'http', 'register', false, [{
      route: '/spotify/authorize',
      code: 200,
      type: 'text/html'
    }]);

    instance.setClientId(this.config.connection.client_id || CLIENT_ID);
    instance.setClientSecret(this.config.connection.client_secret || CLIENT_SECRET);
    instance.setRedirectURI(`${this.vars.http}/spotify/authorize`);
    if (this.config.connection.access_token) {
      instance.setAccessToken(this.config.connection.access_token);

      let scopes = {
        saved: this.config.connection.scopes,
        current: SCOPES
      };
      scopes.current.sort();
      if (Array.isArray(scopes.saved)) {
        scopes.saved.sort();
      }

      if (JSON.stringify(scopes.saved) !== JSON.stringify(scopes.current)) {
        this.refresh = true;
        comm.send('manager', 'state', 'set', false, 'warning');
      }
    }

    if (this.config.connection.refresh_token) {
      instance.setRefreshToken(this.config.connection.refresh_token);
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

      instance.setClientId(this.config.connection.client_id || CLIENT_ID);
      instance.setClientSecret(this.config.connection.client_secret || CLIENT_SECRET);
      instance.setAccessToken(this.config.connection.access_token);
      instance.setRefreshToken(this.config.connection.refresh_token);

      update_interface.call(this);
    }

    comm.send('manager', 'config', 'save', false, this.config);
  }

  async http(id, property, data) {
    if (data.register.route === '/spotify/authorize') {
      const pos = Math.min(data.url.indexOf('?'), data.url.indexOf('&')),
        search = querystring.parse(data.url.substr(pos + 1));

      if (typeof search.code === 'string') {
        instance.authorizationCodeGrant(search.code).then(data => {
          this.config.connection.access_token = data.body.access_token;
          this.config.connection.refresh_token = data.body.refresh_token;
          this.config.connection.scopes = SCOPES;

          instance.setAccessToken(this.config.connection.access_token);
          instance.setRefreshToken(this.config.connection.refresh_token);

          this.refresh = false;
          comm.send('manager', 'state', 'unset');
          comm.send('manager', 'config', 'save', false, this.config);

          update_interface.call(this);
          comm.send('done', undefined, 'response', false, { content: '<h1 style="font-family: sans-serif;">You can now close this page ...</h1>' }, id);
        }, err => {
          comm.send('done', undefined, 'response', false, { content: `<h1 style="font-family: sans-serif;">Something went wrong!</h1>${err}` }, id);
        });

        throw new Error('NO_RESPONSE');
      } else {
        return { content: `<h1 style="font-family: sans-serif;">Something went wrong!</h1>` };
      }
    }
  }

  async call(id, property, data) {
    if (this.config.default.enabled) {
      if (typeof Additional[property] === 'function') {
        if (Array.isArray(data) && data.length) {
          return await Additional[property].call(this, ...data);
        } else {
          return await Additional[property].call(this);
        }
      } else {
        try {
          if (Array.isArray(data) && data.length) {
            return await instance[property](...data);
          } else {
            return await instance[property]();
          }
        } catch (e) {
          if (await refresh_token.call(this, e)) {
            if (Array.isArray(data) && data.length) {
              return await instance[property](...data);
            } else {
              return await instance[property]();
            }
          }

          throw e;
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