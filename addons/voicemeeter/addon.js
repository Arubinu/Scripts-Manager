const path = require('node:path'),
  voicemeeter = require('easy-voicemeeter-remote'),
  sm = require('./sm-comm');

const	voicemeeter_path = path.dirname(require.resolve('easy-voicemeeter-remote')),
  ioFuncs = require(path.join(voicemeeter_path, 'ioFuncs.js')),
  {
    VoicemeeterDefaultConfig,
    VoicemeeterType,
    InterfaceType
  } = require(path.join(voicemeeter_path, 'voicemeeterUtils.js'));

let comm = null;


// Additional methods
class Additional {
  static async GetDevices() {
    voicemeeter.updateDeviceList();

    return {
      input: voicemeeter.inputDevices,
      output: voicemeeter.outputDevices
    };
  }

  static async GetInputDevices() {
    return (await Additional.GetDevices()).input;
  }

  static async GetOutputDevices() {
    return (await Additional.GetDevices()).output;
  }
}


// Shared methods
class Shared {
  init = false;

  constructor(config, vars) {
    this.vars = vars;
    this.config = config;

    setInterval(async () => {
      if (this.config.default.enabled && !voicemeeter.isConnected) {
        await this.reconnect();
      }
    }, 5000);

    if (this.config.default.enabled) {
      this.connect().then();
    }
  }

  async show(id, property, data) {
    if (data) {
      comm.send('manager', 'interface', 'config', false, this.config);
    } else if (this.config.default.enabled) {
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
    if (typeof data === typeof this.config.connection[property]) {
      this.config.connection[property] = data;
    }

    comm.send('manager', 'config', 'save', false, this.config);
  }

  async connect(id, property, broadcast) {
    if (this.config.default.enabled) {
      comm.broadcast('Connection');

      try {
        if (!this.init) {
          await voicemeeter.init();
          this.init = true;
        }
        await voicemeeter.login();

        this.connected = true;
        comm.send('manager', 'state', 'set', false, 'connected');

        console.log('devices:', await Additional.GetDevices());
      } catch (e) {}
    }
  }

  async disconnect(id, property, broadcast) {
    if (this.config.default.enabled) {
      if (typeof broadcast === 'undefined' || broadcast) {
        comm.broadcast('Disconnection');
      }

      if (voicemeeter.isConnected) {
        this.connected = false;
        comm.send('manager', 'state', 'set', false, 'disconnected');
      }
    }
  }

  async reconnect(id, property, broadcast) {
    await this.disconnect(false, broadcast);
    await this.connect(false, broadcast);
  }

  async call(id, property, data) {
    if (this.config.default.enabled) {
      if (this.connected && voicemeeter.isConnected) {
        if (typeof Additional[property] === 'function') {
          if (Array.isArray(data) && data.length) {
            return await Additional[property](...data);
          } else {
            return await Additional[property]();
          }
        } else {
          if (Array.isArray(data) && data.length) {
            return await voicemeeter[property](...data);
          } else {
            return await voicemeeter[property]();
          }
        }
      }
    }
  }
}

//console.log('ioFuncs:', ioFuncs);
//console.log('VoicemeeterDefaultConfig:', VoicemeeterDefaultConfig);
//console.log('VoicemeeterType:', VoicemeeterType);
//console.log('InterfaceType:', InterfaceType);

module.exports = sender => {
  comm = new sm(Shared, sender);
  return {
    receive: (data) => {
      return comm.receive(data);
    }
  };
};