const fs = require('fs'),
  path = require('path'),
  uniqid = require('uniqid'),
  { shell, ipcRenderer } = require('electron');

let _target = '',
  _manager = {},
  _audio = {},
  _bluetooth = {};

function get_target(target = _target) {
  const split = target.split(':');
  const [type, id, name] = [
    split[0],
    split[1],
    ((split.length > 2) ? split[2] : 'index')
  ];

  return { type, id, name, target };
}

function load_manager() {
  let target = get_target();
  target.name = 'load';

  ipcRenderer.invoke('manager', target);
}

class AudioPlayer {
  constructor() {
    this._element = document.createElement('audio');
  }

  get element() {
    return this._element;
  }

  async get_devices() {
    const devices = await navigator.mediaDevices.enumerateDevices();

    let output_devices = [];
    for (const device of devices) {
      if (device.kind === 'audiooutput') {
        output_devices.push(device);
      }
    }

    return output_devices;
  }

  async set_device(name, contains = false) {
    for (const device of await this.get_devices()) {
      if ((contains && device.label.indexOf(name) >= 0) || (!contains && device.label === name)) {
        await this._element.setSinkId(device.deviceId);
        return device;
      }
    }

    return false;
  }

  async set_volume(volume) {
    this._element.volume = Math.round(Math.max(0, Math.min(100, volume))) / 100;
  }

  play(file, volume) {
    if (typeof volume !== 'undefined') {
      this.set_volume(volume).then(() => {});
    }

    this._element.src = file;
    this._element.play();
  }

  pause() {
    this._element.pause();
  }
}

