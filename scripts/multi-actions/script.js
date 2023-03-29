const fs = require('node:fs'),
  path = require('node:path'),
  https = require('node:https'),
  child_process = require('node:child_process'),
  StreamTransform = require('node:stream').Transform,
  temp = require('temp'),
  keyevents = require('node-global-key-listener').GlobalKeyboardListener,
  sm = require('./sm-comm');

const SPECIALS = [
    'obs-studio-authentification',
    'obs-studio-connection',
    'obs-studio-recording',
    'obs-studio-replay',
    'obs-studio-streaming',
    'obs-studio-studio-mode',
    'obs-studio-switch-scene',
    'obs-studio-virtualcam',
    'streamlabs-recording',
    'streamlabs-replay',
    'streamlabs-streaming',
    'streamlabs-switch-scene',
    'twitch-emote-only',
    'twitch-followers-only',
    'twitch-info',
    'twitch-slow',
    'twitch-subs-only',
    'twitch-unique-message'
  ],
  VARIABLE_TYPE = Object.freeze({
    GLOBALS: 0,
    LOCALS: 1,
    NEXT: 2
  }),
  OUTPUT_TYPE = Object.freeze({
    SUCCESS: 'output_1',
    ERROR: 'output_2'
  });

let comm = null,
  _cmd = '',
  _variables = {
    globals: {},
    locals: {},
    queue: {},
    temp: []
  };


// Additional methods
class Additional {
  static get_state(state, on, toggle, off) {
    if (state === 'on') {
      return on;
    } else if (state === 'off') {
      return off;
    }

    return toggle;
  }

  static get_applications() {
    return new Promise((resolve, reject) => {
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
    });
  }

  static sort_keys(data) {
    const is_array = Array.isArray(data),
      prefixes = ['LEFT', 'RIGHT', 'NUMPAD', 'NUM', 'SCROLL'],
      sort = (a, b) => {
        if (a.toUpperCase().indexOf('CTRL') >= 0) {
          return -1;
        } else if (b.toUpperCase().indexOf('CTRL') >= 0) {
          return +1;
        }

        return b.length - a.length;
      };

    if (!is_array) {
      data = data.split(' ').filter(Boolean);
    }

    data = data.join(' ');

    for (const prefix of prefixes) {
      data = data.replaceAll(`${prefix} `, `${prefix}_`);
    }

    data = data.split(' ').sort(sort).join(' ');

    for (const prefix of prefixes) {
      data = data.replaceAll(`${prefix}_`, `${prefix} `);
    }

    data = data.split(' ');

    return data;
  }

