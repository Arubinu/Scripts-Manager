const	fs = require('fs'),
		ws = require('ws'),
		path = require('path'),
		temp = require('temp'),
		https = require('https'),
		socket = require('dgram'),
		{ request } = require('undici'),
		child_process = require('child_process'),
		StreamTransform = require('stream').Transform,
		{ MessageEmbed, MessageAttachment, WebhookClient } = require('discord.js');

const	VARIABLE_TYPE = Object.freeze({
			GLOBALS: 0,
			LOCALS: 1,
			NEXT: 2
		});

let		_cmd = '',
		_config = {},
		_sender = null,
		_variables = {
			globals: {},
			locals: {}
		};

const	functions = {
	hex2rgb: hex => {
		var bigint = parseInt(hex, 16);
		var r = (bigint >> 16) & 255;
		var g = (bigint >> 8) & 255;
		var b = bigint & 255;

		return `${r},${g},${b}`;
	},
	twitch_compare: (module_name, receive, data, next_data, next, name, arg, simple, force_receive) => {
		if (receive.id === 'twitch' && receive.name === name)
		{
			force_receive = ((typeof force_receive === 'function') ? force_receive() : receive.data.message);

			let check = (!data[arg] || force_receive.toLowerCase() == data[arg].toLowerCase());
			if (!simple)
			{
				const	msg_compare	= (data.case ? data[arg] : data[arg].toLowerCase()),
						msg_receive	= (data.case ? force_receive : force_receive.toLowerCase());

				check = (!msg_compare || (data.contains && msg_receive.indexOf(msg_compare) >= 0) || (!data.contains && msg_compare == msg_receive));
			}
			else if (name.toLowerCase() === 'command')
				check = !force_receive.indexOf(data[arg]);

			if (check)
			{
				const	flags	= receive.data.flags,
						viewer	= (!flags.broadcaster && !flags.moderator && !flags.vip && !flags.founder && !flags.subscriber);

				let check = false;
				check = (check || (data.broadcaster && flags.broadcaster));
				check = (check || (data.moderator && flags.moderator));
				check = (check || (data.vip && flags.vip));
				check = (check || (data.founder && flags.founder));
				check = (check || (data.subscriber && flags.subscriber));
				check = (check || (data.viewer && viewer));

				if (check)
				{
					set_variable('username', receive.data.user.name, VARIABLE_TYPE.NEXT, module_name, next_data);
					set_variable('displayname', receive.data.user.display, VARIABLE_TYPE.NEXT, module_name, next_data);

					if (name.toLowerCase() === 'command')
					{
						const	command		= data[arg],
								arguments	= force_receive.substr(command.length).trim(),
								split		= arguments.split(' ');

						set_variable('command', command, VARIABLE_TYPE.NEXT, module_name, next_data);
						set_variable('arguments', arguments, VARIABLE_TYPE.NEXT, module_name, next_data);
						for (let i = 0; i < split.length; ++i)
							set_variable(`argument[${i}]`, split[i], VARIABLE_TYPE.NEXT, module_name, next_data);
					}
					else if (name.toLowerCase() === 'message')
						set_variable('message', force_receive.toString(), VARIABLE_TYPE.NEXT, module_name, next_data);

					next();
				}
			}
		}
	}
};

const	pregetters = {
	'twitch_channel_game': async (get_data, channel_name) => [await _sender('twitch', 'getChannelGame', { type: 'Methods', args: [channel_name || false] }), channel_name],
	'twitch_channel_info': async (get_data, channel_name) => [await _sender('twitch', 'getChannelInfo', { type: 'Methods', args: [channel_name || false] }), channel_name],
};

const	getters = {
	'date:toLocaleTimeString': ['Date Locale Time', [], get_data => (new Date()).toLocaleTimeString()],
	'date:toLocaleDateString': ['Date Locale Date', [], get_data => (new Date()).toLocaleDateString()],
	'twitch:channelGame': ['Twitch Channel Game', ['Channel Name'], (get_data, channel_name) => (get_data[`twitch_channel_info:${channel_name}`].displayName || '').replace('Just Chatting', 'Discussion'), ['twitch_channel_info']],
	'twitch:channelName': ['Twitch Channel Name', ['Channel Name'], (get_data, channel_name) => (get_data[`twitch_channel_info:${channel_name}`].title || ''), ['twitch_channel_info']],
	'twitch:channelTitle': ['Twitch Channel Title', ['Channel Name'], (get_data, channel_name) => (get_data[`twitch_channel_info:${channel_name}`].gameName || ''), ['twitch_channel_info']],
};

