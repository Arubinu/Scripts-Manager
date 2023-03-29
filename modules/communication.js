const fs = require('node:fs'),
  path = require('node:path'),
  {
    app,
    dialog
  } = require('electron'),
  {
    TYPE_ENUM,
    EVENT_ENUM,
    ACCESS_ENUM
  } = require('../enums');

module.exports = (modules, addons, scripts, options, methods) => {
  let states = {},
    voices = [],
    store_clear = false;

  /**
   * Indicates if the interface is accessible from a web browser
   */
  function is_local() {
    return options.manager.default.local === true;
  }

  /**
   * Returns an object including general software data
   */
  function init_data() {
    return {
      pkg: options.pkg,
      asar: options.app_asar,
      mode: (process.env.NODE_ENV || 'production'),
      path: options.app_path,
      menus: modules.loader.get_menus(),
      configs: modules.config.get_extensions(),
      profiles: modules.config.get_profiles(),
      settings: options.manager.default,
      versions: process.versions,
      states
    };
  }

  /**
   * Send data to all addons/scripts, also via WebSocket if requested
   *
   * @param   {string}   from         Data sender name
   * @param   {string}   method       Name of targeted function or data intent
   * @param   {string}   property     Give the intention to the method
   * @param   {any}      [data]       Data to be transmitted
   * @param   {boolean}  [websocket]  To send to all clients connected to the websocket
   * @param   {boolean}  [is_method]  Broadcast on a specific method (only for internal methods)
   * @param   {function} [callback]   Returns a result if there is a return to do
   * @param   {boolean}  [to_object]  Return an object instead of arguments
   */
  function broadcast(from, method, property, data, websocket, is_method, callback, to_object) {
    if (!is_method && [EVENT_ENUM.METHOD, EVENT_ENUM.MANAGER, EVENT_ENUM.BROADCAST].indexOf(from) >= 0) {
      return;
    }

    const id = callback ? modules.store.generate(from) : undefined,
      obj = {
        from,
        event: is_method ? EVENT_ENUM.METHOD : EVENT_ENUM.BROADCAST,
        id,
        method: is_method ? from : method,
        property,
        data
      };

    if (callback) {
      modules.store.tracking(id, callback, to_object);
    }

    if (websocket && modules.websocket) {
      to_method(EVENT_ENUM.METHOD, false, 'websocket', false, Object.assign({}, obj, { origin: 'arubinu42' }), ACCESS_ENUM.GUEST);
    }

    for (const name in addons) {
      const addon = modules.loader.get_addon(name, (is_method ? from : undefined));
      if (addon) {
        addon.receiver(Object.assign({ name }, obj));
      }
    }

    for (const name in scripts) {
      const for_method = is_method ? from : undefined,
        for_extension = (is_method || name === method) ? undefined : method,
        script = modules.loader.get_script(name, for_method, for_extension, for_extension);

      if (script) {
        script.receiver(Object.assign({ name }, obj));
      }
    }
  }

  /**
   * Send data to all addons/scripts, also via WebSocket if requested
   *
   * @param   {string}   method               Name of targeted function or data intent
   * @param   {string}   property             Give the intention to the method
   * @param   {any}      [data]               Data to be transmitted
   * @param   {boolean}  [without_websocket]  To send to all clients connected to the websocket
   * @param   {function} [callback]           Returns a result if there is a return to do
   * @param   {boolean}  [to_object]          Return an object instead of arguments
   */
  function broadcast_method(method, property, data, without_websocket, callback, to_object) {
    return broadcast(method, false, property, data, !without_websocket, true, callback, to_object);
  }

  /**
   * Communication of the different methods made available by the software
   *
   * @param   {EVENT_ENUM}  event
   * @param   {string}      name        Name of addon, script, or targeted method
   * @param   {string}      method      Name of targeted function or data intent
   * @param   {string}      property    Give the intention to the method
   * @param   {any}         data        Data to be transmitted
   * @param   {ACCESS_ENUM} access
   * @param   {function}    [callback]  Returns a result if there is a return to do
   * @returns {any}
   */
  function to_method(event, name, method, property, data, access, callback) {
    const target_key = `${event}:${name}`,
      _callback = (error, data) => {
        if (callback) {
          callback(error, data);
        } else if (!error) {
          modules.window.instance.webContents.send('message', {
            event: EVENT_ENUM.METHOD,
            name,
            method,
            property,
            data
          });
        }

        return data;
      };

    switch (method) {
      case 'audio':
        if (['devices', 'play', 'stop'].indexOf(property) >= 0) {
          to_interface(TYPE_ENUM.MANAGER, name, method, property, data, undefined, undefined, _callback);
        } else if (property === 'list') {
          broadcast_method(method, property, data);
        }
        break;

      case 'bluetooth':
        if (property === 'scan' || property === 'disconnect') {
          to_interface(TYPE_ENUM.MANAGER, name, method, property, data);
        } else if (property === 'list') {
          broadcast_method(method, property, data);
        } else if (property === 'connect' && typeof modules.window.get_bluetooth_callback() === 'function') {
          to_interface(TYPE_ENUM.MANAGER, name, method, property, data);
        }
        break;

      case 'http':
        if (modules.http) {
          if (property === 'register') {
            modules.http.set_routes(target_key, data);
          }
        } else {
          _callback('"HTTP" module not loaded');
        }
        break;

      case 'speech':
        if (property === 'set' && data.length) {
          voices = data;
        } else if (property === 'say') {
          to_interface(TYPE_ENUM.MANAGER, name, method, property, Object.assign({
            voice: '',
            volume: 100,
            rate: 1,
            pitch: .8,
            text: ''
          }, data), false, true, _callback);
        } else if (property === 'end') {
          broadcast_method(method, property, _callback(false, data));
        } else if (property === 'stop') {
          to_interface(TYPE_ENUM.MANAGER, name, method, property, undefined, undefined, undefined, _callback);
        } else if (property === 'voices') {
          broadcast_method(method, property, _callback(false, voices));
        }
        break;

      case 'usb':
        if (modules.usb) {
          if (property === 'devices') {
            modules.usb.sender(false, false, (_property, data) => {
              property = _property;
              _callback(false, data);
            });
          }
        } else {
          _callback('"USB" module not loaded');
        }
        break;

      case 'websocket':
        if (modules.websocket) {
          if (typeof data === 'object' || [EVENT_ENUM.MANAGER, 'message'].indexOf(data.from) < 0) {
            modules.websocket.send(data);
          }
        } else {
          console.error('"WebSocket" module not loaded');
        }
        break;
    }
  }

  /**
   * Send data to specific addon/script
   *
   * @param   {EVENT_ENUM}  event
   * @param   {string}      name        Name of addon, script, or targeted method
   * @param   {string}      method      Name of targeted function or data intent
   * @param   {string}      property    Give the intention to the method
   * @param   {any}         data        Data to be transmitted
   * @param   {ACCESS_ENUM} access
   * @param   {function}    [callback]  Returns a result if there is a return to do
   */
  function to_manager(event, name, method, property, data, access, callback) {
    const is_granted = (access === ACCESS_ENUM.ITSELF || access === ACCESS_ENUM.RENDERER),
      is_deckboard = access === ACCESS_ENUM.DECKBOARD;

    if (is_granted || is_deckboard) {
      const target_key = `${event}:${name}`,
        _callback = (error, data) => {
          const obj = {
            event,
            name,
            method,
            property,
            data
          };

          if (callback) {
            callback(error, data);
          } else if (!error) {
            modules.window.instance.webContents.send('message', obj);
          }

          return data;
        };

      let update = false;
      if (is_granted && event === EVENT_ENUM.MANAGER) {
        if (method === 'load') {
          data = init_data();
          _callback(false, data);
        }

        if (method === 'save') {
          const all = options.manager.default.all,
            local = is_local();

          Object.assign(options.manager, data);
          if (local !== is_local()) {
            modules.tray.generate();
          }

          modules.websocket.set_password(options.manager.default.local_password);

          let dialog = false;
          if (typeof options.manager.default.all === 'string' && options.manager.default.all.trim().length && all !== options.manager.default.all) {
            const addons_path = path.join(options.manager.default.all, 'addons');
            if (!fs.existsSync(addons_path)) {
              fs.mkdir(addons_path, () => {});
            } else {
              dialog = true;
            }

            const scripts_path = path.join(options.manager.default.all, 'scripts');
            if (!fs.existsSync(scripts_path)) {
              fs.mkdir(scripts_path, () => {});
            } else {
              dialog = true;
            }
          }

          if (dialog) {
            _callback(false, { name: 'reload', data: true });
          }

          modules.config.save();
          update = true;
        }

        if (method === 'import') {
          const saved = JSON.stringify(options.store.store);
          try {
            if (data.indexOf('{') < 0) {
              data = fs.readFileSync(data, 'utf-8');
            }

            store_clear = true;
            options.store.set(JSON.parse(data));

            if (process.env.PORTABLE_EXECUTABLE_DIR) {
              app.setLoginItemSettings({
                name: 'Scripts Manager',
                path: process.env.PORTABLE_EXECUTABLE_FILE,
                openAtLogin: !!options.manager.default.startup
              });
            }

            methods.relaunch_app();
          } catch (e) {
            options.store.set(JSON.parse(saved));
          }

          store_clear = false;
        }

        if (method === 'export') {
          if (data) {
            try {
              fs.writeFileSync(data, JSON.stringify(options.store.store, null, '  '));
            } catch (e) {}
          } else {
            _callback(false, { name: 'export', data: JSON.stringify(options.store.store, null, '  ') });
          }
        }

        if (['change_profile', 'remove_profile'].indexOf(method) >= 0) {
          modules.config[method](data);
        }

        if (['add_profile', 'image_profile', 'rename_profile'].indexOf(method) >= 0) {
          modules.config[method](data[0], data[1]);
        }

        if (method === 'reset' || method === 'restart') {
          if (method === 'reset') {
            options.store.clear();
          }

          methods.relaunch_app();
        }
      } else {
        const obj = modules.loader.get_extension(event, name);
        if (obj) {
          if (is_granted && method === 'config' && (property === 'save' || property === 'override') && typeof data === 'object') {
            update = true;
            modules.config.save_extension(event, name, data, (property === 'override'));
          } else if (is_granted && method === 'state') {
            if (property === 'set') {
              states[target_key] = data;
            } else if (property === 'unset' && typeof states[target_key] !== 'undefined') {
              delete states[target_key];
            }
            to_interface(event, name, method, property, data);
          } else if (method === 'enable' && obj.config.default.enabled !== data) {
            update = true;
            obj.config.default.enabled = (typeof data === 'boolean') ? data : !obj.config.default.enabled;
            modules.config.save_extension(event, name);
            to_interface(event, name, method, property, obj.config.default.enabled);
            to_extension(event, name, 'enable', property, obj.config.default.enabled, ACCESS_ENUM.RENDERER);
          } else if (is_granted && method === 'menu' && event === EVENT_ENUM.SCRIPT) {
            obj.menu = data;
            modules.tray.generate();
          } else if (is_granted && method === 'interface') {
            modules.communication.to_interface(event, name, method, property, data);
          }
        }
      }

      if (is_granted) {
        if (method === 'browse') {
          if (property === 'file' || property === 'files') {
            dialog[data.name ? 'showSaveDialog' : 'showOpenDialog']({
              properties: [(property === 'files') ? 'openFiles' : 'openFile'],
              defaultPath: data.name ? `${data.name}${data.ext ? `.${data.ext}` : ''}` : undefined,
              filters: [{ name: 'all', extensions: (data.ext ? data.ext.split(',') : ['*']) }],
            }).then(result => {
              if (!result.canceled) {
                data.result = result;
                _callback(false, data);
              } else {
                _callback(true);
              }
            });
          } else if (property === 'folder') {
            dialog.showOpenDialog({
              properties: ['openDirectory']
            }).then(result => {
              if (!result.canceled) {
                data.result = result;
                _callback(false, data);
              } else {
                _callback(true);
              }
            });
          }
        }

        if (update) {
          to_interface(TYPE_ENUM.MANAGER, 'update', undefined, undefined, init_data());
        }
      }
    }
  }

  /**
   * Send data to specific addon/script
   *
   * @param   {EVENT_ENUM}  event
   * @param   {string}      name        Name of addon, script, or targeted method
   * @param   {string}      method      Name of targeted function or data intent
   * @param   {string}      property    Give the intention to the method
   * @param   {any}         data        Data to be transmitted
   * @param   {ACCESS_ENUM} access
   * @param   {function}    [callback]  Returns a result if there is a return to do
   */
  function to_extension(event, name, method, property, data, access, callback) {
    let check = (access === ACCESS_ENUM.ITSELF || access === ACCESS_ENUM.RENDERER) || ['show', 'enable', 'interface'].indexOf(name) < 0;
    if (name === EVENT_ENUM.AUTHORIZATION && access !== ACCESS_ENUM.RENDERER) {
      check = false;
    }

    const id = callback ? modules.store.tracking('extension', callback) : undefined;
    if (check) {
      const obj = modules.loader.get_extension(event, name);
      if (obj) {
        obj.receiver({
          event,
          id,
          name,
          method,
          property,
          data
        });
      }
    }
  }

  /**
   * Send data to all addons/scripts, also via WebSocket if requested
   *
   * @param   {TYPE_ENUM} event
   * @param   {string}    name             Name of addon, script, or targeted method
   * @param   {string}    method           Name of targeted function or data intent
   * @param   {string}    property         Give the intention to the method
   * @param   {any}       data             Data to be transmitted
   * @param   {boolean}   [only_local]     Send data only to the web interface
   * @param   {boolean}   [only_internal]  Send data only to software interface
   * @param   {function}  [callback]       Returns a result if there is a return to do
   * @param   {boolean}   [to_object]      Return an object instead of arguments
   */
  function to_interface(event, name, method, property, data, only_local, only_internal, callback, is_object) {
    const id = callback ? modules.store.generate(name) : undefined,
      obj = {
        to: 'interface',
        event,
        id,
        name,
        method,
        property,
        data
      };

    if (callback) {
      modules.store.tracking(id, callback, is_object);
    }

    if (!only_local) {
      modules.window.instance.webContents.send('message', obj);
    }

    if (!only_internal && is_local() && modules.websocket) {
      modules.websocket.send(obj);
    }
  }

  return {
    is_local,
    broadcast,
    init_data,
    to_method,
    to_manager,
    to_extension,
    to_interface,
    broadcast_method,
    get_voices: () => {
      return voices;
    },
    get_store_clear: () => {
      return store_clear;
    }
  };
};