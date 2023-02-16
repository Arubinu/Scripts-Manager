const fs = require('node:fs'),
  path = require('node:path'),
  notifications = require('electron-custom-notifications');

const PATH_ICON = path.join(__dirname, '..', '..', 'public', 'images', 'logo.png'),
  BASE64_ICON = fs.readFileSync(PATH_ICON, 'base64');

let _config = {},
  _screen = 0,
  _sender = null,
  _default = {
    settings: {
      screen: 0
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
  _sender('manager', 'config', _config);
}

function next_screen(index) {
  const screens = notifications.getScreens();
  if (typeof(index) === 'undefined') {
    _screen = ((_screen + 1) % screens.length);
    _config.settings.screen = _screen;
  } else {
    _screen = ((index < screens.length) ? index : 0);
  }

  notifications.setScreen(_screen);
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
      if (icon && fs.existsSync(icon)) {
        icon = fs.readFileSync(icon, 'base64');
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
      if (typeof(_config[section]) !== 'object') {
        _config[section] = {};
      }

      for (const name in _default[section]) {
        const config_value = _config[section][name];
        const default_value = _default[section][name];
        const config_type = typeof(config_value);
        const default_type = typeof(default_value);
        if (config_type !== default_type) {
          if (default_type === 'number' && config_type === 'string' && is_numeric(config_value)) {
            _config[section][name] = parseFloat(config_value);
          } else {
            _config[section][name] = default_value;
          }
        }
      }
    }

    notifications.setContainerWidth(350);

    notifications.setGlobalStyles(`
notification {
  overflow: hidden;
  display: flex;
  margin: 10px;
  padding: 20px;
  background-color: #fff;
  border-radius: 12px;
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
      if (typeof(data) === 'object') {
        const name = Object.keys(data)[0];
        if (typeof(data[name]) === typeof(_config.settings[name])) {
          _config.settings[name] = data[name];
        }
        save_config();

        if (name === 'screen') {
          next_screen(data.screen);

          if (_config.default.enabled) {
            functions.ShowNotification(`Screen: ${_screen + 1}`, 'Screen change');
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
}
