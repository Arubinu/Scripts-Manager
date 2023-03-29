const path = require('node:path'),
  uniqid = require('uniqid'),
  keyevents = require('node-global-key-listener').GlobalKeyboardListener,
  {
    screen,
    ipcMain,
    BrowserWindow
  } = require('electron'),
  sm = require('./sm-comm');

let comm = null,
  intervals = {};


// Basic methods
function is_numeric(n) {
  return (!isNaN(parseFloat(n)) && isFinite(n));
}

function update_interface() {
  const screens = screen.getAllDisplays();

  comm.send('manager', 'interface', 'config', false, this.config);
  comm.send('manager', 'interface', 'screens', false, screens.length);
}

function save_config() {
  comm.send('manager', 'config', 'override', false, this.config);
}

function create_window() {
  this.win = new BrowserWindow({
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
      partition: 'stream-widgets',
      nodeIntegrationInWorker: false,
      preload: path.join(__dirname, 'window', 'preload.js')
    }
  });

  this.screen.call(this, false, false, [false, this.config.settings.screen, true]);

  this.win.setMenu(null);
  this.win.setIgnoreMouseEvents(true);
  this.win.loadFile(path.join(__dirname, 'window', 'index.html')).then(() => {
    if (!this.init) {
      this.init = true;
      ipcMain.handle('edit', (event, data) => {
        if (typeof this.config.widgets[data.id] !== 'undefined') {
          let widget = JSON.parse(this.config.widgets[data.id]);
          for (const attr of ['x', 'y', 'width', 'height']) {
            if (typeof data[attr]  !== 'undefined') {
              widget[attr] = data[attr];
            }
          }

          this.config.widgets[data.id] = JSON.stringify(widget);
          comm.send('manager', 'interface', 'add', false, { id: data.id, widget: this.config.widgets[data.id] });
          save_config.call(this);
        }
      });
    }

    for (const widget_index in this.config.widgets) {
      const widget = JSON.parse(this.config.widgets[widget_index]);
      this.win.webContents.send('add', { id: widget_index, widget });
    }
    this.win.webContents.send('enabled', this.config.default.enabled);
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setVisibleOnAllWorkspaces(true);
    this.win.show();
  });

  if (intervals.top) {
    clearInterval(intervals.top);
  }

  intervals.top = setInterval(() => {
    if (this.config.default.enabled && this.win) {
      try {
        this.win.setSkipTaskbar(true);
        this.win.setAlwaysOnTop(true, 'screen-saver');
        this.win.setVisibleOnAllWorkspaces(true);
      } catch (e) {}
    }
  }, 100);

  if (intervals.screens) {
    clearInterval(intervals.screens);
  }

  let screens = screen.getAllDisplays().length,
    timeout = 0;

  intervals.screens = setInterval(() => {
    if (this.config.default.enabled && this.win) {
      let tmp = screen.getAllDisplays().length;
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

function update_menu() {
  comm.send('manager', 'menu', 'set', false, [{
    label: 'Edit Mode',
    type: 'checkbox',
    checked: !!this.edit,
    click : () => {
      if (this.config.default.enabled && this.win) {
        this.edit = !this.edit;
        update_menu.call(this);
        this.win.setIgnoreMouseEvents(!this.edit);
        this.win.webContents.send('edit', this.edit);
      }
    }
  }, {
    label: 'Next Screen',
    click : () => {
      this.screen.call(this, false, false, [true]);
      update_interface.call(this);
      save_config.call(this);
    }
  }]);
}

function edit_widget(name, callback) {
  for (const id in this.config.widgets) {
    const widget = JSON.parse(this.config.widgets[id]);
    if (widget.name === name) {
      callback(widget);

      this.config.widgets[id] = JSON.stringify(widget);
      if (this.win) {
        this.win.webContents.send('add', { id, widget });
      }

      update_interface.call(this);
      save_config.call(this);

      break;
    }
  }
}


// Shared methods
class Shared {
  win = null;
  edit = false;
  init = false;
  default = {
    settings: {
      screen: 0
    },
    presets: {},
    widgets: {}
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

    (new keyevents()).addListener(event => {
      if (event.name === 'ESCAPE' && event.state === 'DOWN') {
        this.edit = false;
        update_menu.call(this);
        if (this.win) {
          this.win.setIgnoreMouseEvents(!this.edit);
          this.win.webContents.send('edit', this.edit);
        }
      }
    });

    update_menu.call(this);
    if (this.config.default.enabled) {
      create_window.call(this);
    }
  }

  async show(id, property, data) {
    if (data) {
      update_interface.call(this);
    }
  }

  async enable(id, property, data) {
    this.config.default.enabled = data;
    if (this.config.default.enabled && !this.win) {
      create_window.call(this);
    } else if (!this.config.default.enabled && this.win) {
      this.win.destroy();
      this.win = null;
    }
  }

  async interface(id, property, data) {
    if (property === 'create') {
      const id = uniqid();
      this.config.widgets[id] = data.widget;
      if (this.win) {
        this.win.webContents.send('add', { id, widget: JSON.parse(this.config.widgets[id]) });
      }

      comm.send('manager', 'interface', 'add', false, { id, widget: this.config.widgets[id] });
    } else if (property === 'refresh') {
      const id = data.id;
      if (this.win) {
        this.win.webContents.send('refresh', { id });
      }
    } else if (property === 'update') {
      const id = data.id;
      this.config.widgets[id] = data.widget;
      if (this.win) {
        this.win.webContents.send('add', { id, widget: JSON.parse(this.config.widgets[id]) });
      }
    } else if (property === 'delete') {
      const id = data.id;
      delete this.config.widgets[id];
      if (this.win) {
        this.win.webContents.send('remove', { id });
      }
    } else if (typeof data === typeof this.config.settings[property]) {
      this.config.settings[property] = data;
    }
    save_config.call(this);

    if (property === 'screen') {
      this.screen.call(this, false, false, [false, data]);
    }
  }

  async websocket(id, property, data) {
    if (property === 'toggle-widget' && typeof data.name === 'string') {
      edit_widget.call(this, data.name, widget => {
        widget.hide = (typeof data.state === 'boolean') ? !data.state : !widget.hide;
      });
    } else if (property === 'replace-url' && typeof data.name === 'string' && typeof data.url === 'string') {
      edit_widget.call(this, data.name, widget => {
        widget.url = data.url;
      });
    } else if (property === 'next-screen') {
      this.screen.call(this, false, false, [true]);
      update_interface.call(this);
      save_config.call(this);
    }
  }

  async screen(id, property, data) {
    let index = data[1];
    const [next, _, no_flash] = data;
    if (['undefined', 'number'].indexOf(typeof index) < 0) {
      throw new TypeError('please specify a screen number or leave it blank');
    }

    const screens = screen.getAllDisplays();
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
    if (this.win) {
      const bounds = screens[index].bounds;
      this.win.setPosition(bounds.x, bounds.y);
      this.win.setMinimumSize(bounds.width, bounds.height); // fix
      this.win.setSize(bounds.width, bounds.height);

      if (!no_flash) {
        this.win.webContents.send('flash');
      }
    }

    return this.config.settings.screen;
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