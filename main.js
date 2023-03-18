const fs = require('node:fs'),
  net = require('node:net'),
  http = require('node:http'),
  path = require('node:path'),
  pkg = require('./package.json'),
  tp = require('touchportal-api'),
  ws = require('ws'),
  { usb, WebUSB } = require('usb'),
  elog = require('electron-log'),
  estore = require('electron-store'),
  sstatic = require('serve-static'),
  inifile = { read: require('read-ini-file'), write: require('write-ini-file') },
  { BrowserWindow, Menu, nativeImage, Notification, Tray, app, dialog, globalShortcut, ipcMain, shell } = require('electron');

const APP_PORT = 5042,
  PATH_ICON = path.join(__dirname, 'public', 'images', 'logo.png'),
  PATH_ICON_GRAY = path.join(__dirname, 'public', 'images', 'logo-gray.png'),
  APP_ICON = nativeImage.createFromPath(PATH_ICON),
  APP_ICON_GRAY = nativeImage.createFromPath(PATH_ICON_GRAY),
  store = new estore(),
  istatic = sstatic(path.join(__dirname, 'public'), { index: 'local.html' });

let win,
  tpc,
  wss,
  tray,
  menus = {},
  addons = {},
  exited = false,
  states = {},
  voices = [],
  manager = { default: {} },
  scripts = {},
  app_asar = __dirname,
  app_path = __dirname,
  tpc_state = false,
  store_clear = false,
  usb_infos = {},
  bluetooth_callback = null;

function relaunch_app() {
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    app.relaunch({ execPath: process.env.PORTABLE_EXECUTABLE_FILE });
  } else {
    app.relaunch();
  }

  console.log('Restarting Scripts Manager');
  app.exit();
}

function is_local() {
  return manager.default.local === true;
}

function get_configs() {
  let configs = {
    addons: {},
    scripts: {}
  };

  for (const id in addons) {
    configs.addons[id] = addons[id].config;
  }

  for (const id in scripts) {
    configs.scripts[id] = scripts[id].config;
  }

  return configs;
}

function get_static(_path, req, res, next) {
  const url = req.url,
    split = url.substring(1).split('/');

  _path = path.join(_path, split[0]);
  req.url = '/' + split.slice(1).join('/');

  if (fs.existsSync(_path)) {
    return sstatic(_path)(req, res, async () => {
      req.url = url;
      await next();
    });
  }
}

