const sockjs = require('sockjs-client'),
  sm = require('./sm-comm');

let comm = null;


// Basic methods
function request(name, ...args) {
  const id = this.sock_id++,
    split = name.split('.'),
    resource = split[0],
    method = split.slice(1).join('.');

  this.instance.send(JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params: {
      resource,
      args
    }
  }));

  return id;
}

function on_message(data) {
  if (typeof data.id === 'number') {
    const _store = this.store[data.id.toString()];
    if (typeof _store !== 'undefined') {
      comm.send('done', undefined, _store.property, false, data.result, _store.id);

      delete this.store[data.id.toString()];
    }

    return;
  }

  const obj = {
    type: data.result.resourceId,
    date: Date.now()
  };

  this.logs.unshift(obj);
  for (let i = (this.logs.length - 1); i >= 20; --i) {
    delete this.logs[i];
  }

  data = data.result.data;
  data = ((typeof data !== 'undefined') ? JSON.parse(JSON.stringify(data)) : data);

  comm.send('manager', 'interface', 'logs', false, obj);
  comm.broadcast(obj.type, data);
}


// Shared methods
class Shared {
  logs = [];
  store = {};
  changes = false;
  sock_id = 1;
  connected = false;
  services = {
    SceneCollectionsService: [
      'collectionAdded',
      'collectionRemoved',
      'collectionSwitched',
      'collectionUpdated',
      'collectionWillSwitch'
    ],
    ScenesService: [
      'itemAdded',
      'itemRemoved',
      'itemUpdated',
      'sceneAdded',
      'sceneRemoved',
      'sceneSwitched'
    ],
    SourcesService: [
      'sourceAdded',
      'sourceRemoved',
      'sourceUpdated'
    ],
    StreamingService: [
      'recordingStatusChange',
      'replayBufferStatusChange',
      'streamingStatusChange'
    ],
    TransitionsService: [
      'studioModeChanged'
    ]
  };

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

    const sname = Object.keys(data)[0];
    if (typeof data[sname] === typeof this.config[property][sname]) {
      this.changes = true;
      this.config[property][sname] = data[sname];
    }

    comm.send('manager', 'config', 'save', false, this.config);
  }

  async connect(id, property, broadcast) {
    if (this.config.desktop && this.config.desktop.token) {
      if (typeof broadcast === 'undefined' || broadcast) {
        comm.broadcast('Connection');
      }

      this.changes = false;
      this.instance = new sockjs(`http://${this.config.desktop.address}:${this.config.desktop.port}/api`);
      this.instance.onopen = async () => {
        console.log('StreamlabsDesktop Connected');
        request.call(this, 'TcpServerService.auth', this.config.desktop.token);
      }
      this.instance.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.id === 1) {
          if (data.result) {
            console.log('StreamlabsDesktop Authentication successful');
            this.connected = true;

            for (const service of Object.keys(this.services)) {
              for (const accessor of this.services[service]) {
                request.call(this, `${service}.${accessor}`);
              }
            }
          } else {
            console.log('StreamlabsDesktop Authentication failed');
            this.instance.close();
          }

          return;
        }

        on_message.call(this, data);
      };
      this.instance.onclose = () => {
        if (this.connected) {
          this.connected = false;
          console.log('StreamlabsDesktop Disconnected');
        }
      };
    }
  }

  async disconnect(id, property, broadcast) {
    if (typeof broadcast === 'undefined' || broadcast) {
      comm.broadcast('Disconnection');
    }

    if (this.instance) {
      this.instance.close();
      this.instance = null;
      this.connected = false;
    }
  }

  async reconnect(id, property, broadcast) {
    this.disconnect(broadcast);
    this.connect(broadcast);
  }

  async call(id, property, data) {
    if (this.config.default.enabled) {
      if (this.connected) {
        const rid = request.call(this, property, ...(data || []));
        this.store[rid] = {
          id,
          property,
          data
        };

        throw new Error('NO_RESPONSE');
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