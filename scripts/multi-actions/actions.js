const fs = require('node:fs'),
  path = require('node:path'),
  ws = require('ws'),
  active = require('active-win'),
  socket = require('dgram'),
  child_process = require('node:child_process'),
  { request } = require('undici'),
  { MessageBuilder: GuildedMessageBuilder, Webhook: GuildedWebhook } = require('guilded-webhook-node'),
  { EmbedBuilder: DiscordEmbedBuilder, AttachmentBuilder: DiscordAttachmentBuilder, WebhookClient: DiscordWebhook } = require('discord.js');

module.exports = (Additional, options, methods) => {
  const {
    _cmd,
    _variables,
    OUTPUT_TYPE,
    VARIABLE_TYPE
  } = options;

  function scope(data) {
    let variable_type = VARIABLE_TYPE.GLOBALS;
    variable_type = ((data.scope === 'toggle') ? VARIABLE_TYPE.LOCALS : variable_type);
    variable_type = ((data.scope === 'off') ? VARIABLE_TYPE.NEXT : variable_type);

    return variable_type;
  }

  return {
    'both-active-window': (module_name, receive, data, next_data, next) => {
      const title = methods.apply_variables(data.title, module_name, next_data),
        program = methods.apply_variables(data.program, module_name, next_data);

      active()
        .then(window => {
          let check = true;
          check = (data.type && program.length) ? (window.owner.path.toLowerCase() === program.toLowerCase()) : check;
          check = (!data.type && title.length) ? (window.title === title || window.owner.name === title) : check;

          if (typeof next !== 'undefined' && check) {
            methods.set_variable('active-window:id', window.id, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('active-window:name', window.title, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('active-window:bounds:x', window.bounds.x, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('active-window:bounds:y', window.bounds.y, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('active-window:bounds:width', window.bounds.width, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('active-window:bounds:height', window.bounds.height, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('active-window:process:id', window.owner.processId, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('active-window:process:name', window.owner.name, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('active-window:process:path', window.owner.path, VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
          } else {
            next(OUTPUT_TYPE.ERROR);
          }
        })
        .catch(error => {
          console.error('active-window error:', data, error);
          next(OUTPUT_TYPE.ERROR);
        });
    },
    'outputs-app-status': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'method' && receive.name === 'app') {
        if ((receive.property === 'add' && data.state) || (receive.property === 'remove' && !data.state)) {
          if (receive.data.path.toLowerCase() === data.program.toLowerCase()) {
            methods.set_variable('app-status:id', receive.data.id, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('app-status:name', receive.data.name, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('app-status:path', receive.data.path, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('app-status:launched', data.state, VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
          }
        }
      }
    },
    'inputs-audio-play': (module_name, receive, data, next_data) => {
      const file = methods.apply_variables(data.file, module_name, next_data);
      if (file.trim().length) {
        data.file = file.trim();
        methods.comm_send('method', 'audio', 'play', false, data);
      }
    },
    'inputs-audio-stop': (module_name, receive, data, next_data) => {
      methods.comm_send('method', 'audio', 'stop');
    },
    'both-cooldown': (module_name, receive, data, next_data, next) => {
      if (data.seconds > 0) {
        let value = methods.get_variable(data.variable, 0, module_name, next_data);
        if (typeof value !== 'number') {
          value = 0;
        }

        let time = parseInt(data.seconds);
        if (!isNaN(time) && time > 0) {
          if (data.number_unit === 'seconds') {
            time *= 1000;
          } else if (data.number_unit === 'minutes') {
            time *= 60000;
          }

          const now = Date.now();
          if (!value || (value + time) < now) {
            const end = (now + time);

            methods.set_variable(data.variable, now, VARIABLE_TYPE.GLOBALS);
            Additional.date_to_vars(now, 'cooldown:start', VARIABLE_TYPE.NEXT, module_name, next_data);
            Additional.date_to_vars(end, 'cooldown:end', VARIABLE_TYPE.NEXT, module_name, next_data);
            Additional.timediff_to_vars((end - now), 'cooldown:left', VARIABLE_TYPE.NEXT, module_name, next_data);
            Additional.timediff_to_vars(0, 'cooldown:past', VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
          } else {
            const end = (value + time);

            Additional.date_to_vars(value, 'cooldown:start', VARIABLE_TYPE.NEXT, module_name, next_data);
            Additional.date_to_vars(end, 'cooldown:end', VARIABLE_TYPE.NEXT, module_name, next_data);
            Additional.timediff_to_vars((end - now), 'cooldown:left', VARIABLE_TYPE.NEXT, module_name, next_data);
            Additional.timediff_to_vars((now - value), 'cooldown:past', VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.ERROR);
          }
        }
      }
    },
    'both-download-file': async (module_name, receive, data, next_data, next) => {
      const url = methods.apply_variables(data.url, module_name, next_data),
        name = methods.apply_variables(data.name, module_name, next_data),
        folder = methods.apply_variables(data.folder, module_name, next_data);

      if (url.trim().length && folder.trim().length) {
        if (!fs.existsSync(folder)) {
          return next(OUTPUT_TYPE.ERROR);
        }

        Additional.load_file(path.join(folder, name), url, true)
          .then(() => next(OUTPUT_TYPE.SUCCESS))
          .catch(error => {
            console.error('download-file error:', data, error);
            next(OUTPUT_TYPE.ERROR);
          });
      }
    },
    'both-file-read': (module_name, receive, data, next_data, next) => {
      const file = methods.apply_variables(data.file, module_name, next_data);
      if (file.trim().length) {
        fs.readFile(file, 'utf8', (error, data) => {
          if (error) {
            console.error('file-read error:', data, error);
            return next(OUTPUT_TYPE.ERROR);
          }

          const lines = data.split('\n');
          for (let i = 0; i < lines.length; ++i) {
            methods.set_variable(`file-read:all`, data, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`file-read:count`, lines.length, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`file-read:line[${i}]`, lines[i].trim(), VARIABLE_TYPE.NEXT, module_name, next_data);
          }

          next(OUTPUT_TYPE.SUCCESS);
        });
      }
    },
    'inputs-file-write': (module_name, receive, data, next_data) => {
      const file = methods.apply_variables(data.file, module_name, next_data),
        content = (data.separator ? '\n' : '') + methods.apply_variables(data.content, module_name, next_data);

      if (file.trim().length) {
        fs.writeFile(file, content, {
          encoding: 'utf8',
          flag: data.append ? 'a' : 'w'
        }, error => {
          if (error) {
            console.error('file-write error:', error);
          }
        });
      }
    },
    'both-http-request': (module_name, receive, data, next_data, next) => {
      const url = methods.apply_variables(data.url, module_name, next_data);
      if (url.trim().length && data.method) {
        request(url, { method: data.method.toUpperCase() })
          .then(async req => {
            methods.set_variable('http-request:status', req.statusCode, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('http-request:body', await req.body.text(), VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
          })
          .catch(error => {
            console.error('http-request error:', data, error);
            next(OUTPUT_TYPE.ERROR);
          });
      }
    },
    'outputs-keyboard-shortcut': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'method' && receive.name === 'keyboard') {
        if (receive.data.down.normal.length && receive.data.event.state.toLowerCase() === data.state) {
          let shortcuts = {
            saved: Additional.sort_keys(data.keys),
            normal: Additional.sort_keys(receive.data.down.normal),
            simple: Additional.sort_keys(receive.data.down.simple)
          };

          if (JSON.stringify(shortcuts.saved) === JSON.stringify(shortcuts.normal) || JSON.stringify(shortcuts.saved) === JSON.stringify(shortcuts.simple)) {
            methods.set_variable('keyboard-shortcut:name', receive.data.event.name, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('keyboard-shortcut:code', receive.data.event.scanCode, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('keyboard-shortcut:virtual', receive.data.event.vKey, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('keyboard-shortcut:state', data.state, VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
          }
        }
      }
    },
    'inputs-kill-app': (module_name, receive, data, next_data) => {
      const program = methods.apply_variables(data.program, module_name, next_data);
      if (!_cmd || !program.trim().length) {
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

              if (ps.path.toLowerCase() === program.toLowerCase()) {
                if (data.children) {
                  child_process.exec(`taskkill /PID ${ps.id} /T /F`, (error, stdout, stderr) => {
                    if (error) {
                      console.error('kill-app error:', data, error);
                    }
                  });
                } else {
                  process.kill(ps.id, 'SIGKILL');
                }
              }
            }
          }
        });
    },
    'both-launch-app': (module_name, receive, data, next_data, next) => {
      const program = methods.apply_variables(data.program, module_name, next_data);
      if (!_cmd) {
        return;
      } else if (!program.trim().length || !fs.existsSync(program)) {
        return next(OUTPUT_TYPE.ERROR);
      }

      child_process.spawn(_cmd, ['/c', 'start', '', program], {
        cwd: path.dirname(program),
      })
        .on('close', exit_code => {
          next(exit_code ? OUTPUT_TYPE.ERROR : OUTPUT_TYPE.SUCCESS);
        })
        .on('error', error => {
          console.error('launch-app error:', data, error);
          next(OUTPUT_TYPE.ERROR);
        });
    },
    'inputs-notification': (module_name, receive, data, next_data) => {
      const icon = methods.apply_variables(data.icon, module_name, next_data) || methods.get_variable('notification:icon', '', module_name, next_data),
        title = methods.apply_variables(data.title, module_name, next_data),
        message = methods.apply_variables(data.message, module_name, next_data);

      let time = parseInt(data.duration);
      if (!isNaN(time) && time > 0) {
        if (data.number_unit === 'seconds') {
          time *= 1000;
        } else if (data.number_unit === 'minutes') {
          time *= 60000;
        }

        if (message.trim().length) {
          methods.comm_send('addon', 'notifications', 'create', false, [message, title, ((typeof icon === 'string' && icon.trim().length) ? icon : false), time]);
        }
      }
    },
    'inputs-open-url': (module_name, receive, data, next_data) => {
      if (!_cmd) {
        return;
      }

      let address = methods.apply_variables(data.address, module_name, next_data);
      if (address.trim().length) {
        if (address.indexOf('://') < 0) {
          address = 'https://' + address;
        }

        child_process.spawn(_cmd, ['/c', 'explorer', address], {
          cmd: process.env.USERPROFILE,
          detached: true
        });
      }
    },
    /*'both-queue': (module_name, receive, data, next_data, next) => {
      const id = methods.get_variable('block:id', -1, module_name, next_data);

      let obj = _variables.queue[id];
      if (typeof _variables.queue[id] === 'undefined') {
        obj = {
          interval: 0,
          queue: []
        };
        _variables.queue[id] = obj;
      }

      if (typeof this.config.actions[module_name] === 'undefined' || typeof this.config.actions[module_name].data[id] === 'undefined') {
        return clearInterval(obj.interval);
      }

      obj.queue.push(JSON.parse(JSON.stringify(next_data)));
      if (!obj.interval) {
        obj.interval = setInterval(() => {
          if (!obj.queue.length) {
            next(OUTPUT_TYPE.SUCCESS, obj.queue.shift());
          } else {
            clearInterval(obj.interval);
            obj.interval = 0;
          }
        }, data.delay);
      }
      // check if block exists
    },*/
    'both-say': (module_name, receive, data, next_data, next) => {
      const message = methods.apply_variables(data.message, module_name, next_data);
      if (!data.state) {
        methods.comm_send('method', 'speech', 'stop');
      } else if (message.trim().length && data.voice) {
        methods.comm_send('method', 'speech', 'say', false, {
          voice: data.voice,
          volume: parseInt(data.volume) || 100,
          rate: parseFloat(data.rate) || 1,
          pitch: parseFloat(data.pitch) || .8,
          text: message
        });
      }
    },
    'outputs-launch': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'multi-actions' && receive.name === 'launch') {
        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'both-self-timer': (module_name, receive, data, next_data, next) => {
      let time = parseInt(data.millis);
      if (!isNaN(time) && time > 0) {
        if (data.number_unit === 'seconds') {
          time *= 1000;
        } else if (data.number_unit === 'minutes') {
          time *= 60000;
        }

        setTimeout(() => next(OUTPUT_TYPE.SUCCESS), time);
      }
    },
    'both-socket-request': (module_name, receive, data, next_data, next) => {
      const host = methods.apply_variables(data.host, module_name, next_data),
        _data = methods.apply_variables(data.data, module_name, next_data);

      if (host.trim().length && data.port && _data.trim().length) {
        const tdata = Buffer.from(_data),
          client = socket.createSocket('udp4');

        client.send(tdata, parseInt(data.port), host, error => {
          if (error) {
            console.error('socket-request error:', error);
          }

          client.close();
          next(error ? OUTPUT_TYPE.ERROR : OUTPUT_TYPE.SUCCESS);
        });
      }
    },
    'outputs-toggle-block': (module_name, receive, data, next_data, next) => {
      const id = parseInt(data.id) || 0;
      if (receive.id === 'multi-actions' && receive.name === 'call' && receive.property === 'toggle-block' && (!id || id === receive.data.id)) {
        if (data.state === 'toggle' || receive.data.enabled === (data.state === 'on')) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-toggle-block': function(module_name, receive, data, next_data) {
      const node = this.config.actions[module_name].data[parseInt(data.id)];
      if (typeof node !== 'undefined') {
        if (data.state === 'toggle') {
          node.data.data.enabled = !(typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled);
        } else {
          node.data.data.enabled = (data.state === 'on');
        }

        methods.comm_send('manager', 'interface', 'toggle-block', false, { id: node.id, module: module_name, enabled: node.data.data.enabled });
        methods.comm_send('script', 'multi-actions', 'call', 'toggle-block', { id: node.id, module: module_name, enabled: node.data.data.enabled });
      }
    },
    'outputs-usb-detection': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'method' && receive.name === 'usb') {
        if ((receive.property === 'add' && data.state) || (receive.property === 'remove' && !data.state)) {
          if (!data.device || (receive.data.productName === data.device)) {
            methods.set_variable('usb-detection:name', receive.data.productName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('usb-detection:manufacturer', receive.data.manufacturerName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('usb-detection:serial', receive.data.serialNumber, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('usb-detection:connected', data.state, VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
          }
        }
      }
    },
    'both-variable-condition': (module_name, receive, data, next_data, next) => {
      const type = Additional.get_state(data.type, 'string', 'number', 'boolean'),
        condition = data.condition,
        precondition = condition.replace('not-', '');

      if (!condition.length) {
        return;
      }

      let check = false;
      let value1 = methods.apply_variables(data['value-1'], module_name, next_data);
      let value2 = '';
      switch (type) {
        case 'string':
          value2 = methods.apply_variables(data.string, module_name, next_data);

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
          value2 = parseFloat(methods.apply_variables(data.number, module_name, next_data));

          if (isNaN(value1) || isNaN(value2)) {
            return next(OUTPUT_TYPE.ERROR);
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
            return next(OUTPUT_TYPE.ERROR);
          }

          if (precondition === 'equal') {
            check = value1 === value2;
          }

          break;
      }

      if (!condition.indexOf('not-') || !condition.indexOf('less')) {
        check = !check;
      }

      next(check ? OUTPUT_TYPE.SUCCESS : OUTPUT_TYPE.ERROR);
    },
    'both-variable-increment': (module_name, receive, data, next_data, next) => {
      let value = methods.get_variable(data.variable, undefined, module_name, next_data);
      if (typeof value === 'undefined') {
        value = 0;
      }
      if (typeof value === 'string') {
        const tmp = parseFloat(value);
        if (!isNaN(tmp)) {
          value = tmp;
        }
      }
      if (typeof value === 'number') {
        value += parseInt(data.number);
        methods.set_variable(data.variable, value, scope(data), module_name, next_data);
        return next(OUTPUT_TYPE.SUCCESS);
      }

      next(OUTPUT_TYPE.ERROR);
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
        return next(OUTPUT_TYPE.SUCCESS);
      }

      next(OUTPUT_TYPE.ERROR);
    },
    'both-variable-replace': (module_name, receive, data, next_data, next) => {
      const search = methods.apply_variables(data.search, module_name, next_data),
        replace = methods.apply_variables(data.replace, module_name, next_data);

      let value = methods.apply_variables(data.value, module_name, next_data);
      if (data.all) {
        value = value.replaceAll(search, replace);
      } else {
        value = value.replace(search, replace);
      }

      methods.set_variable(data.variable, value, scope(data), module_name, next_data);
      next(OUTPUT_TYPE.SUCCESS);
    },
    'both-variable-setter': (module_name, receive, data, next_data, next) => {
      const type = Additional.get_state(data.type, 'string', 'number', 'boolean');

      let value = '';
      switch (type) {
        case 'string': value = methods.apply_variables(data.string, module_name, next_data); break;
        case 'number': value = parseFloat(data.number); break;
        case 'boolean': value = (data.boolean === 'true'); break;
      }

      methods.set_variable(data.variable, value, scope(data), module_name, next_data);
      next(OUTPUT_TYPE.SUCCESS);
    },
    'both-websocket-request': (module_name, receive, data, next_data, next) => {
      const url = methods.apply_variables(data.url, module_name, next_data),
        _data = methods.apply_variables(data.data, module_name, next_data);

      if (url.trim().length && _data.trim().length) {
        let client = null;
        const timeout = setTimeout(() => {
          try {
            client.close();
          } catch (e) {}

          client = null;
          next(OUTPUT_TYPE.ERROR);
        }, 1000);

        client = new ws(url, { handshakeTimeout: 1000 });
        client.on('error', error => {
          clearTimeout(timeout);
          console.error('websocket-request error:', data, error);
          next(OUTPUT_TYPE.ERROR);
        });

        client.on('open', () => {
          clearTimeout(timeout);
          client.send(_data, () => {
            client.close();
            next(OUTPUT_TYPE.SUCCESS);
          });
        });
      }
    },
    'both-discord-webhook-embed': async (module_name, receive, data, next_data, next) => {
      const id = methods.get_variable('discord:webhook:id', '', module_name, next_data),
        big_image = methods.apply_variables(data['big-image'], module_name, next_data) || methods.get_variable('discord:big-image', '', module_name, next_data),
        thumbnail = methods.apply_variables(data.thumbnail, module_name, next_data) || methods.get_variable('discord:thumbnail', '', module_name, next_data);

      let texts = {};
      for (const name of ['title', 'url', 'message', 'inline-1-title', 'inline-1-content', 'inline-2-title', 'inline-2-content']) {
        texts[name] = methods.apply_variables(data[name], module_name, next_data);
      }

      if (data.webhook && texts.title.trim().length) {
        let big_image_path = '';
        if (typeof big_image === 'string' && big_image.trim().length) {
          try {
            if (big_image.indexOf('://') >= 0) {
              big_image_path = await Additional.load_file('big_image', big_image);
            } else if (fs.existsSync(big_image)) {
              big_image_path = Additional.copy_file('big_image', big_image);
            }
          } catch (e) {}
        }

        let thumbnail_path = '';
        if (typeof thumbnail === 'string' && thumbnail.trim().length) {
          try {
            if (thumbnail.indexOf('://') >= 0) {
              thumbnail_path = await Additional.load_file('thumbnail', thumbnail);
            } else if (fs.existsSync(thumbnail)) {
              thumbnail_path = Additional.copy_file('thumbnail', thumbnail);
            }
          } catch (e) {}
        }

        const webhook = new DiscordWebhook({ url: data.webhook.replace('discordapp', 'discord') }),
          embed = new DiscordEmbedBuilder()
            .setColor('#c0392b')
            .setTitle(texts.title);

        let images = [];
        if (big_image_path) {
          images.push(new DiscordAttachmentBuilder(big_image_path));
        }
        if (thumbnail_path) {
          images.push(new DiscordAttachmentBuilder(thumbnail_path));
        }

        if (texts.url) {
          if (texts.url.indexOf('://') < 0) {
            texts.url = 'https://' + texts.url;
          }

          embed.setURL(texts.url);
        }
        if (big_image_path) {
          embed.setImage('attachment://' + encodeURI(path.basename(big_image_path)));
        }
        if (thumbnail_path) {
          embed.setThumbnail('attachment://' + path.basename(thumbnail_path));
        }

        if (texts['inline-1-title'].trim().length && texts['inline-1-content'].trim().length) {
          embed.addFields([{ name: texts['inline-1-title'], value: texts['inline-1-content'], inline: true }]);
        }
        if (texts['inline-2-title'].trim().length && texts['inline-2-content'].trim().length) {
          embed.addFields([{ name: texts['inline-2-title'], value: texts['inline-2-content'], inline: true }]);
        }

        let parse = [];
        if (texts.message && texts.message.indexOf('@everyone') >= 0) {
          parse.push('everyone');
        }

        const options = {
          content: texts.message || '',
          embeds: [embed],
          files: images,
          allowed_mentions: { parse: ['everyone'] }
        };

        if (id) {
          webhook
            .editMessage(id, options)
            .then(message => Additional.discord_next(message, module_name, next_data, next))
            .catch(() => {
              webhook
                .send(options)
                .then(message => Additional.discord_next(message, module_name, next_data, next))
                .catch(error => {
                  console.error('discord-webhook-embed:', data, error);
                  next(OUTPUT_TYPE.ERROR);
                });
            });
        } else {
          webhook
            .send(options)
            .then(message => Additional.discord_next(message, module_name, next_data, next))
            .catch(error => {
              console.error('discord-webhook-embed:', data, error);
              next(OUTPUT_TYPE.ERROR);
            });
        }
      }
    },
    'both-discord-webhook-message': async (module_name, receive, data, next_data, next) => {
      const id = methods.get_variable('discord:webhook:id', '', module_name, next_data),
        message = methods.apply_variables(data.message, module_name, next_data);

      if (data.webhook && message.trim().length) {
        const webhook = new DiscordWebhook({ url: data.webhook.replace('discordapp', 'discord') });

        let parse = [];
        if (message.indexOf('@everyone') >= 0) {
          parse.push('everyone');
        }

        const options = {
          content: message,
          embeds: [],
          files: [],
          allowed_mentions: { parse: ['everyone'] }
        };

        if (id) {
          webhook
            .editMessage(id, options)
            .then(message => Additional.discord_next(message, module_name, next_data, next))
            .catch(() => {
              webhook
                .send(options)
                .then(message => Additional.discord_next(message, module_name, next_data, next))
                .catch(error => {
                  console.error('discord-webhook-message:', data, error);
                  next(OUTPUT_TYPE.ERROR);
                });
            });
        } else {
          webhook
            .send(options)
            .then(message => Additional.discord_next(message, module_name, next_data, next))
            .catch(error => {
              console.error('discord-webhook-message:', data, error);
              next(OUTPUT_TYPE.ERROR);
            });
        }
      }
    },
    'outputs-guilded-member-banned': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'guilded' && receive.property === 'memberBanned') {
        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-guilded-member-joined': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'guilded' && receive.property === 'memberJoined') {
        methods.set_variable('guilded:member-joined:nickname', receive.data.nickname, VARIABLE_TYPE.NEXT, module_name, next_data);
        Additional.date_to_vars((receive.data.joinedAt || receive.data._joinedAt), 'guilded:member-joined:join', VARIABLE_TYPE.NEXT, module_name, next_data);

        Additional.guilded_next(receive.data, module_name, next_data, next);
      }
    },
    'outputs-guilded-member-removed': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'guilded' && receive.property === 'memberRemoved') {
        Additional.guilded_next(receive.data, module_name, next_data, next);
      }
    },
    'outputs-guilded-member-updated': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'guilded' && receive.property === 'memberUpdated') {
        methods.set_variable('guilded:member-updated', receive.data.content, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('guilded:member-updated:id', receive.data.id, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('guilded:member-updated:type', receive.data.type, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('guilded:member-updated:private', receive.data.isPrivate, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('guilded:member-updated:silent', receive.data.isSilent, VARIABLE_TYPE.NEXT, module_name, next_data);
        Additional.date_to_vars((receive.data.createdAt || receive.data._createdAt), 'guilded:member-updated:create', VARIABLE_TYPE.NEXT, module_name, next_data);

        Additional.guilded_next(receive.data, module_name, next_data, next);
      }
    },
    'outputs-guilded-member-unbanned': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'guilded' && receive.property === 'memberUnbanned') {
        Additional.guilded_next(receive.data, module_name, next_data, next);
      }
    },
    'outputs-guilded-message': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'guilded' && receive.property === 'messageCreated') {
        const msg_compare = data.case ? receive.data.content : receive.data.content.toLowerCase(),
          msg_receive = data.case ? data.message : data.message.toLowerCase();

        if (!msg_compare || (data.contains && msg_receive.indexOf(msg_compare) >= 0) || (!data.contains && msg_compare === msg_receive)) {
          methods.set_variable('guilded:message', receive.data.content, VARIABLE_TYPE.NEXT, module_name, next_data);
          methods.set_variable('guilded:message:id', receive.data.id, VARIABLE_TYPE.NEXT, module_name, next_data);
          methods.set_variable('guilded:message:type', receive.data.type, VARIABLE_TYPE.NEXT, module_name, next_data);
          methods.set_variable('guilded:message:private', receive.data.isPrivate, VARIABLE_TYPE.NEXT, module_name, next_data);
          methods.set_variable('guilded:message:silent', receive.data.isSilent, VARIABLE_TYPE.NEXT, module_name, next_data);
          Additional.date_to_vars((receive.data.createdAt || receive.data._createdAt), 'guilded:message:create', VARIABLE_TYPE.NEXT, module_name, next_data);

          Additional.guilded_next(receive.data, module_name, next_data, next);
        }
      }
    },
    'inputs-guilded-message': (module_name, receive, data, next_data, next) => {
      const channel_id = methods.get_variable('guilded:channel:id', '', module_name, next_data),
        message = methods.apply_variables(data.message, module_name, next_data);

      if (typeof channel_id === 'string' && channel_id.trim().length && message.trim().length) {
        methods.comm_send('addon', 'guilded', 'call', 'SendMessage', [channel_id, message]);
      }
    },
    'outputs-guilded-message-deleted': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'guilded' && receive.property === 'messageDeleted') {
        methods.set_variable('guilded:message-deleted:id', receive.data.id, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('guilded:message-deleted:private', receive.data.isPrivate, VARIABLE_TYPE.NEXT, module_name, next_data);
        Additional.date_to_vars((receive.data.deletedAt || receive.data._deletedAt), 'guilded:message-deleted:delete', VARIABLE_TYPE.NEXT, module_name, next_data);

        Additional.guilded_next(receive.data, module_name, next_data, next);
      }
    },
    'outputs-guilded-message-updated': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'guilded' && receive.property === 'messageUpdated') {
        methods.set_variable('guilded:message-updated', receive.data.content, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('guilded:message-updated:private', receive.data.isPrivate, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('guilded:message-updated:silent', receive.data.isSilent, VARIABLE_TYPE.NEXT, module_name, next_data);
        Additional.date_to_vars((receive.data.createdAt || receive.data._createdAt), 'guilded:message-updated:create', VARIABLE_TYPE.NEXT, module_name, next_data);
        Additional.date_to_vars((receive.data.updatedAt || receive.data._updatedAt), 'guilded:message-updated:update', VARIABLE_TYPE.NEXT, module_name, next_data);

        Additional.guilded_next(receive.data, module_name, next_data, next);
      }
    },
    'inputs-guilded-webhook-embed': async (module_name, receive, data, next_data, next) => {
      const big_image = methods.apply_variables(data['big-image'], module_name, next_data),
        thumbnail = methods.apply_variables(data.thumbnail, module_name, next_data);

      let texts = {};
      for (const name of ['title', 'url', 'message', 'inline-1-title', 'inline-1-content', 'inline-2-title', 'inline-2-content']) {
        texts[name] = methods.apply_variables(data[name], module_name, next_data);
      }

      if (data.webhook && texts.title.trim().length) {
        const webhook = new GuildedWebhook({ url: data.webhook }),
          embed = new GuildedMessageBuilder()
            .setColor('#c0392b')
            .setTitle(texts.title)
            .setText(texts.message || '');

        if (texts.url) {
          if (texts.url.indexOf('://') < 0) {
            texts.url = 'https://' + texts.url;
          }

          embed.setURL(texts.url);
        }
        if (big_image) {
          embed.setImage(big_image);
        }
        if (thumbnail) {
          embed.setThumbnail(thumbnail);
        }

        if (texts['inline-1-title'].trim().length && texts['inline-1-content'].trim().length) {
          embed.addField(texts['inline-1-title'], texts['inline-1-content'], true);
        }
        if (texts['inline-2-title'].trim().length && texts['inline-2-content'].trim().length) {
          embed.addField(texts['inline-2-title'], texts['inline-2-content'], true);
        }

        try {
          const result = await webhook.send(embed);
          console.log('Guilded Webhook:', result);

          //Additional.guilded_next(emded, module_name, next_data, next);
          next(OUTPUT_TYPE.SUCCESS);
        } catch (e) {
          console.error('guilded-webhook-embed error:', data, e);
          next(OUTPUT_TYPE.ERROR);
        }
      }
    },
    'inputs-guilded-webhook-message': async (module_name, receive, data, next_data, next) => {
      const message = methods.apply_variables(data.message, module_name, next_data);
      if (data.webhook && message.trim().length) {
        const webhook = new GuildedWebhook({ url: data.webhook });

        try {
          const result = await webhook.send(message);
          console.log('Guilded Webhook:', result);

          //Additional.guilded_next(emded, module_name, next_data, next);
          next(OUTPUT_TYPE.SUCCESS);
        } catch (e) {
          console.error('guilded-webhook-message error:', data, e);
          next(OUTPUT_TYPE.ERROR);
        }
      }
    },
    'both-mastodon-message': (module_name, receive, data, next_data, next) => {
      const message = methods.apply_variables(data.message, module_name, next_data);
      if (message.trim().length) {
        methods.comm_send('addon', 'mastodon', 'call', 'CreateStatus', [message, data.visibility.toLowerCase()])
          .then(result => {
            methods.set_variable('mastodon:message', result.content, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:id', result.id, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:uri', result.uri, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:url', result.url, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:muted', result.muted, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:reblogged', result.reblogged, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:bookmarked', result.bookmarked, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:favourited', result.favourited, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:reply', (result.inReplyToId || result.inReplyToAccountId), VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:replies', result.repliesCount, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:reblogs', result.reblogsCount, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:language', result.language, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:sensitive', result.sensitive, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:favourites', result.favouritesCount, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:visibility', result.visibility, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:spoilerText', result.spoilerText, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('mastodon:message:id', result.id, VARIABLE_TYPE.NEXT, module_name, next_data);
            //Additional.date_to_vars(result.editedAt, 'mastodon:message:edited', VARIABLE_TYPE.NEXT, module_name, next_data);
            Additional.date_to_vars(result.createdAt, 'mastodon:message:create', VARIABLE_TYPE.NEXT, module_name, next_data);

            methods.set_variable('mastodon:message:tags:count', result.tags.length, VARIABLE_TYPE.NEXT, module_name, next_data);
            for (let i = 0; i < result.tags.length; ++i) {
              const tag = result.tags[i];
              methods.set_variable(`mastodon:message:tag[${i}]:url`, tag.url, VARIABLE_TYPE.NEXT, module_name, next_data);
              methods.set_variable(`mastodon:message:tag[${i}]:name`, tag.name, VARIABLE_TYPE.NEXT, module_name, next_data);
            }

            methods.set_variable('mastodon:message:mentions:count', result.mentions.length, VARIABLE_TYPE.NEXT, module_name, next_data);
            for (let i = 0; i < result.mentions.length; ++i) {
              const mention = result.mentions[i];
              methods.set_variable(`mastodon:message:mention[${i}]:id`, mention.id, VARIABLE_TYPE.NEXT, module_name, next_data);
              methods.set_variable(`mastodon:message:mention[${i}]:url`, mention.url, VARIABLE_TYPE.NEXT, module_name, next_data);
              methods.set_variable(`mastodon:message:mention[${i}]:account`, mention.acct, VARIABLE_TYPE.NEXT, module_name, next_data);
              methods.set_variable(`mastodon:message:mention[${i}]:username`, mention.username, VARIABLE_TYPE.NEXT, module_name, next_data);
            }

            next(OUTPUT_TYPE.SUCCESS);
          });
      }
    },
    'outputs-obs-studio-authentification': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && ['AuthenticationSuccess', 'AuthenticationFailure'].indexOf(receive.property) >= 0) {
        const state = receive.property === 'AuthenticationSuccess';
        methods.set_variable('obs-studio:authentification', state, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && state === data.state) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'outputs-obs-studio-connection': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && ['ConnectionOpened', 'ConnectionClosed'].indexOf(receive.property) >= 0) {
        const state = receive.property === 'ConnectionOpened';
        methods.set_variable('obs-studio:connection', state, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && state === data.state) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'outputs-obs-studio-exit': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'ExitStarted') {
        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'both-obs-studio-filters': (module_name, receive, data, next_data, next) => {
      methods.comm_send('addon', 'obs-studio', 'call', 'GetFilters', [data.source])
        .then(filters => {
          if (!Array.isArray(filters)) {
            return next(OUTPUT_TYPE.ERROR);
          }

          methods.set_variable('obs-studio:filters:count', filters.length, VARIABLE_TYPE.NEXT, module_name, next_data);

          for (let i = 0; i < filters.length; ++i) {
            const filter = filters[i];

            methods.set_variable(`obs-studio:filter[${i}]:name`, filter.filterName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:filter[${i}]:index`, filter.filterIndex, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:filter[${i}]:kind`, filter.filterKind, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:filter[${i}]:enabled`, filter.filterEnabled, VARIABLE_TYPE.NEXT, module_name, next_data);

            if (typeof filter.filterSettings === 'object') {
              for (const key in filter.filterSettings) {
                methods.set_variable(`obs-studio:filter[${i}]:settings:${key}`, filter.filterSettings[key], VARIABLE_TYPE.NEXT, module_name, next_data);
              }
            }
          }

          next(OUTPUT_TYPE.SUCCESS);
        })
        .catch(error => {
          console.error('obs-studio-sources:', data, error);
          next(OUTPUT_TYPE.ERROR);
        });
    },
    'outputs-obs-studio-recording': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'RecordStateChanged' && ['OBS_WEBSOCKET_OUTPUT_STARTED', 'OBS_WEBSOCKET_OUTPUT_STOPPED'].indexOf(receive.data.outputState) >= 0) {
        const state = receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED';
        methods.set_variable('obs-studio:recording', state, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && data.state === state) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-obs-studio-recording': (module_name, receive, data, next_data) => {
      const state = Additional.get_state(data.state, 'StartRecord', 'ToggleRecord', 'StopRecord');
      methods.comm_send('addon', 'obs-studio', 'call', state);
    },
    'outputs-obs-studio-replay': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'ReplayBufferStateChanged' && ['OBS_WEBSOCKET_OUTPUT_STARTED', 'OBS_WEBSOCKET_OUTPUT_STOPPED'].indexOf(receive.data.outputState) >= 0) {
        const state = receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED';
        methods.set_variable('obs-studio:replay', state, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && data.state === state) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-obs-studio-replay': (module_name, receive, data, next_data) => {
      const state = Additional.get_state(data.state, 'StartReplayBuffer', 'ToggleReplayBuffer', 'StopReplayBuffer');
      methods.comm_send('addon', 'obs-studio', 'call', state);
    },
    'outputs-obs-studio-save-replay': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'ReplayBufferSaved') {
        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'inputs-obs-studio-save-replay': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'obs-studio', 'call', 'SaveReplayBuffer');
    },
    'both-obs-studio-scenes': (module_name, receive, data, next_data, next) => {
      methods.comm_send('addon', 'obs-studio', 'call', 'GetScenes')
        .then(scenes => {
          if (!Array.isArray(scenes)) {
            return next(OUTPUT_TYPE.ERROR);
          }

          methods.set_variable('obs-studio:scenes:count', scenes.length, VARIABLE_TYPE.NEXT, module_name, next_data);

          for (let i = 0; i < scenes.length; ++i) {
            const scene = scenes[i];

            methods.set_variable(`obs-studio:scene[${i}]:name`, scene.sceneName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:scene[${i}]:index`, scene.sceneIndex, VARIABLE_TYPE.NEXT, module_name, next_data);
          }

          next(OUTPUT_TYPE.SUCCESS);
        })
        .catch(error => {
          console.error('obs-studio-scenes:', data, error);
          next(OUTPUT_TYPE.ERROR);
        });
    },
    'inputs-obs-studio-set-browser': (module_name, receive, data, next_data) => {
      if (data.source) {
        methods.comm_send('addon', 'obs-studio', 'call', 'SetSourceSettings', [data.source, { url: methods.apply_variables(data.url, module_name, next_data) }, false]);
      }
    },
    'inputs-obs-studio-set-image': (module_name, receive, data, next_data) => {
      if (data.source) {
        methods.comm_send('addon', 'obs-studio', 'call', 'SetSourceSettings', [data.source, { file: methods.apply_variables(data.file, module_name, next_data) }, false]);
      }
    },
    'inputs-obs-studio-set-media': (module_name, receive, data, next_data) => {
      if (data.source) {
        methods.comm_send('addon', 'obs-studio', 'call', 'SetSourceSettings', [data.source, { local_file: methods.apply_variables(data.file, module_name, next_data) }, false]);
      }
    },
    'inputs-obs-studio-set-text': (module_name, receive, data, next_data) => {
      if (data.source) {
        methods.comm_send('addon', 'obs-studio', 'call', 'SetSourceSettings', [data.source, { text: methods.apply_variables(data.text, module_name, next_data) }, false]);
      }
    },
    'outputs-obs-studio-streaming': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'StreamStateChanged' && ['OBS_WEBSOCKET_OUTPUT_STARTED', 'OBS_WEBSOCKET_OUTPUT_STOPPED'].indexOf(receive.data.outputState) >= 0) {
        const state = receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED';
        methods.set_variable('obs-studio:streaming', state, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && data.state === state) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-obs-studio-streaming': (module_name, receive, data, next_data) => {
      const state = Additional.get_state(data.state, 'StartStream', 'ToggleStream', 'StopStream');
      methods.comm_send('addon', 'obs-studio', 'call', state);
    },
    'outputs-obs-studio-studio-mode': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'StudioModeStateChanged') {
        methods.set_variable('obs-studio:studio-mode', receive.data.studioModeEnabled, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && data.state === receive.data.studioModeEnabled) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-obs-studio-studio-mode': (module_name, receive, data, next_data) => {
      const state = Additional.get_state(data.state, true, undefined, false);
      methods.comm_send('addon', 'obs-studio', 'call', 'ToggleStudioMode', [state]);
    },
    'outputs-obs-studio-switch-scene': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'CurrentProgramSceneChanged') {
        methods.set_variable('obs-studio:switch-scene', receive.data.sceneName, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && (!data.scene || receive.data.sceneName.toLowerCase() === data.scene.toLowerCase())) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-obs-studio-switch-scene': (module_name, receive, data, next_data) => {
      if (data.scene) {
        methods.comm_send('addon', 'obs-studio', 'call', 'SetCurrentScene', [data.scene]);
      }
    },
    'outputs-obs-studio-source-selected': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'SceneItemSelected') {
        const _next = () => {
          methods.set_variable('obs-studio:source-selected:id', receive.data.sceneItemId, VARIABLE_TYPE.NEXT, module_name, next_data);
          methods.set_variable('obs-studio:source-selected:name', receive.data.sceneName, VARIABLE_TYPE.NEXT, module_name, next_data);

          next(OUTPUT_TYPE.SUCCESS);
        };

        if (data.scene && data.source) {
          methods.comm_send('addon', 'obs-studio', 'call', 'GetSceneItemId', { sceneName: data.scene, sourceName: data.source })
            .then(_data => {
              if (data.scene === receive.data.sceneName && _data && _data.sceneItemId === receive.data.sceneItemId) {
                _next();
              }
            })
            .catch(error => {
              console.error('obs-studio-source-selected:', data, error);
              next(OUTPUT_TYPE.ERROR);
            });
        } else {
          _next();
        }
      }
    },
    'both-obs-studio-sources': (module_name, receive, data, next_data, next) => {
      methods.comm_send('addon', 'obs-studio', 'call', 'GetSources', [data.scene])
        .then(sources => {
          if (!Array.isArray(sources)) {
            return next(OUTPUT_TYPE.ERROR);
          }

          methods.set_variable('obs-studio:sources:count', sources.length, VARIABLE_TYPE.NEXT, module_name, next_data);

          for (let i = 0; i < sources.length; ++i) {
            const source = sources[i];

            methods.set_variable(`obs-studio:source[${i}]:id`, source.sceneItemId, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:name`, source.sourceName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:index`, source.sourceIndex, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:type`, source.sourceType, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:kind`, source.inputKind, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:blend`, source.sceneItemBlendMode, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:group`, !!source.isGroup, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:locked`, source.sceneItemLocked, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:enabled`, source.sceneItemEnabled, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:alignment`, source.sceneItemTransform.alignment, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:rotation`, source.sceneItemTransform.rotation, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:width`, source.sceneItemTransform.width, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:height`, source.sceneItemTransform.height, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:source:width`, source.sceneItemTransform.sourceWidth, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:source:height`, source.sceneItemTransform.sourceHeight, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:position:x`, source.sceneItemTransform.positionX, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:position:y`, source.sceneItemTransform.positionY, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:scale:x`, source.sceneItemTransform.scaleX, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:scale:y`, source.sceneItemTransform.scaleY, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:crop:top`, source.sceneItemTransform.cropTop, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:crop:bottom`, source.sceneItemTransform.cropBottom, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:crop:left`, source.sceneItemTransform.cropLeft, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:crop:right`, source.sceneItemTransform.cropRight, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:bounds:type`, source.sceneItemTransform.boundsType, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:bounds:alignment`, source.sceneItemTransform.boundsAlignment, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:bounds:width`, source.sceneItemTransform.boundsWidth, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable(`obs-studio:source[${i}]:transform:bounds:height`, source.sceneItemTransform.boundsHeight, VARIABLE_TYPE.NEXT, module_name, next_data);
          }

          next(OUTPUT_TYPE.SUCCESS);
        })
        .catch(error => {
          console.error('obs-studio-sources:', data, error);
          next(OUTPUT_TYPE.ERROR);
        });
    },
    'outputs-obs-studio-lock-source': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'SceneItemLockStateChanged') {
        const _next = () => {
          if (data.state === receive.data.sceneItemLocked) {
            methods.set_variable('obs-studio:lock-source:id', receive.data.sceneItemId, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('obs-studio:lock-source:name', receive.data.sceneName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('obs-studio:lock-source:locked', receive.data.sceneItemLocked, VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
          }
        };

        if (data.scene && data.source) {
          methods.comm_send('addon', 'obs-studio', 'call', 'GetSceneItemId', { sceneName: data.scene, sourceName: data.source })
            .then(_data => {
              if (data.scene === receive.data.sceneName && _data && _data.sceneItemId === receive.data.sceneItemId) {
                _next();
              }
            })
            .catch(error => {
              console.error('obs-studio-lock-source:', data, error);
              next(OUTPUT_TYPE.ERROR);
            });
        } else {
          _next();
        }
      }
    },
    'inputs-obs-studio-lock-source': (module_name, receive, data, next_data) => {
      if (data.scene && data.source) {
        const state = Additional.get_state(data.state, true, undefined, false);
        methods.comm_send('addon', 'obs-studio', 'call', 'LockSource', [data.source, data.scene, state]);
      }
    },
    'outputs-obs-studio-toggle-source': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'SceneItemEnableStateChanged') {
        const _next = () => {
          if (data.state === receive.data.sceneItemEnabled) {
            methods.set_variable('obs-studio:toggle-source:id', receive.data.sceneItemId, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('obs-studio:toggle-source:name', data.source, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('obs-studio:toggle-source:scene', receive.data.sceneName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('obs-studio:toggle-source:enabled', receive.data.sceneItemEnabled, VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
          }
        };

        if (data.scene && data.source) {
          methods.comm_send('addon', 'obs-studio', 'call', 'GetSceneItemId', { sceneName: data.scene, sourceName: data.source })
            .then(_data => {
              if (data.scene === receive.data.sceneName && _data && _data.sceneItemId === receive.data.sceneItemId) {
                _next();
              }
            })
            .catch(error => {
              console.error('obs-studio-toggle-source:', data, error);
              next(OUTPUT_TYPE.ERROR);
            });
        } else {
          _next();
        }
      }
    },
    'inputs-obs-studio-toggle-source': (module_name, receive, data, next_data) => {
      if (data.scene && data.source) {
        const state = Additional.get_state(data.state, true, undefined, false);
        methods.comm_send('addon', 'obs-studio', 'call', 'ToggleSource', [data.source, data.scene, state]);
      }
    },
    'outputs-obs-studio-toggle-filter': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'SourceFilterEnableStateChanged') {
        const _next = () => {
          if (data.state === receive.data.filterEnabled) {
            methods.set_variable('obs-studio:toggle-filter:name', receive.data.filterName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('obs-studio:toggle-filter:source', receive.data.sourceName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('obs-studio:toggle-filter:enabled', receive.data.filterEnabled, VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
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
        const state = Additional.get_state(data.state, true, undefined, false);
        methods.comm_send('addon', 'obs-studio', 'call', 'ToggleFilter', [data.filter, data.source, state]);
      }
    },
    'outputs-obs-studio-virtualcam': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.property === 'VirtualcamStateChanged' && ['OBS_WEBSOCKET_OUTPUT_STARTED', 'OBS_WEBSOCKET_OUTPUT_STOPPED'].indexOf(receive.data.outputState) >= 0) {
        const state = receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED';
        methods.set_variable('obs-studio:virtualcam', state, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && data.state === state) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-obs-studio-virtualcam': (module_name, receive, data, next_data) => {
      const state = Additional.get_state(data.state, 'StartVirtualCam', 'ToggleVirtualCam', 'StopVirtualCam');
      methods.comm_send('addon', 'obs-studio', 'call', state);
    },
    'inputs-spotify-add-to-queue': (module_name, receive, data, next_data) => {
      const track = methods.apply_variables(data.track, module_name, next_data) || methods.get_variable('spotify:search[0]:uri', '', module_name, next_data);
      if (typeof track === 'string' && track.trim().length) {
        methods.comm_send('addon', 'spotify', 'call', 'addToQueue', [track]);
      }
    },
    'both-spotify-current-queue': (module_name, receive, data, next_data, next) => {
      methods.comm_send('addon', 'spotify', 'call', 'getQueue')
        .then(data => {
          Additional.spotify_next('spotify:current', ((data.body && data.body.queue) ? [data.body.queue] : []), module_name, next_data, next);
        })
        .catch(error => {
          console.error('spotify-current-queue error:', data, error);
          next(OUTPUT_TYPE.ERROR);
        });
    },
    'both-spotify-currently-playing': (module_name, receive, data, next_data, next) => {
      methods.comm_send('addon', 'spotify', 'call', 'getCurrentTrack')
        .then(track => {
          Additional.spotify_next('spotify:current', (track ? [track] : []), module_name, next_data, next);
        })
        .catch(error => {
          console.error('spotify-currently-playing error:', data, error);
          next(OUTPUT_TYPE.ERROR);
        });
    },
    'inputs-spotify-play-pause': (module_name, receive, data, next_data) => {
      const track = methods.apply_variables(data.track, module_name, next_data) || methods.get_variable('spotify:search[0]:uri', '', module_name, next_data),
        play_pause = play => {
          if (play) {
            methods.comm_send('addon', 'spotify', 'call', 'playNow', [(typeof track === 'string' && track.trim().length) ? track : false]);
          }

          return methods.comm_send('addon', 'spotify', 'call', 'pauseNow');
        };

      if (['on', 'off'].indexOf(data.state) < 0) {
        methods.comm_send('addon', 'spotify', 'call', 'isPlaying')
          .then(is_playing => {
            play_pause(!is_playing, track);
          });
      } else {
        play_pause(data.state === 'on');
      }
    },
    'inputs-spotify-prev-next': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'spotify', 'call', ((data.state ? 'skipToPrevious' : 'skipToNext')));
    },
    'inputs-spotify-repeat': (module_name, receive, data, next_data) => {
      const state = Additional.get_state(data.state, 'off', 'track', 'context');
      methods.comm_send('addon', 'spotify', 'call', 'setRepeat', [state]);
    },
    'both-spotify-search': (module_name, receive, data, next_data, next) => {
      const track = methods.apply_variables(data.track, module_name, next_data);
      if (track.trim().length) {
        methods.comm_send('addon', 'spotify', 'call', 'search', [track])
          .then(tracks => {
            Additional.spotify_next('spotify:search', tracks, module_name, next_data, next);
          })
          .catch(error => {
            console.error('spotify-search error:', data, error);
            next(OUTPUT_TYPE.ERROR);
          });
      }
    },
    'inputs-spotify-shuffle': (module_name, receive, data, next_data) => {
      if (['on', 'off'].indexOf(data.state) < 0) {
        methods.comm_send('addon', 'spotify', 'call', 'isShuffle')
          .then(is_shuffle => {
            methods.comm_send('addon', 'spotify', 'call', 'setShuffle', [!is_shuffle]);
          });
      } else {
        methods.comm_send('addon', 'spotify', 'call', 'setShuffle', [data.state === 'on']);
      }
    },
    'inputs-spotify-volume': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'spotify', 'call', 'setVolume', [data.volume]);
    },
    'outputs-streamlabs-item-added': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'streamlabs' && receive.property === 'ScenesService.itemAdded') {
        console.log(`${receive.name}:`, JSON.stringify(receive.data, null, '  '));
      }
    },
    'outputs-streamlabs-item-update': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'streamlabs' && receive.property === 'ScenesService.itemUpdate') {
        console.log(`${receive.name}:`, JSON.stringify(receive.data, null, '  '));
      }
    },
    'inputs-streamlabs-mute': (module_name, receive, data, next_data) => {
      if (data.source) {
        const state = Additional.get_state(data.state, true, undefined, false);
        methods.comm_send('addon', 'streamlabs', 'call', 'AudioService.getSources')
          .then(sources => {
            const source = sources.find(source => source.name === data.source);
            if (source) {
              const muted = (typeof state === 'boolean') ? state : !source.muted;
              methods.comm_send('addon', 'streamlabs', 'call', 'SourcesService.setMuted', [source.sourceId, muted]);
            }
          });
      }
    },
    'outputs-streamlabs-recording': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'streamlabs' && receive.property === 'StreamingService.recordingStatusChange' && ['recording', 'offline'].indexOf(receive.data) >= 0) {
        const state = receive.data !== 'offline';
        methods.set_variable('streamlabs:recording', state, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && data.state === state) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-streamlabs-recording': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'streamlabs', 'call', 'StreamingService.getModel')
        .then(_data => {
          const state = Additional.get_state(data.state, true, undefined, false);
          if (typeof state === 'undefined' || state !== (_data.recordingStatus !== 'offline')) {
            methods.comm_send('addon', 'streamlabs', 'call', 'StreamingService.toggleRecording');
          }
        });
    },
    'outputs-streamlabs-replay': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'streamlabs' && receive.property === 'StreamingService.replayBufferStatusChange' && ['running', 'offline'].indexOf(receive.data) >= 0) {
        const state = receive.data !== 'offline';
        methods.set_variable('streamlabs:replay', state, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && data.state === state) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-streamlabs-replay': (module_name, receive, data, next_data) => {
      const state = Additional.get_state(data.state, 'startReplayBuffer', undefined, 'stopReplayBuffer');
      if (typeof state !== 'string') {
        methods.comm_send('addon', 'streamlabs', 'call', 'isShuffle')
          .then(_data => {
            methods.comm_send('addon', 'streamlabs', ((_data.replayBufferStatus === 'offline') ? 'StreamingService.startReplayBuffer' : 'StreamingService.stopReplayBuffer'));
          });
      } else {
        methods.comm_send('addon', 'streamlabs', 'call', `StreamingService.${state}`);
      }
    },
    'outputs-streamlabs-save-replay': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'streamlabs' && receive.property === 'StreamingService.replayBufferStatusChange' && receive.data === 'saving') {
        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'inputs-streamlabs-save-replay': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'streamlabs', 'call', 'StreamingService.saveReplay');
    },
    'outputs-streamlabs-streaming': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'streamlabs' && receive.property === 'StreamingService.streamingStatusChange' && ['live', 'offline'].indexOf(receive.data) >= 0) {
        const state = receive.data !== 'offline';
        methods.set_variable('streamlabs:streaming', state, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && data.state === state) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-streamlabs-streaming': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'streamlabs', 'call', 'StreamingService.getModel')
        .then(_data => {
          const state = Additional.get_state(data.state, true, undefined, false);
          if (typeof state === 'undefined' || state !== (_data.streamingStatus !== 'offline')) {
            methods.comm_send('addon', 'streamlabs', 'call', 'StreamingService.toggleStreaming');
          }
        });
    },
    'inputs-streamlabs-toggle-source': (module_name, receive, data, next_data) => {
      if (data.scene && data.source) {
        const state = Additional.get_state(data.state, true, undefined, false);
        methods.comm_send('addon', 'streamlabs', 'call', 'ScenesService.getScenes')
          .then(scenes => {
            const scene = scenes.find(scene => scene.name === data.scene);
            if (scene) {
              const source = scene.nodes.find(source => source.name === data.source);
              if (source) {
                const visible = (typeof state === 'boolean') ? state : !source.visible;
                methods.comm_send('addon', 'streamlabs', 'call', `${source.resourceId}.setVisibility`, [visible]);
              }
            }
          });
      }
    },
    'outputs-streamlabs-switch-scene': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'streamlabs' && receive.property === 'ScenesService.sceneSwitched') {
        methods.set_variable('streamlabs:switch-scene', receive.data.name, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && (!data.scene || data.scene.toLowerCase() === receive.data.name.toLowerCase())) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-streamlabs-switch-scene': (module_name, receive, data, next_data) => {
      if (data.scene) {
        methods.comm_send('addon', 'streamlabs', 'call', 'ScenesService.getScenes')
          .then(scenes => {
            const scene = scenes.find(scene => scene.name === data.scene);
            if (scene) {
              methods.comm_send('addon', 'streamlabs', 'call', 'ScenesService.makeSceneActive', [scene.id]);
            }
          });
      }
    },
    'outputs-twitch-action': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, next, 'Action', 'message', false),
    'inputs-twitch-action': (module_name, receive, data, next_data) => {
      const message = methods.apply_variables(data.message, module_name, next_data),
        type = (data.account && data.account.toLowerCase() === 'bot') ? 'BotChat' : 'Chat';

      if (message.trim().length) {
        methods.comm_send('addon', 'twitch', 'call', 'Action', { type, args: [message] });
      }
    },
    'outputs-twitch-announcement': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, next, 'Announcement', 'message', false),
    'inputs-twitch-announce': (module_name, receive, data, next_data) => {
      const message = methods.apply_variables(data.message, module_name, next_data),
        type = (data.account && data.account.toLowerCase() === 'bot') ? 'BotChat' : 'Chat';

      if (message.trim().length) {
        methods.comm_send('addon', 'twitch', 'call', 'announce', { type: 'Methods', args: [false, message, (data.color ? data.color.toLowerCase() : false), (type === 'BotChat')] });
      }
    },
    'outputs-twitch-ban': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, output_type => {
      methods.set_variable('twitch:ban:user:id', receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:ban:user:name', receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:ban:user:display', receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:ban:reason', receive.data.data.reason, VARIABLE_TYPE.NEXT, module_name, next_data);
      Additional.date_to_vars(receive.data.data.startDate, 'twitch:ban:start', VARIABLE_TYPE.NEXT, module_name, next_data);

      next(OUTPUT_TYPE.SUCCESS);
    }, 'Ban', 'message', true),
    'inputs-twitch-ban': (module_name, receive, data, next_data) => {
      const user = methods.apply_variables(data.user, module_name, next_data),
        reason = methods.apply_variables(data.reason, module_name, next_data);

      if (user.trim().length) {
        methods.comm_send('addon', 'twitch', 'call', 'Ban', { type: 'Chat', args: [user, reason] });
      }
    },
    'outputs-twitch-chat-clear': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'ChatClear') {
        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'inputs-twitch-chat-clear': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'twitch', 'call', 'deleteMessage', { type: 'Methods', args: [false] });
    },
    'outputs-twitch-cheer': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, output_type => {
      methods.set_variable('twitch:cheer:bits', receive.data.data.bits, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:cheer:message', receive.data.data.message, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:cheer:anonymous', receive.data.data.isAnonymous, VARIABLE_TYPE.NEXT, module_name, next_data);

      next(OUTPUT_TYPE.SUCCESS);
    }, 'Cheer', 'message', true),
    'outputs-twitch-command': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, next, 'Command', 'command', true),
    'outputs-twitch-community-pay-forward': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'CommunityPayForward') {
        methods.set_variable(['twitch:all:user:id', 'twitch:community-pay-forward:user:id'], (receive.data.user.id || receive.data.subscribe.forward.userId), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:community-pay-forward:user:name'], (receive.data.user.name || receive.data.subscribe.forward.displayName.toLowerCase()), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:community-pay-forward:user:display'], (receive.data.user.display || receive.data.subscribe.forward.displayName), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:community-pay-forward:original:id', receive.data.subscribe.forward.originalGifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:community-pay-forward:original:name', receive.data.subscribe.forward.originalGifterDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:community-pay-forward:original:display', receive.data.subscribe.forward.originalGifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-community-sub': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'CommunitySub') {
        methods.set_variable(['twitch:all:user:id', 'twitch:community-sub:user:id'], receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:community-sub:user:name'], receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:community-sub:user:display'], receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:community-sub:original:id', receive.data.subscribe.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:community-sub:original:name', receive.data.subscribe.info.gifter, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:community-sub:original:display', receive.data.subscribe.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:community-sub:count', receive.data.subscribe.info.count, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:community-sub:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'inputs-twitch-delete-message': (module_name, receive, data, next_data) => {
      const all = data.type,
        message_id = methods.get_variable('twitch:message:id', '', module_name, next_data);

      if (all || (typeof message_id === 'string' && message_id.trim().length)) {
        methods.comm_send('addon', 'twitch', 'call', 'deleteMessage', { type: 'Methods', args: [false, (all ? undefined : message_id)] });
      }
    },
    'outputs-twitch-emote-only': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'EmoteOnly') {
        methods.set_variable('twitch:emote-only:enabled', receive.data.emote_only.enabled, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.emote_only.enabled === (data.state === 'on'))) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-twitch-emote-only': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'twitch', 'call', 'updateSettings', { type: 'Methods', args: [false, { emoteOnlyModeEnabled: data.state }] });
    },
    'outputs-twitch-first-message': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'obs-studio' && receive.name === 'StreamStateChanged' && receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') {
        const variable_name = `twitch:users[${methods.get_variable('block:id', -1, module_name, next_data)}]`;
        return methods.set_variable(variable_name, [], VARIABLE_TYPE.GLOBALS);
      }

      const type = (typeof data.type === 'undefined' || data.type) ? 'Command' : 'Message';
      Additional.twitch_compare(module_name, receive, data, next_data, output_type => {
        const variable_name = `twitch:users[${methods.get_variable('block:id', -1, module_name, next_data)}]`;

        let users = methods.get_variable(variable_name, []);
        if (typeof users !== 'object' && !Array.isArray(users)) {
          users = [];
        }

        const all = (data.all === 'true'),
          tmp = [...users],
          user = receive.data.user.name.toLowerCase(),
          exists = tmp.indexOf(user) >= 0;

        if (!exists) {
          users.push(user);
          methods.set_variable(variable_name, users, VARIABLE_TYPE.GLOBALS);
        }

        if ((all && !exists) || (!all && !tmp.length)) {
          return next(OUTPUT_TYPE.SUCCESS);
        }

        next(OUTPUT_TYPE.ERROR);
      }, type, type.toLowerCase(), (type === 'command'));
    },
    'outputs-twitch-follow': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, output_type => {
      methods.set_variable(['twitch:all:user:id', 'twitch:follow:user:id'], receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable(['twitch:all:user:name', 'twitch:follow:user:name'], receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable(['twitch:all:user:display', 'twitch:follow:user:display'], receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
      Additional.date_to_vars(receive.data.data.followDate, 'twitch:follow', VARIABLE_TYPE.NEXT, module_name, next_data);

      next(OUTPUT_TYPE.SUCCESS);
    }, 'Follow', 'message', true),
    'outputs-twitch-followers-only': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'FollowersOnly') {
        methods.set_variable('twitch:follower-only:enabled', receive.data.follower_only.enabled, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.follower_only.enabled === (data.state === 'on'))) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-twitch-followers-only': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'twitch', 'call', 'updateSettings', { type: 'Methods', args: [false, { followerOnlyModeDelay: parseInt(data.delay), followerOnlyModeEnabled: data.state }] });
    },
    'both-twitch-game': (module_name, receive, data, next_data, next) => {
      const game = methods.apply_variables(data.game, module_name, next_data)
      if (game.trim().length) {
        methods.comm_send('addon', 'twitch', 'call', 'getGame', { type: 'Methods', args: [game] })
          .then(game => {
            methods.set_variable('twitch:game:id', game.id, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('twitch:game:name', game.name, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('twitch:game:image', game.boxArtUrl, VARIABLE_TYPE.NEXT, module_name, next_data);

            next(OUTPUT_TYPE.SUCCESS);
          })
          .catch(error => {
            console.error('twitch-game error:', data, error);
            next(OUTPUT_TYPE.ERROR);
          });
      }
    },
    'outputs-twitch-gift-paid-upgrade': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'GiftPaidUpgrade') {
        methods.set_variable(['twitch:all:user:id', 'twitch:gift-paid-upgrade:user:id'], (receive.data.user.id || receive.data.upgrade.info.userId), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:gift-paid-upgrade:user:name'], (receive.data.user.name || receive.data.upgrade.info.displayName.toLowerCase()), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:gift-paid-upgrade:user:display'], (receive.data.user.display || receive.data.upgrade.info.displayName), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:gift-paid-upgrade:original:id', receive.data.upgrade.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:gift-paid-upgrade:original:name', receive.data.upgrade.info.gifter, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:gift-paid-upgrade:original:display', receive.data.upgrade.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-info': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'Update') {
        methods.comm_send('addon', 'twitch', 'call', 'getChannelInfo', { type: 'Methods', args: [false] })
          .then(info => {
            if (info) {
              methods.set_variable('twitch:channel:name', info.name, VARIABLE_TYPE.GLOBALS);
              methods.set_variable('twitch:channel:display', info.displayName, VARIABLE_TYPE.GLOBALS);
              methods.set_variable('twitch:channel:title', info.title, VARIABLE_TYPE.GLOBALS);
              methods.set_variable('twitch:channel:lang', info.language, VARIABLE_TYPE.GLOBALS);
              methods.set_variable('twitch:channel:delay', info.delay, VARIABLE_TYPE.GLOBALS);

              info.getGame()
                .then(game => {
                  methods.set_variable('twitch:channel:game:id', game.id, VARIABLE_TYPE.GLOBALS);
                  methods.set_variable('twitch:channel:game:name', game.name, VARIABLE_TYPE.GLOBALS);
                  methods.set_variable('twitch:channel:game:image', game.boxArtUrl, VARIABLE_TYPE.GLOBALS);

                  if (typeof next !== 'undefined') {
                    next(OUTPUT_TYPE.SUCCESS);
                  }
                })
                .catch(error => {
                  methods.set_variable('twitch:channel:game:id', receive.data.data.categoryId, VARIABLE_TYPE.GLOBALS);
                  methods.set_variable('twitch:channel:game:name', receive.data.data.categoryName, VARIABLE_TYPE.GLOBALS);
                  methods.set_variable('twitch:channel:game:image', '', VARIABLE_TYPE.GLOBALS);

                  if (typeof next !== 'undefined') {
                    next(OUTPUT_TYPE.SUCCESS);
                  }
                });
            } else {
              if (typeof next !== 'undefined') {
                next(OUTPUT_TYPE.ERROR);
              }
            }
          })
          .catch(error => {
            methods.set_variable('twitch:channel:title', receive.data.data.streamTitle, VARIABLE_TYPE.GLOBALS);
            methods.set_variable('twitch:channel:lang', receive.data.data.streamLanguage, VARIABLE_TYPE.GLOBALS);
            methods.set_variable('twitch:channel:game:id', receive.data.data.categoryId, VARIABLE_TYPE.GLOBALS);
            methods.set_variable('twitch:channel:game:name', receive.data.data.categoryName, VARIABLE_TYPE.GLOBALS);

            if (typeof next !== 'undefined') {
              next(OUTPUT_TYPE.ERROR);
            }
          });
      }
    },
    'both-twitch-info': (module_name, receive, data, next_data, next) => {
      const channel = methods.apply_variables(data.channel, module_name, next_data).trim().toLowerCase();
      methods.comm_send('addon', 'twitch', 'call', 'getChannelInfo', { type: 'Methods', args: [channel] })
        .then(info => {
          if (info) {
            methods.set_variable('twitch:channel:name', info.name, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('twitch:channel:display', info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('twitch:channel:title', info.title, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('twitch:channel:lang', info.language, VARIABLE_TYPE.NEXT, module_name, next_data);
            methods.set_variable('twitch:channel:delay', info.delay, VARIABLE_TYPE.NEXT, module_name, next_data);

            info.getGame()
              .then(game => {
                methods.set_variable('twitch:channel:game:id', game.id, VARIABLE_TYPE.NEXT, module_name, next_data);
                methods.set_variable('twitch:channel:game:name', game.name, VARIABLE_TYPE.NEXT, module_name, next_data);
                methods.set_variable('twitch:channel:game:image', game.boxArtUrl, VARIABLE_TYPE.NEXT, module_name, next_data);

                next(OUTPUT_TYPE.SUCCESS);
              })
              .catch(error => {
                methods.set_variable('twitch:channel:game:id', info.gameId, VARIABLE_TYPE.NEXT, module_name, next_data);
                methods.set_variable('twitch:channel:game:name', info.gameName, VARIABLE_TYPE.NEXT, module_name, next_data);
                methods.set_variable('twitch:channel:game:image', '', VARIABLE_TYPE.NEXT, module_name, next_data);

                next(OUTPUT_TYPE.SUCCESS);
              });
          } else {
            next(OUTPUT_TYPE.ERROR);
          }
        })
        .catch(error => {
          console.error('twitch-info error:', data, error);
          next(OUTPUT_TYPE.ERROR);
        });
    },
    'inputs-twitch-info': (module_name, receive, data, next_data) => {
      const game = methods.apply_variables(data.game, module_name, next_data),
        status = methods.apply_variables(data.status, module_name, next_data);

      if (status.trim().length || game.trim().length) {
        methods.comm_send('addon', 'twitch', 'call', 'updateChannelInfo', { type: 'Methods', args: [false, status, game] });
      }
    },
    'outputs-twitch-join': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, next, 'Join', 'user', true),
    'outputs-twitch-message': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, next, 'Message', 'message', false),
    'inputs-twitch-message': (module_name, receive, data, next_data) => {
      const message = methods.apply_variables(data.message, module_name, next_data),
        type = (data.account && data.account.toLowerCase() === 'bot') ? 'BotChat' : 'Chat';

      if (message.trim().length) {
        methods.comm_send('addon', 'twitch', 'call', 'Say', { type, args: [message] });
      }
    },
    'inputs-twitch-message-delay': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'twitch', 'call', 'updateSettings', { type: 'Methods', args: [false, { nonModeratorChatDelay: parseInt(data.delay), nonModeratorChatDelayEnabled: data.state }] });
    },
    'outputs-twitch-message-remove': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, next, 'MessageRemove', 'message', false),
    'outputs-twitch-part': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, next, 'Part', 'user', true),
    'outputs-twitch-prime-community-gift': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'PrimeCommunityGift') {
        methods.set_variable(['twitch:all:user:id', 'twitch:prime-community-gift:user:id'], (receive.data.user.id || receive.data.subscribe.info.userId), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:prime-community-gift:user:name'], (receive.data.user.name || receive.data.subscribe.info.displayName.toLowerCase()), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:prime-community-gift:user:display'], (receive.data.user.display || receive.data.subscribe.info.displayName), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:prime-community-gift:original:id', receive.data.subscribe.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:prime-community-gift:original:name', receive.data.subscribe.info.gifter, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:prime-community-gift:original:display', receive.data.subscribe.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:prime-community-gift:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-prime-paid-upgrade': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'PrimePaidUpgrade') {
        methods.set_variable(['twitch:all:user:id', 'twitch:prime-paid-upgrade:user:id'], (receive.data.user.id || receive.data.upgrade.info.userId), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:prime-paid-upgrade:user:name'], (receive.data.user.name || receive.data.upgrade.info.displayName.toLowerCase()), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:prime-paid-upgrade:user:display'], (receive.data.user.display || receive.data.upgrade.info.displayName), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:prime-paid-upgrade:plan:id', receive.data.upgrade.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-raid': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, output_type => {
      methods.set_variable('twitch:raid:channel', receive.data.raid.channel, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:raid:count', receive.data.raid.info.viewerCount, VARIABLE_TYPE.NEXT, module_name, next_data);

      next(OUTPUT_TYPE.SUCCESS);
    }, 'Raid', 'channel', true, () => receive.data.raid.channel),
    'inputs-twitch-raid': (module_name, receive, data, next_data) => {
      const channel = methods.apply_variables(data.game, module_name, next_data);
      if (channel.trim().length) {
        methods.comm_send('addon', 'twitch', 'call', 'Raid', { type: 'Chat', args: [channel] });
      }
    },
    'outputs-twitch-raid-cancel': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'RaidCancel') {
        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'inputs-twitch-raid-cancel': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'twitch', 'call', 'Unraid', { type: 'Chat', args: [] });
    },
    'outputs-twitch-resub': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'Resub') {
        methods.set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.userId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.displayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:message', 'twitch:subscribe:message'], receive.data.message || receive.data.subscribe.info.message, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:months', receive.data.subscribe.info.months, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:plan:name', receive.data.subscribe.info.planName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:streak', receive.data.subscribe.info.streak, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:prime', receive.data.subscribe.info.isPrime, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-redemption': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, output_type => {
      if (receive.data.reward && (!data.reward || data.reward === receive.data.reward.id)) {
        methods.set_variable(['twitch:all:user:id', 'twitch:redemption:user:id'], receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:redemption:user:name'], receive.data.user.name.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:redemption:user:display'], receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:redemption:id', receive.data.reward.id, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:redemption:title', receive.data.reward.title, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:redemption:prompt', receive.data.reward.prompt, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:redemption:cost', receive.data.reward.cost, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:redemption:queued', receive.data.reward.queued, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:redemption:images:1x', receive.data.reward.images.url_1x, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:redemption:images:2x', receive.data.reward.images.url_2x, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:redemption:images:4x', receive.data.reward.images.url_4x, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    }, 'Redemption', 'message', true),
    'outputs-twitch-reward-gift': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'RewardGift') {
        methods.set_variable(['twitch:all:user:id', 'twitch:reward:user:id'], receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:reward:user:name'], receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:reward:user:display'], receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:reward:original:id', receive.data.reward.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:reward:original:name', receive.data.reward.info.gifterDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:reward:original:display', receive.data.reward.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:reward:count', receive.data.reward.info.count, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:reward:domain', receive.data.reward.info.domain, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:reward:shared', receive.data.reward.info.gifterGiftCount, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-ritual': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, output_type => {
      methods.set_variable(['twitch:all:user:id', 'twitch:ritual:user:id'], receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable(['twitch:all:user:name', 'twitch:ritual:user:name'], receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable(['twitch:all:user:display', 'twitch:ritual:user:display'], receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:ritual:name', receive.data.ritual.info.ritualName, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:ritual:message', receive.data.ritual.info.message, VARIABLE_TYPE.NEXT, module_name, next_data);

      next(OUTPUT_TYPE.SUCCESS);
    }, 'Ritual', 'user', true, () => receive.data.ritual.user),
    'inputs-twitch-shoutout': (module_name, receive, data, next_data) => {
      const user = methods.apply_variables(data.user, module_name, next_data);
      if (user.trim().length) {
        methods.comm_send('addon', 'twitch', 'call', 'shoutout', { type: 'Methods', args: [user] });
      }
    },
    'outputs-twitch-stream-offline': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'StreamOffline') {
        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-stream-online': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'StreamOnline') {
        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-slow': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'Slow') {
        methods.set_variable('twitch:slow:enabled', receive.data.slow.enabled, VARIABLE_TYPE.GLOBALS);
        methods.set_variable('twitch:slow:delay', receive.data.slow.delay, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.slow.enabled === (data.state === 'on'))) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-twitch-slow': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'twitch', 'call', 'updateSettings', { type: 'Methods', args: [false, { slowModeDelay: parseInt(data.delay), slowModeEnabled: data.state }] });
    },
    'outputs-twitch-standard-pay-forward': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'StandardPayForward') {
        methods.set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.recipientUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.recipientDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.recipientDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:original:id', receive.data.subscribe.info.originalGifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:original:name', receive.data.subscribe.info.originalGifterDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:original:display', receive.data.subscribe.info.originalGifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-sub': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'Sub') {
        methods.set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.userId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.displayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:message', 'twitch:subscribe:message'], receive.data.message || receive.data.subscribe.info.message, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:months', receive.data.subscribe.info.months, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:plan:name', receive.data.subscribe.info.planName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:streak', receive.data.subscribe.info.streak, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:prime', receive.data.subscribe.info.isPrime, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-sub-extend': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'SubExtend') {
        methods.set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.userId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.displayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:months', receive.data.subscribe.info.months, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:months:end', receive.data.subscribe.info.endMonth, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-sub-gift': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'SubGift') {
        methods.set_variable(['twitch:all:user:id', 'twitch:subscribe:user:id'], receive.data.subscribe.info.userId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:name', 'twitch:subscribe:user:name'], receive.data.subscribe.info.displayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:all:user:display', 'twitch:subscribe:user:display'], receive.data.subscribe.info.displayName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:gifter:id', receive.data.subscribe.info.gifterUserId, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:gifter:name', receive.data.subscribe.info.gifterDisplayName.toLowerCase(), VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:gifter:display', receive.data.subscribe.info.gifterDisplayName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable(['twitch:message', 'twitch:subscribe:message'], receive.data.message || receive.data.subscribe.info.message, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:duration', receive.data.subscribe.info.giftDuration, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:count', receive.data.subscribe.info.gifterGiftCount, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:months', receive.data.subscribe.info.months, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:plan:id', receive.data.subscribe.info.plan, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:plan:name', receive.data.subscribe.info.planName, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:streak', receive.data.subscribe.info.streak, VARIABLE_TYPE.NEXT, module_name, next_data);
        methods.set_variable('twitch:subscribe:prime', receive.data.subscribe.info.isPrime, VARIABLE_TYPE.NEXT, module_name, next_data);

        next(OUTPUT_TYPE.SUCCESS);
      }
    },
    'outputs-twitch-subs-only': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && receive.property === 'SubsOnly') {
        methods.set_variable('twitch:subs-only:enabled', receive.data.subscribe_only.enabled, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.subscribe_only.enabled === (data.state === 'on'))) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }},
    'inputs-twitch-subs-only': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'twitch', 'call', 'updateSettings', { type: 'Methods', args: [false, { subscriberOnlyModeEnabled: data.state }] });
    },
    'outputs-twitch-timeout': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, output_type => {
      methods.set_variable('twitch:timeout:user:id', receive.data.user.id, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:timeout:user:name', receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:timeout:user:display', receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);
      methods.set_variable('twitch:timeout:duration', receive.data.timeout.duration, VARIABLE_TYPE.NEXT, module_name, next_data);
      Additional.date_to_vars(receive.data.data.startDate, 'twitch:timeout:start', VARIABLE_TYPE.NEXT, module_name, next_data);
      Additional.date_to_vars(receive.data.data.endDate, 'twitch:timeout:end', VARIABLE_TYPE.NEXT, module_name, next_data);

      next(OUTPUT_TYPE.SUCCESS);
    }, 'Timeout', 'user', true, () => receive.data.timeout.user),
    'inputs-twitch-timeout': (module_name, receive, data, next_data) => {
      const user = methods.apply_variables(data.user, module_name, next_data),
        reason = methods.apply_variables(data.reason, module_name, next_data);

      if (user.trim().length && data.duration) {
        methods.comm_send('addon', 'twitch', 'call', 'Timeout', { type: 'Chat', args: [user, data.duration, reason] });
      }
    },
    'outputs-twitch-unique-message': (module_name, receive, data, next_data, next) => {
      if (receive.id === 'addon' && receive.name === 'twitch' && (receive.property === 'R9k' || receive.property === 'UniqueChat')) {
        methods.set_variable('twitch:unique-message:enabled', receive.data.r9k.enabled, VARIABLE_TYPE.GLOBALS);

        if (typeof next !== 'undefined' && (data.state === 'toggle' || receive.data.r9k.enabled === (data.state === 'on'))) {
          next(OUTPUT_TYPE.SUCCESS);
        }
      }
    },
    'inputs-twitch-unique-message': (module_name, receive, data, next_data) => {
      methods.comm_send('addon', 'twitch', 'call', 'updateSettings', { type: 'Methods', args: [false, { uniqueChatModeEnabled: data.state }] });
    },
    'outputs-twitch-whisper': (module_name, receive, data, next_data, next) => Additional.twitch_compare(module_name, receive, data, next_data, output_type => {
      next(output_type);
    }, 'Whisper', 'message', false),
    'inputs-twitch-whisper': (module_name, receive, data, next_data) => {
      const user = methods.apply_variables(data.user, module_name, next_data),
        message = methods.apply_variables(data.message, module_name, next_data);

      if (user.trim().length && message.trim().length) {
        methods.comm_send('addon', 'twitch', 'call', 'Whisper', { type: 'Chat', args: [user, message] });
      }
    },
    'both-voicemeeter-get-settings': (module_name, receive, data, next_data, next) => {
      methods.comm_send('addon', 'voicemeeter', 'call', 'getAllParameter')
        .then(parameters => {
          methods.set_variable('voicemeeter:strips:count', parameters.inputs.length, VARIABLE_TYPE.NEXT, module_name, next_data);
          for (let i = 0; i < parameters.inputs.length; ++i) {
            const strip = parameters.inputs[i];
            for (const parameter of Object.keys(strip)) {
              methods.set_variable(`voicemeeter:strip[${i}]:${parameter.toLowerCase()}`, strip[parameter], VARIABLE_TYPE.NEXT, module_name, next_data);
            }
          }

          methods.set_variable('voicemeeter:buses:count', parameters.outputs.length, VARIABLE_TYPE.NEXT, module_name, next_data);
          for (let i = 0; i < parameters.outputs.length; ++i) {
            const strip = parameters.outputs[i];
            for (const parameter of Object.keys(strip)) {
              methods.set_variable(`voicemeeter:bus[${i}]:${parameter.toLowerCase()}`, strip[parameter], VARIABLE_TYPE.NEXT, module_name, next_data);
            }
          }

          next(OUTPUT_TYPE.SUCCESS);
        });
    },
    'inputs-voicemeeter-set-setting': (module_name, receive, data, next_data) => {
      const value = methods.apply_variables(data.value, module_name, next_data);
      if (data.type && data.type.trim().length && data.param && data.param.trim().length && value.trim().length) {
        methods.comm_send('addon', 'voicemeeter', 'call', '_setParameter', [
          ((data.type.toLowerCase() === 'strip') ? 0 : 1),
          (data.param[0].toUpperCase() + data.param.substring(1)),
          parseInt(data.num),
          value
        ]);
      }
    },
    'inputs-voicemeeter-mute': (module_name, receive, data, next_data) => {
      const state = Additional.get_state(data.state, true, undefined, false);
      if (data.type.trim().length) {
        methods.comm_send('addon', 'voicemeeter', 'call', 'isParametersDirty')
          .then(() => {
            methods.comm_send('addon', 'voicemeeter', 'call', 'getParameter', [`${data.type}[${data.num}].mute`])
              .then(muted => {
                muted = (typeof state === 'boolean') ? state : !muted;
                methods.comm_send('addon', 'voicemeeter', 'call', `set${data.type}Mute`, [parseInt(data.num), muted]);
              });
          });
      }
    },
  };
};