function create_server() {
  const server = http.createServer({}, async (req, res) => {
    const next = async () => {
      if (req.url !== '/favicon.ico' && await all_methods('http', { req, res })) {
        res.writeHead(200);
        return res.end('success');
      }

      res.writeHead(403);
      res.end();
    };

    if (is_local() && req.url !== '/index.html' && req.url !== '/local.html') {
      return istatic(req, res, async () => {
        const split = req.url.substring(1).split('/');
        if (split.length > 2 && ['addons', 'scripts'].indexOf(split[0]) >= 0) {
          return get_static(__dirname, req, res, async () => {
            if (typeof manager.default.all === 'string') {
              return get_static(manager.default.all, req, res, async () => {
                await next();
              });
            }

            await next();
          });
        }

        await next();
      });
    }

    await next();
  });
  server.on('error', exit_on_error);
  server.listen(APP_PORT, () => {
    console.log('HTTP running on port', APP_PORT);
  });

  wss = new ws.Server({server});
  wss.on('connection', client => {
    client.is_defined = false;
    client.is_renderer = false;

    client.on('message', async data => {
      const is_defined = client.is_defined;
      client.is_defined = true;

      if (typeof data === 'object') {
        data = Buffer.from(data).toString();
      }

      try {
        data = JSON.parse(data);
      } catch (e) {}

      if (typeof data === 'object' && data.from === 'renderer' && is_local()) {
        if (data.target === 'init' && !is_defined) {
          client.is_renderer = true;
          client.send(JSON.stringify({
            from: 'manager',
            name: 'init',
            data: {
              asar: app_asar,
              mode: (process.env.NODE_ENV || 'production'),
              path: app_path,
              configs: get_configs(),
              settings: manager.default,
              versions: process.versions,
              pkg,
              menus,
              states
            }
          }));
        } else if (client.is_renderer) {
          if (data.target === 'manager') {
            manager_conn(data.data, data => {
              client.send(JSON.stringify({
                from: 'manager',
                name: 'response',
                data
              }));
            });
          } else if (data.target === 'message') {
            message_conn(data.data, data => {
              client.send(JSON.stringify({
                from: 'manager',
                name: 'response',
                data
              }));
            });
          }
        }
      } else if (typeof data === 'object' && data.target === 'manager') {
        if (data.name === 'enabled' && typeof data.data === 'object') {
          broadcast_sender('manager', { name: data.name, data: { type: 'scripts', name: data.data.name, state: data.data.state } });
        } else if (data.name === 'addons') {
          let data = {};
          for (const id in addons) {
            data[id] = addons[id].config.default;
          }

          client.send(JSON.stringify({ from: 'manager', name: 'addons', data }));
        } else if (data.name === 'scripts') {
          let data = {};
          for (const id in scripts) {
            data[id] = scripts[id].config.default;
          }

          client.send(JSON.stringify({ from: 'manager', name: 'scripts', data }));
        }
      } else if (await all_methods('websocket', data)) {
        return;
      }
    });
  });

  const tcp_connect = () => {
    tpc = new tp.Client();

    tpc.on('connected', () => {
      if (!tpc_state) {
        tpc_state = true;
        console.log('TouchPortal Connected');
      }

      let data = [];
      for (const id in scripts) {
        data.push(scripts[id].config.default.name);
      }
      tpc.choiceUpdate('script', data);
    });

    tpc.on('Action', async _data => {
      const get_state = state => {
          if (state === 'Enable') {
            return true;
          } else if (state === 'Disable') {
            return false;
          }

          return undefined;
        },
        get_script = name => {
          for (const id in scripts) {
            if (scripts[id].config.default.name === name) {
              return id;
            }
          }

          return undefined;
        },
        get_evidence = evidence => {
          const evidences = {
            'EMF Level 5': 'emf-5',
            'Fingerprints': 'fingerprints',
            'Ghost Writing': 'ghost-writing',
            'Freezing Temperatures': 'freezing-temperatures',
            'D.O.T.S Projector': 'dots-projector',
            'Ghost Orb': 'ghost-orb',
            'Spirit Box': 'spirit-box'
          };

          return evidences[evidence];
        },
        get_mode = mode => {
          if (mode === 'Found') {
            return 'on';
          } else if (mode === 'Impossible') {
            return 'off';
          }

          return 'toggle';
        };

      let data = {};
      for (const item of _data.data) {
        data[item.id] = item.value;
      }

      switch (_data.actionId) {
        case 'fr.arubinu42.action.scripts-manager.custom-request':
          try {
            await all_methods('websocket', (data.isJson ? JSON.parse(data.message) : data.message));
          } catch (e) {}

          break;

        case 'fr.arubinu42.action.scripts-manager.toggle-script':
          win.webContents.send('manager', { name: get_script(data.script), data: get_state(data.state) });
          break;

        case 'fr.arubinu42.action.multi-actions.button':
          await all_methods('websocket', { target: 'multi-actions', name: 'block', data: parseInt(data.id) });
          break;

        case 'fr.arubinu42.action.multi-actions.variable-setter.string':
        case 'fr.arubinu42.action.multi-actions.variable-setter.number':
        case 'fr.arubinu42.action.multi-actions.variable-setter.boolean':
          await all_methods('websocket', { target: 'multi-actions', name: 'variable', data });
          break;

        case 'fr.arubinu42.action.notifications.corner':
          await all_methods('websocket', { target: 'notifications', name: 'corner', data: data.toLowerCase() });
          break;

        case 'fr.arubinu42.action.notifications.next-screen':
          await all_methods('websocket', { target: 'notifications', name: 'next-screen' });
          break;

        case 'fr.arubinu42.action.stream-flash.next-screen':
          await all_methods('websocket', { target: 'stream-flash', name: 'next-screen' });
          break;

        case 'fr.arubinu42.action.stream-flash.pause':
          await all_methods('websocket', { target: 'stream-flash', name: 'pause', data: { state: get_state(data.state) } });
          break;

        case 'fr.arubinu42.action.stream-widgets.next-screen':
          await all_methods('websocket', { target: 'stream-widgets', name: 'next-screen' });
          break;

        case 'fr.arubinu42.action.stream-widgets.replace-url':
          await all_methods('websocket', { target: 'stream-widgets', name: 'replace-url', data: { name: data.widget, url: data.url } });
          break;

        case 'fr.arubinu42.action.stream-widgets.toggle-widget':
          await all_methods('websocket', { target: 'stream-widgets', name: 'toggle-widget', data: { name: data.widget, state: get_state(data.state) } });
          break;

        case 'fr.arubinu42.action.phasmophobia.evidence':
          await all_methods('websocket', {
            origin: 'arubinu42',
            data: {
              target: 'phasmophobia',
              name: `${get_mode(data.mode)}-evidence`,
              data: get_evidence(data.evidence)
            }
          });
          break;

        case 'fr.arubinu42.action.phasmophobia.reset':
          await all_methods('websocket', {
            origin: 'arubinu42',
            data: {
              target: 'phasmophobia',
              name: 'reset-evidence',
              data: undefined
            }
          });
          break;
      }
    });

    tpc.on('disconnected', () => {
      if (tpc_state) {
        tpc_state = false;
        console.log('TouchPortal Disconnected');
      }

      setTimeout(() => {
        tcp_connect();
      }, 5000);
    });

    tpc.connect({ pluginId: 'fr.arubinu42', disableLogs: true, exitOnClose: false });
  };

  tcp_connect();
}

