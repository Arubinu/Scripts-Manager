const fs = require('node:fs'),
  path = require('node:path'),
  https = require('node:https'),
  StreamTransform = require('node:stream').Transform,
  temp = require('temp'),
  notifications = require('electron-custom-notifications');

const PATH_ICON = path.join(__dirname, '..', '..', 'public', 'images', 'logo.png'),
  BASE64_ICON = fs.readFileSync(PATH_ICON, 'base64');

let _config = {},
  _screen = 0,
  _sender = null,
  _timeout = 0,
  _default = {
    settings: {
      round: 0,
      scale: 100,
      anchor: ['bottom', 'right'],
      screen: 0,
      opacity: 100
    }
  };

function is_numeric(n) {
  return (!isNaN(parseFloat(n)) && isFinite(n));
}

function update_interface() {
  const screens = notifications.getScreens();

  _sender('message', 'config', _config);
  _sender('message', 'screens', screens.length);
}

function save_config() {
  set_style();
  _sender('manager', 'config:override', _config);
}

function next_screen(index) {
  const screens = notifications.getScreens();
  if (typeof index === 'undefined') {
    _screen = ((_screen + 1) % screens.length);
    _config.settings.screen = _screen;
  } else {
    _screen = ((index < screens.length) ? index : 0);
  }

  notifications.setScreen(_screen);
}

function set_style() {
  const round = (Math.max(0, Math.min(100, _config.settings.round)) * .5).toFixed(0),
    scale = (Math.max(0, Math.min(100, _config.settings.scale)) / 100).toFixed(2).replace('.00', ''),
    anchor = _config.settings.anchor.join(' '),
    opacity = (Math.max(0, Math.min(100, _config.settings.opacity)) / 100).toFixed(2).replace('.00', '');

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

const functions = {
  GetScreens: async () => {
    return notifications.getScreens();
  },
  SetScreen: async index => {
    next_screen(index);
  },
  ShowNotification: async (message, title, icon, timeout) => {
    if (_config.default.enabled && message.length) {
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
};


module.exports = {
  init: (origin, config, sender, vars) => {
    _sender = sender;
    _config = config;

    for (const section in _default) {
      if (typeof _config[section] !== 'object') {
        _config[section] = {};
      }

      for (const name in _default[section]) {
        const config_value = _config[section][name];
        const default_value = _default[section][name];
        const config_type = typeof config_value;
        const default_type = typeof default_value;
        if (config_type !== default_type) {
          if (default_type === 'number' && config_type === 'string' && is_numeric(config_value)) {
            _config[section][name] = parseFloat(config_value);
          } else {
            _config[section][name] = default_value;
          }
        }
      }
    }

    set_style();
    notifications.setContainerWidth(350);
    notifications.setDefaultTemplate(`
<notification id="%id%" class="animated fadeInUp">
  <div class="logo" style="background-image: url('data:image/png;base64,%logo%');"></div>
  <div class="content">
    <h1>%title%</h1>
    <p>%body%</p>
  </div>
</notification>`);

    _screen = _config.settings.screen;
    next_screen(_screen);
  },
  initialized: () => {
    _sender('manager', 'menu', [
      { label: 'Next Screen', click : () => {
        next_screen();
        update_interface();
        save_config();

        functions.ShowNotification(`Screen: ${_screen + 1}`, 'Screen change');
      } }
    ]);
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
        if (typeof data[name] === typeof _config.settings[name]) {
          _config.settings[name] = data[name];
        }
        save_config();

        if (name === 'screen') {
          next_screen(data.screen);

          if (_config.default.enabled) {
            functions.ShowNotification(`Screen: ${_screen + 1}`, 'Screen change');
          }
        } else if (_config.default.enabled) {
          clearTimeout(_timeout);
          _timeout = setTimeout(() => {
            functions.ShowNotification(`${name[0].toUpperCase() + name.substring(1)}: ${Array.isArray(data[name]) ? data[name].join(' ') : data[name]}`, 'Notification settings');
          }, 2000 );
        }
      }

      return;
    } else if (id === 'methods') {
      if (name === 'websocket') {
        if (typeof data === 'object' && data.target === 'notifications') {
          if (data.name === 'corner') {
            const anchors = ['bottom-left', 'top-left', 'top-right', 'bottom-right'];

            let anchor = '';
            if (data.data && anchors.indexOf(data.data) >= 0) {
              anchor = data.data;
              _config.settings.anchor = data.data.split('-');
            } else {
              if (Array.isArray(_config.settings.anchor)) {
                anchor = _config.settings.anchor.join('-');
              }

              const pos = anchors.indexOf(anchor) + 1;
              _config.settings.anchor = anchors[pos % anchors.length].split('-');
            }

            update_interface();
            save_config();
          } else if (data.name === 'next-screen') {
            next_screen();
            update_interface();
            save_config();
          }
        }
      }

      return;
    }

    if (_config.default.enabled) {
      if (typeof functions[name] === 'function') {
        if (Array.isArray(data) && data.length) {
          return await functions[name](...data);
        } else {
          return await functions[name]();
        }
      }
    }
  }
};
