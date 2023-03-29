const path = require('node:path'),
  {
    BrowserWindow,
    Notification,
    globalShortcut,
    ipcMain
  } = require('electron'),
  {
    TYPE_ENUM,
    ACCESS_ENUM,
    RESPONSE_ENUM
  } = require('../enums');


module.exports = (modules, addons, scripts, options, methods) => {
  let bluetooth_callback = null;

  const window = new BrowserWindow({
    show: !options.manager.default.systray,
    icon: options.APP_ICON,
    frame: false,
    width: 1140,
    height: 630,
    minWidth: 700,
    minHeight: 300,
    transparent: true,
    webPreferences: {
      //devTools: true,
      nodeIntegration: false,
      contextIsolation: false,
      preload: path.join(__dirname, '..', 'preload.js')
    }
  });

  window.setMenu(null);
  window.setTitle('Scripts Manager');
  window.loadFile(path.join(__dirname, '..', 'public', 'index.html'), {
    extraHeaders: 'Content-Security-Policy: ' + [
      `default-src 'self'`,
      `connect-src 'self' blob: https://api.github.com/repos/Arubinu/Scripts-Manager/releases/latest`,
      `script-src 'self'`,
      `style-src 'self'`,
      `frame-src 'self'`
    ].join('; ')
  }).then(() => {
    ipcMain.handleOnce('init', (event, data) => {
      if (process.env.NODE_TOOLS) {
        window.webContents.openDevTools();
      }

      ipcMain.handle('window', (event, data) => {
        switch (data) {
          case 'maximize':
            if (window.isMaximized()) {
              window.unmaximize();
            } else {
              window.maximize();
            }
            break;

          case 'minimize':
            if (window.isMinimized()) {
              window.unminimize();
            } else {
              window.minimize();
            }
            break;

          case 'close': window.hide(); break;
        }
      });

      ipcMain.handle('message', (_event, _data) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug('\u001b[35mreceive:\u001b[0m', _data);
        }

        if (_data.method === 'response' && (_data.event === RESPONSE_ENUM.DONE || _data.event === RESPONSE_ENUM.ERROR)) {
          modules.store[_data.event](_data.id, _data.data);
          return;
        }

        const { to, id } = _data,
          { event, name, method, property, data } = _data.data,
          respond = id && ((error, data) => modules.store[error ? RESPONSE_ENUM.ERROR : RESPONSE_ENUM.DONE](id, error ? error : data));

        if (id) {
          modules.store.tracking(id, data => {
            window.webContents.send('message', data);
          }, true);
        }

        switch (to) {
          case TYPE_ENUM.METHOD: modules.communication.to_method(event, name, method, property, data, ACCESS_ENUM.RENDERER, respond); break;
          case TYPE_ENUM.MANAGER: modules.communication.to_manager(event, name, method, property, data, ACCESS_ENUM.RENDERER, respond); break;
          case TYPE_ENUM.EXTENSION: modules.communication.to_extension(event, name, method, property, data, ACCESS_ENUM.RENDERER, respond); break;
          default:
            console.error('bad request', _data);
        }
      });

      window.webContents.on('select-bluetooth-device', (event, device_list, callback) => {
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
            modules.communication.broadcast_method('bluetooth', 'devices', false);

            clearTimeout(timeout);
            callback((typeof device === 'object' && typeof device.deviceId === 'string') ? device.deviceId : device);
          };
        }

        modules.communication.broadcast_method('bluetooth', 'devices', device_list);
      });

      const interval = setInterval(() => {
        const voices = modules.communication.get_voices();
        if (Array.isArray(voices) && voices.length) {
          clearInterval(interval);
          modules.communication.broadcast_method('speech', 'voices', voices);
        } else {
          modules.communication.to_interface(TYPE_ENUM.MANAGER, false, 'speech', 'voices', false, false, true);
        }
      }, 1000);

      methods.set_initialize(true);

      for (const id in addons) {
        const addon = addons[id];
        if (!addon.init) {
          addon.initialize();
        }
      }

      for (const id in scripts) {
        const script = scripts[id];
        if (!script.init) {
          script.initialize();
        }
      }
    });

    globalShortcut.register('CommandOrControl+R', () => {});
    window.webContents.executeJavaScript('console.log("user gesture fired");', true);
    window.webContents.send('init', modules.communication.init_data());

    if (Notification.isSupported()) {
      (new Notification({
        title: 'Scripts Manager',
        body: 'The software is available in the systray',
        icon: options.APP_ICON,
        timeout: 6000
      })).show();
    }
  });

  window.on('will-navigate', (event, cmd) => {
    if (cmd === 'browser-backward' || cmd === 'browser-forward') {
      event.preventDefault();
    }
  })

  window.on('close', event => {
    event.preventDefault();
    window.hide();
  });

  return {
    instance: window,
    get_bluetooth_callback: () => {
      return bluetooth_callback;
    }
  }
}