function manager_conn(data, callback) {
  const id = 'manager',
    internal = !callback;

  if (internal) {
    callback = data => {
      win.webContents.send(id, data);
    };
  }

  let obj = false;
  if (data.type === 'addons' && typeof addons[data.id] === 'object') {
    obj = addons[data.id];
  } else if (data.type === 'scripts' && typeof scripts[data.id] === 'object') {
    obj = scripts[data.id];
  }

  if (data.name === 'enabled' && obj && obj.config.default.enabled !== data.data) {
    obj.config.default.enabled = data.data;
    save_config(data.type, data.id);
    broadcast_sender('manager', { name: data.name, data: { type: data.type, name: data.id, state: data.data } });
  } else if (data.name === 'websocket') {
    for (const client of wss.clients) {
      client.send(data.data);
    }
  } else if (!data.name.indexOf('audio')) {
    callback({ name: data.name, data: data.data });
    all_methods('audio', { name: data.name, data: data.data });
    return;
  } else if (data.name === 'bluetooth:connect') {
    if (typeof bluetooth_callback === 'function') {
      bluetooth_callback(data.data);
    }
    return;
  } else if (!data.name.indexOf('bluetooth')) {
    callback({ name: data.name, data: data.data });
    all_methods('bluetooth', { name: data.name, data: data.data });
    return;
  } else if (data.name === 'speech:end') {
    all_methods('speech', { name: data.name, data: data.data });
    return;
  } else if (data.name === 'speech:voices') {
    voices = data.data;
    return;
  } else if (data.name === 'browse:file' || data.name === 'browse:files') {
    dialog[data.data.name ? 'showSaveDialog' : 'showOpenDialog']({
      properties: [(data.name === 'browse:files') ? 'openFiles' : 'openFile'],
      defaultPath: data.data.name ? `${data.data.name}${data.data.ext ? `.${data.data.ext}` : ''}` : undefined,
      filters: [{ name: 'all', extensions: (data.data.ext ? data.data.ext.split(',') : ['*']) }],
    }).then(result => {
      if (!result.canceled) {
        data.result = result;
        callback(data);
      }
    });
  } else if (data.name === 'browse:folder') {
    dialog.showOpenDialog({
      properties: ['openDirectory']
    }).then(result => {
      if (!result.canceled) {
        data.result = result;
        callback(data);
      }
    });
  }

  if (data.type === 'general') {
    if (data.name === 'save') {
      const all = manager.default.all,
        local = is_local();

      manager = Object.assign(manager, data.data);
      if (local !== is_local()) {
        generate_menu();
      }

      let dialog = false;
      if (manager.default.all.trim().length && all !== manager.default.all) {
        const addons_path = path.join(manager.default.all, 'addons');
        if (!fs.existsSync(addons_path)) {
          fs.mkdir(addons_path, () => {});
        } else {
          dialog = true;
        }

        const scripts_path = path.join(manager.default.all, 'scripts');
        if (!fs.existsSync(scripts_path)) {
          fs.mkdir(scripts_path, () => {});
        } else {
          dialog = true;
        }
      }

      if (dialog) {
        callback({ name: 'reload', data: true });
      }

      save_manager_config();
    } else if (data.name === 'browse') {
      callback(data);
    } else if (data.name === 'load') {
      data.data = JSON.parse(JSON.stringify(manager));
      callback(data);
    } else if (data.name === 'import') {
      const saved = JSON.stringify(store.store);
      try {
        if (data.data.indexOf('{')) {
          data.data = fs.readFileSync(data.data, 'utf-8');
        }

        store_clear = true;
        store.set(JSON.parse(data.data));

        if (process.env.PORTABLE_EXECUTABLE_DIR) {
          app.setLoginItemSettings({
            name: 'Scripts Manager',
            path: process.env.PORTABLE_EXECUTABLE_FILE,
            openAtLogin: manager.default.startup
          });
        }

        relaunch_app();
      } catch (e) {
        store.set(JSON.parse(saved));
      }

      store_clear = false;
    } else if (data.name === 'export') {
      if (data.data) {
        try {
          fs.writeFileSync(data.data, JSON.stringify(store.store, null, '  '));
        } catch (e) {}
      } else {
        callback({ name: 'export', data: JSON.stringify(store.store, null, '  ') });
      }
    } else if (data.name === 'reset' || data.name === 'restart') {
      if (data.name === 'reset') {
        store.clear();
      }

      relaunch_app();
    }
  } else if (obj && typeof obj.include.receiver === 'function') {
    obj.include.receiver(id, data.name, data.data);
  }
}

