const fs = require('node:fs'),
  net = require('node:net'),
  path = require('node:path'),
  pkg = require('./package.json'),
  //cp = require('node:child_process'),
  elog = require('electron-log'),
  estore = require('electron-store'),
  { nativeImage, Notification, app } = require('electron');

const APP_PORT = 5042,
  PREVENT_MAX = 10,
  PREVENT_DELAY = 1000,
  PATH_ICON = path.join(__dirname, 'public', 'images', 'logo.png'),
  PATH_ICON_GRAY = path.join(__dirname, 'public', 'images', 'logo-gray.png'),
  APP_ICON = nativeImage.createFromPath(PATH_ICON),
  APP_ICON_GRAY = nativeImage.createFromPath(PATH_ICON_GRAY),
  store = new estore();

let init = false,
  addons = {},
  exited = false,
  manager = {},
  modules = {},
  profile = 'Default',
  scripts = {},
  app_asar = __dirname,
  app_path = __dirname;

/**
 * Checks that the port used by the software is available (indicates that the software is already launched)
 *
 * @param   {number} port  Port to check
 * @returns {promise}
 */
function check_port(port) {
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
      resolve();
      s.close();
    });
    s.listen(port);
  });
}

/**
 * Used to return the current profile even for already loaded modules
 *
 * @returns {string}
 */
function get_profile() {
  return profile;
}

/**
 * Loads the modules necessary for the operation of the software
 */
function load_modules() {
  modules.http = require(path.join(__dirname, 'modules', 'http.js'))(modules, addons, scripts, {
    manager,
    APP_PORT
  }, {});
  modules.store = require(path.join(__dirname, 'modules', 'store.js'))(modules, addons, scripts, {}, {});
  modules.touchportal = require(path.join(__dirname, 'modules', 'touchportal.js'))(modules, addons, scripts, {}, {});
  modules.usb = require(path.join(__dirname, 'modules', 'usb.js'))(modules, addons, scripts, {}, {});
  modules.websocket = require(path.join(__dirname, 'modules', 'websocket.js'))(modules, addons, scripts, {
    manager
  }, {});

  modules.usb.detection();
  modules.http.instance.on('error', exit_on_error);
  modules.loader.set_var('websocket_token', modules.websocket.token);
}

/**
 * Restarts the software, allows in particular to reload custom addons/scripts
 */
function relaunch_app() {
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    app.relaunch({ execPath: process.env.PORTABLE_EXECUTABLE_FILE });
  } else {
    app.relaunch();
  }

  console.log('Restarting Scripts Manager');
  app.exit();
}

/**
 * Displays a critical error
 */
function exit_on_error(err) {
  if (exited) {
    return;
  }

  if (err.message.indexOf('EADDRINUSE') >= 0 || err.message.indexOf('ERR_FAILED (-2)') >= 0) {
    exited = true;
    if (Notification.isSupported()) {
      (new Notification({
        title: 'Scripts Manager',
        body: 'The software is already running',
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

console.log(`Starting Scripts Manager v${pkg.version}`);

const env_file = path.join(__dirname, 'env.json');
if (fs.existsSync(env_file)) {
  Object.assign(process.env, JSON.parse(fs.readFileSync(env_file, 'utf-8')));
}

app.whenReady().then(() => {
  app.setAppUserModelId('fr.arubinu42.scripts-manager');

  check_port(APP_PORT)
    .then(() => {
      // built-in scripts
      const next = () => {
        // user addons
        const next = () => {
          // user scripts
          const next = () => {
            // init app
            const next = () => {
              modules.tray.generate();
              modules.window = require(path.join(__dirname, 'modules', 'window.js'))(modules, addons, scripts, {
                manager,
                APP_ICON,
                APP_ICON_GRAY
              }, {
                set_initialize: callback => {
                  init = callback;
                }
              });
              app.on('activate', () => {
                if (modules.window && !modules.window.instance.isVisible()) {
                  modules.window.instance.show();
                }
              });

              load_modules();
            };

            if (typeof manager.default.all === 'string') {
              const scripts_path = path.join(manager.default.all, 'scripts');
              if (fs.existsSync(scripts_path)) {
                modules.loader.scripts(scripts_path).then(next).catch(next);
                return;
              }
            }

            next();
          };

          if (typeof manager.default.all === 'string') {
            const addons_path = path.join(manager.default.all, 'addons');
            if (fs.existsSync(addons_path)) {
              modules.loader.addons(addons_path).then(next).catch(next);
              return;
            }
          }

          next();
        };

        modules.loader.scripts(path.join(__dirname, 'scripts'), true).then(next).catch(next);
      };

      // increases the number of extensions that can load at the same time
      process.setMaxListeners(42);

      // addons/scripts loaders
      modules.loader = require(path.join(__dirname, 'modules', 'loader.js'))(modules, addons, scripts, {
        store,
        APP_PORT,
        PREVENT_MAX,
        PREVENT_DELAY
      }, {
        get_profile,
        get_initialize: () => {
          return init;
        }
      });

      // all communication
      modules.communication = require(path.join(__dirname, 'modules', 'communication.js'))(modules, addons, scripts, {
        pkg,
        store,
        manager,
        app_asar,
        app_path,
        APP_ICON,
        APP_PORT,
        APP_ICON_GRAY,
      }, {
        get_profile,
        relaunch_app
      });

      // load config
      modules.config = require(path.join(__dirname, 'modules', 'config.js'))(modules, addons, scripts, {
        store,
        manager
      }, {
        get_profile
      });

      // init tray
      modules.tray = require(path.join(__dirname, 'modules', 'tray.js'))(modules, addons, scripts, {
        APP_ICON,
        APP_PORT,
        APP_ICON_GRAY,
      }, {
        relaunch_app
      });

      // get default profile name
      profile = modules.config.get_profiles().default;

      // load the default profile
      modules.config.load(profile);

      // deprecated
      for (const key in store.store) {
        if (!key.indexOf('addons-')) {
          store.set(`addon[${profile}][${key.substring(7)}]`, store.get(key));
          store.delete(key);
        } else if (!key.indexOf('scripts-')) {
          store.set(`script[${profile}][${key.substring(8)}]`, store.get(key));
          store.delete(key);
        }
      }

      // built-in addons
      modules.loader.addons(path.join(__dirname, 'addons'), true).then(next).catch(next);
    })
    .catch(error => {
      console.log('Scripts Manager already launched', error);
      exit_on_error({ message: 'ERR_FAILED (-2)' });
    });
});