class Bluetooth {
  static _characteristics = [
    'gap.device_name',
    'gap.appearance',
    'gap.peripheral_privacy_flag',
    'gap.reconnection_address',
    'gap.peripheral_preferred_connection_parameters',
    'gatt.service_changed',
    'alert_level',
    'tx_power_level',
    'date_time',
    'day_of_week',
    'day_date_time',
    'exact_time_100',
    'exact_time_256',
    'dst_offset',
    'time_zone',
    'local_time_information',
    'secondary_time_zone',
    'time_with_dst',
    'time_accuracy',
    'time_source',
    'reference_time_information',
    'time_broadcast',
    'time_update_control_point',
    'time_update_state',
    'glucose_measurement',
    'battery_level',
    'battery_power_state',
    'battery_level_state',
    'temperature_measurement',
    'temperature_type',
    'intermediate_temperature',
    'temperature_celsius',
    'temperature_fahrenheit',
    'measurement_interval',
    'boot_keyboard_input_report',
    'system_id',
    'model_number_string',
    'serial_number_string',
    'firmware_revision_string',
    'hardware_revision_string',
    'software_revision_string',
    'manufacturer_name_string',
    'current_time',
    'magnetic_declination',
    'position_2d',
    'position_3d',
    'scan_refresh',
    'boot_keyboard_output_report',
    'boot_mouse_input_report',
    'glucose_measurement_context',
    'blood_pressure_measurement',
    'intermediate_cuff_pressure',
    'heart_rate_measurement',
    'body_sensor_location',
    'heart_rate_control_point',
    'removable',
    'service_required',
    'scientific_temperature_celsius',
    'string',
    'network_availability',
    'alert_status',
    'ringer_control_point',
    'ringer_setting',
    'alert_category_id_bit_mask',
    'alert_category_id',
    'alert_notification_control_point',
    'unread_alert_status',
    'new_alert',
    'supported_new_alert_category',
    'supported_unread_alert_category',
    'blood_pressure_feature',
    'hid_information',
    'report_map',
    'hid_control_point',
    'report',
    'protocol_mode',
    'scan_interval_window',
    'pnp_id',
    'glucose_feature',
    'record_access_control_point',
    'rsc_measurement',
    'rsc_feature',
    'sc_control_point',
    'digital',
    'digital_output',
    'analog',
    'analog_output',
    'aggregate',
    'csc_measurement',
    'csc_feature',
    'sensor_location',
    'plx_spot_check_measurement',
    'plx_continuous_measurement',
    'plx_features',
    'pulse_oximetry_control_point',
    'cycling_power_measurement',
    'cycling_power_vector',
    'cycling_power_feature',
    'cycling_power_control_point',
    'location_and_speed',
    'navigation',
    'position_quality',
    'ln_feature',
    'ln_control_point',
    'elevation',
    'pressure',
    'temperature',
    'humidity',
    'true_wind_speed',
    'true_wind_direction',
    'apparent_wind_speed',
    'apparent_wind_direction',
    'gust_factor',
    'pollen_concentration',
    'uv_index',
    'irradiance',
    'rainfall',
    'wind_chill',
    'heat_index',
    'dew_point',
    'descriptor_value_changed',
    'aerobic_heart_rate_lower_limit',
    'aerobic_threshold',
    'age',
    'anaerobic_heart_rate_lower_limit',
    'anaerobic_heart_rate_upper_limit',
    'anaerobic_threshold',
    'aerobic_heart_rate_upper_limit',
    'date_of_birth',
    'date_of_threshold_assessment',
    'email_address',
    'fat_burn_heart_rate_lower_limit',
    'fat_burn_heart_rate_upper_limit',
    'first_name',
    'five_zone_heart_rate_limits',
    'gender',
    'heart_rate_max',
    'height',
    'hip_circumference',
    'last_name',
    'maximum_recommended_heart_rate',
    'resting_heart_rate',
    'sport_type_for_aerobic_and_anaerobic_thresholds',
    'three_zone_heart_rate_limits',
    'two_zone_heart_rate_limit',
    'vo2_max',
    'waist_circumference',
    'weight',
    'database_change_increment',
    'user_index',
    'body_composition_feature',
    'body_composition_measurement',
    'weight_measurement',
    'weight_scale_feature',
    'user_control_point',
    'magnetic_flux_density_2D',
    'magnetic_flux_density_3D',
    'language',
    'barometric_pressure_trend',
    'bond_management_control_point',
    'bond_management_feature',
    'gap.central_address_resolution_support',
    'cgm_measurement',
    'cgm_feature',
    'cgm_status',
    'cgm_session_start_time',
    'cgm_session_run_time',
    'cgm_specific_ops_control_point',
    'indoor_positioning_configuration',
    'latitude',
    'longitude',
    'local_north_coordinate',
    'local_east_coordinate.xml',
    'floor_number',
    'altitude',
    'uncertainty',
    'location_name',
    'uri',
    'http_headers',
    'http_status_code',
    'http_entity_body',
    'http_control_point',
    'https_security',
    'tds_control_point',
    'ots_feature',
    'object_name',
    'object_type',
    'object_size',
    'object_first_created',
    'object_last_modified',
    'object_id',
    'object_properties',
    'object_action_control_point',
    'object_list_control_point',
    'object_list_filter',
    'object_changed',
    'resolvable_private_address_only',
    'fitness_machine_feature',
    'treadmill_data',
    'cross_trainer_data',
    'step_climber_data',
    'stair_climber_data',
    'rower_data',
    'indoor_bike_data',
    'training_status',
    'supported_speed_range',
    'supported_inclination_range',
    'supported_resistance_level_range',
    'supported_heart_rate_range',
    'supported_power_range',
    'fitness_machine_control_point',
    'fitness_machine_status',
    'date_utc'
  ];

  constructor(id, type, options) {
    console.log('Bluetooth scan:', id, options);

    this.device = null;
    this.connected = false;

    navigator.bluetooth.requestDevice(options)
      .then(device => {
        this.device = device;
        this.device.addEventListener('gattserverdisconnected', this.destroy);

        return this.device.gatt.connect();
      })
      .then(server => {
        return server.getPrimaryServices();
      })
      .then(services => {
        this.connected = true;

        let queue = Promise.resolve();
        services.forEach(service => {
          let service_name = '';
          for (const _service of options.services.concat(options.optionalServices || [])) {
            service_name = ((service.uuid === BluetoothUUID.getService(_service)) ? _service : service_name);
          }

          queue = queue.then(_ => service.getCharacteristics().then(characteristics => {
            characteristics.forEach(characteristic => {
              let characteristic_name = '';
              for (const _characteristic of Bluetooth._characteristics) {
                characteristic_name = ((characteristic.uuid === BluetoothUUID.getCharacteristic(_characteristic)) ? _characteristic : characteristic_name);
              }

              if (characteristic_name && characteristic.properties) {
                if (characteristic.properties.read) {
                  characteristic.readValue().then(data => {
                    ipcRenderer.invoke('manager', { id, type, name: 'bluetooth:data', data: {
                      service: service_name,
                      characteristic: characteristic_name,
                      type: 'read',
                      value: Bluetooth.characteristic_data(characteristic_name, data)
                    } });
                  });
                }

                if (characteristic.properties.notify) {
                  characteristic.startNotifications().then(characteristic => {
                    characteristic.addEventListener('characteristicvaluechanged', event => {
                      ipcRenderer.invoke('manager', { id, type, name: 'bluetooth:data', data: {
                        service: service_name,
                        characteristic: characteristic_name,
                        type: 'notify',
                        value: Bluetooth.characteristic_data(characteristic_name, event.target.value)
                      } });
                    });
                  });
                }
              }
            });
          }));
        });

        return queue;
      })
      .catch(error => {
        ipcRenderer.invoke('manager', { id, type, name: 'bluetooth:error', data: error });
      });
  }