function message_conn(data, callback) {
  let obj = false;
  if (data.type === 'addons' && typeof addons[data.id] === 'object') {
    obj = addons[data.id];
  } else if (data.type === 'scripts' && typeof scripts[data.id] === 'object') {
    obj = scripts[data.id];
  }

  if (data.type === 'general') {
    //
  } else if (obj && typeof obj.include.receiver === 'function') {
    obj.include.receiver('message', data.name, data.data);
  }
}

function create_window() {
  win = new BrowserWindow({
    show: !manager.default.systray,
    icon: APP_ICON,
    width: 1140,
    height: 630,
    minWidth: 700,
    minHeight: 300,
    webPreferences: {
      //devTools: true,
      nodeIntegration: false,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.setMenu(null);
  win.setTitle('Scripts Manager');
  win.loadFile(path.join(__dirname, 'public', 'index.html'), {
    extraHeaders: 'Content-Security-Policy: ' + [
      `default-src 'self'`,
      `connect-src 'self' blob: https://api.github.com/repos/Arubinu/Scripts-Manager/releases/latest`,
      `script-src 'self'`,
      `style-src 'self'`,
      `frame-src 'self'`
    ].join('; ')
  }).then(() => {
    ipcMain.handleOnce('init', (event, data) => {
      ipcMain.handle('manager', (event, data) => manager_conn(data));
      ipcMain.handle('message', (event, data) => message_conn(data));

      win.webContents.on('select-bluetooth-device', (event, device_list, callback) => {
        event.preventDefault(); // important, otherwise first available device will be selected

        if (typeof bluetooth_callback !== 'function') {
          const timeout = setTimeout(() => {
            if (typeof bluetooth_callback === 'function') {
              bluetooth_callback('');
            }
          }, 30000);

          bluetooth_callback = device => {
            console.log('bluetooth selected:', device);

            bluetooth_callback = null;
            all_methods('bluetooth', { devices: false });

            clearTimeout(timeout);
            callback((typeof device === 'object' && typeof device.deviceId === 'string') ? device.deviceId : device);
          };
        }

        all_methods('bluetooth', device_list);
      });
      const interval = setInterval(() => {
        if (Array.isArray(voices) && voices.length) {
          clearInterval(interval);
          all_methods('speech', { name: 'speech:ready', data: voices });
        } else {
          broadcast_sender('manager', { name: 'speech:voices' }, false, true);
        }
      }, 1000);

      const vars = {
        http: `http://localhost:${APP_PORT}`,
        websocket: `ws://localhost:${APP_PORT}`
      };

      for (const id in addons) {
        const addon = addons[id];
        try {
          addon.include.initialized();
        } catch (e) {}
      }

      for (const id in scripts) {
        const script = scripts[id];
        try {
          script.include.initialized();
        } catch (e) {}
      }
    });

    globalShortcut.register('CommandOrControl+R', () => {});
    if (process.env.NODE_TOOLS) {
      win.webContents.openDevTools();
    }
    win.webContents.executeJavaScript('console.log("user gesture fired");', true);
    win.webContents.send('init', {
      asar: app_asar,
      mode: (process.env.NODE_ENV || 'production'),
      path: app_path,
      configs: get_configs(),
      settings: manager.default,
      versions: process.versions,
      pkg,
      menus,
      states
    });

    if (Notification.isSupported()) {
      (new Notification({
        title: 'Scripts Manager',
        body: 'The program is available in the systray',
        icon: APP_ICON,
        timeout: 6000
      })).show();
    }
  });

  win.on('will-navigate', (event, cmd) => {
    if (cmd === 'browser-backward' || cmd === 'browser-forward') {
      event.preventDefault();
    }
  })

  win.on('close', event => {
    event.preventDefault();
    win.hide();
  });
}

function load_manager_config() {
  try {
    const tmp = store.get('manager');
    if (typeof tmp === 'object') {
      manager = tmp;
    }
  } catch (e) {}
}

function save_manager_config() {
  if (store_clear) {
    return;
  }

  store.set('manager', manager);

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    app.setLoginItemSettings({
      name: 'Scripts Manager',
      path: process.env.PORTABLE_EXECUTABLE_FILE,
      openAtLogin: manager.default.startup
    });
  }
}

async function save_config(type, id, data, override) {
  let obj = null;
  let is_global = false;
  if (type === 'addons') {
    obj = addons[id].config;
    is_global = addons[id].is_global;
  } else if (type === 'scripts') {
    obj = scripts[id].config;
    is_global = scripts[id].is_global;
  } else {
    return false;
  }

  if (typeof data === 'object') {
    for (const section in data) {
      if (['default', 'menu'].indexOf(section) < 0 && typeof data[section] === 'object') {
        if (typeof obj[section] !== 'object') {
          obj[section] = {};
        }

        if (!override) {
          for (const name in data[section]) {
            obj[section][name] = data[section][name];
          }
        } else {
          obj[section] = JSON.parse(JSON.stringify(data[section]));
        }
      }
    }
  }

  let config_path = path.join(__dirname, type, id);
  if (!fs.existsSync(config_path)) {
    if (typeof manager.default.all === 'string') {
      config_path = path.join(manager.default.all, type, id);
    }
  }

  if (is_global) {
    if (store_clear) {
      return false;
    }

    store.set(`${type}-${id}`, obj);
    return true;
  }

  return await inifile.write(path.join(config_path, 'config.ini'), obj);
}

async function check_port(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', (err) => {
      s.close();
      if (err.code === "EADDRINUSE") {
        reject(err);
      } else {
        resolve();
      }
    });
    s.once('listening', () => {
      console.log('listening');
      resolve();
      s.close();
    });
    s.listen(port);
  });
}

