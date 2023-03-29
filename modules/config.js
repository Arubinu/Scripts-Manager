const fs = require('node:fs'),
  path = require('node:path'),
  inifile = { write: require('write-ini-file') },
  { app } = require('electron'),
  { EVENT_ENUM } = require('../enums');

module.exports = (modules, addons, scripts, options, methods) => {
  /**
   * Load software configuration
   */
  function load() {
    try {
      const tmp = options.store.get('manager');
      if (typeof tmp === 'object') {
        Object.assign(options.manager, tmp);
      } else {
        throw new Error('bad save');
      }
    } catch (e) {
      Object.assign(options.manager, { default: {} });
    }
  }

  /**
   * Backup software configuration
   *
   * @param   {object} [manager]  Object to save, otherwise the current object is used
   */
  function save(manager) {
    if (modules.communication.get_store_clear()) {
      return;
    }

    options.store.set('manager', manager || options.manager);
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      app.setLoginItemSettings({
        name: 'Scripts Manager',
        path: process.env.PORTABLE_EXECUTABLE_FILE,
        openAtLogin: !!options.manager.default.startup
      });
    }
  }

  /**
   * Retrieves the name of existing profiles
   *
   * @returns {object}
   */
  function get_profiles() {
    let data = {
      current: methods.get_profile(),
      images: {},
      default: 'Default',
      profiles: []
    };

    try {
      const tmp = options.store.get('profiles');
      if (typeof tmp === 'object') {
        if (typeof tmp.default === 'string') {
          data.default = tmp.default;
        }

        if (typeof tmp.images === 'object') {
          data.images = tmp.images;
        }

        if (Array.isArray(tmp.profiles)) {
          data.profiles = tmp.profiles;
        }
      }
    } catch (e) {}

    if (data.profiles.indexOf(data.default) < 0) {
      if (!data.profiles.length) {
        data.default = 'Default';
        data.profiles.push(data.default);
      } else {
        data.default = data.profiles[0];
      }
    }

    for (const name in data.images) {
      if (typeof data.images[name] !== 'string' || data.profiles.indexOf(name) < 0) {
        delete data.images[name];
      }
    }

    return data;
  }

  /**
   * Returns configuration of all addons/scripts
   *
   * @returns {object}
   */
  function get_extensions() {
    let obj = {
      addon: {},
      script: {}
    };

    for (const name in addons) {
      obj.addon[name] = addons[name].config;
    }

    for (const name in scripts) {
      obj.script[name] = scripts[name].config;
    }

    return obj;
  }

  /**
   * Save profiles
   *
   * @param   {string} data  Object grouping the profiles to save
   */
  function save_profiles(data) {
    if (modules.communication.get_store_clear()) {
      return;
    }

    if (typeof data === 'object' && typeof data.default === 'string' && Array.isArray(data.profiles)) {
      options.store.set('profiles', data);
    }
  }

  /**
   * Backup addon/script configuration
   *
   * @param   {EVENT_ENUM} event
   * @param   {string}     name      Name of addon, script, or targeted method
   * @param   {any}        data      Data to be transmitted
   * @param   {boolean}    override  Replace object instead of properties
   * @returns {boolean}
   */
  async function save_extension(event, name, data, override) {
    let obj = null,
      is_global = false;

    if (event === EVENT_ENUM.ADDON) {
      obj = addons[name].config;
      is_global = addons[name].is_global;
    } else if (event === EVENT_ENUM.SCRIPT) {
      obj = scripts[name].config;
      is_global = scripts[name].is_global;
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

    let config_path = path.join(__dirname, '..', event, name);
    if (!fs.existsSync(config_path)) {
      if (typeof options.manager.default.all === 'string' && options.manager.default.all.trim().length) {
        config_path = path.join(options.manager.default.all, event, name);
      }
    }

    if (is_global) {
      if (modules.communication.get_store_clear()) {
        return false;
      }

      options.store.set(`${event}[${methods.get_profile()}][${name}]`, obj);
      return true;
    }

    try {
      await inifile.write(path.join(config_path, 'config.ini'), obj);
      return true;
    } catch (e) {}

    return false;
  }

  /**
   * Adds a profile to the list of existing profiles
   *
   * @param   {string} name     Profile name
   * @param   {string} [image]  Image to display on profile
   */
  function add_profile(name, image) {
    let data = get_profiles();
    if (data.profiles.indexOf(name) < 0) {
      if (image) {
        data.images[name] = image;
      }

      data.profiles.push(name);
      save_profiles(data);
    }
  }

  /**
   * Change default profile
   *
   * @param   {string} name  Profile name
   */
  function change_profile(name) {
    let data = get_profiles();
    if (name.trim().length) {
      data.default = name;
      save_profiles(data);
    }
  }

  /**
   * Change the image of an existing profile (or delete it)
   *
   * @param   {string} name     Profile name
   * @param   {string} [image]  Image to display on profile
   */
  function image_profile(name, image) {
    let data = get_profiles();
    if (data.profiles.indexOf(name) >= 0) {
      if (image) {
        data.images[name] = image;
      } else if (typeof data.images[name] !== 'undefined') {
        delete data.images[name];
      }

      save_profiles(data);
    }
  }

  /**
   * Rename an existing profile
   *
   * @param   {string} name      Profile name
   * @param   {string} new_name  New name for this profile
   */
  function rename_profile(name, new_name) {
    let data = get_profiles(),
      index = data.profiles.indexOf(name);

    if (index >= 0) {
      data.profiles[index] = new_name;
      if (name === data.default) {
        data.default = new_name;
      }

      if (typeof data.images[name] !== 'undefined') {
        data.images[new_name] = data.images[name];
        delete data.images[name];
      }

      save_profiles(data);

      for (const key in options.store.store) {
        const addon_name = `addon[${name}]`,
          script_name = `script[${name}]`;

        if (!key.indexOf(addon_name)) {
          options.store.set(`addon[${new_name}][${key.slice((addon_name.length + 1), -1)}]`, options.store.get(key));
          options.store.delete(key);
        } else if (!key.indexOf(script_name)) {
          options.store.set(`script[${new_name}][${key.slice((script_name.length + 1), -1)}]`, options.store.get(key));
          options.store.delete(key);
        }
      }
    }
  }

  /**
   * Deletes one of the profiles from the list of existing profiles
   *
   * @param   {string} name  Profile name
   */
  function remove_profile(name) {
    let data = get_profiles(),
      index = data.profiles.indexOf(name);

    if (index >= 0) {
      if (typeof data.images[name] !== 'undefined') {
        delete data.images[name];
      }

      data.profiles.splice(index, 1);
      save_profiles(data);

      for (const key in options.store.store) {
        const addon_name = `addon[${name}]`,
          script_name = `script[${name}]`;

        if (!key.indexOf(addon_name)) {
          options.store.delete(key);
        } else if (!key.indexOf(script_name)) {
          options.store.delete(key);
        }
      }
    }
  }

  return {
    load,
    save,
    get_profiles,
    get_extensions,
    save_extension,
    add_profile,
    change_profile,
    image_profile,
    rename_profile,
    remove_profile
  };
};