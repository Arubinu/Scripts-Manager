const fs = require('fs'),
  path = require('path'),
  uniqid = require('uniqid'),
  { shell, ipcRenderer } = require('electron');

let _audio = {},
  _bluetooth = {};

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
  const iframe = document.querySelector('.content > iframe');

  window.file_exists = function() {
    return fs.existsSync(path.join(...arguments));
  };
  window.send_message = (target, data) => {
    ipcRenderer.invoke(target, data);
  };
  window.open_link = url => {
    shell.openExternal(url);
  };

  window._data = data;
  window.init();

  // from main
  ipcRenderer.on('manager', (event, data) => {
    if (data.name === 'bluetooth:scan') {
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
    } else if (data.name === 'audio:devices') {
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
    } else if (data.name === 'speech:cancel') {
      window.speechSynthesis.cancel();
    } else if (data.name === 'speech:say') {
      if (typeof data.data.text === 'string' && data.data.text.trim().length)
      {
        for (const voice of window.speechSynthesis.getVoices())
        {
          if (voice.name === data.data.voice)
          {
            const message = new SpeechSynthesisUtterance();
            message.onend = () => { ipcRenderer.invoke('manager', { name: 'speech:end', data: data.data }); };

            message.voice = voice;
            message.volume = parseInt(parseFloat(data.data.volume) || 100) / 100;
            message.rate = parseInt(parseInt(parseFloat(data.data.rate) || 1) * 100) / 100;
            message.pitch = parseInt(parseInt(parseFloat(data.data.pitch) || .8) * 100) / 100;
            message.text = data.data.text.trim();

            window.speechSynthesis.speak(message);
            break;
          }
        }
      }
    } else if (data.name === 'speech:voices') {
      let voices = [];
      const keys = ['default', 'lang', 'localService', 'name', 'voiceURI'];
      for (const voice of window.speechSynthesis.getVoices()) {
        let obj = {};
        for (const key of keys) {
          obj[key] = voice[key];
        }

        voices.push(obj);
      }
      data.data = voices;
      ipcRenderer.invoke('manager', data);
      return;
    }

    window.manager_conn(data);
  });
  ipcRenderer.on('message', (event, data) => window.message_conn(data));

  // send init to manager
  window.send_message('init');
});