function load_addons(dir, is_global) {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        return reject(err);
      }

      const vars = {
        http: `http://localhost:${APP_PORT}`,
        websocket: `ws://localhost:${APP_PORT}`
      };

      let progress = 0;
      files.forEach(async file => {
        if (typeof addons[file] !== 'undefined') {
          return ++progress;
        }

        let addon_path = path.join(dir, file);
        let addon_file = path.join(addon_path, 'addon.js');
        let config_file = path.join(addon_path, 'config.ini');
        if (fs.existsSync(addon_file) && fs.existsSync(config_file) && fs.existsSync(path.join(addon_path, 'index.html'))) {
          try {
            let config = JSON.parse(JSON.stringify(inifile.read.sync(config_file)));
            if (typeof config.default.name === 'string') {
              if (is_global) {
                try {
                  const tmp = store.get(`addons-${file}`);
                  for (const key in tmp) {
                    if (key === 'general') {
                      config[key].enabled = (typeof tmp[key].enabled === 'boolean') ? tmp[key].enabled : false;
                    } else {
                      config[key] = Object.assign(((typeof config[key] === 'object') ? config[key] : {}), tmp[key]);
                    }
                  }
                } catch (e) {}
              }

              addons[file] = {
                path: addon_path,
                config: config,
                include: require(addon_file),
                is_global: is_global
              }

              try {
                addons[file].include.init(addon_path, JSON.parse(JSON.stringify(addons[file].config)), async function() { return await all_sender('addons', file, ...arguments); }, vars);
              } catch (e) {}

              console.log('Addon loaded:', file);
            }
          } catch (e) {
            delete addons[file];
            console.log('Addon error:', file, e);
          }
        }

        ++progress;
        if (progress === files.length) {
          resolve(addons);
        }
      });
    });
  });
}

