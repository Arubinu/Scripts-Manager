const	ComfyJS = require('comfy.js');

let		_sender = null,
		_config = {};

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
				_sender(method, arguments);
			};
		}

		ComfyJS.Init(_config.connection.channel);
	},
	receiver: async (id, name, data) => {
		if (id == 'manager')
		{
			if (name == 'show')
				_sender('message', 'config', _config);

			return;
		}
		else if (id == 'message')
		{
			if (typeof(data) === 'object')
			{
				const name = Object.keys(data)[0];
				if (typeof(data[name]) === typeof(_config.connection[name]))
					_config.connection[name] = data[name];
				_sender('manager', 'config', _config);
			}

			return;
		}

		let check = false;
		if ((name == 'disconnect' || name == 'reconnect') && (check = true))
			ComfyJS.Disconnect();
		if ((name == 'connect' || name == 'reconnect') && (check = true))
			ComfyJS.Init(_config.connection.channel);

		if (!check)
		{
			console.log(id, name);
			if (Array.isArray(data) && data.length)
				return await ComfyJS[name](...data);
			else
				return await ComfyJS[name]();
		}
	}
}
