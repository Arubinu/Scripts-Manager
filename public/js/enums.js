/**
 * Communication types
 * @readonly
 * @enum {string}
 */
const TYPE_ENUM = {
  METHOD: 'method',
  MANAGER: 'manager',
  EXTENSION: 'extension'
};

/**
 * Communication events
 * @readonly
 * @enum {string}
 */
const EVENT_ENUM = {
  ADDON: 'addon',
  METHOD: 'method',
  SCRIPT: 'script',
  MANAGER: 'manager',
  BROADCAST: 'broadcast'
};

/**
 * Name of the events linked to a promise
 * @readonly
 * @enum {string}
 */
const RESPONSE_ENUM = {
  DONE: 'done',
  ERROR: 'error'
};

/**
 * USB events
 * @readonly
 * @enum {string}
 */
const USBEVENT_ENUM = {
  ADD: 'add',
  REMOVE: 'remove'
};