function load_scripts(dir, is_global) {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        return reject(err);
      }

      const vars = {
        http: `http://localhost:${APP_PORT}`,
        websocket: `ws://localhost:${APP_PORT}`
      };

      let progress = 0;
      files.forEach(file => {
        if (typeof scripts[file] !== 'undefined') {
          return ++progress;
        }

        let script_path = path.join(dir, file);
        let script_file = path.join(script_path, 'script.js');
        let config_file = path.join(script_path, 'config.ini');
        if (fs.existsSync(script_file) && fs.existsSync(config_file) && fs.existsSync(path.join(script_path, 'index.html'))) {
          try {
            let config = JSON.parse(JSON.stringify(inifile.read.sync(config_file)));
            if (typeof config.default.name === 'string' && typeof config.default.version === 'string' && typeof config.default.author === 'string') {
              menus[file] = [];
              if (typeof config.menu === 'object') {
                for (let id in config.menu) {
                  if (id.indexOf('/') < 0 && id.indexOf('\\') < 0 && fs.existsSync(path.join(script_path, `${id}.html`))) {
                    menus[file].push({ id: id, name: config.menu[id] });
                  }
                }
              }

              if (is_global) {
                try {
                  const tmp = store.get(`scripts-${file}`);
                  for (const key in tmp) {
                    if (key === 'default') {
                      config[key].enabled = (typeof tmp[key].enabled === 'boolean') ? tmp[key].enabled : false;
                    } else {
                      config[key] = Object.assign(((typeof config[key] === 'object') ? config[key] : {}), tmp[key]);
                    }
                  }
                } catch (e) {}
              }

              scripts[file] = {
                menu: [],
                path: script_path,
                config: config,
                include: require(script_file),
                is_global: is_global
              }

              try {
                scripts[file].include.init(script_path, JSON.parse(JSON.stringify(scripts[file].config)), async function() { return await all_sender('scripts', file, ...arguments); }, vars);
              } catch (e) {}

              console.log('Script loaded:', file);
            }
          } catch (e) {
            delete scripts[file];
            console.log('Script error:', file, e);
          }
        }

        ++progress;
        if (progress === files.length) {
          resolve(scripts);
        }
      });
    });
  });
}

function unload_script(name) {
  scripts[name];
}

async function all_methods(type, data) {
  if (typeof data === 'object' && typeof data.origin === 'string') {
    for (const client of wss.clients) {
      client.send(JSON.stringify(data));
    }
  }

  for (const id in addons) {
    if (typeof addons[id].config.default.methods === 'string' && addons[id].config.default.methods.split(',').indexOf(type) >= 0) {
      if (await (addons[id].include.receiver('methods', type, data))) {
        return true;
      }
    }
  }

  for (const id in scripts) {
    if (typeof scripts[id].config.default.methods === 'string' && scripts[id].config.default.methods.split(',').indexOf(type) >= 0) {
      if (await (scripts[id].include.receiver('methods', type, data))) {
        return true;
      }
    }
  }

  return false;
}

function broadcast_sender(name, data, only_local, only_internal) {
  if (!only_local) {
    win.webContents.send(name, data);
  }

  if (!only_internal && is_local()) {
    for (const client of wss.clients) {
      if (client.is_renderer) {
        client.send(JSON.stringify({
          from: 'manager',
          name,
          data
        }));
      }
    }
  }
}