  destroy() {
    this.connected = false;
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
      this.device = null;
    }
  }

  static characteristic_data(name, data) {
    const datas = Bluetooth.convert_dataview(name, data);

    let result = datas;
    switch (name) {
      case 'battery_level': result = datas.number[0]; break;
      case 'heart_rate_measurement': result = datas.number[1]; break;
      case 'body_sensor_location': result = ['OTHER', 'CHEST', 'WRIST', 'FINGER', 'HAND', 'EAR_LOBE', 'FOOT'][datas.number[0]]; break;
    }

    return result;
  }

  static convert_dataview(name, dataview) {
    let datas = { flags: null, string: null, number: null, number16: null };

    try {
      const flags = dataview.getUint16(0, true);
      datas.flags = [flags & 0x0, flags & 0x1, flags & 0x2, flags & 0x3, flags & 0x4, flags & 0x5, flags & 0x6, flags & 0x7, flags & 0x8, flags & 0x9, flags & 0x10, flags & 0x11, flags & 0x12, flags & 0x13, flags & 0x14, flags & 0x15, flags & 0x16];
    } catch (e) {}

    try {
      const text = new TextDecoder('ascii');
      datas.string = text.decode(dataview.buffer);
    } catch (e) {}

    try {
      datas.number = new Int8Array(dataview.buffer);
    } catch (e) {}

    try {
      datas.number16 = dataview.getUint16(0, true);
    } catch (e) {}

    return datas;
  }
}

