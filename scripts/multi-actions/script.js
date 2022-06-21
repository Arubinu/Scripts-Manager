const	path = require('path'),
		https = require('https'),
		child_process = require('child_process'),
		{ MessageEmbed, MessageAttachment, WebhookClient } = require('discord.js');

let		_config = {},
		_sender = null;

const functions = {
	twitch_compare: (receive, data, next, name, arg, simple, force_receive) => {
		if (receive.id == 'twitch' && receive.name == name)
		{
			force_receive = ((typeof(force_receive) === 'string') ? force_receive : receive.data.message);

			let check = (!data[arg] || force_receive.toLowerCase() == data[arg].toLowerCase());
			if (!simple)
			{
				const msg_compare = (data.case ? data[arg] : data[arg].toLowerCase());
				const msg_receive = (data.case ? force_receive : force_receive.toLowerCase());
				check = (!msg_compare || (data.contains && msg_receive.indexOf(msg_compare) >= 0) || (!data.contains && msg_compare == msg_receive));
			}

			if (check)
			{
				const flags = receive.data.flags;
				const viewer = (!flags.broadcaster && !flags.moderator && !flags.vip && !flags.founder && !flags.subscriber);

				let check = false;
				check = (check || (data.broadcaster && flags.broadcaster));
				check = (check || (data.moderator && flags.moderator));
				check = (check || (data.vip && flags.vip));
				check = (check || (data.founder && flags.founder));
				check = (check || (data.subscriber && flags.subscriber));
				check = (check || (data.viewer && viewer));

				if (check)
					next();
			}
		}
	}
};