async function all_sender(type, id, target, name, data) {
  if (target === 'manager') {
    if (name === 'state') {
      states[`${type}:${id}`] = data;
      broadcast_sender('manager', { type, id, name, data });
    }

    const names = name.split(':');
    if (names[0] === 'websocket') {
      data = JSON.stringify(data);
      for (const client of wss.clients) {
        client.send(data);
      }

      return;
    } else if (names[0] === 'audio' && names.length > 1) {
      if (['devices', 'play', 'stop'].indexOf(names[1]) >= 0) {
        broadcast_sender('manager', { type, id, name, data });
      } else if (names[1] === 'list') {
        all_methods('audio', data);
        return data;
      }

      return;
    } else if (names[0] === 'bluetooth' && names.length > 1) {
      if (names[1] === 'scan' || names[1] === 'disconnect') {
        broadcast_sender('manager', { type, id, name, data });
      } else if (names[1] === 'list') {
        all_methods('bluetooth', data);
        return data;
      } else if (names[1] === 'connect' && typeof bluetooth_callback === 'function') {
        broadcast_sender('manager', { type, id, name, data });
      }

      return;
    } else if (names[0] === 'speech' && names.length > 1) {
      if (names[1] === 'say') {
        broadcast_sender('manager', { name: 'speech:say', data: Object.assign({
          voice: '',
          volume: 100,
          rate: 1,
          pitch: .8,
          text: ''
        }, data) }, false, true);
      } else if (names[1] === 'voices') {
        all_methods('speech', { name, data: voices });
        return voices;
      }

      return;
    } else if (names[0] === 'usb' && names.length > 1) {
      if (names[1] === 'devices') {
        usb_sender();
      }

      return;
    }
  }

  if (type === 'addons') {
    if (target === 'manager') {
      const split = name.split(':');
      if (split[0] === 'config') {
        save_config(type, id, data, (split.length === 2 && split[1] === 'override'));
      }
    } else if (target === 'message') {
      if (!win) {
        return false;
      }

      broadcast_sender('message', { type, id, name, data });
      return true;
    } else if (target === 'broadcast') {
      for (const sid in scripts) {
        if (typeof scripts[sid].config.default.addons === 'string' && scripts[sid].config.default.addons.split(',').indexOf(id) >= 0) {
          scripts[sid].include.receiver(id, name, data);
        }
      }
    }
  } else if (type === 'scripts') {
    if (target === 'manager') {
      const split = name.split(':');
      if (name === 'menu') {
        scripts[id].menu = data;

        const menu = generate_menu().getMenuItemById(id);
        return menu ? menu.submenu : null;
      } else if (split[0] === 'config') {
        save_config(type, id, data, (split.length === 2 && split[1] === 'override'));
      } else {
        return 'feature not found';
      }

      return true;
    } else if (target === 'message') {
      if (!win) {
        return false;
      }

      broadcast_sender('message', { type, id, name, data });
      return true;
    }

    if (typeof addons[target] !== 'object') {
      return 'addon not found';
    } else if (typeof scripts[id].config.default.addons !== 'string' || scripts[id].config.default.addons.split(',').indexOf(target) < 0) {
      return 'unregistered addon';
    } else if (typeof scripts[id].include.receiver !== 'function') {
      return 'addon receiver not found';
    }

    return await addons[target].include.receiver(id, name, data);
  }
}

function generate_menu() {
  let scripts_menu = [];
  for (let id in scripts) {
    try {
      const menu = scripts[id].menu;
      if (menu.length) {
        let tmp = { id, label: scripts[id].config.default.name };
        tmp.submenu = menu;

        Menu.buildFromTemplate([tmp]);
        scripts_menu.push(tmp);
      }
    } catch (e) {}
  }

  let parts = {
    settings: [
      { type: 'separator' },
      { label: 'Settings', click : async () => {
        win.show();
      } }
    ],
    quit: [
      { type: 'separator' },
      { label: 'Restart', click : async () => {
        relaunch_app();
      } },
      { label: 'Quit', click : async () => {
        console.log('Closing Scripts Manager');
        app.exit();
      } }
    ]
  };

  if (is_local()) {
    parts.settings.push({
      label: 'Open in browser', click : async () => {
        shell.openExternal(`http://localhost:${APP_PORT}`);
      }
    });
  }

  const menu = Menu.buildFromTemplate(scripts_menu.concat(parts.settings, parts.quit));
  tray.setContextMenu(menu);

  return menu;
}

