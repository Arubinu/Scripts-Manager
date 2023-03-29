const fs = require('node:fs'),
  path = require('node:path'),
  https = require('node:https'),
  StreamTransform = require('node:stream').Transform,
  temp = require('temp'),
  notifications = require('electron-custom-notifications'),
  sm = require('./sm-comm');

const PATH_ICON = path.join(__dirname, '..', '..', 'public', 'images', 'logo.png'),
  BASE64_ICON = fs.readFileSync(PATH_ICON, 'base64');

let comm = null;


// Basic methods
function is_numeric(n) {
  return (!isNaN(parseFloat(n)) && isFinite(n));
}

function update_interface() {
  const screens = notifications.getScreens();

  comm.send('manager', 'interface', 'config', false, this.config);
  comm.send('manager', 'interface', 'screens', false, screens.length);
}

function save_config() {
  set_style.call(this);
  comm.send('manager', 'config', 'override', false, this.config);
}

function set_style() {
  const round = (Math.max(0, Math.min(100, this.config.settings.round)) * .5).toFixed(0),
    scale = (Math.max(0, Math.min(100, this.config.settings.scale)) / 100).toFixed(2).replace('.00', ''),
    anchor = this.config.settings.anchor.join(' '),
    opacity = (Math.max(0, Math.min(100, this.config.settings.opacity)) / 100).toFixed(2).replace('.00', '');

  if (anchor.indexOf('left') >= 0) {
    notifications.toLeft();
  } else if (anchor.indexOf('right') >= 0) {
    notifications.toRight();
  }

  notifications.setGlobalStyles(`
#notification-container {
  ${(anchor.indexOf('top') >= 0) ? 'top: 0;' : ''}
  ${(anchor.indexOf('bottom') >= 0) ? 'bottom: 0;' : ''}
  ${(anchor.indexOf('left') >= 0) ? 'left: 0;' : ''}
  ${(anchor.indexOf('right') >= 0) ? 'right: 0;' : ''}
  opacity: ${opacity};
  transform: scale(${scale});
  transform-origin: ${anchor};
}
notification {
  overflow: hidden;
  display: flex;
  margin: 10px;
  padding: 12px;
  background-color: #fff;
  border-radius: ${round}%;
  box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
}
notification .logo {
  margin-right: 20px;
  width: 50px;
  height: 50px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
notification .content {
  font-family: sans-serif;
}
notification .content h1 {
  margin-bottom: 5px;
  font-weight: bold;
}`);
}

function load_file(name, data) {
  return new Promise((resolve, reject) => {
    https.request(data, response => {
      const sdata = new StreamTransform();

      response.on('data', chunk => {
        sdata.push(chunk);
      });

      response.on('end', () => {
        const file_path = path.join(temp.mkdirSync(), (name + '.' + response.headers['content-type'].split('/')[1]));
        fs.writeFileSync(file_path, sdata.read());

        resolve(file_path);
      });
    }).end();
  });
}


// Additional methods
class Additional {
  static async ShowNotification(message, title, icon, timeout) {
    if (message.length) {
      if (icon) {
        if (icon.indexOf('://') >= 0) {
          icon = await load_file('icon', icon);
        } else if (!fs.existsSync(icon)) {
          icon = false;
        }

        if (icon) {
          icon = fs.readFileSync(icon, 'base64');
        }
      }

      notifications.createNotification({
        parameters: [
          { key: 'logo', value: (icon || BASE64_ICON) },
          { key: 'title', value: (title || 'Scripts Manager') },
          { key: 'body', value: message }
        ],
        timeout: (timeout > 0) ? timeout : 6000,
      });
    }
  }
}


// Shared methods
class Shared {
  timeout = 0;
  default = {
    settings: {
      round: 0,
      scale: 100,
      anchor: ['bottom', 'right'],
      screen: 0,
      opacity: 100
    }
  };

  constructor(config, vars) {
    this.vars = vars;
    this.config = config;

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

    set_style.call(this);
    notifications.setContainerWidth(350);
    notifications.setDefaultTemplate(`
  <notification id="%id%" class="animated fadeInUp">
    <div class="logo" style="background-image: url('data:image/png;base64,%logo%');"></div>
    <div class="content">
      <h1>%title%</h1>
      <p>%body%</p>
    </div>
  </notification>`);

    this.screen.call(this, false, false, [false, this.config.settings.screen]);

    comm.send('manager', 'menu', 'set', false, [
      { label: 'Next Screen', click : () => {
        this.screen.call(this, false, false, [true]);
        update_interface.call(this);
        save_config.call(this);

        if (this.config.default.enabled) {
          Additional.ShowNotification(`Screen: ${this.config.settings.screen + 1}`, 'Screen change');
        }
      } }
    ]);

    let screens = notifications.getScreens().length,
      timeout = 0;

    setInterval(() => {
      if (this.config.default.enabled && this.win) {
        let tmp = notifications.getScreens().length;
        if (tmp !== screens) {
          clearTimeout(timeout);

          screens = tmp;
          timeout = setTimeout(() => {
            this.screen.call(this, false, false, []);
          }, 5000);
        }
      }
    }, 1000);
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
    if (typeof data === typeof this.config.settings[property]) {
      this.config.settings[property] = data;
    }
    save_config.call(this);

    if (property === 'screen') {
      this.screen.call(this, false, false, [false, data.screen]);

      if (this.config.default.enabled) {
        Additional.ShowNotification(`Screen: ${this.config.settings.screen + 1}`, 'Screen change');
      }
    } else if (this.config.default.enabled) {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        if (this.config.default.enabled) {
          Additional.ShowNotification(`${property[0].toUpperCase() + property.substring(1)}: ${Array.isArray(data) ? data.join(' ') : data}`, 'Notification settings');
        }
      }, 2000 );
    }
  }

  async websocket(id, property, data) {
    console.log('websocket notifications:', { property, data });
    if (property === 'corner') {
      const anchors = ['bottom-left', 'top-left', 'top-right', 'bottom-right'];

      let anchor = '';
      if (typeof data === 'string' && anchors.indexOf(data) >= 0) {
        anchor = data;
        this.config.settings.anchor = data.split('-');
      } else {
        if (Array.isArray(this.config.settings.anchor)) {
          anchor = this.config.settings.anchor.join('-');
        }

        const pos = anchors.indexOf(anchor) + 1;
        this.config.settings.anchor = anchors[pos % anchors.length].split('-');
      }

      update_interface.call(this);
      save_config.call(this);
    } else if (property === 'next-screen') {
      this.screen.call(this, false, false, [true]);
      update_interface.call(this);
      save_config.call(this);
    }
  }

  async create(id, property, data) {
    return await Additional.ShowNotification(...data);
  }

  async screen(id, property, data) {
    let index = data[1];
    const next = data[0];
    if (['undefined', 'number'].indexOf(typeof index) < 0) {
      throw new TypeError('please specify a screen number or leave it blank');
    }

    const screens = notifications.getScreens();
    if (typeof index !== 'number') {
      index = this.config.settings.screen;
    }

    if (index < 0 || index >= screens.length) {
      index = 0;
    }

    if (next) {
      index = (index + 1) % screens.length;
    }

    this.config.settings.screen = index;
    notifications.setScreen(this.config.settings.screen);

    return this.config.settings.screen;
  }

  async call(id, property, data) {
    if (this.config.default.enabled) {
      if (Array.isArray(data) && data.length) {
        return await Additional[property](...data);
      } else {
        return await Additional[property]();
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