const	actions = {
	'self-timer': (receive, data, next) => {
		if (data.millis > 0)
			setTimeout(next, data.millis);
	},
	'launch-app': (receive, data, next) => {
		child_process.spawn(data.program, [], {
			cwd: path.dirname(data.program),
			detached: true
		}).on('close', exit_code => {
			next();
		}).on('error', error => {
			console.error('launch-app:', data, error);
		});
	},
	'event-twitch-action': (receive, data, next) => functions.twitch_compare(receive, data, next, 'Message', 'message', false),
	'trigger-twitch-action': (receive, data) => {
		if (data.message)
			_sender('twitch', 'Action', { type: 'Chat', args: [data.message] });
	},
	'event-twitch-announcement': (receive, data, next) => functions.twitch_compare(receive, data, next, 'Message', 'message', false),
	'trigger-twitch-announce': (receive, data) => {
		if (data.message)
			_sender('twitch', 'Announce', { type: 'Chat', args: [data.message] });
	},
	'event-twitch-any-message': (receive, data, next) => functions.twitch_compare(receive, data, next, 'Message', 'message', false),
	'event-twitch-ban': (receive, data, next) => {
		if (receive.id == 'twitch' && receive.name == 'Ban')
		{
			if (receive.data.user.name.toLowerCase() == data.user.toLowerCase())
				next();
		}
	},
	'trigger-twitch-ban': (receive, data) => {
		if (data.user)
			_sender('twitch', 'Ban', { type: 'Chat', args: [data.user, data.reason] });
	},
	'event-twitch-chat-clear': (receive, data, next) => {
		if (receive.id == 'twitch' && receive.name == 'ChatClear')
			next();
	},
	'trigger-twitch-chat-clear': (receive, data) => {
		_sender('twitch', 'Clear', { type: 'Chat', args: [] });
	},
	'event-twitch-command': (receive, data, next) => functions.twitch_compare(receive, data, next, 'Command', 'command', true),
	'event-twitch-community-pay-forward': (receive, data, next) => {},
	'event-twitch-community-sub': (receive, data, next) => {},
	'event-twitch-community-sub': (receive, data, next) => {},
	'event-twitch-emote-only': (receive, data, next) => {
		if (receive.id == 'twitch' && receive.name == 'EmoteOnly')
		{
			if (data.state == 'toggle' || receive.data.emote_only.enabled == (data.state == 'on'))
				next();
		}
	},
	'trigger-twitch-emote-only': (receive, data) => {
		const method = ((data.state == 'on') ? 'enableEmoteOnly' : 'disableEmoteOnly');
		_sender('twitch', method, { type: 'Chat', args: [] });
	},
	'event-twitch-followers-only': (receive, data, next) => {
		if (receive.id == 'twitch' && receive.name == 'FollowersOnly')
		{
			if (data.state == 'toggle' || receive.data.follower_only.enabled == (data.state == 'on'))
				next();
		}
	},
	'trigger-twitch-followers-only': (receive, data) => {
		const min = 0; // The time (in minutes) a user needs to be following before being able to send messages.
		const method = ((data.state == 'on') ? 'enableFollowersOnly' : 'disableFollowersOnly');
		_sender('twitch', method, { type: 'Chat', args: [min] });
	},
	'event-twitch-gift-paid-upgrade': (receive, data, next) => {},
	'event-twitch-host': (receive, data, next) => functions.twitch_compare(receive, data, () => {
		if (true) // gérer le nombre de viewers (receive.data.host.viewers)
			next();
	}, 'Host', 'channel', true, receive.data.host.channel),
	'event-twitch-hosted': (receive, data, next) => functions.twitch_compare(receive, data, next, 'Hosted', 'channel', true, receive.data.host.channel),
	'trigger-twitch-host': (receive, data) => {
		if (data.channel)
			_sender('twitch', 'Host', { type: 'Chat', args: [data.channel] });
	},
	'event-twitch-message': (receive, data, next) => functions.twitch_compare(receive, data, next, 'Message', 'message', false),
	'trigger-twitch-message': (receive, data) => {
		if (data.message)
			_sender('twitch', 'Say', { type: 'Chat', args: [data.message] });
	},
	'event-twitch-message-remove': (receive, data, next) => functions.twitch_compare(receive, data, next, 'Message', 'message', false),
	'event-twitch-prime-community-gift': (receive, data, next) => {},
	'event-twitch-prime-paid-upgrade': (receive, data, next) => {},
	'event-twitch-raid': (receive, data, next) => functions.twitch_compare(receive, data, () => {
		if (true) // gérer le nombre de viewers (receive.data.host.viewers)
			next();
	}, 'Raid', 'channel', true, receive.data.raid.channel),
	'trigger-twitch-raid': (receive, data) => {
		if (data.channel)
			_sender('twitch', 'Raid', { type: 'Chat', args: [data.channel] });
	},
	'event-twitch-raid-cancel': (receive, data, next) => next,
	'trigger-twitch-raid-cancel': (receive, data) => {
		_sender('twitch', 'Unraid', { type: 'Chat', args: [] });
	},
	'event-twitch-resub': (receive, data, next) => {},
	'event-twitch-reward-gift': (receive, data, next) => {},
	'event-twitch-ritual': (receive, data, next) => functions.twitch_compare(receive, data, () => {
		if (true) // gérer le nombre de viewers (receive.data.host.viewers)
			next();
	}, 'Ritual', 'user', true, receive.data.ritual.user),
	'event-twitch-slow': (receive, data, next) => {
		if (receive.id == 'twitch' && receive.name == 'Slow')
		{
			if (data.state == 'toggle' || receive.data.slow.enabled == (data.state == 'on'))
				next();
		}
	},
	'trigger-twitch-slow': (receive, data) => {
		const min = 0; // The time (in seconds) a user needs to wait between messages.
		const method = ((data.state == 'on') ? 'enableSlow' : 'disableSlow');
		_sender('twitch', method, { type: 'Chat', args: [min] });
	},
	'event-twitch-standard-pay-forward': (receive, data, next) => {},
	'event-twitch-sub': (receive, data, next) => {},
	'event-twitch-sub-extend': (receive, data, next) => {},
	'event-twitch-sub-gift': (receive, data, next) => {},
	'event-twitch-subs-only': (receive, data, next) => {
		if (receive.id == 'twitch' && receive.name == 'SubsOnly')
		{
			if (data.state == 'toggle' || receive.data.subscribe_only.enabled == (data.state == 'on'))
				next();
		}},
	'trigger-twitch-subs-only': (receive, data) => {
		const method = ((data.state == 'on') ? 'enableSubsOnly' : 'disableSubsOnly');
		_sender('twitch', method, { type: 'Chat', args: [] });
	},
	'event-twitch-timeout': (receive, data, next) => functions.twitch_compare(receive, data, next, 'Timeout', 'user', true, receive.data.timeout.user),
	'trigger-twitch-timeout': (receive, data) => {
		if (data.user && data.duration)
			_sender('twitch', 'Timeout', { type: 'Chat', args: [data.user, data.duration, data.reason] });
	},
	'event-twitch-unhost': (receive, data, next) => {
		if (receive.id == 'twitch' && receive.name == 'Unhost')
			next();
	},
	'trigger-twitch-unhost': (receive, data) => {
		_sender('twitch', 'UnhostOutside', { type: 'Chat', args: [] });
	},
	'event-twitch-unique-message': (receive, data, next) => {
		if (receive.id == 'twitch' && (receive.name == 'R9k' || receive.name == 'UniqueChat'))
		{
			if (data.state == 'toggle' || receive.data.r9k.enabled == (data.state == 'on'))
				next();
		}
	},
	'trigger-twitch-unique-message': (receive, data) => {
		const method = ((data.state == 'on') ? 'enableUniqueChat' : 'disableUniqueChat');
		_sender('twitch', method, { type: 'Chat', args: [] });
	},
	'event-twitch-whisper': (receive, data, next) => { // penser à modifier functions.twitch_compare
		if (data.message && receive.id == 'twitch' && receive.name == 'Whisper')
		{
			const msg_compare = (data.case ? data.message : data.message.toLowerCase());
			const msg_receive = (data.case ? receive.data.message : receive.data.message.toLowerCase());
			if (!msg_compare || (data.contains && msg_receive.indexOf(msg_compare) >= 0) || (!data.contains && msg_compare == msg_receive))
				next();
		}
	},
	'trigger-twitch-whisper': (receive, data) => {
		if (data.user && data.message)
			_sender('twitch', 'Whisper', { type: 'Chat', args: [data.user, data.message] });
	},
	'event-obs-studio-recording': (receive, data, next) => {
		if (receive.id == 'obs-studio' && ((data.state && receive.name == 'RecordingStarted') || (!data.state && receive.name == 'RecordingStopped')))
			next();
	},
	'trigger-obs-studio-recording': (receive, data) => {
		let state = 'StartStopRecording';
		state = ((data.state == 'on') ? 'StartRecording' : state);
		state = ((data.state == 'off') ? 'StopRecording' : state);

		_sender('obs-studio', state);
	},
	'event-obs-studio-replay': (receive, data, next) => {
		if (receive.id == 'obs-studio' && ((data.state && receive.name == 'ReplayStarted') || (!data.state && receive.name == 'ReplayStopped')))
			next();
	},
	'trigger-obs-studio-replay': (receive, data) => {
		let state = 'StartStopReplayBuffer';
		state = ((data.state == 'on') ? 'StartReplayBuffer' : state);
		state = ((data.state == 'off') ? 'StopReplayBuffer' : state);

		_sender('obs-studio', state);
	},
	'event-obs-studio-streaming': (receive, data, next) => {
		if (receive.id == 'obs-studio' && ((data.state && receive.name == 'StreamStarted') || (!data.state && receive.name == 'StreamStopped')))
			next();
	},
	'trigger-obs-studio-streaming': (receive, data) => {
		let state = 'StartStopStreaming';
		state = ((data.state == 'on') ? 'StartStreaming' : state);
		state = ((data.state == 'off') ? 'StopStreaming' : state);

		_sender('obs-studio', state);
	},
	'event-obs-studio-switch-scene': (receive, data, next) => {
		if (data.scene && receive.id == 'obs-studio' && receive.name == 'SwitchScenes' && receive.data['scene-name'].toLowerCase() == data.scene.toLowerCase())
			next();
	},
	'trigger-obs-studio-switch-scene': (receive, data) => {
		if (data.scene)
			_sender('obs-studio', 'SetCurrentScene', [data.scene]);
	},
	'trigger-discord-webhook': (receive, data) => {
		if (data.webhook && data.title)
		{
			let texts = {};
			for (const name of ['title', 'inline-1-title', 'inline-1-content', 'inline-2-title', 'inline-2-content'])
			{
				texts[name] = data[name]
					.replace('${date:toLocaleTimeString}', (new Date()).toLocaleTimeString())
					.replace('${date:toLocaleDateString}', (new Date()).toLocaleDateString());
			}

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
				embed.setImage('attachment://' + path.basename(data['big-image']));
			if (data['inline-1-title'] && data['inline-1-content'])
				embed.addField(texts['inline-1-title'], texts['inline-1-content'], true);
			if (data['inline-2-title'] && data['inline-2-content'])
				embed.addField(texts['inline-2-title'], texts['inline-2-content'], true);

			//embed.setAuthor('Author here', 'https://cdn.discordapp.com/embed/avatars/0.png', 'https://www.google.com');
			//embed.setDescription('');
			//embed.setFooter('', 'https://cdn.discordapp.com/embed/avatars/0.png');

			webhook.send({ embeds: [embed], files: images, allowed_mentions: { parse: ['everyone'] } });
		}
	},
	'trigger-obs-studio-toggle-source': (receive, data) => {
		if (data.scene && data.source)
		{
			let state = undefined;
			state = ((data.state == 'on') ? true : state);
			state = ((data.state == 'off') ? false : state);

			_sender('obs-studio', 'ToggleSource', [data.source, data.scene, state]);
		}
	},
};

