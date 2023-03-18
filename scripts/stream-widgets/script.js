const path = require('node:path'),
  uniqid = require('uniqid'),
  keyevents = require('node-global-key-listener').GlobalKeyboardListener,
  { screen, BrowserWindow, ipcMain } = require('electron');

let win = null,
  _edit = false,
  _init = false,
  _screen = 0,
  _config = {},
  _sender = null,
  _default = {
    settings: {
      screen: 0
    },
    presets: {},
    widgets: {}
  };

function is_numeric(n) {
  return (!isNaN(parseFloat(n)) && isFinite(n));
}

function create_window() {
  win = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    movable: false,
    closable: false,
    focusable: false,
    hasShadow: false,
    resizable: false,
    thickFrame: false,
    skipTaskbar: true,
    transparent: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'window', 'preload.js')
    }
  });

  _screen = _config.settings.screen;
  next_screen(_screen);

  win.setMenu(null);
  win.setIgnoreMouseEvents(true);
  win.loadFile(path.join(__dirname, 'window', 'index.html')).then(() => {
    if (!_init) {
      _init = true;
      ipcMain.handle('edit', (event, data) => {
        if (typeof _config.widgets[data.id] !== 'undefined') {
          let widget = JSON.parse(_config.widgets[data.id]);
          for (const attr of ['x', 'y', 'width', 'height']) {
            if (typeof data[attr]  !== 'undefined') {
              widget[attr] = data[attr];
            }
          }

          _config.widgets[data.id] = JSON.stringify(widget);
          _sender('message', 'add', { id: data.id, widget: _config.widgets[data.id] });
          save_config();
        }
      });
    }

    for (const widget_index in _config.widgets) {
      const widget = JSON.parse(_config.widgets[widget_index]);
      win.webContents.send('add', { id: widget_index, widget });
    }

    //win.webContents.openDevTools();
    win.webContents.send('enabled', _config.default.enabled);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true);
    win.show();
  });
  setInterval(() => {
    if (_config.default.enabled && win) {
      try {
        win.setSkipTaskbar(true);
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setVisibleOnAllWorkspaces(true);
      } catch (e) {}
    }
  }, 100);
}

function update_interface() {
  const screens = screen.getAllDisplays();

  _sender('message', 'config', _config);
  _sender('message', 'screens', screens.length);
}

function save_config() {
  _sender('manager', 'config:override', _config);
}

function next_screen(index) {
  const screens = screen.getAllDisplays();
  if (typeof index === 'undefined') {
    _screen = ((_screen + 1) % screens.length);
    _config.settings.screen = _screen;
  } else {
    _screen = ((index < screens.length) ? index : 0);
  }

  if (win) {
    const bounds = screens[_screen].bounds;
    win.setPosition(bounds.x, bounds.y);
    win.setMinimumSize(bounds.width, bounds.height); // fix
    win.setSize(bounds.width, bounds.height);

    win.webContents.send('flash');
  }
}

function edit_widget(name, callback) {
  for (const id in _config.widgets) {
    const widget = JSON.parse(_config.widgets[id]);
    if (widget.name === name) {
      callback(widget);

      _config.widgets[id] = JSON.stringify(widget);
      if (win) {
        win.webContents.send('add', { id, widget });
      }

      update_interface();
      save_config();

      break;
    }
  }
}


module.exports = {
  init: (origin, config, sender) => {
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
  },
  initialized: () => {
    _sender('manager', 'menu', [ { label: 'Edit Mode', click : () => {
      if (_config.default.enabled && win) {
        _edit = true;
        win.setIgnoreMouseEvents(!_edit);
        win.webContents.send('edit', _edit);
      }
    } }, { label: 'Next Screen', click : () => {
      next_screen();
      update_interface();
      save_config();
    } }]);

    (new keyevents()).addListener(event => {
      if (event.name === 'ESCAPE' && event.state === 'DOWN') {
        _edit = false;
        if (win) {
          win.setIgnoreMouseEvents(!_edit);
          win.webContents.send('edit', _edit);
        }
      }
    });

    if (_config.default.enabled) {
      create_window();
    }
  },
  receiver: (id, name, data) => {
    if (id === 'manager') {
      if (name === 'show') {
        update_interface();
      } else if (name === 'enabled') {
        _config.default.enabled = data;
        if (_config.default.enabled && !win) {
          create_window();
        } else if (!_config.default.enabled && win) {
          win.destroy();
          win = false;
        }
      }
    } else if (name === 'websocket') {
      if (typeof data === 'object' && data.target === 'stream-widgets') {
        if (data.name === 'toggle-widget' && typeof data.data === 'object' && typeof data.data.name === 'string') {
          edit_widget(data.data.name, widget => {
            widget.hide = (typeof data.data.state === 'boolean') ? !data.data.state : !widget.hide;
          });
        } else if (data.name === 'replace-url' && typeof data.data === 'object' && typeof data.data.name === 'string' && typeof data.data.url === 'string') {
          edit_widget(data.data.name, widget => {
            widget.url = data.data.url;
          });
        } else if (data.name === 'next-screen') {
          next_screen();
          update_interface();
          save_config();
        }
      }
    }

    if (id === 'message') {
      if (typeof data === 'object') {
        const name = Object.keys(data)[0];

        if (name === 'create') {
          const id = uniqid();
          _config.widgets[id] = data[name].widget;
          if (win) {
            win.webContents.send('add', { id, widget: JSON.parse(_config.widgets[id]) });
          }
          _sender('message', 'add', { id, widget: _config.widgets[id] });
        } else if (name === 'refresh') {
          const id = data[name].id;
          if (win) {
            win.webContents.send('refresh', { id });
          }
        } else if (name === 'update') {
          const id = data[name].id;
          _config.widgets[id] = data[name].widget;
          if (win) {
            win.webContents.send('add', { id, widget: JSON.parse(_config.widgets[id]) });
          }
        } else if (name === 'delete') {
          const id = data[name].id;
          delete _config.widgets[id];
          if (win) {
            win.webContents.send('remove', { id });
          }
        } else if (typeof data[name] === typeof _config.settings[name]) {
          _config.settings[name] = data[name];
        }
        save_config();

        if (name === 'screen') {
          next_screen(data.screen);
        }
      }
    }
  }
};