  static load_file(name, data, output) {
    return new Promise((resolve, reject) => {
      const request = (url, follow) => {
          https
            .request(url, res => {
              if (!res.headers.location) {
                download(res);
              } else if (!follow) {
                request(res.headers.location, true);
              }
            })
            .on('error', reject)
            .end();
        },
        download = res => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(res);
          }

          const sdata = new StreamTransform();
          res.on('data', chunk => {
            sdata.push(chunk);
          });

          res.on('end', () => {
            const file_path = output ? name : path.join(temp.mkdirSync(), (name + '.' + res.headers['content-type'].split('/')[1]));
            fs.writeFileSync(file_path, sdata.read());

            resolve(file_path);
          });
        };

      request(data);
    });
  }

  static copy_file(name, data) {
    const file_path = path.join(temp.mkdirSync(), (name + path.extname(data)));
    fs.copyFileSync(data, file_path);

    return file_path;
  }

  static date_to_vars(date, prefix, type, module_name, next_data) {
    if (typeof date === 'string' || typeof date === 'number') {
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
  }

  static timediff_to_vars(millis, prefix, type, module_name, next_data) {
    if (typeof millis !== 'number') {
      millis = 0;
    }

    const seconds = Math.floor(millis / 1000),
      total = {
        seconds: seconds,
        minutes: Math.floor(seconds / 60),
        hours: Math.floor(seconds / 3600),
        days: Math.floor(seconds / 86400)
      },
      left = {
        seconds: total.seconds % 60,
        minutes: total.minutes % 60,
        hours: total.hours % 24,
        days: total.days
      };

    set_variable(`${prefix ? (prefix + ':') : ''}time:days`, left.days, type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:hours`, left.hours, type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:minutes`, left.minutes, type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:seconds`, left.seconds, type, module_name, next_data);

    set_variable(`${prefix ? (prefix + ':') : ''}time:total:days`, total.days, type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:total:hours`, total.hours, type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:total:minutes`, total.minutes, type, module_name, next_data);
    set_variable(`${prefix ? (prefix + ':') : ''}time:total:seconds`, total.seconds, type, module_name, next_data);
  }

  static discord_next(message, module_name, next_data, next) {
    set_variable('discord:webhook:id', message.id, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('discord:webhook:content', message.content, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('discord:webhook:channel:id', message.channel_id, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('discord:webhook:author:id', message.author.id, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('discord:webhook:author:username', message.author.username, VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('discord:webhook:author:avatar', message.author.avatar || '', VARIABLE_TYPE.NEXT, module_name, next_data);
    set_variable('discord:webhook:mention:everyone', message.mention_everyone, VARIABLE_TYPE.NEXT, module_name, next_data);

    if (message.timestamp) {
      Additional.date_to_vars(message.timestamp, 'discord:webhook:create', VARIABLE_TYPE.NEXT, module_name, next_data);
    }

    if (message.edited_timestamp) {
      Additional.date_to_vars(message.edited_timestamp, 'discord:webhook:edit', VARIABLE_TYPE.NEXT, module_name, next_data);
    }

    if (Array.isArray(message.embeds)) {
      set_variable('discord:webhook:embeds:count', message.embeds.length, VARIABLE_TYPE.NEXT, module_name, next_data);

      for (let i = 0; i < message.embeds.length; ++i) {
        const embed = message.embeds[i];

        set_variable(`discord:webhook:embed[${i}]:url`, (embed.url || ''), VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable(`discord:webhook:embed[${i}]:title`, embed.title, VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable(`discord:webhook:embed[${i}]:image`, (embed.image ? (embed.image.url || '') : ''), VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable(`discord:webhook:embed[${i}]:thumbnail`, (embed.thumbnail ? (embed.thumbnail.url || '') : ''), VARIABLE_TYPE.NEXT, module_name, next_data);

        if (Array.isArray(embed.fields)) {
          set_variable(`discord:webhook:embed[${i}]:fields:count`, embed.fields.length, VARIABLE_TYPE.NEXT, module_name, next_data);

          for (let j = 0; j < embed.fields.length; ++j) {
            const field = embed.fields[j];

            set_variable(`discord:webhook:embed[${i}]:field[${j}]:inline`, field.inline, VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable(`discord:webhook:embed[${i}]:field[${j}]:name`, field.name, VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable(`discord:webhook:embed[${i}]:field[${j}]:value`, field.value, VARIABLE_TYPE.NEXT, module_name, next_data);
          }
        } else {
          set_variable(`discord:webhook:embed[${i}]:fields:count`, 0, VARIABLE_TYPE.NEXT, module_name, next_data);
        }
      }
    } else {
      set_variable('discord:webhook:embeds:count', 0, VARIABLE_TYPE.NEXT, module_name, next_data);
    }

    next(OUTPUT_TYPE.SUCCESS);
  }

  static guilded_next(data, module_name, next_data, next) {
    if (typeof data.server === 'object') {
      set_variable('guilded:server:id', data.server.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('guilded:server:url', data.server.url, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('guilded:server:name', data.server.name, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('guilded:server:avatar', data.server.avatar, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('guilded:server:banner', data.server.banner, VARIABLE_TYPE.NEXT, module_name, next_data);
      Additional.date_to_vars(data.server.createdAt, 'guilded:server:create', VARIABLE_TYPE.NEXT, module_name, next_data);
    }

    if (typeof data.channel === 'object') {
      set_variable('guilded:channel:id', data.channel.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('guilded:channel:type', data.channel.type, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('guilded:channel:name', data.channel.name, VARIABLE_TYPE.NEXT, module_name, next_data);
      Additional.date_to_vars(data.channel.createdAt, 'guilded:channel:create', VARIABLE_TYPE.NEXT, module_name, next_data);
    }

    if (typeof data.member === 'object') {
      set_variable('guilded:user:id', data.member.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('guilded:user:name', data.member.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('guilded:user:avatar', data.member.user.avatar, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable('guilded:user:owner', data.member.user.owner, VARIABLE_TYPE.NEXT, module_name, next_data);
      Additional.date_to_vars(data.member.user.createdAt, 'guilded:user:create', VARIABLE_TYPE.NEXT, module_name, next_data);
      Additional.date_to_vars(data.member.joinedAt, 'guilded:user:join', VARIABLE_TYPE.NEXT, module_name, next_data);
    }

    next(OUTPUT_TYPE.SUCCESS);
  }

  static spotify_next(prefix, tracks, module_name, next_data, next) {
    set_variable(`${prefix}:count`, tracks.length, VARIABLE_TYPE.NEXT, module_name, next_data);

    if (tracks.length) {
      for (let i = 0; i < tracks.length; ++i) {
        const track = tracks[i];

        set_variable(`${prefix}[${i}]:name`, track.name, VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable(`${prefix}[${i}]:type`, track.type, VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable(`${prefix}[${i}]:uri`, track.uri, VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable(`${prefix}[${i}]:link`, track.external_urls.spotify, VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable(`${prefix}[${i}]:image`, track.preview_url, VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable(`${prefix}[${i}]:duration`, track.duration_ms, VARIABLE_TYPE.NEXT, module_name, next_data);

        let artists = [];
        for (let j = 0; j < track.artists.length; ++j) {
          artists.push(track.artists[j].name);
          set_variable(`${prefix}[${i}]:artist[${j}]:name`, track.artists[j].name, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable(`${prefix}[${i}]:artist[${j}]:uri`, track.artists[j].uri, VARIABLE_TYPE.NEXT, module_name, next_data);
          set_variable(`${prefix}[${i}]:artist[${j}]:link`, track.artists[j].external_urls.spotify, VARIABLE_TYPE.NEXT, module_name, next_data);
        }
        set_variable(`${prefix}[${i}]:artists:name`, artists.join(', '), VARIABLE_TYPE.NEXT, module_name, next_data);
        set_variable(`${prefix}[${i}]:artists:count`, artists.length, VARIABLE_TYPE.NEXT, module_name, next_data);
      }
    } else {
      set_variable(`${prefix}[0]:name`, '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:type`, '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:uri`, '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:link`, '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:image`, '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:duration`, 0, VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:artist[0]:name`, '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:artist[0]:uri`, '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:artist[0]:link`, '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:artists:name`, '', VARIABLE_TYPE.NEXT, module_name, next_data);
      set_variable(`${prefix}[0]:artists:count`, 0, VARIABLE_TYPE.NEXT, module_name, next_data);
    }

    next(OUTPUT_TYPE.SUCCESS);
  }

  static twitch_compare(module_name, receive, data, next_data, next, name, arg, simple, force_receive) {
    if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === name && typeof data !== 'undefined') {
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
          Additional.date_to_vars(receive.data.date, 'twitch:message', VARIABLE_TYPE.NEXT, module_name, next_data);

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
              args = force_receive.substring(command.length).trim(),
              split = args.split(' ');

            set_variable('twitch:command', command, VARIABLE_TYPE.NEXT, module_name, next_data);
            set_variable('twitch:command:arguments', args, VARIABLE_TYPE.NEXT, module_name, next_data);
            for (let i = 0; i < split.length; ++i) {
              set_variable(`twitch:command:argument[${i}]`, split[i], VARIABLE_TYPE.NEXT, module_name, next_data);
            }
          }

          return next(OUTPUT_TYPE.SUCCESS);
        }
      }
    }
  }
}