ipcRenderer.on('init', (event, data) => {
  let index = 0;
  const list = document.querySelector('.menu'),
    iframe = document.querySelector('.content > iframe');

  // define iframe height
  setInterval(() => {
    if (iframe.contentWindow.document.body) {
      iframe.style.height = `${iframe.contentWindow.document.body.scrollHeight - 20}px`;
    }
  }, 1000);

  // menu generation
  const add_ul = (type, name, parent) => {
    const li = document.createElement('li'),
      ul = document.createElement('ul');

    li.appendChild(ul);
    parent.appendChild(li);

    return ul;
  };

  const add_li = (type, id, name, parent) => {
    const a = document.createElement('a'),
      li = document.createElement('li');

    a.innerText = name;
    a.setAttribute('data-target', `${type}:${id}`);
    li.appendChild(a);

    if (id.indexOf(':') < 0) {
      const label = document.createElement('label');
      label.setAttribute('for', `checkbox_${index}`);
      label.classList.add('switch');

      const checkbox = document.createElement('input');
      checkbox.setAttribute('type', 'checkbox');
      checkbox.setAttribute('id', `checkbox_${index}`);
      checkbox.checked = !!data.configs[type][id].default.enabled;

      const slider = document.createElement('div');
      slider.classList.add('slider', 'round');

      label.appendChild(checkbox);
      label.appendChild(slider);
      li.appendChild(label);

      ++index;
    }

    parent.appendChild(li);

    return li;
  };

  for (const type in data.configs) {
    const list = document.querySelector(`.${type}-list`);
    for (const id in data.configs[type]) {
      const name = data.configs[type][id].default.name,
        li = add_li(type, id, name, list);

      if (type === 'scripts') {
        const menu = data.menus[id];
        if (menu.length) {
          const ul = add_ul(name, li, list);
          for (const submenu of menu) {
            add_li(type, `${id}:${submenu.id}`, submenu.name, ul);
          }
        }
      }
    }
  }

  // from main
  ipcRenderer.on('manager', (event, data) => {
    if (data.name === 'enabled') {
      const elem = document.querySelector(`[data-target="scripts:${data.data.name}"]`);
      if (elem) {
        const state = elem.parentElement.querySelector('[type="checkbox"]').checked;
        if (data.data.state !== state) {
          elem.parentElement.querySelector('.slider').click();
        }
      }

      return;
    } else if (data.name === 'state') {
      const elem = document.querySelector(`[data-target="${data.type}:${data.id}"]`);
      if (elem) {
        if (data.data) {
          elem.setAttribute('state', data.data);
        } else {
          elem.removeAttribute('state');
        }
      }

      return;
    } else if (data.name === 'bluetooth:scan') {
      _bluetooth[data.id] = new Bluetooth(data.id, data.type, data.data);
      return;
    } else if (data.name === 'bluetooth:connect') {
      if (typeof _bluetooth[data.id] !== 'undefined' && !_bluetooth[data.id].connected) {
        data.name = 'bluetooth:connected';

        // to main
        ipcRenderer.invoke('manager', data);

        // to renderer
        iframe.contentWindow.postMessage(data, '*');
      }
      return;
    } else if (data.name === 'bluetooth:disconnect') {
      if (typeof _bluetooth[data.id] !== 'undefined') {
        _bluetooth[data.id].destroy();
        delete _bluetooth[data.id];

        data.name = 'bluetooth:disconnected';

        // to main
        ipcRenderer.invoke('manager', data);
      }
      return;
    }

    if (data.name === 'audio:devices') {
      const audio = new AudioPlayer();
      audio.get_devices()
        .then(devices => {
          data.name = 'audio:list';
          data.data = JSON.parse(JSON.stringify(devices));

          // to main
          ipcRenderer.invoke('manager', data);

          // to renderer
          iframe.contentWindow.postMessage(data, '*');
        });
      return;
    } else if (data.name === 'audio:play') {
      if (typeof _audio[data.id] === 'undefined') {
        _audio[data.id] = {};
      }

      const id = uniqid();
      _audio[data.id][id] = new AudioPlayer();
      _audio[data.id][id].onended = () => {
        _audio[data.id][id].pause();
        delete _audio[data.id][id];
      };

      let volume = parseInt(data.data.volume);
      if (typeof volume !== 'number') {
        volume = 100;
      }

      if (data.data.device) {
        _audio[data.id][id].set_device((typeof data.data.device === 'string') ? data.data.device : data.data.device.label)
          .then(device => {
            _audio[data.id][id].play(data.data.file, volume);
          });
      } else
        _audio[data.id][id].play(data.data.file, volume);
      return;
    } else if (data.name === 'audio:stop') {
      if (typeof _audio[data.id] !== 'undefined') {
        for (const id in _audio[data.id]) {
          _audio[data.id][id].pause();
          delete _audio[data.id][id];
        }
      }
      return;
    }

    if (data.target === get_target().target) {
      const iframe_doc = iframe.contentWindow.document;

      if (data.name === 'load') {
        if (['general:about', 'general:settings'].indexOf(data.target) >= 0) {
          _manager = data.data;
        }

        if (data.target === 'general:settings') {
          const check = typeof _manager === 'object' && typeof _manager.default === 'object',
            browse = iframe_doc.querySelector('.browse input'),
            button_action = key => {
              const buttons = iframe_doc.querySelectorAll(`.${key} .button`),
                state = (check && _manager.default[key] === true) ? 'on' : 'off';

              for (const button of buttons) {
                const selected = button.getAttribute('name') === state;
                button.classList.toggle('is-selected', selected);
                if (selected) {
                  button.dispatchEvent(new Event('update', { bubbles: true, cancelable: true }));
                }
              }
            };

          if (check) {
            if (typeof _manager.default.all === 'string') {
              browse.value = _manager.default.all;
              browse.dispatchEvent(new Event('update', { bubbles: true, cancelable: true }));
            }
          }

          button_action('startup');
          button_action('systray');
        }
      } else if (!data.name.indexOf('browse:')) {
        const elem = iframe_doc.querySelector(data.data.elem);
        elem.value = data.result.filePath || data.result.filePaths[0];
        elem.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      }
    }
  });
  ipcRenderer.on('message', (event, data) => {
    const target = get_target();
    if (data.type === target.type && data.id === target.id) {
      // to renderer
      iframe.contentWindow.postMessage(data, '*');
    }
  });

  // from renderer
  window.addEventListener('message', event => {
    if (event.origin !== 'null') {
      let target = get_target();
      target.data = event.data;

      // to main
      ipcRenderer.invoke('message', target);
    }
  }, false);

  // target changed
  iframe.addEventListener('load', event => {
    setTimeout(() => {
      const iframe_doc = iframe.contentWindow.document;

      const config_stylesheet = iframe_doc.querySelector(`#config_stylesheet`);
      if (config_stylesheet) {
        config_stylesheet.setAttribute('href', path.join(__dirname, 'public', 'css', 'config.css'));
      }

      // get new target
      let target = get_target();
      target.name = 'show';
      target.data = true;

      // pages
      if (target.target === 'general:settings') {
        const browse = iframe_doc.querySelector('.browse input'),
          import_input = iframe_doc.querySelector('.import input'),
          export_input = iframe_doc.querySelector('.export input'),
          reset = iframe_doc.querySelector('.reset-app .is-success'),
          reload_dialog = iframe_doc.querySelector('div.reload-app'),
          reset_dialog = iframe_doc.querySelector('div.reset-app'),
          settings = {
            all: browse.value,
            startup: false,
            systray: false
          },
          button_action = key => {
            const buttons = iframe_doc.querySelectorAll(`.${key} .button`),
              callback = event => {
                for (const button of buttons) {
                  button.classList.remove('is-selected');
                }

                const on = event.target.getAttribute('name') === 'on';
                event.target.classList.add('is-selected');

                settings[key] = on;
                if (event.type !== 'update') {
                  save_settings();
                }
              };

            for (const button of buttons) {
              button.addEventListener('click', callback, false);
              button.addEventListener('update', callback, false);
            }
          },
          get_save_target = () => {
            let target = get_target();
            target.name = 'save';
            target.data = { default: settings };

            return target;
          },
          save_settings = () => {
            ipcRenderer.invoke('manager', get_save_target());
          };

        browse.addEventListener('update', () => {
          settings.all = browse.value;
        }, false);

        browse.addEventListener('change', () => {
          if (browse.value === settings.all) {
            return;
          }

          const target = get_save_target();

          let dialog = false;
          if (target.data.default.all.trim().length) {
            const addons_path = path.join(target.data.default.all, 'addons');
            if (!fs.existsSync(addons_path)) {
              fs.mkdir(addons_path, () => {});
            } else {
              dialog = true;
            }

            const scripts_path = path.join(target.data.default.all, 'scripts');
            if (!fs.existsSync(scripts_path)) {
              fs.mkdir(scripts_path, () => {});
            } else {
              dialog = true;
            }
          }

          settings.all = browse.value;
          save_settings();

          if (dialog) {
            reload_dialog.classList.add('is-active');
          }
        }, false);

        button_action('startup');
        button_action('systray');

        import_input.addEventListener('change', event => {
          let target = get_target();
          target.name = 'import';
          target.data = import_input.value;

          ipcRenderer.invoke('manager', target);
        }, false);

        export_input.addEventListener('change', event => {
          let target = get_target();
          target.name = 'export';
          target.data = export_input.value;

          ipcRenderer.invoke('manager', target);
        }, false);

        reset.addEventListener('click', () => {
          let target = get_target();
          target.name = 'reset';

          ipcRenderer.invoke('manager', target);
        }, false);

        iframe_doc.querySelectorAll('[aria-label="close"]').forEach(elem => {
          elem.addEventListener('click', () => {
            const modal = elem.closest('.modal');
            if (modal) {
              modal.classList.remove('is-active');
            }
          }, false);
        });

        iframe_doc.querySelector('.reset').addEventListener('click', () => {
          reset_dialog.classList.add('is-active');
        }, false);

        load_manager();
      } else if (target.target === 'general:about') {
        const this_file = path.join(__dirname, 'package.json');
        const this_version = iframe_doc.querySelector('.this-version');
        if (fs.existsSync(this_file)) {
          const pkg = require(this_file);
          this_version.innerText = pkg.version + (data.mode === 'development' ? 'a' : '');
          this_version.parentElement.children[0].innerText = pkg.name;

          fetch('https://api.github.com/repos/Arubinu/Scripts-Manager/releases/latest').then(async res => {
            const data = await res.json();
            if (data.tag_name !== `v${pkg.version}`) {
              const elem = iframe_doc.querySelector('.new-version');
              elem.classList.remove('is-hidden');
              elem.querySelector('span').innerText = data.tag_name.substring(1);
            }
          });
        } else {
          this_version.parentElement.remove();
        }

        iframe_doc.querySelector('.node-version').innerText = process.versions.node;
        iframe_doc.querySelector('.chrome-version').innerText = process.versions.chrome;
        iframe_doc.querySelector('.electron-version').innerText = process.versions.electron;

        load_manager();
      }

      // open links in default browser and open dialog
      iframe_doc.addEventListener('click', event => {
        let elem = event.target.closest('[browse-file], [browse-file], [browse-folder], [external-link]');
        if (!elem) {
          elem = event.target;
        }

        if (elem.matches('[browse-file], [browse-files]')) {
          const type = (elem.hasAttribute('browse-file') ? 'file' : 'files');
          let target = get_target();
          target.name = `browse:${type}`;
          target.data = {
            elem: elem.getAttribute(`browse-${type}`),
            name: elem.getAttribute(`browse-file-name`),
            ext: elem.getAttribute(`browse-file-ext`)
          };

          ipcRenderer.invoke('manager', target);
        } else if (elem.matches('[browse-folder]')) {
          let target = get_target();
          target.name = 'browse:folder';
          target.data = {
            elem: elem.getAttribute('browse-folder')
          };

          ipcRenderer.invoke('manager', target);
        } else if (elem.matches('[external-link]')) {
          event.preventDefault();
          shell.openExternal(elem.getAttribute('external-link'));
        }
      }, false);

      // removes focus from buttons and links so as not to have the blue outline
      iframe_doc.addEventListener('mouseup', event => {
        if (!event.target.matches('input, select, textarea') && !event.target.closest('input, select, textarea')) {
          iframe.blur();
        }
      }, false);

      // to main
      ipcRenderer.invoke('manager', target);
    }, 10);

    // force show/hide content right margin
    setTimeout(() => {
      window.dispatchEvent(new Event('resize', { bubbles: true }));
    }, 1000);

    // production/development
    document.body.setAttribute('mode', data.mode);
  });

  // click on menu link
  document.addEventListener('click', event => {
    if (event.target.matches('.menu a')) {
      // unselect all
      list.querySelectorAll('li, li > a').forEach(elem => {
        elem.classList.remove('is-active');
      });

      // select with parent
      event.target.classList.add('is-active');
      const parent = event.target.parentElement.parentElement.closest('li');
      if (parent && parent.previousSibling) {
        parent.previousSibling.classList.add('is-active');
      }

      // change target
      let target = event.target.getAttribute('data-target');
      if (target) {
        if (_target) {
          // get old target
          let target = get_target();
          target.name = 'show';
          target.data = false;

          ipcRenderer.invoke('manager', target);
        }

        // get/set new target
        _target = target;
        target = get_target();

        let uri = `../${target.type}/${target.id}/${target.name}.html`;
        if (target.type === 'general') {
          uri = `../public/${target.id}.html`;
        }

        if (!fs.existsSync(path.join(__dirname, 'erase', uri))) {
          if (typeof _manager === 'object' && typeof _manager.default === 'object') {
            if (typeof _manager.default.all === 'string') {
              uri = path.join(_manager.default.all, 'erase', uri);
            }
          }
        }

        iframe.setAttribute('src', uri);
      }
    }

    // send a message to the switch
    if (event.target.matches('.menu .switch .slider')) {
      setTimeout(() => {
        let target = get_target(event.target.parentElement.parentElement.querySelector('a').getAttribute('data-target'));
        target.name = 'enabled';
        target.data = event.target.parentElement.querySelector('input').checked;

        // to main
        ipcRenderer.invoke('manager', target);
      }, 10);
    }
  }, false);

  // send init to main
  ipcRenderer.invoke('init');

  // enable default target
  setTimeout(() => {
    const elem = document.querySelector('[data-target].is-active');
    _target = elem.getAttribute('data-target');
    elem.click();
  }, 10);

  // show/hide content right margin
  window.addEventListener('resize', () => {
    const elem = document.querySelector('.content');
    elem.classList.toggle('is-scrollbar', (elem.scrollHeight > elem.clientHeight));
  });
});
