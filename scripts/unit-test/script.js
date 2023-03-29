const path = require('node:path'),
  ws = require('ws'),
  { request } = require('undici'),
  sm = require('./sm-comm');

let comm = null;


// Basic methods
function is_numeric(n) {
  return (!isNaN(parseFloat(n)) && isFinite(n));
}

function update_interface() {
  comm.send('manager', 'interface', 'config', false, this.config);
}

function save_config() {
  comm.send('manager', 'config', 'save', false, this.config);
}

function update_menu() {
  comm.send('manager', 'menu', 'set', false, [{
    label: 'Checkbox',
    type: 'checkbox',
    checked: !!this.checkbox,
    click : item => {
      this.checkbox = item.checked;
      if (!this.checkbox) {
        add_statistic.call(this, 'menu');
      }

      update_menu.call(this);
    }
  }]);
}

function add_statistic(name) {
  ++this.config.statistics[name];

  update_interface.call(this);
  save_config.call(this);
}


// Shared methods
class Shared {
  _show = false;
  voices = [];
  checkbox = false;
  default = {
    statistics: {
      audio: 0,
      bluetooth: 0,
      broadcast: 0,
      enable: 0,
      http: 0,
      menu: 0,
      show: 0,
      speech: 0,
      usb: 0,
      websocket: 0
    }
  };

  constructor(config, vars) {
    this.vars = vars;
    this.config = config;

    comm.send('method', 'http', 'register', false, [{
      route: '/unit-test',
      code: 200,
      type: 'text/html'
    }]);

    for (const section in this.default) {
      if (typeof this.config[section] !== 'object') {
        this.config[section] = {};
      }

      for (const name in this.default[section]) {
        const config_value = this.config[section][name];
        const default_value = this.default[section][name];
        const config_type = typeof config_value;
        const default_type = typeof default_value;
        if (config_type !== default_type) {
          if (default_type === 'number' && config_type === 'string' && is_numeric(config_value)) {
            this.config[section][name] = parseFloat(config_value);
          } else {
            this.config[section][name] = default_value;
          }
        }
      }
    }

    update_menu.call(this);
  }

  async show(id, property, data) {
    this._show = !this._show;
    if (this._show) {
      add_statistic.call(this, 'show');
    }

    if (data) {
      update_interface.call(this);
    }
  }

  async enable(id, property, data) {
    this.config.default.enabled = data;
    add_statistic.call(this, 'enable');
  }

  async interface(id, property, data) {
    if (property === 'check') {
      let client = null;
      switch (data) {
        case 'audio': // todo: test stop
          comm.send('method', 'audio', 'play', false, {
            file: path.join(__dirname, 'error.ogg')
          })
            .catch(error => {
              comm.send('method', 'audio', 'play', false, {
                file: path.join(__dirname, 'audio.ogg')
              })
                .then(result => {
                  add_statistic.call(this, 'audio');
                })
                .catch(error => console.error('audio error:', error));
            });
          break;

        case 'http':
          request(this.vars.http + '/unit-test')
            .then(async req => {
              if (await req.body.text() === 'direct') {
                request(this.vars.http + '/unit-test?timeout')
                  .then(async req => {
                    if (await req.body.text() === 'timeout') {
                      add_statistic.call(this, 'http');
                    } else {
                      console.error('http error: timeout bad result');
                    }
                  })
                  .catch(error => {
                    console.error('http error: timeout', error);
                  });
              } else {
                console.error('http error: direct bad result');
              }
            })
            .catch(error => {
              console.error('http error: direct', error);
            });
          break;

        case 'broadcast':
          comm.broadcast('test');
          break;

        case 'speech': // todo: test stop
          if (Array.isArray(this.voices) && this.voices.length) {
            comm.send('method', 'speech', 'say', false, {
              voice: this.voices[0].name,
              text: 'test'
            })
              .then(result => {
                add_statistic.call(this, 'speech');
              })
              .catch(error => console.error('speech error:', error));
          } else {
            console.error('speech error: no voice');
          }
          break;

        case 'websocket':
          client = new ws(`${this.vars.websocket}?token=${this.vars.websocket_token}`);
          client.on('error', error => {
            console.error('websocket error:', error);
          });

          client.onopen = () => {
            client.send(JSON.stringify({
              to: 'extension',
              event: 'script',
              name: 'unit-test',
              method: 'websocket',
              property: false,
              data: true
            }), () => {
              client.close();
              client = null;
            });
          };
          break;
      }

      return;
    } else if (property === 'reset') {
      for (const key in this.config.statistics) {
        this.config.statistics[key] = 0;
      }

      update_interface.call(this);
      save_config.call(this);
      return;
    }

    if (typeof data === typeof this.config.settings[property]) {
      this.config.settings[property] = data;
    }
    save_config.call(this);
  }

  async bluetooth(id, property, data) {
  }

  async http(id, property, data) {
    if (data.url.split('?')[1] === 'timeout') {
      setTimeout(() => {
        comm.send('done', undefined, 'response', false, { content: 'timeout' }, id);
      }, 1000);
      throw new Error('NO_RESPONSE');
    } else {
      return { content: 'direct' };
    }
  }

  async speech(id, property, data) {
    if (property === 'voices') {
      this.voices = data;
    }
  }

  async usb(id, property, data) {
    add_statistic.call(this, 'usb');
  }

  async websocket(id, property, data) {
    add_statistic.call(this, 'websocket');
  }

  async broadcast(name, method, property, data) {
    if (name === 'script' && method === 'unit-test') {
      add_statistic.call(this, 'broadcast');
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