function update_interface() {
  comm.send('manager', 'interface', 'config', false, this.config);
}

function save_config() {
  comm.send('manager', 'config', 'save', false, this.config);
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

function variables_block(prefix, node, module_name, next_data, first) {
  let connections = { inputs: 0, outputs: 0 };
  for (const input_index in node.inputs) {
    connections.inputs += node.inputs[input_index].connections.length;
  }
  for (const output_index in node.outputs) {
    connections.outputs += node.outputs[output_index].connections.length;
  }

  set_variable(`${prefix}:id`, (first ? -1 : node.id), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable(`${prefix}:type`, (first ? '' : node.type), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable(`${prefix}:name`, (first ? '' : node.html), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable(`${prefix}:title`, (first ? '' : node.title), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable(`${prefix}:input:exists`, (typeof node.inputs.input_1 !== 'undefined'), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable(`${prefix}:output:exists`, (typeof node.outputs.output_1 !== 'undefined'), VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable(`${prefix}:input:connections`, connections.inputs, VARIABLE_TYPE.NEXT, module_name, next_data);
  set_variable(`${prefix}:output:connections`, connections.outputs, VARIABLE_TYPE.NEXT, module_name, next_data);
}

function get_module_block_id(id) {
  for (const module_name in this.config.actions) {
    const action = this.config.actions[module_name],
      node = action.data[id];

    if (typeof node !== 'undefined') {
      return {
        module_name,
        action,
        node
      };
    }
  }
}

function process_modules(id, name, property, data) {
  for (const module_name in this.config.actions) {
    const action = this.config.actions[module_name],
      receive = { id, name, property, data };

    let next_data = {};
    let node_types = [];
    for (const node_index in action.data) {
      const node = action.data[node_index];
      if (typeof node.type === 'string' && !node.type.indexOf('outputs-') && node_types.indexOf(node.type) < 0) {
        node_types.push(node.type);
      }

      process_block.call(this, module_name, node, next_data, receive);
    }

    for (const node_type of SPECIALS) {
      const outputs_type = `outputs-${node_type}`;
      if (node_types.indexOf(outputs_type) < 0) {
        this.actions[outputs_type].call(this, '', receive, {}, {});
      }
    }
  }
}

function process_block(module_name, node, next_data, receive, force, direct_next) {
  receive = receive || {};
  next_data = next_data || {};

  if (!force && this.config && Array.isArray(this.config.settings.disabled) && this.config.settings.disabled.indexOf(module_name) >= 0) {
    return;
  }

  if ((force || !Object.keys(node.inputs).length) && (direct_next || typeof this.actions[node.data.type] !== 'undefined')) {
    const next = (node, output_type, next_data) => {
      variables_block('block:previous', node, module_name, next_data);

      if (typeof node.outputs[output_type] !== 'undefined') {
        for (const connection of node.outputs[output_type].connections) {
          const node = this.config.actions[module_name].data[connection.node];
          if (typeof this.actions[node.data.type] !== 'undefined' && (typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled)) {
            variables_block('block', node, module_name, next_data);

            this.actions[node.data.type].call(this, module_name, receive, JSON.parse(JSON.stringify(node.data.data)), next_data, (output_type, _next_data) => next(node, output_type, (_next_data || next_data)));
          }
        }
      }
    };

    if (direct_next) {
      next(node, OUTPUT_TYPE.SUCCESS, {});
    } else if (typeof this.actions[node.data.type] !== 'undefined' && (typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled || force)) {
      variables_block('block', node, module_name, next_data);

      this.actions[node.data.type].call(this, module_name, receive, JSON.parse(JSON.stringify(node.data.data)), next_data, (output_type, _next_data) => next(node, output_type, (_next_data || next_data)));
    }
  }
}

function process_block_id(id, receive, next_data, force, direct_next) {
  const data = get_module_block_id.call(this, id);
  if (data.module_name && data.node) {
    process_block.call(this, data.module_name, data.node, (next_data || {}), (receive || {}), force, direct_next);
  }
}


// Shared methods
class Shared {
  keys = false;
  apps = {
    init: false,
    launched: {}
  };
  timeout = 0;

  constructor(config, vars) {
    this.vars = vars;
    this.config = config;

    for (const item of process.env.path.split(';')) {
      const program = path.join(item, 'cmd.exe');
      if (fs.existsSync(program)) {
        _cmd = program;
        break;
      }
    }

    this.actions = require('./actions')(Additional, {
      _cmd,
      _variables,
      OUTPUT_TYPE,
      VARIABLE_TYPE
    }, {
      comm_send: function() { return comm.send(...arguments); },
      get_variable,
      set_variable,
      apply_variables
    });

    const update_times = () => {
      const date = new Date();
      Additional.date_to_vars(date, false, VARIABLE_TYPE.GLOBALS);
    };

    setTimeout(async () => {
      setInterval(update_times, 1000);

      update_times();
      set_variable('http:url', this.vars.http, VARIABLE_TYPE.GLOBALS);
      set_variable('websocket:url', this.vars.websocket, VARIABLE_TYPE.GLOBALS);
      set_variable('websocket:token', this.vars.websocket_token, VARIABLE_TYPE.GLOBALS);

      process_modules.call(this, 'manager', 'launch');
    }, 1000);

    setInterval(async () => {
      let ids = [],
        launched = [],
        applications = [];

      applications = await Additional.get_applications();
      for (const application of applications) {
        ids.push(application.id);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      for (const application of await Additional.get_applications()) {
        if (ids.indexOf(application.id) < 0) {
          applications.push(application);
        }
      }

      for (const application of applications) {
        if (application.path.length) {
          if (this.apps.init && typeof this.apps.launched[application.path] === 'undefined') {
            process_modules.call(this, 'method', 'app', 'add', application);
          }

          launched.push(application.path);
          this.apps.launched[application.path] = application;
        }
      }

      if (this.apps.init) {
        for (const key in this.apps.launched) {
          const application = this.apps.launched[key];
          if (launched.indexOf(application.path) < 0) {
            process_modules.call(this, 'method', 'app', 'remove', application);
            delete this.apps.launched[key];
          }
        }
      } else {
        this.apps.init = true;
      }
    }, 250);

    (new keyevents()).addListener((event, down) => {
      let normal = [];
      let simple = [];
      for (const key in down) {
        if (down[key]) {
          normal.push(key);
          simple.push(key.replace('LEFT ', '').replace('RIGHT ', ''));
        }
      }

      normal = Additional.sort_keys(normal);
      simple = Additional.sort_keys(simple);

      if (!this.keys || JSON.stringify(this.keys.down.normal) !== JSON.stringify(normal)) {
        const kv = {
          event,
          down: {
            keys: down,
            normal,
            simple
          }
        };

        let keyevent = kv;
        if (event.state === 'UP') {
          keyevent = this.keys;
          if (keyevent) {
            keyevent.event.state = event.state;
            keyevent.event._raw = keyevent.event._raw.replace('DOWN', event.state);
          }
        }

        this.keys = kv;
        if (!keyevent) {
          return;
        }

        process_modules.call(this, 'method', 'keyboard', false, keyevent);
        comm.send('manager', 'interface', 'keyboard', false, keyevent);
      }
    });
  }

  async authorization(id, type, name, method) {
    return type === 'script' && method === 'block';
  }

  async show(id, property, data) {
    if (data) {
      update_interface.call(this);
    }
  }

  async enable(id, property, data) {
    this.config.default.enabled = data;
  }

  async interface(id, property, _data) {
    if (property === 'save') {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.config.actions = _data;
        comm.send('manager', 'config', 'override', false, this.config);
      }, 100);
    } else if (property === 'open') {
      if (_cmd) {
        child_process.spawn(_cmd, ['/c', 'explorer', _data], {
          cmd: process.env.USERPROFILE,
          detached: true
        });
      }
    } else if (property === 'sort') {
      this.config.settings.sort = _data;
      save_config();
    } else if (['module', 'toggle', 'lateral', 'disabled'].indexOf(property) >= 0) {
      this.config.settings[property] = _data;
      save_config();
    } else if (property === 'request') {
      const { event, name, method, property, data } = _data;
      comm.send(event, name, method, property, data)
        .then(data => {
          if (data !== null) {
            comm.send('manager', 'interface', 'receive', false, Object.assign({}, _data, { data }));
          }
        });
    } else if (property === 'test') {
      const [module_name, node_index] = _data,
        action = this.config.actions[module_name];

      process_block.call(this, module_name, action.data[node_index], false, false, true);
    } else if (property === 'import') {
      try {
        _data = JSON.parse(fs.readFileSync(_data.path, 'utf-8'));
        comm.send('manager', 'interface', 'import', false, _data);
      } catch (e) {
        comm.send('addon', 'notifications', 'create', false, ['Error while importing', 'Multi Actions - Import']);
      }
    } else if (property === 'export') {
      fs.writeFileSync(_data.path, _data.data);
    }
  }

  async audio(id, property, data) {
    comm.send('manager', 'interface', 'receive', property, { source: false, event: 'method', name: 'audio', method: property, data });
  }

  async speech(id, property, data) {
    comm.send('manager', 'interface', 'receive', property, { source: false, event: 'method', name: 'speech', method: property, data });
  }

  async usb(id, property, data) {
    if (['add', 'remove'].indexOf(property) >= 0) {
      return process_modules.call(this, 'method', 'usb', property, data);
    }

    comm.send('manager', 'interface', 'receive', property, { source: false, event: 'method', name: 'usb', method: property, data });
  }

  async websocket(id, property, data) {
    if (property === 'block' && typeof data === 'number') {
      const block = get_module_block_id.call(this, data);
      if (block && block.module_name) {
        let next_data = {};
        while (_variables.temp.length) {
          const variable = _variables.temp.shift();
          set_variable(variable.name, variable.value, ((variable.scope === 'Local') ? VARIABLE_TYPE.LOCALS : VARIABLE_TYPE.NEXT), block.module_name, next_data);
        }

        process_block_id.call(this, data, {}, next_data, false, true);
      }
    } else if (property === 'variable' && typeof data === 'object') {
      if (typeof data.name === 'string' && data.name.trim().length && typeof data.value !== 'undefined' && typeof data.scope === 'string') {
        data.name = data.name.trim();
        if (['Local', 'Next'].indexOf(data.scope) >= 0) {
          _variables.temp.push(data);
        } else if (data.scope === 'Global') {
          set_variable(data.name, data.value, VARIABLE_TYPE.GLOBALS);
        }
      }
    }
  }

  async call(id, property, data) {
    process_modules.call(this, 'multi-actions', 'call', property, data);
  }

  async block(id, property, data) {
    if (property === 'add') {
      return true;
    }
  }

  async broadcast(name, method, property, data) {
    process_modules.call(this, name, method, property, data);
  }
}

module.exports = sender => {
  comm = new sm(Shared, sender);
  return {
    receive: (data) => {
      return comm.receive(data);
    }
  };
};