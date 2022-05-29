const	ComfyJS = require('comfy.js');

let		_config = {};

module.exports = {
	init: (origin, config, sender) => {
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
				sender(method, arguments);
			};
		}

		ComfyJS.Init(_config.connection.channel);
	},
	receiver: async (id, name, data) => {
		if (id == 'manager')
		{
			return;
		}
		else if (id == 'message')
		{
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
