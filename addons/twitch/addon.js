const	ComfyJS = require('comfy.js');

let		_logs = [],
		_config = {},
		_sender = null,
		_changes = false,
		_connected = false;

function connect()
{
	if (_config.connection.channel)
	{
		_sender('broadcast', 'Connextion', []);
		ComfyJS.Init(_config.connection.channel, (_config.connection.token || null));
	}
}

function reconnect()
{
	disconnect(false);
	connect();
}

function disconnect(broadcast)
{
	if (_connected)
	{
		_changes = false;
		_connected = false;
		ComfyJS.Disconnect();

		const obj = {
			type: 'Disconnected',
			date: Date.now(),
			from: '',
			sub: false,
			vip: false,
			mod: false,
			brd: false
		};
		_logs.unshift(obj);
		_sender('message', 'logs', obj);

		if (typeof(broadcast) === 'undefined' || broadcast)
			_sender('broadcast', 'Disconnected', []);
	}
}

module.exports = {
	init: (origin, config, sender) => {
		_sender = sender;
		_config = config;

		const methods = [
			'Command',
			'Chat',
			'Whisper',
			'MessageDeleted',
			'Reward',
			'Join',
			'Part',
			'Hosted',
			'Ban',
			'Timeout',
			'Raid',
			'Cheer',
			'Sub',
			'Resub',
			'SubGift',
			'SubMysteryGift',
			'GiftSubContinue',
			'Connected',
			'Reconnect',
			'Error'
		];

		for (const method of methods)
		{
			ComfyJS[`on${method}`] = function() {
				if (method == 'Connected')
					_connected = true;
				else if (method == 'Error' || method == 'Reconnect')
					_connected = false;

				const user_relation = { Command: 0, Chat: 0, Whisper: 0, Reward: 0, Join: 0, Part: 0, Hosted: 0, Ban: 0, Timeout: 0, Raid: 0, Cheer: 0, Sub: 0, Resub: 0, SubGift: 0, SubMysteryGift: 0, GiftSubContinue: 0 };
				const extra_relation = { Command: 4, Chat: 4, Whisper: 4, MessageDeleted: 1, Reward: 4, Join: 2, Part: 2, Hosted: 3, Ban: 1, Timeout: 2, Raid: 2, Cheer: 4, Sub: 3, Resub: 5, SubGift: 5, SubMysteryGift: 4, GiftSubContinue: 2 };
				const flags_relation = { Command: 3, Chat: 2, Whisper: 2, Cheer: 3 };

				const user = ((typeof(user_relation[method]) !== 'undefined') ? arguments[user_relation[method]] : false);
				const extra = ((typeof(extra_relation[method]) !== 'undefined') ? arguments[extra_relation[method]] : false);
				const flags = ((typeof(flags_relation[method]) !== 'undefined') ? arguments[flags_relation[method]] : (extra ? extra.flags : false));

				const obj = {
					type: method,
					date: Date.now(),
					from: ((extra && extra.username) ? extra.username : (user || '')),
					sub: (flags && flags.subscriber),
					vip: (flags && flags.vip),
					mod: (flags && flags.mod),
					brd: (flags && flags.broadcaster)
				};

				_logs.unshift(obj);
				for (let i = (_logs.length - 1); i >= 20; --i)
					delete _logs[i];

				_sender('message', 'logs', obj);
				_sender('broadcast', method, JSON.parse(JSON.stringify(arguments)));
			};
		}

		if (_config.default.enabled)
			connect();
	},
	receiver: async (id, name, data) => {
		if (id == 'manager')
		{
			if (name == 'show')
			{
				if (!data && _changes && _config.default.enabled)
					reconnect();

				_sender('message', 'logs', _logs);
				_sender('message', 'config', _config);
			}
			else if (name == 'enabled')
			{
				_config.default.enabled = data;
				if (!_config.default.enabled)
					disconnect();
				else
					connect();
			}

			return;
		}
		else if (id == 'message')
		{
			if (typeof(data) === 'object')
			{
				const name = Object.keys(data)[0];
				if (name == 'refresh')
				{
					if (_config.default.enabled)
						reconnect();

					return;
				}

				if (typeof(data[name]) === typeof(_config.connection[name]))
				{
					_changes = true;
					_config.connection[name] = data[name];
				}
				_sender('manager', 'config', _config);
			}

			return;
		}

		let check = false;
		if ((name == 'disconnect' || name == 'reconnect') && (check = true))
			disconnect();
		if ((name == 'connect' || name == 'reconnect') && (check = true))
			connect();

		if (!check)
		{
			if (typeof(ComfyJS[name]) === 'function')
			{
				if (Array.isArray(data) && data.length)
					return await ComfyJS[name](...data);
				else
					return await ComfyJS[name]();
			}
		}
	}
}
