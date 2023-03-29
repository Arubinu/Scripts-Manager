const path = require('node:path'),
  {
    screen,
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
  comm.send('manager', 'config', 'save', false, this.config);
}

function add_block() {
  comm.authorization('script', 'multi-actions', 'block')
    .then(() => {
      comm.send('script', 'multi-actions', 'block', 'add', {
        title: 'Flash',
        help: 'flash',
        icon: path.join(__dirname, 'images', 'flash.webp'),
        inputs: 1,
        outputs: 1,
        body: '<div class="is-size-5 has-text-centered block-id">Flash</div>'
      })
        .then(result => console.log('Block Added:', result));
    })
    .catch(error => {
      if (error === 'script not found') {
        setTimeout(add_block, 1000);
      }
    });
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
      partition: 'stream-flash',
      nodeIntegrationInWorker: false,
      preload: path.join(__dirname, 'window', 'preload.js')
    }
  });

  this.screen.call(this, false, false, [false, undefined, true]);

  this.win.setMenu(null);
  this.win.setIgnoreMouseEvents(true);
  this.win.loadFile(path.join(__dirname, 'window', 'index.html')).then(() => {
    set_opacity.call(this, this.config.settings.opacity);
    set_duration.call(this, this.config.settings.duration);

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
    label: 'Pause',
    type: 'checkbox',
    checked: !!this.pause,
    click : item => {
      clearTimeout(this.pause);
      this.pause = 0;

      if (item.checked) {
        this.pause = setTimeout(() => {
          this.pause = 0;
          item.checked = false;
          update_menu.call(this);
        }, (this.config.settings.pause * 1000 * 60));
        update_menu.call(this);
      }
    }
  }, {
    label: 'Next Screen',
    click : () => {
      this.screen.call(this, false, false, [true]);
      update_interface.call(this);
      save_config.call(this);

      flash_screen.call(this, false, true);
    }
  }]);
}

function set_opacity(opacity) {
  opacity = Math.max(0, Math.min(100, opacity));
  if (this.win) {
    this.win.webContents.send('opacity', opacity);
  }
}

function set_duration(duration) {
  duration = Math.max(100, duration);
  if (this.win) {
    this.win.webContents.send('duration', duration);
  }
}

function flash_screen(name, force) {
  let now = Date.now();
  if (force || !this.last || (this.last + (this.config.settings.delay * 1000)) < now) {
    if (this.win) {
      this.last = now + (force ? 1000 : 0);
      this.win.webContents.send('flash', name);
    }

    return true;
  }

  return false;
}


// Shared methods
class Shared {
  win = null;
  last = 0;
  pause = 0;
  default = {
    settings: {
      screen: 0,
      delay: 15,
      pause: 1,
      opacity: 80,
      duration: 400,
      join: false,
      command: true
    },
    statistics: {
      flash: 0,
      viewer: 0,
      follower: 0,
      subscriber: 0,
      moderator: 0
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

    this.config.settings.delay = Math.max(1, this.config.settings.delay);
    this.config.settings.opacity = Math.max(0, Math.min(100, this.config.settings.opacity));
    this.config.settings.duration = Math.max(100, this.config.settings.duration);

    update_menu.call(this);
    if (this.config.default.enabled) {
      create_window.call(this);
    }

    add_block();
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
    if (property === 'reset') {
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

    if (property === 'screen') {
      this.screen.call(this, false, false, [false, data]);
      flash_screen.call(this, false, true);
    } else if (property === 'opacity') {
      set_opacity.call(this, data);
    } else if (property === 'duration') {
      set_duration.call(this, data);
    }
  }

  async websocket(id, property, data) {
    if (property === 'pause') {
      const state = (typeof data === 'object' && typeof data.state === 'boolean') ? data.state : !this.pause,
        delay = (typeof data === 'object' && typeof data.delay === 'number' && data.delay > 0) ? data.delay : this.config.settings.pause;

      clearTimeout(this.pause);
      this.pause = 0;

      if (state) {
        this.pause = setTimeout(() => {
          this.pause = 0;
          update_menu.call(this);
        }, (delay * 1000 * 60));
      }

      update_menu.call(this);
    } else if (property === 'next-screen') {
      this.screen.call(this, false, false, [true]);
      update_interface.call(this);
      save_config.call(this);

      flash_screen.call(this, false, true);
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

  async broadcast(name, method, property, data) {
    if (name === 'twitch' && method === 'AuthenticationSuccess') {
      flash_screen.call(this, 'connected', true);
    } else if (name === 'twitch' && (method === 'AuthenticationFailure' || method === 'Disconnected')) {
      flash_screen.call(this, 'disconnected', true);
    }

    if (name === 'twitch' && (method === 'Message' || (this.config.settings.join && method === 'Join') || (this.config.settings.command && name === 'Command'))) {
      if (this.pause || !flash_screen.call(this)) {
        return;
      }

      ++this.config.statistics.flash;

      if (data.flags) {
        let viewer = !data.flags.broadcaster;
        if (data.flags.moderator && !(viewer = false)) {
          ++this.config.statistics.moderator;
        }
        if (data.flags.subscriber && !(viewer = false)) {
          ++this.config.statistics.subscriber;
        }
        if (data.flags.follower && !(viewer = false)) {
          ++this.config.statistics.follower;
        }

        if (viewer) {
          ++this.config.statistics.viewer;
        }
      }

      update_interface.call(this);
      save_config.call(this);
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