const {
    usb,
    WebUSB
  } = require('usb'),
  { USBEVENT_ENUM } = require('../enums');


module.exports = (modules, addons, scripts, options, methods) => {
  let infos = {};

  /**
   * Sends the list of connected USB devices or the desired one
   *
   * @param   {USBEVENT_ENUM} event
   * @param   {any}           device  Device object to target
   */
  function sender(event, device, callback) {
    const _callback = (property, data, without_websocket) => {
      if (callback) {
        callback(property, data);
      } else {
        modules.communication.broadcast_method('usb', property, data, without_websocket);
      }
    };

    if (typeof device === 'object' && event === USBEVENT_ENUM.REMOVE) {
      for (const key in infos) {
        const item = infos[key];
        if (item.vendorId === device.deviceDescriptor.idVendor && item.productId === device.deviceDescriptor.idProduct) {
          _callback(event, Object.assign({}, item, device));
          return;
        }
      }

      _callback(event, device);
      return;
    }

    (new WebUSB({ allowAllDevices: true })).getDevices()
      .then(devices => {
        let usb_keys = Object.keys(infos);
        for (const item of devices) {
          const key = `${item.vendorId}-${item.productId}`;
          if (usb_keys.indexOf(key) < 0) {
            usb_keys.push(key);
            infos[key] = item;
          }

          if (typeof device === 'object' && item.vendorId === device.deviceDescriptor.idVendor && item.productId === device.deviceDescriptor.idProduct) {
            _callback(event, Object.assign({}, item, device));
            return;
          }
        }

        if (typeof device === 'object') {
          _callback(event, device);
        } else {
          _callback('devices', devices, true);
        }
      });
  }

  /**
   * Sends the list of connected USB devices and register connection/disconnection events
   */
  function detection() {
    sender();

    usb.on('attach', device => {
      sender(USBEVENT_ENUM.ADD, device);
    });
    usb.on('detach', device => {
      sender(USBEVENT_ENUM.REMOVE, device);
    });
  }

  return {
    instance: usb,
    sender,
    detection
  }
};