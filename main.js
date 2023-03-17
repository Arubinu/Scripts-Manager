const fs = require('node:fs'),
  net = require('node:net'),
  http = require('node:http'),
  path = require('node:path'),
  tp = require('touchportal-api'),
  ws = require('ws'),
  { usb, WebUSB } = require('usb'),
  elog = require('electron-log'),
  estore = require('electron-store'),
  inifile = { read: require('read-ini-file'), write: require('write-ini-file') },
  { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, dialog } = require('electron');

const APP_PORT = 5042,
  PATH_ICON = path.join(__dirname, 'public', 'images', 'logo.png'),
  PATH_ICON_GRAY = path.join(__dirname, 'public', 'images', 'logo-gray.png'),
  APP_ICON = nativeImage.createFromPath(PATH_ICON),
  APP_ICON_GRAY = nativeImage.createFromPath(PATH_ICON_GRAY),
  store = new estore();

let win,
  tpc,
  wss,
  tray,
  menus = {},
  addons = {},
  exited = false,
  manager = {},
  scripts = {},
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

  console.log('Closing Scripts Manager');
  app.exit();
}

function create_server() {
  const server = http.createServer({}, async (req, res) => {
    if (req.url !== '/favicon.ico' && await all_methods('http', { req, res })) {
      return;
    }

    res.writeHead(200);
    res.end('success');
  });
  server.on('error', exit_on_error);
  server.listen(APP_PORT, () => {
    console.log('HTTP running on port', APP_PORT);
  });

  wss = new ws.Server({server});
  wss.on('connection', client => {
    client.on('message', async data => {
      if (typeof data === 'object') {
        data = Buffer.from(data).toString();
      }

      try {
        data = JSON.parse(data);
      } catch (e) {}

      if (typeof data === 'object' && data.target === 'manager') {
        if (data.name === 'enabled' && typeof data.data === 'object') {
          win.webContents.send('manager', { name: data.name, data: data.data });
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

function create_window() {
  win = new BrowserWindow({
    show: !manager.default || !manager.default.systray,
    icon: APP_ICON,
    width: 1140,
    height: 630,
    minWidth: 700,
    minHeight: 300,
    webPreferences: {
      //devTools: true,
      //nodeIntegration: true,
      //contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.setMenu(null);
  win.setTitle('Scripts Manager');
  win.loadFile(path.join(__dirname, 'public', 'index.html'), {
    extraHeaders: 'Content-Security-Policy: ' + [
      `default-src 'self'`,
      `connect-src 'self' https://api.github.com/repos/Arubinu/Scripts-Manager/releases/latest`,
      `script-src 'self'`,
      `style-src 'self'`,
      `frame-src 'self'`
    ].join('; ')
  }).then(() => {
    ipcMain.handleOnce('init', (event, data) => {
      ipcMain.handle('manager', (event, data) => {
        let id = 'manager';

        let obj = false;
        if (data.type === 'addons' && typeof addons[data.id] === 'object') {
          obj = addons[data.id];
        } else if (data.type === 'scripts' && typeof scripts[data.id] === 'object') {
          obj = scripts[data.id];
        }

        if (data.name === 'enabled') {
          obj.config.default.enabled = data.data;
          save_config(data.type, data.id);
        } else if (data.name === 'websocket') {
          for (const client of wss.clients) {
            client.send(data.data);
          }
        } else if (!data.name.indexOf('audio')) {
          win.webContents.send('manager', { name: data.name, data: data.data });
          all_methods('audio', { name: data.name, data: data.data });
          return;
        } else if (data.name === 'bluetooth:connect') {
          if (typeof bluetooth_callback === 'function') {
            bluetooth_callback(data.data);
          }
          return;
        } else if (!data.name.indexOf('bluetooth')) {
          win.webContents.send('manager', { name: data.name, data: data.data });
          all_methods('bluetooth', { name: data.name, data: data.data });
          return;
        } else if (data.name === 'browse:file' || data.name === 'browse:files') {
          dialog[data.data.name ? 'showSaveDialog' : 'showOpenDialog']({
            properties: [(data.name === 'browse:files') ? 'openFiles' : 'openFile'],
            defaultPath: data.data.name ? `${data.data.name}${data.data.ext ? `.${data.data.ext}` : ''}` : undefined,
            filters: [{ name: 'all', extensions: (data.data.ext ? data.data.ext.split(',') : ['*']) }],
          }).then(result => {
            if (!result.canceled) {
              data.result = result;
              win.webContents.send('manager', data);
            }
          });
        } else if (data.name === 'browse:folder') {
          dialog.showOpenDialog({
            properties: ['openDirectory']
          }).then(result => {
            if (!result.canceled) {
              data.result = result;
              win.webContents.send('manager', data);
            }
          });
        }

        if (data.type === 'general') {
          if (data.name === 'save') {
            manager = Object.assign(manager, data.data);
            save_manager_config();
          } else if (data.name === 'browse') {
            win.webContents.send('manager', data);
          } else if (data.name === 'load') {
            data.data = JSON.parse(JSON.stringify(manager));
            win.webContents.send('manager', data);
          } else if (data.name === 'import') {
            const saved = JSON.stringify(store.store);
            try {
              store_clear = true;
              store.set(JSON.parse(fs.readFileSync(data.data, 'utf-8')));

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
            try {
              fs.writeFileSync(data.data, JSON.stringify(store.store, null, '  '));
            } catch (e) {}
          } else if (data.name === 'reset' || data.name === 'restart') {
            if (data.name === 'reset') {
              store.clear();
            }

            relaunch_app();
          }
        } else if (obj && typeof obj.include.receiver === 'function') {
          obj.include.receiver(id, data.name, data.data);
        }
      });

      ipcMain.handle('message', (event, data) => {
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
      });

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

    let configs = { addons: {}, scripts: {} };
    for (const id in addons) {
      configs.addons[id] = addons[id].config;
    }
    for (const id in scripts) {
      configs.scripts[id] = scripts[id].config;
    }

    if (process.env.NODE_TOOLS) {
      win.webContents.openDevTools();
    }
    win.webContents.executeJavaScript('console.log("user gesture fired");', true);
    win.webContents.send('init', { menus, configs, mode: (process.env.NODE_ENV || 'production') });

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
    if (typeof manager === 'object' && typeof manager.default === 'object') {
      if (typeof manager.default.all === 'string') {
        config_path = path.join(manager.default.all, type, id);
      }
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

      files.forEach(file => {
        if (typeof addons[file] !== 'undefined') {
          return;
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
      });

      resolve(scripts);
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

      files.forEach(file => {
        if (typeof scripts[file] !== 'undefined') {
          return;
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
      });

      resolve(scripts);
    });
  });
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

async function all_sender(type, id, target, name, data) {
  if (target === 'manager') {
    if (name === 'state') {
      win.webContents.send('manager', { type, id, name, data });
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
        win.webContents.send('manager', { type, id, name, data });
      } else if (names[1] === 'list') {
        all_methods('audio', data);
      }

      return;
    } else if (names[0] === 'bluetooth' && names.length > 1) {
      if (names[1] === 'scan' || names[1] === 'disconnect') {
        win.webContents.send('manager', { type, id, name, data });
      } else if (names[1] === 'list') {
        all_methods('bluetooth', data);
      } else if (names[1] === 'connect' && typeof bluetooth_callback === 'function') {
        win.webContents.send('manager', { type, id, name, data });
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

      win.webContents.send('message', { type, id, name, data });
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

      win.webContents.send('message', { type, id, name, data });
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

  const menu = Menu.buildFromTemplate(scripts_menu.concat([
    { type: 'separator' },
    { label: 'Settings', click : async () => {
      win.show();
    } },
    { type: 'separator' },
    { label: 'Restart', click : async () => {
      relaunch_app();
    } },
    { label: 'Quit', click : async () => {
      console.log('Closing Scripts Manager');
      app.exit();
    } }
  ]));

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

let logpath = (process.env.PORTABLE_EXECUTABLE_DIR ? process.env.PORTABLE_EXECUTABLE_DIR : __dirname);
if (logpath.endsWith('app.asar')) {
  logpath = path.dirname(path.dirname(logpath));
}

elog.transports.file.resolvePath = () => path.join(logpath, 'ScriptsManager.log');
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

            if (typeof manager.default === 'object' && typeof manager.default.all === 'string') {
              const scripts_path = path.join(manager.default.all, 'scripts');
              if (fs.existsSync(scripts_path)) {
                load_scripts(scripts_path).then(next).catch(next);
                return;
              }
            }

            next();
          };

          load_manager_config();
          if (typeof manager.default === 'object' && typeof manager.default.all === 'string') {
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