module.exports = {
	init: (origin, config, sender) => {
		_sender = sender;
		_config = config;
	},
	receiver: (id, name, data) => {
		if (id == 'manager')
		{
			if (name == 'show')
				_sender('message', 'config', _config);
			else if (name == 'enabled')
				_config.default.enabled = data;

			return;
		}
		else if (id == 'message' && name == 'index')
		{
			if (typeof(data) === 'object')
			{
				if (data.save)
				{
					_config.actions = data.save;
					_sender('manager', 'config:override', _config);
				}
				else if (data.request)
				{
					_sender(...data.request).then(_data => {
						_sender('message', 'receive', { id: data.request[0], name: data.request[1], data: _data });
					}).catch(error => {});
				}
			}

			return;
		}

		if (_config.default.enabled)
		{
			const receive = { id, name, data };
			_sender('message', 'receive', receive);

			for (const action_index in _config.actions)
			{
				const action = _config.actions[action_index];
				for (const node_index in action.data)
				{
					const node = action.data[node_index];
					if (!Object.keys(node.inputs).length && typeof(actions[node.data.type]) !== 'undefined')
					{
						const next = node => {
							for (const output_index in node.outputs)
							{
								const output = node.outputs[output_index].connections;
								for (const connection of node.outputs[output_index].connections)
								{
									const node = action.data[connection.node];
									if (typeof(actions[node.data.type]) !== 'undefined')
										actions[node.data.type](receive, node.data.data, () => next(node));
								}
							}
						};

						actions[node.data.type](receive, node.data.data, () => next(node));
					}
				}
			}
		}
	}
}
