/* global RESPONSE_ENUM */

/**
 * Checks if the name is indeed an ID
 *
 * @param   {string} name  Unique tracking number (prefixed with 'TN:') or name for generate it
 * @returns {boolean}
 */
function is_id(name) {
  return name && name.length > 3 && !name.indexOf('TN:');
}

/**
 * Generates a tracking number with a name or returns the given one
 *
 * @param   {string} name  Unique tracking number (prefixed with 'TN:') or name for generate it
 */
function get_id(name) {
  return is_id(name) ? name : generate();
}

/**
 * responds favorably to tracking
 *
 * @param   {string} name  Unique tracking number (prefixed with 'TN:') or name for generate it
 * @param   {any}    data  Data to be transmitted
 * @returns {boolean}
 */
function done(name, data) {
  return respond(RESPONSE_ENUM.DONE, get_id(name), data);
}

/**
 * Responds unfavorably to tracking
 *
 * @param   {string} name  Unique tracking number (prefixed with 'TN:') or name for generate it
 * @param   {any}    data  Data to be transmitted
 * @returns {boolean}
 */
function error(name, error) {
  return respond(RESPONSE_ENUM.ERROR, get_id(name), error);
}

/**
 * Respond to tracking
 *
 * @param   {RESPONSE_ENUM} event
 * @param   {string}        id    Unique tracking number
 * @param   {any}           data  Data to be transmitted
 * @returns {boolean}
 */
function respond(event, id, data) {
  if (typeof window.store.promises[id] !== 'undefined') {
    const fn = window.store.promises[id];

    clearTimeout(fn.timeout);
    delete window.store.promises[id];

    fn[event](data);
    return true;
  }

  return false;
}

/**
 * Generate tracking number
 *
 * @returns {string}
 */
function generate() {
  return 'TN:' + window.store.hash + Math.random().toString(16).slice(2);
}

/**
 * Create a promise to respond with a tracking number
 *
 * @param   {string}   name         Unique tracking number (prefixed with 'TN:') or name for generate it
 * @param   {function} callback     Function that will be called once the tracking is finished
 * @param   {boolean}  [to_object]  Return an object instead of arguments
 * @returns {string} Unique tracking number
 */
function tracking(name, callback, to_object) {
  const id = get_id(name),
    timeout = setTimeout(() => {
      error(id, 'no response');
    }, 30000),
    response = (event, data) => {
      clearTimeout(timeout);
      if (callback) {
        if (to_object) {
          callback({ event, id, method: 'response', data });
        } else if (event === RESPONSE_ENUM.DONE) {
          callback(false, data);
        } else {
          callback(data);
        }
      }
    };

  new Promise((resolve, reject) => {
    window.store.promises[id] = {
      done: resolve,
      error: reject,
      timeout
    }
  })
    .then(data => {
      response(RESPONSE_ENUM.DONE, data);
    })
    .catch(error => {
      response(RESPONSE_ENUM.ERROR, error);
    });

  return id;
}

window.store = {
  done,
  error,
  generate,
  tracking,
  hash: '696e74657266616365',
  promises: {}
};