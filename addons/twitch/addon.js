const	twurple = require('./twurple'),
		querystring = require('node:querystring'),
		WebSocketClient = require('websocket').client;

const	CLIENT_ID = require('./auth.json').client_id;

let		_logs = [],
		_vars = {},
		_config = {},
		_sender = null,
		_pubsub = false,
		_changes = false,
		_connected = { irc: false, pubsub: false };

function update_interface()
{
	const url = 'https://id.twitch.tv/oauth2/authorize?';
	const scope = [
		'chat:read',
		'chat:edit',
		'channel:read:redemptions',
		'channel:moderate',
		'moderation:read',
		'moderator:manage:automod',
		'channel:manage:polls',
		'channel:manage:predictions',
		'channel:read:hype_train',
		'channel_editor',
		'whispers:edit',
		'user:read:follows',
		'channel:edit:commercial',
		'channel:read:subscriptions'
	];

	const token_data = {
		client_id:		CLIENT_ID,
		redirect_uri:	'http://localhost:5042/twitch/authorize',
		scope:			scope.join('+'),
		response_type:	'token'
	};
	const authorize = (url + querystring.stringify(token_data));

	_sender('message', 'config', Object.assign({ authorize: authorize.replace(/%2B/g, '+') }, _config));
}

async function connect()
{
	if (_config.connection.channel && _config.connection.token)
	{
		_sender('broadcast', 'Connection', []);
		_connected = true;
		await twurple.connect(CLIENT_ID, _config.connection.token, _config.connection.channel, obj => {
			_logs.unshift(obj);
			for (let i = (_logs.length - 1); i >= 20; --i)
				delete _logs[i];

			_sender('message', 'logs', obj);
			_sender('broadcast', obj.type, JSON.parse(JSON.stringify(obj)));
		});
	}
}

async function reconnect()
{
	await disconnect(false);
	await connect();
}

async function disconnect(broadcast)
{
	if (_connected)
	{
		_changes = false;
		_connected = false;
		await twurple.disconnect();

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
	init: (origin, config, sender, vars) => {
		_vars = vars;
		_sender = sender;
		_config = config;

		if (_config.default.enabled)
			connect();
	},
	receiver: async (id, name, data) => {
		if (id == 'manager')
		{
			if (name == 'show')
			{
				if (!data && _changes && _config.default.enabled)
				{
					try
					{
						reconnect();
					}
					catch (e) {}
				}

				_sender('message', 'logs', _logs);
				update_interface();
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
		else if (id == 'methods')
		{
			const url = '/twitch/authorize';

			if (name == 'http')
			{
				data.res.writeHead(200);
				data.res.end(`<script type="text/javascript">
					const socket = new WebSocket('${_vars.websocket}');

					socket.onopen = event => {
						socket.send(JSON.stringify({ url: '${url}', data: document.location.hash }));
						document.body.innerHTML = '<h1 style="font-family: sans-serif;">You can now close this page ...</h1>';
						document.head.innerHTML = '';
					};

					socket.onerror = error => console.error(error);
				</script>`);
			}
			else if (name == 'websocket')
			{
				data = JSON.parse(data);

				if (data.url == url && !data.data.indexOf('#'))
				{
					const hash = querystring.parse(data.data.substr(1));

					if (typeof(hash.access_token) === 'string')
					{
						_config.connection.token = hash.access_token;
						_sender('manager', 'config', _config);

						update_interface();
					}
				}
			}

			return true;
		}

		let check = false;
		if ((name == 'disconnect' || name == 'reconnect') && (check = true))
			disconnect();
		if ((name == 'connect' || name == 'reconnect') && (check = true))
			connect();

		if (!check)
			return await twurple.exec(data.type, name, data.args);
	}
}
