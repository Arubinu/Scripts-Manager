const	path = require('path'),
		https = require('https'),
		child_process = require('child_process'),
		{ MessageEmbed, MessageAttachment, WebhookClient } = require('discord.js');

let		_config = {},
		_sender = null;

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
	'event-twitch-chat': (receive, data, next) => {
		if (data.message && receive.id == 'twitch' && receive.name == 'Chat')
		{
			const msg_compare = (data.case ? data.message : data.message.toLowerCase());
			const msg_receive = (data.case ? receive.data[1] : receive.data[1].toLowerCase());
			if ((data.contains && msg_receive.indexOf(msg_compare) >= 0) || (!data.contains && msg_compare == msg_receive))
			{
				const flags = receive.data[2];
				const viewer = (!flags.broadcaster && !flags.mod && !flags.vip && !flags.founder && !flags.subscriber);

				let check = false;
				check = (check || (data.broadcaster && flags.broadcaster));
				check = (check || (data.moderator && flags.mod));
				check = (check || (data.vip && flags.vip));
				check = (check || (data.founder && flags.founder));
				check = (check || (data.subscriber && flags.subscriber));
				check = (check || (data.viewer && viewer));

				if (check)
					next();
			}
		}
	},
	'event-twitch-command': (receive, data, next) => {
		if (data.command && receive.id == 'twitch' && receive.name == 'Command')
		{
			const split = data.command.split(' ', 2);
			if (receive.data[1].toLowerCase() == split[0].toLowerCase() && (split.length == 1 || receive.data[2].toLowerCase() == split.slice(1).join(' ').toLowerCase()))
				next();
		}
	},
	'event-twitch-whisper': (receive, data, next) => {
		if (data.message && receive.id == 'twitch' && receive.name == 'Whisper')
		{
			const msg_compare = (data.case ? data.message : data.message.toLowerCase());
			const msg_receive = (data.case ? receive.data[1] : receive.data[1].toLowerCase());
			if ((data.contains && msg_receive.indexOf(msg_compare) >= 0) || (!data.contains && msg_compare == msg_receive))
				next();
		}
	},
	'event-obs-studio-recording': (receive, data, next) => {
		if (receive.id == 'obs-studio' && ((data.state && receive.name == 'RecordingStarted') || (!data.state && receive.name == 'RecordingStopped')))
			next();
	},
	'event-obs-studio-replay': (receive, data, next) => {
		if (receive.id == 'obs-studio' && ((data.state && receive.name == 'ReplayStarted') || (!data.state && receive.name == 'ReplayStopped')))
			next();
	},
	'event-obs-studio-streaming': (receive, data, next) => {
		if (receive.id == 'obs-studio' && ((data.state && receive.name == 'StreamStarted') || (!data.state && receive.name == 'StreamStopped')))
			next();
	},
	'event-obs-studio-switch-scene': (receive, data, next) => {
		if (data.scene && receive.id == 'obs-studio' && receive.name == 'SwitchScenes' && receive.data['scene-name'].toLowerCase() == data.scene.toLowerCase())
			next();
	},
	'trigger-discord-webhook': (receive, data, next) => {
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
						.setTimestamp()
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

			webhook.send({ embeds: [embed], files: images });
		}
	},
	'trigger-twitch-chat': (receive, data, next) => {
		if (data.message)
			_sender('twitch', 'Say', [data.message]);
	},
	'trigger-obs-studio-toggle-source': (receive, data, next) => {
		if (data.scene && data.source)
		{
			let state = undefined;
			state = ((data.state == 'on') ? true : state);
			state = ((data.state == 'off') ? false : state);

			_sender('obs-studio', 'ToggleSource', [data.source, data.scene, state]);
		}
	},
	'trigger-obs-studio-recording': (receive, data, next) => {
		let state = 'StartStopRecording';
		state = ((data.state == 'on') ? 'StartRecording' : state);
		state = ((data.state == 'off') ? 'StopRecording' : state);

		_sender('obs-studio', state);
	},
	'trigger-obs-studio-replay': (receive, data, next) => {
		let state = 'StartStopReplayBuffer';
		state = ((data.state == 'on') ? 'StartReplayBuffer' : state);
		state = ((data.state == 'off') ? 'StopReplayBuffer' : state);

		_sender('obs-studio', state);
	},
	'trigger-obs-studio-streaming': (receive, data, next) => {
		let state = 'StartStopStreaming';
		state = ((data.state == 'on') ? 'StartStreaming' : state);
		state = ((data.state == 'off') ? 'StopStreaming' : state);

		_sender('obs-studio', state);
	},
	'trigger-obs-studio-switch-scene': (receive, data, next) => {
		if (data.scene)
			_sender('obs-studio', 'SetCurrentScene', [data.scene]);
	}
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

			return ;
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
					});
				}
			}

			return ;
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