const	actions = {
	'cooldown': (module_name, receive, data, next_data, next) => {
		if (data.seconds > 0)
		{
			const value = get_variable(data.variable, 0, module_name, next_data);
			if (typeof value !== 'number')
				value = 0;

			const now = Date.now();
			if (!value || (value + (data.seconds * 1000)) < now)
			{
				set_variable(data.variable, now, VARIABLE_TYPE.NEXT, module_name, next_data);
				next();
			}
		}
	},
	'http-request': async (module_name, receive, data, next_data, next) => {
		if (data.url && data.method)
		{
			const {
				status,
				headers,
				trailers,
				body
			} = await request(data.url, { method: data.method.toUpperCase() });

			next();
		}
	},
	'socket-request': (module_name, receive, data, next_data, next) => {
		if (data.host && data.port && data.data)
		{
			const	tdata	= Buffer.from(data.data),
					client	= socket.createSocket('udp4');

			client.send(tdata, parseInt(data.port), data.host, error => {
				if (error)
					console.log('socket-request error:', error);

				client.close();
				next();
			});
		}
	},
	'websocket-request': (module_name, receive, data, next_data, next) => {
		if (data.url && data.data)
		{
			let tdata = data.data;
			try
			{
				tdata = JSON.parse(tdata);
			}
			catch (e) {}

			const client = new ws(data.url);
			client.on('error', error => console.error('websocket-request error:', error));

			client.onopen = () => {
				client.send(tdata, () => {
					client.close();
					next();
				});
			};
		}
	},
	'launch-app': (module_name, receive, data, next_data, next) => {
		if (!_cmd)
			return;

		child_process.spawn(_cmd, ['/c', 'start', '', data.program], {
			cwd: path.dirname(data.program),
		}).on('close', exit_code => {
			next();
		}).on('error', error => {
			console.error('launch-app:', data, error);
		});
	},
	'open-url': (module_name, receive, data, next_data, next) => {
		if (!_cmd)
			return;

		let address = data.address;
		if (address.indexOf('://') < 0)
			address = 'https://' + address;

		child_process.spawn(_cmd, ['/c', 'explorer', address], {
			cmd: process.env.USERPROFILE,
			detached: true
		}).on('close', exit_code => {
			next();
		}).on('error', error => {
			console.error('launch-app:', data, error);
		});
	},
	'self-timer': (module_name, receive, data, next_data, next) => {
		if (data.millis > 0)
			setTimeout(next, data.millis);
	},
	'variable-setter': (module_name, receive, data, next_data, next) => {
		let value = '';
		switch (data.type)
		{
			case 'string': value = data.string; break;
			case 'number': value = parseFloat(data.number); break;
			case 'boolean': value = (data.boolean == 'true'); break;
		}

		set_variable(data.variable, now, scope(data), module_name, next_data);
		_variables[data.variable] = value;

		next();
	},
	'variable-remove': (module_name, receive, data, next_data, next) => {
		if (typeof _variables[data.variable] !== 'undefined')
			delete _variables[data.variable];

		next();
	},
	'trigger-discord-webhook': async (module_name, receive, data, next_data) => {
		if (data.webhook && data.title)
		{
			const next = () => {
				const	webhook = new WebhookClient({ url: data.webhook }),
						bigimage = (data['big-image'] ? new MessageAttachment(data['big-image']) : false),
						thumbnail = (data.thumbnail ? new MessageAttachment(data.thumbnail) : false);
						embed = new MessageEmbed()
							//.setTimestamp()
							.setColor('#c0392b')
							.setTitle(texts.title);

				let images = [];
				if (data['big-image'])
					images.push(bigimage);
				if (data.thumbnail)
					images.push(thumbnail);

				if (data.url)
					embed.setURL(data.url);
				if (data.thumbnail)
					embed.setThumbnail('attachment://' + path.basename(data.thumbnail));
				if (data['big-image'])
					embed.setImage('attachment://' + encodeURI(path.basename(data['big-image'])));
				if (data['inline-1-title'] && data['inline-1-content'])
					embed.addField(texts['inline-1-title'], texts['inline-1-content'], true);
				if (data['inline-2-title'] && data['inline-2-content'])
					embed.addField(texts['inline-2-title'], texts['inline-2-content'], true);

				//embed.setAuthor('Author here', 'https://cdn.discordapp.com/embed/avatars/0.png', 'https://www.google.com');
				//embed.setDescription('');
				//embed.setFooter('', 'https://cdn.discordapp.com/embed/avatars/0.png');

				webhook.send({ content: '@everyone', embeds: [embed], files: images, allowed_mentions: { parse: ['everyone'] } });
			};

			let texts = {};
			const channel_game = await _sender('twitch', 'getChannelGame', { type: 'Methods', args: [false] });
			const channel_info = await _sender('twitch', 'getChannelInfo', { type: 'Methods', args: [false] });
			for (const name of ['title', 'inline-1-title', 'inline-1-content', 'inline-2-title', 'inline-2-content'])
			{
				texts[name] = data[name]
					.replace('${date:toLocaleTimeString}', (new Date()).toLocaleTimeString())
					.replace('${date:toLocaleDateString}', (new Date()).toLocaleDateString())
					.replace('${twitch:channelName}', ((channel_info && channel_info.displayName) || ''))
					.replace('${twitch:channelTitle}', ((channel_info && channel_info.title) || ''))
					.replace('${twitch:channelGame}', ((channel_info && channel_info.gameName) || '').replace('Just Chatting', 'Discussion'));
			}

			if (!data.thumbnail && channel_game)
			{
				const url = channel_game.boxArtUrl.replace('{width}', '188').replace('{height}', '250');

				https.request(url, response => {
					var sdata = new StreamTransform();

					response.on('data', chunk => {
						sdata.push(chunk);
					});

					response.on('end', () => {
						const thumbnail_path = path.join(temp.mkdirSync(), ('thumbnail' + path.extname(url)));
						fs.writeFileSync(thumbnail_path, sdata.read());
						data.thumbnail = thumbnail_path;
						next();
					});
				}).end();
			}
			else if (data.thumbnail)
			{
				const thumbnail_path = path.join(temp.mkdirSync(), ('thumbnail' + path.extname(data.thumbnail)));
				fs.copyFileSync(data.thumbnail, thumbnail_path);
				data.thumbnail = thumbnail_path;
				next();
			}
			else
				next();
		}
	},
	'event-obs-studio-authentification': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && ((receive.name === 'AuthenticationSuccess' && data.state) || (receive.name === 'AuthenticationFailure' && !data.state)))
			next();
	},
	'event-obs-studio-connection': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && ((receive.name === 'ConnectionOpened' && data.state) || (receive.name === 'ConnectionClosed' && !data.state)))
			next();
	},
	'event-obs-studio-exit': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'ExitStarted')
			next();
	},
	'event-obs-studio-recording': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'RecordStateChanged')
		{
			let state = null;
			state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') ? true : state;
			state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED') ? false : state;
			if (data.state === state)
				next();
		}
	},
	'trigger-obs-studio-recording': (module_name, receive, data, next_data) => {
		let state = 'ToggleRecord';
		state = ((data.state === 'on') ? 'StartRecord' : state);
		state = ((data.state === 'off') ? 'StopRecord' : state);

		_sender('obs-studio', state);
	},
	'event-obs-studio-replay': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'ReplayBufferStateChanged')
		{
			let state = null;
			state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') ? true : state;
			state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED') ? false : state;
			if (data.state === state)
				next();
		}
	},
	'trigger-obs-studio-replay': (module_name, receive, data, next_data) => {
		let state = 'ToggleReplayBuffer';
		state = ((data.state === 'on') ? 'StartReplayBuffer' : state);
		state = ((data.state === 'off') ? 'StopReplayBuffer' : state);

		_sender('obs-studio', state);
	},
	'event-obs-studio-save-replay': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'ReplayBufferSaved')
			next();
	},
	'trigger-obs-studio-save-replay': (module_name, receive, data, next_data) => {
		_sender('obs-studio', 'SaveReplayBuffer');
	},
	'event-obs-studio-streaming': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'StreamStateChanged')
		{
			let state = null;
			state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') ? true : state;
			state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED') ? false : state;

			if (data.state === state)
				next();
		}
	},
	'trigger-obs-studio-streaming': (module_name, receive, data, next_data) => {
		let state = 'ToggleStream';
		state = ((data.state === 'on') ? 'StartStream' : state);
		state = ((data.state === 'off') ? 'StopStream' : state);

		_sender('obs-studio', state);
	},
	'event-obs-studio-studio-mode': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'StudioModeStateChanged' && data.state === receive.data.studioModeEnabled)
			next();
	},
	'trigger-obs-studio-studio-mode': (module_name, receive, data, next_data) => {
		let state = undefined;
		state = ((data.state === 'on') ? true : state);
		state = ((data.state === 'off') ? false : state);

		_sender('obs-studio', 'ToggleStudioMode', [state]);
	},
	'event-obs-studio-switch-scene': (module_name, receive, data, next_data, next) => {
		if (data.scene && receive.id === 'obs-studio' && receive.name === 'SwitchScenes' && receive.data.sceneName.toLowerCase() == data.scene.toLowerCase())
			next();
	},
	'trigger-obs-studio-switch-scene': (module_name, receive, data, next_data) => {
		if (data.scene)
			_sender('obs-studio', 'SetCurrentScene', [data.scene]);
	},
	'event-obs-studio-source-selected': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'SceneItemSelected')
		{
			_sender('obs-studio', 'GetSceneItemId', { sceneName: data.scene, sourceName: data.source }).then(_data => {
				if (data.scene === receive.data.sceneName && _data && _data.sceneItemId === receive.data.sceneItemId)
					next();
			}).catch(error => {});
		}
	},
	'event-obs-studio-lock-source': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'SceneItemLockStateChanged')
		{
			_sender('obs-studio', 'GetSceneItemId', { sceneName: data.scene, sourceName: data.source }).then(_data => {
				if (data.scene === receive.data.sceneName && _data && _data.sceneItemId === receive.data.sceneItemId && data.state === receive.data.sceneItemLocked)
					next();
			}).catch(error => {});
		}
	},
	'trigger-obs-studio-lock-source': (module_name, receive, data, next_data) => {
		if (data.scene && data.source)
		{
			let state = undefined;
			state = ((data.state === 'on') ? true : state);
			state = ((data.state === 'off') ? false : state);

			_sender('obs-studio', 'LockSource', [data.source, data.scene, state]);
		}
	},
	'event-obs-studio-toggle-source': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'SceneItemEnableStateChanged')
		{
			_sender('obs-studio', 'GetSceneItemId', { sceneName: data.scene, sourceName: data.source }).then(_data => {
				if (data.scene === receive.data.sceneName && _data && _data.sceneItemId === receive.data.sceneItemId && data.state === receive.data.sceneItemEnabled)
					next();
			}).catch(error => {});
		}
	},
	'trigger-obs-studio-toggle-source': (module_name, receive, data, next_data) => {
		if (data.scene && data.source)
		{
			let state = undefined;
			state = ((data.state === 'on') ? true : state);
			state = ((data.state === 'off') ? false : state);

			_sender('obs-studio', 'ToggleSource', [data.source, data.scene, state]);
		}
	},
	'event-obs-studio-toggle-filter': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'SourceFilterEnableStateChanged')
		{
			if (data.source === receive.data.sourceName && data.filter === receive.data.filterName && data.state === receive.data.filterEnabled)
				next();
		}
	},
	'trigger-obs-studio-toggle-filter': (module_name, receive, data, next_data) => {
		if (data.source && data.filter)
		{
			let state = undefined;
			state = ((data.state === 'on') ? true : state);
			state = ((data.state === 'off') ? false : state);

			_sender('obs-studio', 'ToggleFilter', [data.filter, data.source, state]);
		}
	},
	'event-obs-studio-virtualcam': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'VirtualcamStateChanged')
		{
			let state = null;
			state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') ? true : state;
			state = (receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED') ? false : state;

			if (data.state === state)
				next();
		}
	},
	'trigger-obs-studio-virtualcam': (module_name, receive, data, next_data) => {
		let state = 'ToggleVirtualCam';
		state = ((data.state === 'on') ? 'StartVirtualCam' : state);
		state = ((data.state === 'off') ? 'StopVirtualCam' : state);

		_sender('obs-studio', state);
	},
	'trigger-spotify-play-pause': (module_name, receive, data, next_data, next) => {
		if (data.state === 'on')
			instance.setShuffle(true).then(() => {});
		else if (data.state === 'off')
			instance.setShuffle(false).then(() => {});
		else
			instance.getMyCurrentPlaybackState().then(data => { instance[(data.body && data.body.is_playing) ? 'pause' : 'play']().then(() => {}); });
	},
	'trigger-spotify-prev-next': (module_name, receive, data, next_data, next) => {
		if (data.state)
			instance.skipToPrevious().then(() => {});
		else
			instance.skipToNext().then(() => {});
	},
	'trigger-spotify-shuffle': (module_name, receive, data, next_data, next) => {
		if (data.state === 'on')
			instance.setShuffle(true).then(() => {});
		else if (data.state === 'off')
			instance.setShuffle(false).then(() => {});
		else
			instance.setShuffle(true).then(() => {}, err => { instance.setShuffle(false).then(() => {}); });
	},
	'trigger-spotify-volume': (module_name, receive, data, next_data, next) => {
		instance.setVolume(data.volume).then(() => {});
	},
	'event-twitch-action': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Message', 'message', false),
	'trigger-twitch-action': (module_name, receive, data, next_data) => {
		if (data.message)
			_sender('twitch', 'Action', { type: 'Chat', args: [data.message] });
	},
	'event-twitch-announcement': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Message', 'message', false),
	'trigger-twitch-announce': (module_name, receive, data, next_data) => {
		if (data.message)
			_sender('twitch', 'Announce', { type: 'Chat', args: [data.message] });
	},
	'event-twitch-any-message': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Message', 'message', false),
	'event-twitch-first-message': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'obs-studio' && receive.name === 'StreamStateChanged' && receive.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED')
			return set_variable('twitch-users', [], VARIABLE_TYPE.GLOBALS);

		functions.twitch_compare(module_name, receive, data, next_data, () => {
			let users = get_variable('twitch-users', []);
			if (typeof users === 'object' && Array.isArray(users))
			{
				const	all		= (data.all === 'true'),
						tmp		= [...users],
						user	= receive.data.user.name.toLowerCase(),
						exists	= tmp.indexOf(user) < 0;

				if (!exists)
				{
					users.push(user);
					set_variable('twitch-users', users, VARIABLE_TYPE.GLOBALS);
				}

				if ((all && exists) || (!all && !tmp.length))
					next();
			}
		}, 'Message', 'message', !data.message);
	},
	'event-twitch-ban': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'Ban')
		{
			if (receive.data.user.name.toLowerCase() == data.user.toLowerCase())
				next();
		}
	},
	'trigger-twitch-ban': (module_name, receive, data, next_data) => {
		if (data.user)
			_sender('twitch', 'Ban', { type: 'Chat', args: [data.user, data.reason] });
	},
	'event-twitch-chat-clear': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'ChatClear')
			next();
	},
	'trigger-twitch-chat-clear': (module_name, receive, data, next_data) => {
		_sender('twitch', 'Clear', { type: 'Chat', args: [] });
	},
	'event-twitch-command': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Command', 'command', true),
	'event-twitch-community-pay-forward': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'CommunityPayForward')
			next();
	},
	'event-twitch-community-sub': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'CommunitySub')
			next();
	},
	'event-twitch-emote-only': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'EmoteOnly')
		{
			if (data.state == 'toggle' || receive.data.emote_only.enabled == (data.state === 'on'))
				next();
		}
	},
	'trigger-twitch-emote-only': (module_name, receive, data, next_data) => {
		const method = ((data.state === 'on') ? 'enableEmoteOnly' : 'disableEmoteOnly');
		_sender('twitch', method, { type: 'Chat', args: [] });
	},
	'event-twitch-followers-only': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'FollowersOnly')
		{
			if (data.state == 'toggle' || receive.data.follower_only.enabled == (data.state === 'on'))
				next();
		}
	},
	'trigger-twitch-followers-only': (module_name, receive, data, next_data) => {
		const min = 0; // The time (in minutes) a user needs to be following before being able to send messages.
		const method = ((data.state === 'on') ? 'enableFollowersOnly' : 'disableFollowersOnly');
		_sender('twitch', method, { type: 'Chat', args: [min] });
	},
	'event-twitch-gift-paid-upgrade': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'GiftPaidUpgrade')
			next();
	},
	'event-twitch-host': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
		if (true) // todo: manage the number of viewers (receive.data.host.viewers)
			next();
	}, 'Host', 'channel', true, () => receive.data.host.channel),
	'event-twitch-hosted': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Hosted', 'channel', true, () => receive.data.host.channel),
	'trigger-twitch-host': (module_name, receive, data, next_data) => {
		if (data.channel)
			_sender('twitch', 'Host', { type: 'Chat', args: [data.channel] });
	},
	/*'event-twitch-info': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === '')
			next();
	},*/
	'trigger-twitch-info': (module_name, receive, data, next_data) => {
		if (data.status || data.game)
			_sender('twitch', 'updateChannelInfo', { type: 'Methods', args: [false, data.status, data.game] });
	},
	'event-twitch-message': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Message', 'message', false),
	'trigger-twitch-message': (module_name, receive, data, next_data) => {
		if (data.message)
		{
			let message = data.message;
			if (typeof _variables.locals[module_name] === 'object')
			{
				for (const name in _variables.locals[module_name])
					message = message.replaceAll(`\$\{${name}\}`, _variables.locals[module_name][name].toString());
			}

			if (message.length)
				_sender('twitch', 'Say', { type: 'Chat', args: [message] });
		}
	},
	'event-twitch-message-remove': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Message', 'message', false),
	'event-twitch-prime-community-gift': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'PrimeCommunityGift')
			next();
	},
	'event-twitch-prime-paid-upgrade': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'PrimePaidUpgrade')
			next();
	},
	'event-twitch-raid': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
		if (true) // todo: manage the number of viewers (receive.data.host.viewers)
			next();
	}, 'Raid', 'channel', true, () => receive.data.raid.channel),
	'trigger-twitch-raid': (module_name, receive, data, next_data) => {
		if (data.channel)
			_sender('twitch', 'Raid', { type: 'Chat', args: [data.channel] });
	},
	'event-twitch-raid-cancel': (module_name, receive, data, next_data, next) => next,
	'trigger-twitch-raid-cancel': (module_name, receive, data, next_data) => {
		_sender('twitch', 'Unraid', { type: 'Chat', args: [] });
	},
	'event-twitch-resub': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'Resub')
			next();
	},
	'event-twitch-redemption': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'Redemption' && receive.data.reward && (!data.reward || data.reward == receive.data.reward.id))
			next();
	},
	'event-twitch-reward-gift': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'RewardGift')
			next();
	},
	'event-twitch-ritual': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, () => {
		if (true) // todo: manage the number of viewers (receive.data.host.viewers)
			next();
	}, 'Ritual', 'user', true, () => receive.data.ritual.user),
	'event-twitch-slow': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'Slow')
		{
			if (data.state == 'toggle' || receive.data.slow.enabled == (data.state === 'on'))
				next();
		}
	},
	'trigger-twitch-slow': (module_name, receive, data, next_data) => {
		const min = 0; // The time (in seconds) a user needs to wait between messages.
		const method = ((data.state === 'on') ? 'enableSlow' : 'disableSlow');
		_sender('twitch', method, { type: 'Chat', args: [min] });
	},
	'event-twitch-standard-pay-forward': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'StandardPayForward')
			next();
	},
	'event-twitch-sub': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'Subscription')
			next();
	},
	'event-twitch-sub-extend': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'SubExtend')
			next();
	},
	'event-twitch-sub-gift': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'SubGift')
			next();
	},
	'event-twitch-subs-only': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'SubsOnly')
		{
			if (data.state == 'toggle' || receive.data.subscribe_only.enabled == (data.state === 'on'))
				next();
		}},
	'trigger-twitch-subs-only': (module_name, receive, data, next_data) => {
		const method = ((data.state === 'on') ? 'enableSubsOnly' : 'disableSubsOnly');
		_sender('twitch', method, { type: 'Chat', args: [] });
	},
	'event-twitch-timeout': (module_name, receive, data, next_data, next) => functions.twitch_compare(module_name, receive, data, next_data, next, 'Timeout', 'user', true, () => receive.data.timeout.user),
	'trigger-twitch-timeout': (module_name, receive, data, next_data) => {
		if (data.user && data.duration)
			_sender('twitch', 'Timeout', { type: 'Chat', args: [data.user, data.duration, data.reason] });
	},
	'event-twitch-unhost': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && receive.name === 'Unhost')
			next();
	},
	'trigger-twitch-unhost': (module_name, receive, data, next_data) => {
		_sender('twitch', 'UnhostOutside', { type: 'Chat', args: [] });
	},
	'event-twitch-unique-message': (module_name, receive, data, next_data, next) => {
		if (receive.id === 'twitch' && (receive.name === 'R9k' || receive.name === 'UniqueChat'))
		{
			if (data.state == 'toggle' || receive.data.r9k.enabled == (data.state === 'on'))
				next();
		}
	},
	'trigger-twitch-unique-message': (module_name, receive, data, next_data) => {
		const method = ((data.state === 'on') ? 'enableUniqueChat' : 'disableUniqueChat');
		_sender('twitch', method, { type: 'Chat', args: [] });
	},
	'event-twitch-whisper': (module_name, receive, data, next_data, next) => { // todo: to modify functions.twitch_compare
		if (data.message && receive.id === 'twitch' && receive.name === 'Whisper')
		{
			const msg_compare = (data.case ? data.message : data.message.toLowerCase());
			const msg_receive = (data.case ? receive.data.message : receive.data.message.toLowerCase());
			if (!msg_compare || (data.contains && msg_receive.indexOf(msg_compare) >= 0) || (!data.contains && msg_compare == msg_receive))
				next();
		}
	},
	'trigger-twitch-whisper': (module_name, receive, data, next_data) => {
		if (data.user && data.message)
			_sender('twitch', 'Whisper', { type: 'Chat', args: [data.user, data.message] });
	},
};

