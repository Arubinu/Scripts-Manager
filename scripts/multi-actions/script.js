const fs = require('node:fs'),
  path = require('node:path'),
  https = require('node:https'),
  ws = require('ws'),
  temp = require('temp'),
  socket = require('dgram'),
  { request } = require('undici'),
  child_process = require('child_process'),
  StreamTransform = require('stream').Transform,
  { MessageEmbed, MessageAttachment, WebhookClient } = require('discord.js');

const VARIABLE_TYPE = Object.freeze({
  GLOBALS: 0,
  LOCALS: 1,
  NEXT: 2
});

let _cmd = '',
  _apps = { launched: {}, init: false },
  _config = {},
  _sender = null,
  _variables = {
    globals: {},
    locals: {}
  };

const functions = {
  get_state: (state, on, toggle, off) => {
    if (state === 'on') {
      return on;
    } else if (state === 'off') {
      return off;
    }

    return toggle;
  },
  get_applications: () => new Promise((resolve, reject) => {
    if (!_cmd) {
      return reject('cmd not found');
    }

    let apps = [];
    child_process.spawn(_cmd, ['/c', 'wmic', 'process', 'get', 'ProcessID,Name,ExecutablePath'], {}).stdout
      .on('data', _data => {
        for (let ps of _data.toString().split('\n').slice(1)) {
          ps = ps.trim().split('  ').filter(Boolean);
          if (ps.length >= 2) {
            apps.push({
              id: parseInt(ps.slice(-1)[0].trim()),
              name: path.parse(ps.slice(-2)[0].trim()).name,
              path: ps.slice(0, -2).join(' ').trim()
            });
          }
        }
      })
      .on('end', _data => {
        resolve(apps);
      });
  }),
  load_file: (name, data) => new Promise((resolve, reject) => {
    https.request(data, response => {
      const sdata = new StreamTransform();

      response.on('data', chunk => {
        sdata.push(chunk);
      });

      response.on('end', () => {
        const file_path = path.join(temp.mkdirSync(), (name + '.' + response.headers['content-type'].split('/')[1]));
        fs.writeFileSync(file_path, sdata.read());

        resolve(file_path);
      });
    }).end();
  }),
  copy_file: (name, data) => {
    const file_path = path.join(temp.mkdirSync(), (name + path.extname(data)));
    fs.copyFileSync(data, file_path);

    return file_path;
  },
  date_to_vars: (date, prefix, type, module_name, next_data) => {
    if (typeof date === 'string') {
      date = new Date(date);
    }

    set_variable(`${prefix ? (prefix + ':') : ''}date`, date.toString(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}date:locale`, date.toLocaleDateString(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}date:year`, date.getFullYear(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}date:month`, date.getMonth(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}date:day`, date.getDate(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}date:utc:year`, date.getUTCFullYear(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}date:utc:month`, date.getUTCMonth(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}date:utc:day`, date.getUTCDate(), type, module_name, next_data);

    set_variable(`${prefix ? (prefix + ':') : ''}time`, Math.floor(date.getTime() / 1000), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:timezone:offset`, date.getTimezoneOffset(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:locale`, date.toLocaleTimeString(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:hours`, date.getHours(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:minutes`, date.getMinutes(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:seconds`, date.getSeconds(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:utc:hours`, date.getUTCHours(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:utc:minutes`, date.getUTCMinutes(), type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:utc:seconds`, date.getUTCSeconds(), type, module_name, next_data);
  },
  twitch_compare: (module_name, receive, data, next_data, next, name, arg, simple, force_receive) => {
    if (receive.id === 'twitch' && receive.name === name && typeof data !== 'undefined') {
      force_receive = ((typeof force_receive === 'function') ? force_receive() : (receive.data.message || ''));

      let check = !data[arg] || force_receive.toLowerCase() === data[arg].toLowerCase();
      if (!simple) {
        const msg_compare = data.case ? data[arg] : data[arg].toLowerCase(),
          msg_receive = data.case ? force_receive : force_receive.toLowerCase();

        check = !msg_compare || (data.contains && msg_receive.indexOf(msg_compare) >= 0) || (!data.contains && msg_compare === msg_receive);
      } else if (name.toLowerCase() === 'command') {
        check = !force_receive.indexOf(data[arg]);
      }

      if (check && typeof data.name === 'string' && typeof receive.data.user !== 'undefined' && typeof receive.data.user.name === 'string') {
        if (data.user.length && receive.data.user.name.toLowerCase() !== data.user.toLowerCase()) {
          check = false;
        }
      }

      if (check) {
        const flags = receive.data.flags,
          viewer = (!flags || (!flags.broadcaster && !flags.moderator && !flags.vip && !flags.founder && !flags.subscriber && !flags.follower));

        let check = (typeof data.viewer === 'undefined');
        check = check || (data.broadcaster && flags && flags.broadcaster);
        check = check || (data.moderator && flags && flags.moderator);
        check = check || (data.vip && flags && flags.vip);
        check = check || (data.founder && flags && flags.founder);
        check = check || (data.subscriber && flags && flags.subscriber);
        check = check || (data.follower && flags && flags.follower);
        check = check || (data.viewer && viewer);

        if (check) {
          set_variable('twitch:message:id', receive.data.id, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('twitch:message:type', receive.data.type, VARIABLE_TYPE.NEXT, module_name, next_data);
          functions.date_to_vars(receive.data.date, 'twitch:message', VARIABLE_TYPE.NEXT, module_name, next_data);

          for (const key in receive.data.user) {
            set_variable(`twitch:user:${key}`, receive.data.user[key], VARIABLE_TYPE.NEXT, module_name, next_data);
          }
          set_variable(`twitch:user:color`, receive.data.color, VARIABLE_TYPE.NEXT, module_name, next_data);

          if (receive.data.flags) {
            for (const key in receive.data.flags) {
              set_variable(`twitch:flags:${key}`, receive.data.flags[key], VARIABLE_TYPE.NEXT, module_name, next_data);
            }
          }

          set_variable(`twitch:bits`, receive.data.bits, VARIABLE_TYPE.NEXT, module_name, next_data);
          for (const key in receive.data.reward) {
            set_variable(`twitch:reward:${key}`, receive.data.reward[key], VARIABLE_TYPE.NEXT, module_name, next_data);
          }

          if (arg === 'message') {
            set_variable('twitch:message', force_receive.toString(), VARIABLE_TYPE.NEXT, module_name, next_data);
          }

          if (name.toLowerCase() === 'command') {
            const command = data[arg],
              args = force_receive.substr(command.length).trim(),
              split = args.split(' ');

            set_variable('twitch:command', command, VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('twitch:command:arguments', args, VARIABLE_TYPE.NEXT, module_name, next_data);
            for (let i = 0; i < split.length; ++i) {
              set_variable(`twitch:command:argument[${i}]`, split[i], VARIABLE_TYPE.NEXT, module_name, next_data);
            }
          }

          next();
        }
      }
    }
  }
};

const specials = [
  'obs-studio-streaming',
  'obs-studio-studio-mode',
  'obs-studio-switch-scene',
  'obs-studio-virtualcam',
  'twitch-emote-only',
  'twitch-followers-only',
  'twitch-host',
  'twitch-info',
  'twitch-slow',
  'twitch-subs-only',
  'twitch-unique-message',
  'obs-studio-authentification',
  'obs-studio-connection',
  'obs-studio-recording',
  'obs-studio-replay'
];

const actions = {
  'outputs-app-status': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'manager' && receive.name === 'app') {
      if ((receive.data.type === 'add' && data.state) || (receive.data.type === 'remove' && !data.state)) {
        if (receive.data.application.path === data.program) {
          set_variable('app-status:id', receive.data.application.id, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('app-status:name', receive.data.application.name, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('app-status:path', receive.data.application.path, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('app-status:lanched', data.state, VARIABLE_TYPE.NEXT, module_name, next_data);

          next();
        }
      }
    }
  },
  'inputs-audio-play': (module_name, receive, data, next_data, next) => {
    if (data.file) {
      _sender('manager', 'audio:play', data);
    }
  },
  'inputs-audio-stop': (module_name, receive, data, next_data, next) => {
    _sender('manager', 'audio:stop');
  },
  'both-cooldown': (module_name, receive, data, next_data, next) => {
    if (data.seconds > 0) {
      let value = get_variable(data.variable, 0, module_name, next_data);
      if (typeof value !== 'number') {
        value = 0;
      }

      let time = data.seconds;
      if (data.number_unit === 'seconds') {
        time *= 1000;
      } else if (data.number_unit === 'minutes') {
        time *= 60000;
      }

      const now = Date.now();
      if (!value || (value + time) < now) {
        set_variable(data.variable, now, VARIABLE_TYPE.NEXT, module_name, next_data);
        next();
      }
    }
  },
  'both-http-request': (module_name, receive, data, next_data, next) => {
    const url = apply_variables(data.url, module_name, next_data);
    if (url.trim().length && data.method) {
      request(url, { method: data.method.toUpperCase() })
        .then(async req => {
          set_variable('http-request:status', req.statusCode, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('http-request:body', await req.body.text(), VARIABLE_TYPE.NEXT, module_name, next_data);

          next();
        });
    }
  },
  'inputs-kill-app': (module_name, receive, data, next_data, next) => {
    if (!_cmd) {
      return;
    }

    child_process.spawn(_cmd, ['/c', 'wmic', 'process', 'get', 'ProcessID,ExecutablePath'], {})
      .stdout.on('data', _data => {
        for (let ps of _data.toString().split('\n').slice(1)) {
          ps = ps.trim().split('  ').filter(Boolean);
          if (ps.length >= 2) {
            ps = {
              id: ps.slice(-1)[0].trim(),
              path: ps.slice(0, -1).join(' ').trim()
            };

            if (ps.path === data.program) {
              process.kill(ps.id, 'SIGKILL');
            }
          }
        }
      });
  },
  'both-launch-app': (module_name, receive, data, next_data, next) => {
    if (!_cmd) {
      return;
    }

    child_process.spawn(_cmd, ['/c', 'start', '', data.program], {
      cwd: path.dirname(data.program),
    })
      .on('close', exit_code => {
        next();
      })
      .on('error', error => {
        console.error('launch-app:', data, error);
      });
  },
  'inputs-notification': (module_name, receive, data, next_data, next) => {
    const icon = apply_variables(data.icon, module_name, next_data) || get_variable('notification:icon', '', module_name, next_data),
      title = apply_variables(data.title, module_name, next_data),
      message = apply_variables(data.message, module_name, next_data);

    let duration = parseInt(data.duration);
    if (!isNaN(duration) && duration > 0) {
      if (data.number_unit === 'seconds') {
        duration *= 1000;
      } else if (data.number_unit === 'minutes') {
        duration *= 60000;
      }
    } else {
      duration = 0;
    }

    if (message.trim().length) {
      _sender('notifications', 'ShowNotification', [message, title, ((typeof icon === 'string' && icon.trim().length) ? icon : false), duration]);
    }
  },
  'inputs-open-url': (module_name, receive, data, next_data, next) => {
    if (!_cmd) {
      return;
    }

    let address = apply_variables(data.address, module_name, next_data);
    if (address.trim().length) {
      if (address.indexOf('://') < 0) {
        address = 'https://' + address;
      }

      child_process.spawn(_cmd, ['/c', 'explorer', address], {
        cmd: process.env.USERPROFILE,
        detached: true
      })
        .on('close', () => {
          next();
        })
        .on('error', error => {
          console.error('open-url:', data, error);
        });
    }
  },
  'outputs-launch': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'multi-actions' && receive.name === 'launch') {
      next();
    }
  },
  'both-self-timer': (module_name, receive, data, next_data, next) => {
    if (data.millis > 0) {
      let time = data.millis;
      if (data.number_unit === 'seconds') {
        time *= 1000;
      } else if (data.number_unit === 'minutes') {
        time *= 60000;
      }

      setTimeout(next, time);
    }
  },
  'both-socket-request': (module_name, receive, data, next_data, next) => {
    const host = apply_variables(data.host, module_name, next_data),
      _data = apply_variables(data.data, module_name, next_data);

    if (host.trim().length && data.port && _data.trim().length) {
      const tdata = Buffer.from(_data),
        client = socket.createSocket('udp4');

      client.send(tdata, parseInt(data.port), host, error => {
        if (error) {
          console.error('socket-request error:', error);
        }

        client.close();

        if (!error) {
          next();
        }
      });
    }
  },
  'outputs-toggle-block': (module_name, receive, data, next_data, next) => {
    const id = parseInt(data.id) || 0;
    if (receive.id === 'multi-actions' && receive.name === 'toggle-block' && (!id || id === receive.data.id)) {
      if (data.state === 'toggle' || receive.data.enabled === (data.state === 'on')) {
        next();
      }
    }
  },
  'inputs-toggle-block': (module_name, receive, data, next_data, next) => {
    const node = _config.actions[module_name].data[parseInt(data.id)];
    if (typeof node !== 'undefined') {
      if (data.state === 'toggle') {
        node.data.data.enabled = !(typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled);
      } else {
        node.data.data.enabled = (data.state === 'on');
      }

      _sender('message', 'toggle-block', { id: node.id, module: module_name, enabled: node.data.data.enabled });
    }
  },
  'outputs-usb-detection': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'manager' && receive.name === 'usb') {
      if ((receive.data.type === 'add' && data.state) || (receive.data.type === 'remove' && !data.state)) {
        if (!data.device || (receive.data.device.productName === data.device)) {
          set_variable('usb-detection:name', receive.data.device.productName, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('usb-detection:manufacturer', receive.data.device.manufacturerName, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('usb-detection:serial', receive.data.device.serialNumber, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('usb-detection:connected', data.state, VARIABLE_TYPE.NEXT, module_name, next_data);

          next();
        }
      }
    }
  },
  'both-variable-condition': (module_name, receive, data, next_data, next) => {
    const type = functions.get_state(data.type, 'string', 'number', 'boolean'),
      condition = data.condition,
      precondition = condition.replace('not-', '');

    if (!condition.length) {
      return;
    }

    let check = false;
    let value1 = apply_variables(data['value-1'], module_name, next_data);
    let value2 = '';
    switch (type) {
      case 'string':
        value2 = apply_variables(data.string, module_name, next_data);

        if (precondition === 'equal') {
          check = value1 === value2;
        } else if (precondition === 'contains') {
          check = value1.indexOf(value2) >= 0;
        } else if (precondition === 'starts-with') {
          check = !value1.indexOf(value2);
        }

        break;
      case 'number':
        value1 = parseFloat(value1);
        value2 = parseFloat(data.number);

        if (isNaN(value1)) {
          return;
        }

        if (precondition === 'equal') {
          check = value1 === value2;
        } else if (precondition === 'greater' || precondition === 'less-or-equal') {
          check = value1 > value2;
        } else if (precondition === 'greater-or-equal' || precondition === 'less') {
          check = value1 >= value2;
        }

        break;
      case 'boolean':
        value1 = ((['false', 'true'].indexOf(value1) >= 0) ? (value1 === 'true') : null);
        value2 = (data.boolean === 'true');

        if (value1 === null) {
          return;
        }

        if (precondition === 'equal') {
          check = value1 === value2;
        }

        break;
    }

    if (!condition.indexOf('not-') || !condition.indexOf('less-')) {
      check = !check;
    }

    if (check) {
      next();
    }
  },
  'both-variable-increment': (module_name, receive, data, next_data, next) => {
    let value = get_variable(data.variable, undefined, module_name, next_data);
    if (typeof value === 'undefined') {
      value = 0;
    }
    if (typeof value === 'number') {
      value += parseInt(data.number);
      set_variable(data.variable, value, scope(data), module_name, next_data);
    }

    next();
  },
  'both-variable-remove': (module_name, receive, data, next_data, next) => {
    const _scope = scope(data);

    let target = next_data;
    if (_scope === VARIABLE_TYPE.GLOBALS) {
      target = _variables.globals;
    } else if (_scope === VARIABLE_TYPE.LOCALS) {
      target = _variables.locals[module_name];
    }

    if (typeof target !== 'undefined' && typeof target[data.variable] !== 'undefined') {
      delete target[data.variable];
    }

    next();
  },
  'both-variable-replace': (module_name, receive, data, next_data, next) => {
    const search = apply_variables(data.search, module_name, next_data),
      replace = apply_variables(data.replace, module_name, next_data);

    let value = apply_variables(data.value, module_name, next_data);
    if (data.all) {
      value = value.replaceAll(search, replace);
    } else {
      value = value.replace(search, replace);
    }

    set_variable(data.variable, value, scope(data), module_name, next_data);
    next();
  },
  'both-variable-setter': (module_name, receive, data, next_data, next) => {
    const type = functions.get_state(data.type, 'string', 'number', 'boolean');

    let value = '';
    switch (type) {
      case 'string': value = apply_variables(data.string, module_name, next_data); break;
      case 'number': value = parseFloat(data.number); break;
      case 'boolean': value = (data.boolean === 'true'); break;
    }

    set_variable(data.variable, value, scope(data), module_name, next_data);
    next();
  },
  'both-websocket-request': (module_name, receive, data, next_data, next) => {
    const url = apply_variables(data.url, module_name, next_data),
      _data = apply_variables(data.data, module_name, next_data);

    if (url.trim().length && _data.trim().length) {
      let tdata = _data;
      try {
        tdata = JSON.parse(tdata);
      } catch (e) {}

      const client = new ws(url);
      client.on('error', error => console.error('websocket-request error:', error));

      client.onopen = () => {
        client.send(tdata, () => {
          client.close();

          next();
        });
      };
    }
  },
  'inputs-discord-webhook-embed': async (module_name, receive, data, next_data) => {
    const big_image = apply_variables(data['big-image'], module_name, next_data) || get_variable('discord:big-image', '', module_name, next_data),
      thumbnail = apply_variables(data.thumbnail, module_name, next_data) || get_variable('discord:thumbnail', '', module_name, next_data);

    let texts = {};
    for (const name of ['title', 'url', 'message', 'inline-1-title', 'inline-1-content', 'inline-2-title', 'inline-2-content']) {
      texts[name] = apply_variables(data[name], module_name, next_data);
    }

    if (data.webhook && texts.title.trim().length) {
      let big_image_path = '';
      if (typeof big_image === 'string' && big_image.trim().length) {
        try {
          if (big_image.indexOf('://') >= 0) {
            big_image_path = await functions.load_file('big_image', big_image);
          } else if (fs.existsSync(big_image)) {
            big_image_path = functions.copy_file('big_image', big_image);
          }
        } catch (e) {}
      }

      let thumbnail_path = '';
      if (typeof thumbnail === 'string' && thumbnail.trim().length) {
        try {
          if (thumbnail.indexOf('://') >= 0) {
            thumbnail_path = await functions.load_file('thumbnail', thumbnail);
          } else if (fs.existsSync(thumbnail)) {
            thumbnail_path = functions.copy_file('thumbnail', thumbnail);
          }
        } catch (e) {}
      }

      const webhook = new WebhookClient({ url: data.webhook }),
        embed = new MessageEmbed()
          .setColor('#c0392b')
          .setTitle(texts.title);

      let images = [];
      if (big_image_path) {
        images.push(new MessageAttachment(big_image_path));
      }
      if (thumbnail_path) {
        images.push(new MessageAttachment(thumbnail_path));
      }

      if (texts.url) {
        embed.setURL(texts.url);
      }
      if (big_image_path) {
        embed.setImage('attachment://' + encodeURI(path.basename(big_image_path)));
      }
      if (thumbnail_path) {
        embed.setThumbnail('attachment://' + path.basename(thumbnail_path));
      }
      if (texts['inline-1-title'].trim().length && texts['inline-1-content'].trim().length) {
        embed.addField(texts['inline-1-title'], texts['inline-1-content'], true);
      }
      if (texts['inline-2-title'].trim().length && texts['inline-2-content'].trim().length) {
        embed.addField(texts['inline-2-title'], texts['inline-2-content'], true);
      }

      let parse = [];
      if (texts.message && texts.message.indexOf('@everyone') >= 0) {
        parse.push('everyone');
      }

      webhook.send({ content: (texts.message || ''), embeds: [embed], files: images, allowed_mentions: { parse: ['everyone'] } });
    }
  },
  'inputs-discord-webhook-message': async (module_name, receive, data, next_data) => {
    const message = apply_variables(data.message, module_name, next_data);
    if (data.webhook && message.trim().length) {
      const webhook = new WebhookClient({ url: data.webhook });

      let parse = [];
      if (message.indexOf('@everyone') >= 0) {
        parse.push('everyone');
      }

      webhook.send({ content: message, embeds: [], files: [], allowed_mentions: { parse: ['everyone'] } });
    }
  },
  'outputs-obs-studio-authentification': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && ['AuthenticationSuccess', 'AuthenticationFailure'].indexOf(receive.name) >= 0) {
      const state = (receive.name === 'AuthenticationSuccess');
      set_variable('obs-studio:authentification', state, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && state === data.state) {
        next();
      }
    }
  },
  'outputs-obs-studio-connection': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && ['ConnectionOpened', 'ConnectionClosed'].indexOf(receive.name) >= 0) {
      const state = (receive.name === 'ConnectionOpened');
      set_variable('obs-studio:connection', state, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && state === data.state) {
        next();
      }
    }
  },
  'outputs-obs-studio-exit': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'ExitStarted') {
      next();
    }
  },
  'outputs-obs-studio-recording': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'RecordStateChanged' && ['OBS_WEBSOCKET_OUTPUT_STARTED', 'OBS_WEBSOCKET_OUTPUT_STOPPED'].indexOf(receive.data.outputState) >= 0) {
      const state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED');
      set_variable('obs-studio:recording', state, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && data.state === state) {
        next();
      }
    }
  },
  'inputs-obs-studio-recording': (module_name, receive, data, next_data) => {
    const state = functions.get_state(data.state, 'StartRecord', 'ToggleRecord', 'StopRecord');
    _sender('obs-studio', state);
  },
  'outputs-obs-studio-replay': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'ReplayBufferStateChanged' && ['OBS_WEBSOCKET_OUTPUT_STARTED', 'OBS_WEBSOCKET_OUTPUT_STOPPED'].indexOf(receive.data.outputState) >= 0) {
      const state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED');
      set_variable('obs-studio:replay', state, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && data.state === state) {
        next();
      }
    }
  },
  'inputs-obs-studio-replay': (module_name, receive, data, next_data) => {
    const state = functions.get_state(data.state, 'StartReplayBuffer', 'ToggleReplayBuffer', 'StopReplayBuffer');
    _sender('obs-studio', state);
  },
  'outputs-obs-studio-save-replay': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'ReplayBufferSaved') {
      next();
    }
  },
  'inputs-obs-studio-save-replay': (module_name, receive, data, next_data) => {
    _sender('obs-studio', 'SaveReplayBuffer');
  },
  'inputs-obs-studio-set-text': (module_name, receive, data, next_data) => {
    if (data.source) {
      _sender('obs-studio', 'SetSourceSettings', [data.source, { text: apply_variables(data.text, module_name, next_data) }, false]);
    }
  },
  'outputs-obs-studio-streaming': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'StreamStateChanged' && ['OBS_WEBSOCKET_OUTPUT_STARTED', 'OBS_WEBSOCKET_OUTPUT_STOPPED'].indexOf(receive.data.outputState) >= 0) {
      const state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED');
      set_variable('obs-studio:streaming', state, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && data.state === state) {
        next();
      }
    }
  },
  'inputs-obs-studio-streaming': (module_name, receive, data, next_data) => {
    const state = functions.get_state(data.state, 'StartStream', 'ToggleStream', 'StopStream');
    _sender('obs-studio', state);
  },
  'outputs-obs-studio-studio-mode': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'StudioModeStateChanged') {
      set_variable('obs-studio:studio-mode', receive.data.studioModeEnabled, VARIABLE_TYPE.GLOBALS);

      if (data.state === receive.data.studioModeEnabled) {
        next();
      }
    }
  },
  'inputs-obs-studio-studio-mode': (module_name, receive, data, next_data) => {
    const state = functions.get_state(data.state, true, undefined, false);
    _sender('obs-studio', 'ToggleStudioMode', [state]);
  },
  'outputs-obs-studio-switch-scene': (module_name, receive, data, next_data, next) => {
    if (data.scene && receive.id === 'obs-studio' && receive.name === 'CurrentProgramSceneChanged') {
      set_variable('obs-studio:switch-scene', receive.data.sceneName, VARIABLE_TYPE.GLOBALS);

      if (!data.scene || receive.data.sceneName.toLowerCase() === data.scene.toLowerCase()) {
        next();
      }
    }
  },
  'inputs-obs-studio-switch-scene': (module_name, receive, data, next_data) => {
    if (data.scene) {
      _sender('obs-studio', 'SetCurrentScene', [data.scene]);
    }
  },
  'outputs-obs-studio-source-selected': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'SceneItemSelected') {
      const _next = () => {
        set_variable('obs-studio:source-selected:id', receive.data.sceneItemId, VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable('obs-studio:source-selected:name', receive.data.sceneName, VARIABLE_TYPE.NEXT, module_name, next_data);

        next();
      };

      if (data.scene && data.source) {
        _sender('obs-studio', 'GetSceneItemId', { sceneName: data.scene, sourceName: data.source }).then(_data => {
          if (data.scene === receive.data.sceneName && _data && _data.sceneItemId === receive.data.sceneItemId) {
            _next();
          }
        }).catch(error => {});
      } else {
        _next();
      }
    }
  },
  'outputs-obs-studio-lock-source': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'SceneItemLockStateChanged') {
      const _next = () => {
        if (data.state === receive.data.sceneItemLocked) {
          set_variable('obs-studio:lock-source:id', receive.data.sceneItemId, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('obs-studio:lock-source:name', receive.data.sceneName, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('obs-studio:lock-source:locked', receive.data.sceneItemLocked, VARIABLE_TYPE.NEXT, module_name, next_data);

          next();
        }
      };

      if (data.scene && data.source) {
        _sender('obs-studio', 'GetSceneItemId', { sceneName: data.scene, sourceName: data.source })
          .then(_data => {
            if (data.scene === receive.data.sceneName && _data && _data.sceneItemId === receive.data.sceneItemId) {
              _next();
            }
          })
          .catch(error => {});
      } else {
        _next();
      }
    }
  },
  'inputs-obs-studio-lock-source': (module_name, receive, data, next_data) => {
    if (data.scene && data.source) {
      const state = functions.get_state(data.state, true, undefined, false);
      _sender('obs-studio', 'LockSource', [data.source, data.scene, state]);
    }
  },
  'outputs-obs-studio-toggle-source': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'SceneItemEnableStateChanged') {
      const _next = () => {
        if (data.state === receive.data.sceneItemEnabled) {
          set_variable('obs-studio:toggle-source:id', receive.data.sceneItemId, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('obs-studio:toggle-source:name', data.source, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('obs-studio:toggle-source:scene', receive.data.sceneName, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('obs-studio:toggle-source:enabled', receive.data.sceneItemEnabled, VARIABLE_TYPE.NEXT, module_name, next_data);

          next();
        }
      };

      if (data.scene && data.source) {
        _sender('obs-studio', 'GetSceneItemId', { sceneName: data.scene, sourceName: data.source })
          .then(_data => {
            if (data.scene === receive.data.sceneName && _data && _data.sceneItemId === receive.data.sceneItemId) {
              _next();
            }
          })
          .catch(error => {});
      } else {
        _next();
      }
    }
  },
  'inputs-obs-studio-toggle-source': (module_name, receive, data, next_data) => {
    if (data.scene && data.source) {
      const state = functions.get_state(data.state, true, undefined, false);
      _sender('obs-studio', 'ToggleSource', [data.source, data.scene, state]);
    }
  },
  'outputs-obs-studio-toggle-filter': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'SourceFilterEnableStateChanged') {
      const _next = () => {
        if (data.state === receive.data.filterEnabled) {
          set_variable('obs-studio:toggle-filter:name', receive.data.filterName, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('obs-studio:toggle-filter:source', receive.data.sourceName, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('obs-studio:toggle-filter:enabled', receive.data.filterEnabled, VARIABLE_TYPE.NEXT, module_name, next_data);

          next();
        }
      };

      if (data.source && data.filter) {
        if (data.source === receive.data.sourceName && data.filter === receive.data.filterName) {
          _next();
        }
      } else {
        _next();
      }
    }
  },
  'inputs-obs-studio-toggle-filter': (module_name, receive, data, next_data) => {
    if (data.source && data.filter) {
      const state = functions.get_state(data.state, true, undefined, false);
      _sender('obs-studio', 'ToggleFilter', [data.filter, data.source, state]);
    }
  },
  'outputs-obs-studio-virtualcam': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'VirtualcamStateChanged' && ['OBS_WEBSOCKET_OUTPUT_STARTED', 'OBS_WEBSOCKET_OUTPUT_STOPPED'].indexOf(receive.data.outputState) >= 0) {
      const state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED');
      set_variable('obs-studio:virtualcam', state, VARIABLE_TYPE.GLOBALS);

      if (data.state === state) {
        next();
      }
    }
  },
  'inputs-obs-studio-virtualcam': (module_name, receive, data, next_data) => {
    const state = functions.get_state(data.state, 'StartVirtualCam', 'ToggleVirtualCam', 'StopVirtualCam');
    _sender('obs-studio', state);
  },
  'both-spotify-search': (module_name, receive, data, next_data, next) => {
    const track = apply_variables(data.track, module_name, next_data);
    if (track.trim().length) {
      _sender('spotify', 'Search', [track])
        .then(tracks => {
          set_variable('spotify:search:total', tracks.length, VARIABLE_TYPE.NEXT, module_name, next_data);

          if (tracks.length) {
            for (let i = 0; i < tracks.length; ++i) {
              const track = tracks[i];

              set_variable(`spotify:search[${i}]:name`, track.name, VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable(`spotify:search[${i}]:type`, track.type, VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable(`spotify:search[${i}]:uri`, track.uri, VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable(`spotify:search[${i}]:link`, track.external_urls.spotify, VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable(`spotify:search[${i}]:image`, track.preview_url, VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable(`spotify:search[${i}]:duration`, track.duration_ms, VARIABLE_TYPE.NEXT, module_name, next_data);

              let artists = [];
              for (let j = 0; j < track.artists.length; ++j) {
                artists.push(track.artists[j].name);
                set_variable(`spotify:search[${i}]:artist[${j}]:name`, track.artists[j].name, VARIABLE_TYPE.NEXT, module_name, next_data);
                set_variable(`spotify:search[${i}]:artist[${j}]:uri`, track.artists[j].uri, VARIABLE_TYPE.NEXT, module_name, next_data);
                set_variable(`spotify:search[${i}]:artist[${j}]:link`, track.artists[j].external_urls.spotify, VARIABLE_TYPE.NEXT, module_name, next_data);
              }
              set_variable(`spotify:search[${i}]:artists:name`, artists.join(', '), VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable(`spotify:search[${i}]:artists:total`, artists.length, VARIABLE_TYPE.NEXT, module_name, next_data);
            }
          } else {
            set_variable('spotify:search[0]:name', '', VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:type', '', VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:uri', '', VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:link', '', VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:image', '', VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:duration', 0, VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:artist[0]:name', '', VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:artist[0]:uri', '', VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:artist[0]:link', '', VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:artists:name', '', VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('spotify:search[0]:artists:total', 0, VARIABLE_TYPE.NEXT, module_name, next_data);
          }

          next();
        });
    }
  },
  'inputs-spotify-add-to-queue': (module_name, receive, data, next_data, next) => {
    const track = apply_variables(data.track, module_name, next_data) || get_variable('spotify:search[0]:uri', '', module_name, next_data);
    if (typeof track === 'string' && track.trim().length) {
      _sender('spotify', 'AddToQueue', [track]);
    }
  },
  'inputs-spotify-play-pause': (module_name, receive, data, next_data, next) => {
    const track = apply_variables(data.track, module_name, next_data) || get_variable('spotify:search[0]:uri', '', module_name, next_data),
      play_pause = play => {
        if (play) {
          _sender('spotify', 'PlayNow', [(typeof track === 'string' && track.trim().length) ? track : false]);
        } else {
          _sender('spotify', 'PauseNow');
        }
      };

    if (['on', 'off'].indexOf(data.state) < 0) {
      _sender('spotify', 'isPlaying').then(is_playing => {
        play_pause(!is_playing, track);
      });
    } else {
      play_pause(data.state === 'on');
    }
  },
  'inputs-spotify-prev-next': (module_name, receive, data, next_data, next) => {
    _sender('spotify', (data.state ? 'skipToPrevious' : 'skipToNext'));
  },
  'inputs-spotify-repeat': (module_name, receive, data, next_data, next) => {
    const state = functions.get_state(data.state, 'off', 'track', 'context');
    _sender('spotify', 'setRepeat', [state]);
  },
  'inputs-spotify-shuffle': (module_name, receive, data, next_data, next) => {
    if (['on', 'off'].indexOf(data.state) < 0) {
      _sender('spotify', 'isShuffle').then(is_shuffle => {
        _sender('spotify', 'setShuffle', [!is_shuffle]);
      });
    } else {
      _sender('spotify', 'setShuffle', [data.state === 'on']);
    }
  },
  'inputs-spotify-volume': (module_name, receive, data, next_data, next) => {
    _sender('spotify', 'setVolume', [data.volume]);
  },
  'outputs-twitch-action': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Action', 'message', false),
  'inputs-twitch-action': (module_name, receive, data, next_data) => {
    const message = apply_variables(data.message, module_name, next_data);
    if (message.trim().length) {
      _sender('twitch', 'Action', { type: 'Chat', args: [message] });
    }
  },
  'outputs-twitch-announcement': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Announcement', 'message', false),
  'inputs-twitch-announce': (module_name, receive, data, next_data) => {
    const message = apply_variables(data.message, module_name, next_data);
    if (message.trim().length) {
      _sender('twitch', 'Announce', { type: 'Methods', args: [false, message] });
    }
  },
  'outputs-twitch-ban': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    set_variable('twitch:ban:user:id', receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:ban:user:name', receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:ban:user:display', receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:ban:reason', receive.data.data.reason, VARIABLE_TYPE.NEXT, module_name, next_data);
    functions.date_to_vars(receive.data.data.startDate, 'twitch:ban:start', VARIABLE_TYPE.NEXT, module_name, next_data);

    next();
  }, 'Ban', 'message', true),
  'inputs-twitch-ban': (module_name, receive, data, next_data) => {
    const user = apply_variables(data.user, module_name, next_data),
      reason = apply_variables(data.reason, module_name, next_data);

    if (user.trim().length) {
      _sender('twitch', 'Ban', { type: 'Chat', args: [user, reason] });
    }
  },
  'outputs-twitch-chat-clear': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'ChatClear') {
      next();
    }
  },
  'inputs-twitch-chat-clear': (module_name, receive, data, next_data) => {
    _sender('twitch', 'Clear', { type: 'Chat', args: [] });
  },
  'outputs-twitch-cheer': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    set_variable('twitch:cheer:bits', receive.data.data.bits, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:cheer:message', receive.data.data.message, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:cheer:anonymous', receive.data.data.isAnonymous, VARIABLE_TYPE.NEXT, module_name, next_data);

    next();
  }, 'Cheer', 'message', true),
  'outputs-twitch-command': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Command', 'command', true),
  'outputs-twitch-community-pay-forward': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'CommunityPayForward') {
      set_variable(['twitch:all:user:id', 'twitch:community-pay-forward:user:id'], (receive.data.user.id || receive.data.subscribe.forward.userId), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:community-pay-forward:user:name'], (receive.data.user.name || receive.data.subscribe.forward.displayName.toLowerCase()), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:community-pay-forward:user:display'], (receive.data.user.display || receive.data.subscribe.forward.displayName), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:community-pay-forward:original:id', receive.data.subscribe.forward.originalGifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:community-pay-forward:original:name', receive.data.subscribe.forward.originalGifterDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:community-pay-forward:original:display', receive.data.subscribe.forward.originalGifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-community-sub': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'CommunitySub') {
      set_variable(['twitch:all:user:id', 'twitch:community-sub:user:id'], receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:community-sub:user:name'], receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:community-sub:user:display'], receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:community-sub:original:id', receive.data.subscribe.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:community-sub:original:name', receive.data.subscribe.info.gifter, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:community-sub:original:display', receive.data.subscribe.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:community-sub:count', receive.data.subscribe.info.count, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:community-sub:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'inputs-twitch-delete-message': (module_name, receive, data, next_data) => {
    const all = data.type,
      message_id = get_variable('twitch:message-id', '', module_name, next_data);

    if (all || (typeof message_id === 'string' && message_id.trim().length)) {
      _sender('twitch', 'deleteMessage', { type: 'Methods', args: [false, (all ? undefined : message_id)] });
    }
  },
  'outputs-twitch-emote-only': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'EmoteOnly') {
      set_variable('twitch:emote-only:enabled', receive.data.emote_only.enabled, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.emote_only.enabled === (data.state === 'on'))) {
        next();
      }
    }
  },
  'inputs-twitch-emote-only': (module_name, receive, data, next_data) => {
    _sender('twitch', 'updateSettings', { type: 'Methods', args: [false, { emoteOnlyModeEnabled: data.state }] });
  },
  'outputs-twitch-first-message': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'obs-studio' && receive.name === 'StreamStateChanged' && receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') {
      return set_variable('twitch:users', [], VARIABLE_TYPE.GLOBALS);
    }

    const type = (typeof data.type === 'undefined' || data.type) ? 'Command' : 'Message';
    functions.twitch_compare(module_name, receive, data, next_data, () => {
      let users = get_variable('twitch:users', []);
      if (typeof users !== 'object' && !Array.isArray(users)) {
        users = [];
      }

      const all = (data.all === 'true'),
        tmp = [...users],
        user = receive.data.user.name.toLowerCase(),
        exists = tmp.indexOf(user) >= 0;

      if (!exists) {
        users.push(user);
        set_variable('twitch:users', users, VARIABLE_TYPE.GLOBALS);
      }

      if ((all && !exists) || (!all && !tmp.length)) {
        next();
      }
    }, type, type.toLowerCase(), (type === 'command'));
  },
  'outputs-twitch-follow': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    set_variable(['twitch:all:user:id', 'twitch:follow:user:id'], receive.data.data.userId, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable(['twitch:all:user:name', 'twitch:follow:user:name'], receive.data.data.displayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable(['twitch:all:user:display', 'twitch:follow:user:display'], receive.data.data.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
    functions.date_to_vars(receive.data.data.followDate, 'twitch:follow', VARIABLE_TYPE.NEXT, module_name, next_data);

    next();
  }, 'Follow', 'message', true),
  'outputs-twitch-followers-only': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'FollowersOnly') {
      set_variable('twitch:follower-only:enabled', receive.data.follower_only.enabled, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.follower_only.enabled === (data.state === 'on'))) {
        next();
      }
    }
  },
  'inputs-twitch-followers-only': (module_name, receive, data, next_data) => {
    _sender('twitch', 'updateSettings', { type: 'Methods', args: [false, { followerOnlyModeDelay: parseInt(data.delay), followerOnlyModeEnabled: data.state }] });
  },
  'both-twitch-game': (module_name, receive, data, next_data, next) => {
    const game = apply_variables(data.game, module_name, next_data)
    if (game.trim().length) {
      _sender('twitch', 'getGame', { type: 'Methods', args: [game] })
        .then(game => {
          set_variable('twitch:game:id', game.id, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('twitch:game:name', game.name, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('twitch:game:image', game.boxArtUrl, VARIABLE_TYPE.NEXT, module_name, next_data);

          next();
        });
    }
  },
  'outputs-twitch-gift-paid-upgrade': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'GiftPaidUpgrade') {
      set_variable(['twitch:all:user:id', 'twitch:gift-paid-upgrade:user:id'], (receive.data.user.id || receive.data.upgrade.info.userId), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:gift-paid-upgrade:user:name'], (receive.data.user.name || receive.data.upgrade.info.displayName.toLowerCase()), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:gift-paid-upgrade:user:display'], (receive.data.user.display || receive.data.upgrade.info.displayName), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:gift-paid-upgrade:original:id', receive.data.upgrade.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:gift-paid-upgrade:original:name', receive.data.upgrade.info.gifter, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:gift-paid-upgrade:original:display', receive.data.upgrade.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-host': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    set_variable('twitch:host:channel', receive.data.host.channel, VARIABLE_TYPE.GLOBALS);
    set_variable('twitch:host:count', receive.data.host.viewers.length, VARIABLE_TYPE.GLOBALS);

    if (typeof next !== 'undefined') {
      next();
    }
  }, 'Host', 'channel', true, () => receive.data.host.channel),
  'outputs-twitch-hosted': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    set_variable('twitch:hosted:channel', receive.data.host.channel, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:hosted:count', receive.data.host.viewers.length, VARIABLE_TYPE.NEXT, module_name, next_data);

    next();
  }, 'Hosted', 'channel', true, () => receive.data.host.channel),
  'inputs-twitch-host': (module_name, receive, data, next_data) => {
    const channel = apply_variables(data.channel, module_name, next_data);
    if (channel.trim().length) {
      _sender('twitch', 'Host', { type: 'Chat', args: [channel] });
    }
  },
  'outputs-twitch-info': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'Update') {
      _sender('twitch', 'getChannelInfo', { type: 'Methods', args: [false] })
        .then(info => {
          if (info) {
            set_variable('twitch:channel:name', info.name, VARIABLE_TYPE.GLOBALS);
            set_variable('twitch:channel:display', info.displayName, VARIABLE_TYPE.GLOBALS);
            set_variable('twitch:channel:title', info.title, VARIABLE_TYPE.GLOBALS);
            set_variable('twitch:channel:lang', info.language, VARIABLE_TYPE.GLOBALS);
            set_variable('twitch:channel:delay', info.delay, VARIABLE_TYPE.GLOBALS);

            info.getGame()
              .then(game => {
                set_variable('twitch:channel:game:id', game.id, VARIABLE_TYPE.GLOBALS);
                set_variable('twitch:channel:game:name', game.name, VARIABLE_TYPE.GLOBALS);
                set_variable('twitch:channel:game:image', game.boxArtUrl, VARIABLE_TYPE.GLOBALS);

                if (typeof next !== 'undefined') {
                  next();
                }
              })
              .catch(error => {
                set_variable('twitch:channel:game:id', receive.data.data.categoryId, VARIABLE_TYPE.GLOBALS);
                set_variable('twitch:channel:game:name', receive.data.data.categoryName, VARIABLE_TYPE.GLOBALS);
                set_variable('twitch:channel:game:image', '', VARIABLE_TYPE.GLOBALS);

                if (typeof next !== 'undefined') {
                  next();
                }
              });
          }
        })
        .catch(error => {
          set_variable('twitch:channel:title', receive.data.data.streamTitle, VARIABLE_TYPE.GLOBALS);
          set_variable('twitch:channel:lang', receive.data.data.streamLanguage, VARIABLE_TYPE.GLOBALS);
          set_variable('twitch:channel:game:id', receive.data.data.categoryId, VARIABLE_TYPE.GLOBALS);
          set_variable('twitch:channel:game:name', receive.data.data.categoryName, VARIABLE_TYPE.GLOBALS);

          next();
        });
    }
  },
  'both-twitch-info': (module_name, receive, data, next_data, next) => {
    const channel = apply_variables(data.channel, module_name, next_data).trim().toLowerCase();
    _sender('twitch', 'getChannelInfo', { type: 'Methods', args: [channel] })
      .then(info => {
        if (info) {
          set_variable('twitch:channel:name', info.name, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('twitch:channel:display', info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('twitch:channel:title', info.title, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('twitch:channel:lang', info.language, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable('twitch:channel:delay', info.delay, VARIABLE_TYPE.NEXT, module_name, next_data);

          info.getGame()
            .then(game => {
              set_variable('twitch:channel:game:id', game.id, VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable('twitch:channel:game:name', game.name, VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable('twitch:channel:game:image', game.boxArtUrl, VARIABLE_TYPE.NEXT, module_name, next_data);

              next();
            })
            .catch(error => {
              set_variable('twitch:channel:game:id', info.gameId, VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable('twitch:channel:game:name', info.gameName, VARIABLE_TYPE.NEXT, module_name, next_data);
              set_variable('twitch:channel:game:image', '', VARIABLE_TYPE.NEXT, module_name, next_data);

              next();
            });
        }
      });
  },
  'inputs-twitch-info': (module_name, receive, data, next_data) => {
    const game = apply_variables(data.game, module_name, next_data),
      status = apply_variables(data.status, module_name, next_data);

    if (status.trim().length || game.trim().length) {
      _sender('twitch', 'updateChannelInfo', { type: 'Methods', args: [false, status, game] });
    }
  },
  'outputs-twitch-message': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Message', 'message', false),
  'inputs-twitch-message': (module_name, receive, data, next_data) => {
    const message = apply_variables(data.message, module_name, next_data);
    if (message.trim().length) {
      _sender('twitch', 'Say', { type: 'Chat', args: [message] });
    }
  },
  'inputs-twitch-message-delay': (module_name, receive, data, next_data) => {
    _sender('twitch', 'updateSettings', { type: 'Methods', args: [false, { nonModeratorChatDelay: parseInt(data.delay), nonModeratorChatDelayEnabled: data.state }] });
  },
  'outputs-twitch-message-remove': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'MessageRemove', 'message', false),
  'outputs-twitch-prime-community-gift': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'PrimeCommunityGift') {
      set_variable(['twitch:all:user:id', 'twitch:prime-community-gift:user:id'], (receive.data.user.id || receive.data.subscribe.info.userId), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:prime-community-gift:user:name'], (receive.data.user.name || receive.data.subscribe.info.displayName.toLowerCase()), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:prime-community-gift:user:display'], (receive.data.user.display || receive.data.subscribe.info.displayName), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:prime-community-gift:original:id', receive.data.subscribe.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:prime-community-gift:original:name', receive.data.subscribe.info.gifter, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:prime-community-gift:original:display', receive.data.subscribe.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:prime-community-gift:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-prime-paid-upgrade': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'PrimePaidUpgrade') {
      set_variable(['twitch:all:user:id', 'twitch:prime-paid-upgrade:user:id'], (receive.data.user.id || receive.data.upgrade.info.userId), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:prime-paid-upgrade:user:name'], (receive.data.user.name || receive.data.upgrade.info.displayName.toLowerCase()), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:prime-paid-upgrade:user:display'], (receive.data.user.display || receive.data.upgrade.info.displayName), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:prime-paid-upgrade:plan:id', receive.data.upgrade.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-raid': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    set_variable('twitch:raid:channel', receive.data.raid.channel, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:raid:count', receive.data.raid.info.viewerCount, VARIABLE_TYPE.NEXT, module_name, next_data);

    next();
  }, 'Raid', 'channel', true, () => receive.data.raid.channel),
  'inputs-twitch-raid': (module_name, receive, data, next_data) => {
    const channel = apply_variables(data.game, module_name, next_data);
    if (channel.trim().length) {
      _sender('twitch', 'Raid', { type: 'Chat', args: [channel] });
    }
  },
  'outputs-twitch-raid-cancel': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'RaidCancel') {
      next();
    }
  },
  'inputs-twitch-raid-cancel': (module_name, receive, data, next_data) => {
    _sender('twitch', 'Unraid', { type: 'Chat', args: [] });
  },
  'outputs-twitch-resub': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'Resub') {
      set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.userId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.displayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:message', receive.data.subscribe.info.message, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:months', receive.data.subscribe.info.months, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:plan:name', receive.data.subscribe.info.planName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:streak', receive.data.subscribe.info.streak, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:prime', receive.data.subscribe.info.isPrime, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-redemption': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    if (receive.data.reward && (!data.reward || data.reward === receive.data.reward.id)) {
      set_variable(['twitch:all:user:id', 'twitch:redemption:user:id'], receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:redemption:user:name'], receive.data.user.name.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:redemption:user:display'], receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:redemption:id', receive.data.reward.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:redemption:title', receive.data.reward.title, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:redemption:prompt', receive.data.reward.prompt, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:redemption:cost', receive.data.reward.cost, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:redemption:queued', receive.data.reward.queued, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:redemption:images:1x', receive.data.reward.images.url_1x, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:redemption:images:2x', receive.data.reward.images.url_2x, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:redemption:images:4x', receive.data.reward.images.url_4x, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  }, 'Redemption', 'message', true),
  'outputs-twitch-reward-gift': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'RewardGift') {
      set_variable(['twitch:all:user:id', 'twitch:reward:user:id'], receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:reward:user:name'], receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:reward:user:display'], receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:reward:original:id', receive.data.reward.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:reward:original:name', receive.data.reward.info.gifterDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:reward:original:display', receive.data.reward.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:reward:count', receive.data.reward.info.count, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:reward:domain', receive.data.reward.info.domain, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:reward:shared', receive.data.reward.info.gifterGiftCount, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-ritual': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    set_variable(['twitch:all:user:id', 'twitch:ritual:user:id'], receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable(['twitch:all:user:name', 'twitch:ritual:user:name'], receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable(['twitch:all:user:display', 'twitch:ritual:user:display'], receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:ritual:name', receive.data.ritual.info.ritualName, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:ritual:message', receive.data.ritual.info.message, VARIABLE_TYPE.NEXT, module_name, next_data);

    next();
  }, 'Ritual', 'user', true, () => receive.data.ritual.user),
  'outputs-twitch-slow': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'Slow') {
      set_variable('twitch:slow:enabled', receive.data.slow.enabled, VARIABLE_TYPE.GLOBALS);
      set_variable('twitch:slow:delay', receive.data.slow.delay, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.slow.enabled === (data.state === 'on'))) {
        next();
      }
    }
  },
  'inputs-twitch-slow': (module_name, receive, data, next_data) => {
    _sender('twitch', 'updateSettings', { type: 'Methods', args: [false, { slowModeDelay: parseInt(data.delay), slowModeEnabled: data.state }] });
  },
  'outputs-twitch-standard-pay-forward': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'StandardPayForward') {
      set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.recipientUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.recipientDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.recipientDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:original:id', receive.data.subscribe.info.originalGifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:original:name', receive.data.subscribe.info.originalGifterDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:original:display', receive.data.subscribe.info.originalGifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-sub': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'Subscription') {
      set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.userId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.displayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:message', receive.data.subscribe.info.message, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:months', receive.data.subscribe.info.months, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:plan:name', receive.data.subscribe.info.planName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:streak', receive.data.subscribe.info.streak, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:prime', receive.data.subscribe.info.isPrime, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-sub-extend': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'SubExtend') {
      set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.userId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.displayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:months', receive.data.subscribe.info.months, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:months:end', receive.data.subscribe.info.endMonth, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-sub-gift': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'SubGift') {
      set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.userId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.displayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:gifter:id', receive.data.subscribe.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:gifter:name', receive.data.subscribe.info.gifterDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:gifter:display', receive.data.subscribe.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:message', receive.data.subscribe.info.message, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:duration', receive.data.subscribe.info.giftDuration, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:count', receive.data.subscribe.info.gifterGiftCount, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:prime', receive.data.subscribe.info.isPrime, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:months', receive.data.subscribe.info.months, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:plan:name', receive.data.subscribe.info.planName, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:streak', receive.data.subscribe.info.streak, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:subscribe:prime', receive.data.subscribe.info.isPrime, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'outputs-twitch-subs-only': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'SubsOnly') {
      set_variable('twitch:subs-only:enabled', receive.data.subscribe_only.enabled, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.subscribe_only.enabled === (data.state === 'on'))) {
        next();
      }
    }},
  'inputs-twitch-subs-only': (module_name, receive, data, next_data) => {
    _sender('twitch', 'updateSettings', { type: 'Methods', args: [false, { subscriberOnlyModeEnabled: data.state }] });
  },
  'outputs-twitch-timeout': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    set_variable('twitch:timeout:user:id', receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:timeout:user:name', receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:timeout:user:display', receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('twitch:timeout:duration', receive.data.timeout.duration, VARIABLE_TYPE.NEXT, module_name, next_data);
    functions.date_to_vars(receive.data.data.startDate, 'twitch:timeout:start', VARIABLE_TYPE.NEXT, module_name, next_data);
    functions.date_to_vars(receive.data.data.endDate, 'twitch:timeout:end', VARIABLE_TYPE.NEXT, module_name, next_data);

    next();
  }, 'Timeout', 'user', true, () => receive.data.timeout.user),
  'inputs-twitch-timeout': (module_name, receive, data, next_data) => {
    const user = apply_variables(data.user, module_name, next_data),
      reason = apply_variables(data.reason, module_name, next_data);

    if (user.trim().length && data.duration) {
      _sender('twitch', 'Timeout', { type: 'Chat', args: [user, data.duration, reason] });
    }
  },
  'outputs-twitch-unhost': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && receive.name === 'Unhost') {
      set_variable('twitch:host:channel', '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('twitch:host:count', 0, VARIABLE_TYPE.NEXT, module_name, next_data);

      next();
    }
  },
  'inputs-twitch-unhost': (module_name, receive, data, next_data) => {
    _sender('twitch', 'UnhostOutside', { type: 'Chat', args: [] });
  },
  'outputs-twitch-unique-message': (module_name, receive, data, next_data, next) => {
    if (receive.id === 'twitch' && (receive.name === 'R9k' || receive.name === 'UniqueChat')) {
      set_variable('twitch:unique-message:enabled', receive.data.r9k.enabled, VARIABLE_TYPE.GLOBALS);

      if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.r9k.enabled === (data.state === 'on'))) {
        next();
      }
    }
  },
  'inputs-twitch-unique-message': (module_name, receive, data, next_data) => {
    _sender('twitch', 'updateSettings', { type: 'Methods', args: [false, { uniqueChatModeEnabled: data.state }] });
  },
  'outputs-twitch-whisper': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
    next();
  }, 'Whisper', 'message', false),
  'inputs-twitch-whisper': (module_name, receive, data, next_data) => {
    const user = apply_variables(data.user, module_name, next_data),
      message = apply_variables(data.message, module_name, next_data);

    if (user.trim().length && message.trim().length) {
      _sender('twitch', 'Whisper', { type: 'Chat', args: [user, message] });
    }
  },
};

function scope(data) {
  let variable_type = VARIABLE_TYPE.GLOBALS;
  variable_type = ((data.scope === 'toggle') ? VARIABLE_TYPE.LOCALS : variable_type);
  variable_type = ((data.scope === 'off') ? VARIABLE_TYPE.NEXT : variable_type);

  return variable_type;
}

function get_variable(name, base, module_name, next_data) {
  if (typeof next_data !== 'undefined' && typeof next_data[name] !== 'undefined') {
    return next_data[name];
  }

  if (typeof module_name !== 'undefined') {
    if (typeof _variables.locals[module_name] !== 'undefined' && typeof _variables.locals[module_name][name] !== 'undefined') {
      return _variables.locals[module_name][name];
    }
  }

  if (typeof _variables.globals[name] !== 'undefined') {
    return _variables.globals[name];
  }

  return base;
}

function set_variable(name, value, variable_type, module_name, next_data) {
  for (const _name of (Array.isArray(name) ? name : [name])) {
    if (variable_type === VARIABLE_TYPE.NEXT) {
      next_data[_name] = value;
    } else if (variable_type === VARIABLE_TYPE.LOCALS) {
      if (typeof _variables.locals[module_name] === 'undefined') {
        _variables.locals[module_name] = {};
      }

      _variables.locals[module_name][_name] = value;
    } else {
      _variables.globals[_name] = value;
    }
  }
}

function apply_variables(text, module_name, next_data) {
  if (typeof next_data !== 'undefined') {
    for (const name in next_data) {
      if (typeof next_data[name] !== 'undefined') {
        text = text.replaceAll(`$\{${name}}`, `${next_data[name]}`);
      }
    }
  }
  if (typeof module_name !== 'undefined' && typeof _variables.locals[module_name] === 'object') {
    for (const name in _variables.locals[module_name]) {
      if (typeof _variables.locals[module_name][name] !== 'undefined') {
        text = text.replaceAll(`$\{${name}}`, `${_variables.locals[module_name][name]}`);
      }
    }
  }

  for (const name in _variables.globals) {
    if (typeof _variables.globals[name] !== 'undefined') {
      text = text.replaceAll(`$\{${name}}`, `${_variables.globals[name]}`);
    }
  }

  return text.replace(/\$\{[^}]*}/g, '');
}

function variables_block(node, module_name, next_data, first) {
  let connections = { inputs: 0, outputs: 0 };
  for (const input_index in node.inputs) {
    connections.inputs += node.inputs[input_index].connections.length;
  }
  for (const output_index in node.outputs) {
    connections.outputs += node.outputs[output_index].connections.length;
  }

  set_variable('block:previous:id', (first ? -1 : node.id), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable('block:previous:type', (first ? '' : node.type), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable('block:previous:name', (first ? '' : node.html), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable('block:previous:title', (first ? '' : node.title), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable('block:previous:input:exists', (typeof node.inputs.input_1 !== 'undefined'), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable('block:previous:output:exists', (typeof node.outputs.output_1 !== 'undefined'), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable('block:previous:input:connections', connections.inputs, VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable('block:previous:output:connections', connections.outputs, VARIABLE_TYPE.NEXT, module_name, next_data);
}

function process_modules(id, name, data) {
  for (const module_name in _config.actions) {
    const action = _config.actions[module_name],
      receive = { id, name, data };

    let next_data = {};
    let node_types = [];
    for (const node_index in action.data) {
      const node = action.data[node_index];
      if (typeof node.type === 'string' && !node.type.indexOf('outputs-') && node_types.indexOf(node.type) < 0) {
        node_types.push(node.type);
      }

      process_block(module_name, node, next_data, receive);
    }

    for (const node_type of specials) {
      const outputs_type = `outputs-${node_type}`;
      if (node_types.indexOf(outputs_type) < 0) {
        actions[outputs_type]('', receive, {}, {});
      }
    }
  }
}

function process_block(module_name, node, next_data, receive, force) {
  receive = receive || {};
  next_data = next_data || {};

  if (!force && _config && Array.isArray(_config.settings.disabled) && _config.settings.disabled.indexOf(module_name) >= 0) {
    return;
  }

  if ((force || !Object.keys(node.inputs).length) && typeof actions[node.data.type] !== 'undefined') {
    const next = node => {
      variables_block(node, module_name, next_data);

      for (const output_index in node.outputs) {
        const output = node.outputs[output_index].connections;
        for (const connection of node.outputs[output_index].connections) {
          const node = _config.actions[module_name].data[connection.node];
          if (typeof actions[node.data.type] !== 'undefined' && (typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled)) {
            actions[node.data.type](module_name, receive, JSON.parse(JSON.stringify(node.data.data)), next_data, () => next(node));
          }
        }
      }
    };

    if (typeof actions[node.data.type] !== 'undefined' && (typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled || force)) {
      variables_block(node, module_name, next_data, true);

      actions[node.data.type](module_name, receive, JSON.parse(JSON.stringify(node.data.data)), next_data, () => next(node));
    }
  }
}

// deprecated
function node_converter(node) {
  const replacements = [
      'audio-play',
      'audio-stop',
      'toggle-block',
      'cooldown',
      'http-request',
      'socket-request',
      'websocket-request',
      'kill-app',
      'launch-app',
      'notification',
      'open-url',
      'self-timer',
      'variable-condition',
      'variable-increment',
      'variable-setter',
      'variable-remove'
    ],
    split = node.html.split('-');

  let check = true;
  if (split[0] === 'event') {
    split[0] = 'outputs';
  } else if (split[0] === 'trigger') {
    split[0] = 'inputs';
  } else if (split.join('-') === 'inputs-discord-webhook') {
    split.push('embed');
  } else {
    check = false;
  }

  if (check) {
    node.html = split.join('-');
    node.name = `${node.id}.${node.html}`;
    node.class = `block-${node.html}`;
    node.data.type = node.html;
  } else if (replacements.indexOf(node.html) >= 0) {
    const is_inputs = typeof node.inputs.input_1 !== 'undefined',
      is_outputs = typeof node.outputs.output_1 !== 'undefined';

    let prefix = 'outputs';
    if (is_inputs && is_outputs) {
      prefix = 'both';
    } else if (is_inputs) {
      prefix = 'inputs';
    }

    node.html = `${prefix}-${node.html}`;
    node.name = `${node.id}.${node.html}`;
    node.class = `block-${node.html}`;
    node.data.type = node.html;
  }
}

setInterval(() => {
  functions.get_applications()
    .then(applications => {
      let launched = [];

      const apps_keys = Object.keys(_apps.launched);
      for (const application of applications) {
        if (application.path.length) {
          if (_apps.init && apps_keys.indexOf(application.path) < 0) {
            process_modules('manager', 'app', { type: 'add', application });
          }

          launched.push(application.path);
          _apps.launched[application.path] = application;
        }
      }

      if (_apps.init) {
        const apps_keys = Object.keys(_apps.launched);
        for (const key in _apps.launched) {
          const application = _apps.launched[key];
          if (launched.indexOf(application.path) < 0) {
            process_modules('manager', 'app', { type: 'remove', application });
            delete _apps.launched[key];
          }
        }
      } else {
        _apps.init = true;
      }
    });
}, 5000);


module.exports = {
  init: (origin, config, sender) => {
    _sender = sender;
    _config = config;

    // deprecated
    for (const module_name in _config.actions) {
      for (const id in _config.actions[module_name].data) {
        node_converter(_config.actions[module_name].data[id]);
      }
    }

    for (const item of process.env.path.split(';')) {
      const program = path.join(item, 'cmd.exe');
      if (fs.existsSync(program)) {
        _cmd = program;
        break;
      }
    }

    const update_times = () => {
      const date = new Date();
      functions.date_to_vars(date, false, VARIABLE_TYPE.GLOBALS);
    };

    setTimeout(() => {
      setInterval(update_times, 1000);
      update_times();

      module.exports.receiver('multi-actions', 'launch');
    }, 1000);
  },
  receiver: (id, name, data) => {
    if (id === 'manager') {
      if (name === 'show') {
        _sender('message', 'config', _config);
      } else if (name === 'enabled') {
        _config.default.enabled = data;
      }

      return;
    } else if (id === 'message' && name === 'index') {
      if (typeof data === 'object') {
        if (data.save) {
          _config.actions = data.save;
          _sender('manager', 'config:override', _config);
        } else if (data.open) {
          if (_cmd) {
            child_process.spawn(_cmd, ['/c', 'explorer', data.open], {
              cmd: process.env.USERPROFILE,
              detached: true
            });
          }
        } else if (data.module) {
          _config.settings.module = data.module;
          _sender('manager', 'config', _config);
        } else if (data.disabled) {
          _config.settings.disabled = data.disabled;
          _sender('manager', 'config', _config);
        } else if (data.request) {
          if (data.request[1] === 'multi-actions') {
            return module.exports.receiver(...data.request.slice(1));
          }

          _sender(...data.request.slice(1)).then(_data => {
            if (_data !== null) {
              _sender('message', 'receive', { source: data.request[0], id: data.request[1], name: data.request[2], data: _data });
            }
          }).catch(error => {});
        } else if (data.test) {
          const action = _config.actions[data.test[0]];
          process_block(data.test[0], action.data[data.test[1]], false, false, true);
        } else if (data.import) {
          try {
            data = JSON.parse(fs.readFileSync(data.import.path, 'utf-8'));
            for (const id in data) {
              node_converter(data[id]);
            }

            _sender('message', 'import', data);
          } catch (e) {
            _sender('manager', 'notification', { message: 'Error while importing' });
          }
        } else if (data.export) {
          fs.writeFileSync(data.export.path, data.export.data);
        }
      }

      return;
    } else if (id === 'methods') {
      if (name === 'audio') {
        _sender('message', 'receive', { source: false, id: 'manager', name: data.name, data: data.data });
      } else if (name === 'usb') {
        if (typeof data.type === 'string' && ['add', 'remove'].indexOf(data.type) >= 0) {
          return process_modules('manager', name, data);
        }

        _sender('message', 'receive', { source: false, id: 'manager', name: data.name, data: data.data });
      }

      return;
    }

    if (_config.default.enabled) {
      process_modules(id, name, data);
    }
  }
};
