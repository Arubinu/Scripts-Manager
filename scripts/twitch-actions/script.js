const	path = require('path');

let		_config = {},
		_sender = null;

const	actions = {
	'obs-studio': {
		get: {
			SwitchScenes: (name, data, action) => {
				return (data['scene-name'].toLowerCase() == action[1].toLowerCase());
			},
		},
		set: {
			ToggleSource: (name, data, action) => {
				_sender('obs-studio', 'ToggleSource', [action[2], action[1], action[3]]);
			},
			SetCurrentScene: (name, data, action) => {
				_sender('obs-studio', 'SetCurrentScene', [action[1]]);
			},
		}
	},
	'twitch': {
		get: {
			Command: (name, data, action) => {
				return (data[1] == action[1]);
			},
			Chat: (name, data, action) => {
				return (data[1] == action[1]);
			},
			Whisper: (name, data, action) => {
				return (data[1] == action[1]);
			}
		},
		set: {
			Say: (name, data, action) => {
				_sender('twitch', 'Say', [action[1]]);
			},
		}
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
		}

		if (_config.default.enabled)
		{
			for (const index in _config.actions)
			{
				try
				{
					const action = JSON.parse(_config.actions[index]);
					if (id == action[0] && name == action[1][0] && actions[id].get[name](name, data, action[1]))
						actions[action[2]].set[action[3][0]](name, data, action[3]);
				} catch (e) {}
			}
		}
	}
}