function usb_sender(type, device) {
  if (typeof device === 'object' && type === 'remove') {
    for (const key in usb_infos) {
      const item = usb_infos[key];
      if (item.vendorId === device.deviceDescriptor.idVendor && item.productId === device.deviceDescriptor.idProduct) {
        return all_methods('usb', { type, device: Object.assign({}, item, device) });
      }
    }

    return all_methods('usb', { type, device });
  }

  (new WebUSB({ allowAllDevices: true })).getDevices()
    .then(devices => {
      let usb_keys = Object.keys(usb_infos);
      for (const item of devices) {
        const key = `${item.vendorId}-${item.productId}`;
        if (usb_keys.indexOf(key) < 0) {
          usb_keys.push(key);
          usb_infos[key] = item;
        }

        if (typeof device === 'object' && item.vendorId === device.deviceDescriptor.idVendor && item.productId === device.deviceDescriptor.idProduct) {
          return all_methods('usb', { type, device: Object.assign({}, item, device) });
        }
      }

      if (typeof device === 'object') {
        all_methods('usb', { type, device });
      } else {
        all_methods('usb', { type: 'scripts', id: 'manager', name: 'usb:devices', data: devices });
      }
    });
}

function usb_detection() {
  usb_sender();

  usb.on('attach', device => {
    usb_sender('add', device);
  });
  usb.on('detach', device => {
    usb_sender('remove', device);
  });
}

function exit_on_error(err) {
  if (exited) {
    return;
  }

  if (err.message.indexOf('EADDRINUSE') >= 0 || err.message.indexOf('ERR_FAILED (-2)') >= 0) {
    exited = true;
    if (Notification.isSupported()) {
      (new Notification({
        title: 'Scripts Manager',
        body: 'The program is already running',
        icon: APP_ICON_GRAY,
        timeout: 6000
      })).show();
    }

    process.exit(1);
  } else {
    console.error(err);
  }
}


process.on('uncaughtException', exit_on_error);

if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app_path = process.env.PORTABLE_EXECUTABLE_DIR;
}
if (app_path.endsWith('app.asar')) {
  app_asar = app_path;
  app_path = path.dirname(path.dirname(app_path));
}

elog.transports.file.resolvePath = () => path.join(app_path, 'ScriptsManager.log');
Object.assign(console, elog.functions);

console.log('Starting Scripts Manager');

const env_file = path.join(__dirname, 'env.json');
if (fs.existsSync(env_file)) {
  Object.assign(process.env, JSON.parse(fs.readFileSync(env_file, 'utf-8')));
}

app.whenReady().then(() => {
  app.setAppUserModelId('fr.arubinu42.scripts-manager');

  check_port(APP_PORT)
    .then(() => {
      // init tray
      tray = new Tray(APP_ICON);
      tray.setToolTip('Scripts Manager');

      tray.on('double-click', event => {
        if (win) {
          win.show();
        }
      });

      tray.on('click', event => {
        if (win) {
          win.show();
          win.moveTop();
          win.focus();
        }
      });

      // built-in scripts
      const next = () => {
        // user addons
        const next = () => {
          // user scripts
          const next = () => {
            // init app
            const next = () => {
              generate_menu();
              create_server();
              usb_detection();
              create_window();

              app.on('activate', () => {
                if (!win) {
                  create_window();
                } else if (!win.isVisible()) {
                  win.show();
                }
              });
            };

            if (typeof manager.default.all === 'string') {
              const scripts_path = path.join(manager.default.all, 'scripts');
              if (fs.existsSync(scripts_path)) {
                load_scripts(scripts_path).then(next).catch(next);
                return;
              }
            }

            next();
          };

          load_manager_config();
          if (typeof manager.default.all === 'string') {
            const addons_path = path.join(manager.default.all, 'addons');
            if (fs.existsSync(addons_path)) {
              load_addons(addons_path).then(next).catch(next);
              return;
            }
          }

          next();
        };

        load_scripts(path.join(__dirname, 'scripts'), true).then(next).catch(next);
      };

      // built-in addons
      load_addons(path.join(__dirname, 'addons'), true).then(next).catch(next);
    })
    .catch(err => {
      console.log('Scripts Manager already launched');
      exit_on_error({ message: 'ERR_FAILED (-2)' });
    });
});