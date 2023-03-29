const tp = require('touchportal-api');
const communication = require('./communication');
const { EVENT_ENUM, ACCESS_ENUM } = require('../enums');


module.exports = function(modules, addons, scripts, options, methods) {
  let state = false;
  const server = new tp.Client();

  server.on('connected', () => {
    if (!state) {
      state = true;
      console.log('TouchPortal Connected');
    }

    let data = [];
    for (const id in scripts) {
      data.push(scripts[id].config.default.name);
    }
    server.choiceUpdate('script', data);
  });

  server.on('Action', async _data => {
    const get_state = state => {
        if (state === 'Enable') {
          return true;
        } else if (state === 'Disable') {
          return false;
        }

        return undefined;
      },
      get_script = name => {
        for (const id in scripts) {
          if (scripts[id].config.default.name === name) {
            return id;
          }
        }

        return undefined;
      },
      get_evidence = evidence => {
        const evidences = {
          'EMF Level 5': 'emf-5',
          'Fingerprints': 'fingerprints',
          'Ghost Writing': 'ghost-writing',
          'Freezing Temperatures': 'freezing-temperatures',
          'D.O.T.S Projector': 'dots-projector',
          'Ghost Orb': 'ghost-orb',
          'Spirit Box': 'spirit-box'
        };

        return evidences[evidence];
      },
      get_mode = mode => {
        if (mode === 'Found') {
          return 'on';
        } else if (mode === 'Impossible') {
          return 'off';
        }

        return 'toggle';
      };

    let data = {};
    for (const item of _data.data) {
      data[item.id] = item.value;
    }

    switch (_data.actionId) {
      case 'fr.arubinu42.action.scripts-manager.custom-request':
        modules.communication.broadcast('deckboard', 'websocket', false, (data.isJson ? JSON.parse(data.message) : data.message), true);
        break;

      case 'fr.arubinu42.action.scripts-manager.toggle-script':
        modules.communication.to_extension(EVENT_ENUM.SCRIPT, 'scripts-manager', 'deckboard', false, {
          name: 'toggle',
          method: get_script(data.script),
          data: get_state(data.state)
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.multi-actions.button':
        modules.communication.to_extension(EVENT_ENUM.SCRIPT, 'multi-actions', 'deckboard', false, {
          name: 'block',
          method: parseInt(data.id)
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.multi-actions.variable-setter.string':
      case 'fr.arubinu42.action.multi-actions.variable-setter.number':
      case 'fr.arubinu42.action.multi-actions.variable-setter.boolean':
        modules.communication.to_extension(EVENT_ENUM.SCRIPT, 'multi-actions', 'deckboard', false, {
          name: 'variable',
          method: 'set',
          data
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.notifications.corner':
        modules.communication.to_extension(EVENT_ENUM.ADDON, 'notifications', 'deckboard', false, {
          name: 'corner',
          method: data.toLowerCase()
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.notifications.next-screen':
        modules.communication.to_extension(EVENT_ENUM.ADDON, 'notifications', 'deckboard', false, {
          name: 'next-screen',
          method: 'set',
          data: true
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.stream-flash.next-screen':
        modules.communication.to_extension(EVENT_ENUM.SCRIPT, 'stream-flash', 'deckboard', false, {
          name: 'next-screen',
          method: 'set',
          data: true
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.stream-flash.pause':
        modules.communication.to_extension(EVENT_ENUM.SCRIPT, 'stream-flash', 'deckboard', false, {
          name: 'pause',
          method: 'set',
          data: get_state(data.state)
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.stream-widgets.next-screen':
        modules.communication.to_extension(EVENT_ENUM.SCRIPT, 'stream-widgets', 'deckboard', false, {
          name: 'next-screen',
          method: 'set',
          data: true
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.stream-widgets.replace-url':
        modules.communication.to_extension(EVENT_ENUM.SCRIPT, 'stream-widgets', 'deckboard', false, {
          name: 'replace-url',
          method: data.widget,
          data: data.url
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.stream-widgets.toggle-widget':
        modules.communication.to_extension(EVENT_ENUM.SCRIPT, 'stream-widgets', 'deckboard', false, {
          name: 'toggle-widget',
          method: data.widget,
          data: get_state(data.state)
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.phasmophobia.evidence':
        modules.communication.to_extension(EVENT_ENUM.BROADCAST, 'phasmophobia', 'deckboard', false, {
          name: 'evidence',
          method: get_evidence(data.evidence),
          data: get_mode(data.mode)
        }, ACCESS_ENUM.GUEST);
        break;

      case 'fr.arubinu42.action.phasmophobia.reset':
        modules.communication.to_extension(EVENT_ENUM.BROADCAST, 'phasmophobia', 'deckboard', false, {
          name: 'evidence',
          method: 'reset'
        }, ACCESS_ENUM.GUEST);
        break;
    }
  });

  server.on('disconnected', () => {
    if (state) {
      state = false;
      console.log('TouchPortal Disconnected');
    }

    setTimeout(() => {
      module.exports(...arguments);
    }, 5000);
  });

  server.connect({ pluginId: 'fr.arubinu42', disableLogs: true, exitOnClose: false });

  return {
    instance: server
  };
};
