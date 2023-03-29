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
  BROADCAST: 'broadcast',
  AUTHORIZATION: 'authorization'
};

/**
 * Type of access to communication features
 * @readonly
 * @enum {number}
 */
const ACCESS_ENUM = {
  GUEST: 0,
  ITSELF: 1,
  RENDERER: 2,
  DECKBOARD: 3,
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

module.exports = {
  TYPE_ENUM,
  EVENT_ENUM,
  ACCESS_ENUM,
  RESPONSE_ENUM,
  USBEVENT_ENUM,
};