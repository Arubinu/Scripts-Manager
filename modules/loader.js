const fs = require('node:fs'),
  path = require('node:path'),
  inifile = { read: require('read-ini-file') },
  {
    TYPE_ENUM,
    EVENT_ENUM,
    ACCESS_ENUM,
    RESPONSE_ENUM
  } = require('../enums');

module.exports = (modules, addons, scripts, options, methods) => {
  let vars = {
      http: `http://localhost:${options.APP_PORT}`,
      websocket: `ws://localhost:${options.APP_PORT}`
    },
    menus = {};

  /**
   * Load addons from a folder
   *
   * @param   {string}  dir        Path of the folder where the addons to load are located
   * @param   {boolean} is_global  Specifies that addons are part of the program
   * @returns {promise}
   */
  function load_addons(dir, is_global) {
    return new Promise((resolve, reject) => {
      fs.readdir(dir, (err, files) => {
        if (err) {
          return reject(err);
        }

        files.forEach(async file => {
          if (typeof addons[file] !== 'undefined' || typeof scripts[file] !== 'undefined') {
            return;
          }

          load_extension('addon', file, path.join(dir, file), is_global)
            .then(obj => {
              addons[file] = obj;
              console.log('Addon loaded:', file);
            })
            .catch(error => {
              if (!error.toString().indexOf('TypeError: require(...) is not a function')) {
                console.error(`Addon error: please update ${file}`);
              } else {
                console.error('Addon error:', file, error);
              }
            });
        });

        resolve();
      });
    });
  }

  /**
   * Load scripts from a folder
   *
   * @param   {string}  dir        Path of the folder where the scripts to load are located
   * @param   {boolean} is_global  Specifies that scripts are part of the program
   * @returns {promise}
   */
  function load_scripts(dir, is_global) {
    return new Promise((resolve, reject) => {
      fs.readdir(dir, (err, files) => {
        if (err) {
          return reject(err);
        }

        files.forEach(async file => {
          if (typeof addons[file] !== 'undefined' || typeof scripts[file] !== 'undefined' || (is_global && process.env.NODE_ENV !== 'development' && file === 'unit-test')) {
            return;
          }

          load_extension('script', file, path.join(dir, file), is_global)
            .then(obj => {
              scripts[file] = obj;
              console.log('Script loaded:', file);
            })
            .catch(error => {
              if (!error.toString().indexOf('TypeError: require(...) is not a function')) {
                console.error(`Script error: please update ${file}`);
              } else {
                console.error('Script error:', file, error);
              }
            });
        });

        resolve();
      });
    });
  }

  /**
   * Load addon/script from a folder
   *
   * @param   {EVENT_ENUM} type
   * @param   {string}     name         Name of addon/script
   * @param   {string}     module_path  Path of the folder where the scripts to load are located
   * @param   {boolean}    is_global    Specifies that scripts are part of the program
   * @returns {promise}
   */
  function load_extension(type, name, extension_path, is_global) {
    return new Promise((resolve, reject) => {
      let extension_file = path.join(extension_path, `${type}.js`);
      let config_file = path.join(extension_path, 'config.ini');
      if (fs.existsSync(extension_file) && fs.existsSync(config_file) && fs.existsSync(path.join(extension_path, 'index.html'))) {
        let config = JSON.parse(JSON.stringify(inifile.read.sync(config_file)));
        if (typeof config.default.name === 'string') {
          menus[name] = [];
          if (typeof config.menu === 'object') {
            for (let id in config.menu) {
              if (id.indexOf('/') < 0 && id.indexOf('\\') < 0 && fs.existsSync(path.join(extension_path, `${id}.html`))) {
                menus[name].push({ id, name: config.menu[id] });
              }
            }
          }

          if (is_global) {
            try {
              const tmp = options.store.get(`${type}[${methods.get_profile()}][${name}]`);
              for (const key in tmp) {
                if (key === 'default') {
                  config[key].enabled = (typeof tmp[key].enabled === 'boolean') ? tmp[key].enabled : false;
                } else {
                  config[key] = Object.assign(((typeof config[key] === 'object') ? config[key] : {}), tmp[key]);
                }
              }
            } catch (e) {}
          }

          let obj = {
            init: false,
            exit: false,
            menu: [],
            path: extension_path,
            config: config,
            scripts: {},
            //fork: cp.fork(extension_file, [], { stdio: [0, 1, 2, 'ipc'], env: { electronRunAsNode: true }, detached: false }),
            is_global: is_global,
            initialize: () => {
              obj.fork.send({
                event: 'initialize',
                data: [JSON.parse(JSON.stringify(obj.config)), vars]
              });
              obj.init = true;
            },
            receiver: _data => {
              const { id } = _data;
              if (obj.init) {
                obj.fork.send(_data);
              } else {
                modules.store.error(id, 'not initialized');
              }
            },
            sender: async _data => {
              let tid = _data.id,
                this_name = name;

              const { event, id, data } = _data;
              if (event === RESPONSE_ENUM.DONE || event === RESPONSE_ENUM.ERROR) {
                /**
                 * Responds to tracked request
                 */
                modules.store[event](id, data);
              } else {
                const { name, method, property } = _data;
                if (event === EVENT_ENUM.ADDON) {
                  /**
                   * Sending data to a specific addon
                   */
                  modules.store.tracking(tid, obj.receiver, true);
                  const addon = get_addon(name);
                  if (addon) {
                    addon.receiver({
                      id,
                      name,
                      method,
                      property,
                      data
                    });
                  } else {
                    modules.store.error(id, 'addon not found');
                  }
                } else if (event === EVENT_ENUM.SCRIPT) {
                  /**
                   * Send data to a specific script (only if the target script has requested access)
                   */
                  modules.store.tracking(tid, obj.receiver, true);
                  const check_addon = (type === EVENT_ENUM.ADDON) ? this_name : undefined,
                    check_script = (type === EVENT_ENUM.SCRIPT && name !== this_name) ? this_name : undefined,
                    script = get_script(name, undefined, check_addon, check_script, method);

                  if (script) {
                    script.receiver({
                      id,
                      name,
                      method,
                      property,
                      data
                    });
                  } else {
                    modules.store.error(tid, ((typeof scripts[name] !== 'undefined') ? 'authorization required' : 'script not found'));
                  }
                } else {
                  if (event === EVENT_ENUM.AUTHORIZATION) {
                    const _obj = get_extension(name, method);
                    modules.store.tracking(tid, data => {
                      if (data.event !== RESPONSE_ENUM.ERROR) {
                        if (data.data) {
                          if (typeof _obj.scripts[this_name] === 'undefined') {
                            _obj.scripts[this_name] = [];
                          }

                          _obj.scripts[this_name].push(data.data);
                        } else {
                          data.event = RESPONSE_ENUM.ERROR;
                          data.data = 'request denied';
                        }
                      }

                      obj.receiver(data);
                    }, true);
                  } else if (event !== EVENT_ENUM.BROADCAST) {
                    modules.store.tracking(tid, obj.receiver, true);
                  }

                  let access = ACCESS_ENUM.GUEST;
                  if ((event === EVENT_ENUM.MANAGER && ['config', 'enable', 'menu', 'state'].indexOf(name) >= 0) || name === this_name || name === 'interface') {
                    access = ACCESS_ENUM.ITSELF;
                  }

                  const respond = (error, data) => modules.store[error ? RESPONSE_ENUM.ERROR : RESPONSE_ENUM.DONE](tid, error ? error : data);
                  switch (event) {
                    case TYPE_ENUM.METHOD: modules.communication.to_method(type, this_name, name, method, data, access, respond); break;
                    case TYPE_ENUM.MANAGER: modules.communication.to_manager(type, this_name, name, method, data, access, respond); break;
                    case TYPE_ENUM.EXTENSION: modules.communication.to_extension(type, this_name, name, method, data, ACCESS_ENUM.ITSELF, respond); break;
                    case EVENT_ENUM.BROADCAST: modules.communication.broadcast(type, this_name, method, data, true, false); break;
                    case EVENT_ENUM.AUTHORIZATION:
                      if (type === EVENT_ENUM.SCRIPT) {
                        const _obj = get_extension(name, method);
                        if (_obj) {
                          _obj.receiver({
                            event: EVENT_ENUM.AUTHORIZATION,
                            id: tid,
                            name: type,
                            method: this_name,
                            property
                          });
                        } else {
                          modules.store.error(tid, `${name} not found`);
                        }
                      } else {
                        modules.store.error(tid, 'only work with scripts');
                      }
                      break;
                    default: modules.store.error(tid, 'bad request');
                  }
                }
              }
            }
          };

          if (obj.fork && typeof obj.fork.on !== 'undefined') {
            obj.fork.on('message', obj.sender);
            obj.fork.on('error', error => {
              console.log('Fork error:', type, name, error);
            });
            obj.fork.on('exit', (code, signal) => {
              console.log('Fork exit:', type, name, code, signal);
            });
          } else {
            const instance = require(extension_file)(obj.sender);
            obj.fork = {
              send: instance.receive
            };
          }

          if (methods.get_initialize()) {
            obj.initialize();
          }

          resolve(obj);
        }
      }
    });
  }

  /**
   * Find the desired addon
   *
   * @param   {string} name      Name of addon
   * @param   {string} [method]  Feature name made available by the software
   * @returns {object|false}
   */
  function get_addon(name, method) {
    if (typeof addons[name] !== 'undefined') {
      if (!method || (typeof addons[name].config.default?.methods === 'string' && addons[name].config.default.methods.split(',').indexOf(method) >= 0)) {
        return addons[name];
      }
    }

    return false;
  }

  /**
   * Find the desired script
   *
   * @param   {string} name             Name of script
   * @param   {string} [method]         Feature name made available by the software
   * @param   {string} [addon]          Addon name to check if it is accepted by the script
   * @param   {string} [script]         Script name to check if it is accepted by the script
   * @param   {string} [script_method]  Method name allowed for this script
   * @returns {object|false}
   */
  function get_script(name, method, addon, script, script_method) {
    if (typeof scripts[name] !== 'undefined') {
      let check = (!method && !addon && !script);
      check = (addon && typeof scripts[name].config.default?.addons === 'string' && scripts[name].config.default.addons.split(',').indexOf(addon) >= 0) || check;
      check = (method && typeof scripts[name].config.default?.methods === 'string' && scripts[name].config.default.methods.split(',').indexOf(method) >= 0) || check;
      check = (script && Object.keys(scripts[name].scripts).indexOf(script) >= 0 && (!script_method || scripts[name].scripts[script].indexOf(script_method) >= 0)) || check;

      if (check) {
        return scripts[name];
      }
    }

    return false;
  }

  /**
   * Find the desired addon or script
   *
   * @returns {object|false}
   */
  function get_extension(event, name) {
    if (event === EVENT_ENUM.ADDON) {
      return get_addon(name);
    } else if (event === EVENT_ENUM.SCRIPT) {
      return get_script(name);
    }

    return false;
  }

  /**
   * Set a variable to share with loaded modules
   *
   * @param   {string} name   Variable name
   * @param   {any}    value  Variable value
   */
  function set_var(name, value) {
    if (['http', 'websocket'].indexOf(name.toLowerCase()) < 0) {
      vars[name] = value;
    }
  }

  return {
    addons: load_addons,
    scripts: load_scripts,
    get_addon,
    get_script,
    get_extension,
    get_menus: () => {
      return menus;
    },
    set_var
  };
};