function scope(data)
{
	let variable_type = VARIABLE_TYPE.GLOBALS;
	variable_type = ((data.scope == 'toggle') ? VARIABLE_TYPE.LOCALS : variable_type);
	variable_type = ((data.scope == 'off') ? VARIABLE_TYPE.NEXT : variable_type);

	return variable_type;
}

function get_variable(name, base, module_name, next_data)
{
	if (typeof next_data !== 'undefined' && typeof next_data[name] !== 'undefined')
		return next_data[name];

	if (typeof module_name !== 'undefined')
	{
		if (typeof _variables.locals[module_name] !== 'undefined' && typeof _variables.locals[module_name][name] !== 'undefined')
			return _variables.locals[module_name][name];
	}

	if (typeof _variables.globals[name] !== 'undefined')
		return _variables.globals[name];

	return base;
}

function set_variable(name, value, variable_type, module_name, next_data)
{
	if (variable_type == VARIABLE_TYPE.NEXT)
	{
		if (typeof _variables.locals[module_name] === 'undefined')
			_variables.locals[module_name] = {};

		_variables.locals[module_name][name] = value;
	}
	else if (variable_type == VARIABLE_TYPE.LOCALS)
		next_data[name] = value;
	else
		_variables.globals[name] = value;
}

module.exports = {
	init: (origin, config, sender) => {
		_sender = sender;
		_config = config;

		for (const item of process.env.path.split(';'))
		{
			const	program	= path.join(item, 'cmd.exe');

			if (fs.existsSync(program))
			{
				_cmd = program;
				break;
			}
		}
	},
	receiver: (id, name, data) => {
		if (id === 'manager')
		{
			if (name == 'show')
				_sender('message', 'config', _config);
			else if (name == 'enabled')
				_config.default.enabled = data;

			return;
		}
		else if (id === 'message' && name === 'index')
		{
			if (typeof data === 'object')
			{
				if (data.save)
				{
					_config.actions = data.save;
					_sender('manager', 'config:override', _config);
				}
				else if (data.module)
				{
					_config.settings.module = data.module;
					_sender('manager', 'config', _config);
				}
				else if (data.request)
				{
					_sender(...data.request.slice(1)).then(_data => {
						_sender('message', 'receive', { source: data.request[0], id: data.request[1], name: data.request[2], data: _data });
					}).catch(error => {});
				}
			}

			return;
		}

		if (_config.default.enabled)
		{
			const receive = { id, name, data };
			for (const module_name in _config.actions)
			{
				const action = _config.actions[module_name];
				let next_data = {};
				let getters_data = {};
				let getters_storage = {};

				for (const node_index in action.data)
				{
					const node = action.data[node_index];
					if (!Object.keys(node.inputs).length && typeof actions[node.data.type] !== 'undefined')
					{
						const next = node => {
							for (const output_index in node.outputs)
							{
								const output = node.outputs[output_index].connections;
								for (const connection of node.outputs[output_index].connections)
								{
									const node = action.data[connection.node];
									if (typeof actions[node.data.type] !== 'undefined')
										actions[node.data.type](module_name, receive, JSON.parse(JSON.stringify(node.data.data)), next_data, () => next(node));
								}
							}
						};

						actions[node.data.type](module_name, receive, JSON.parse(JSON.stringify(node.data.data)), next_data, () => next(node));
					}
				}
			}
		}
	}
}
