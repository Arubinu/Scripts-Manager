const	spotify = require('spotify-web-api-node'),
		querystring = require('node:querystring');

let		_vars = {},
		_config = {},
		_sender = null,
		instance = new spotify();

const	redirect_uri = '/spotify/authorize';

function update_interface()
{
	const scopes = [
		'user-read-playback-state',
		'user-modify-playback-state',
		'playlist-read-private',
		'playlist-modify-public',
		'playlist-modify-private',
    ];

	_sender('message', 'config', Object.assign({ authorize: instance.createAuthorizeURL(scopes, '') }, _config));
}


module.exports = {
	init: (origin, config, sender, vars) => {
		_vars = vars;
		_sender = sender;
		_config = config;
	},
	initialized: () => {
		if (_config.connection.client_id)
			instance.setClientId(_config.connection.client_id);
		if (_config.connection.client_secret)
			instance.setClientSecret(_config.connection.client_secret);
		if (_config.connection.access_token)
			instance.setAccessToken(_config.connection.access_token);
		if (_config.connection.refresh_token)
			instance.setRefreshToken(_config.connection.refresh_token);

		instance.setRedirectURI(_vars.http + redirect_uri);
	},
	receiver: async (id, name, data) => {
		if (id == 'manager')
		{
			if (name == 'show')
				update_interface();
			else if (name == 'enabled')
				_config.default.enabled = data;

			return;
		}
		else if (id == 'message')
		{
			if (typeof(data) === 'object')
			{
				const name = Object.keys(data)[0];

				if (typeof(data[name]) === typeof(_config.connection[name]))
				{
					_config.connection[name] = data[name];

					instance.setClientId(_config.connection.client_id);
					instance.setClientSecret(_config.connection.client_secret);
					instance.setAccessToken(_config.connection.access_token);
					instance.setRefreshToken(_config.connection.refresh_token);

					update_interface();
				}
				_sender('manager', 'config', _config);
			}

			return;
		}
		else if (id == 'methods')
		{
			if (name == 'http' && data.req && data.req.url.split('?')[0] == redirect_uri)
			{
				data.res.writeHead(200);
				data.res.end(`<script type="text/javascript">
					const socket = new WebSocket('${_vars.websocket}');

					socket.onopen = event => {
						socket.send(JSON.stringify({ url: '${redirect_uri}', data: document.location.search }));
						document.body.innerHTML = '<h1 style="font-family: sans-serif;">You can now close this page ...</h1>';
						document.head.innerHTML = '';
					};

					socket.onerror = error => console.error(error);
				</script>`);

				return true;
			}
			else if (name == 'websocket')
			{
				if (typeof(data) === 'object')
				{
					if (data.url == redirect_uri && !data.data.indexOf('?'))
					{
						const search = querystring.parse(data.data.substr(1));

						if (typeof search.code === 'string')
						{
							instance.authorizationCodeGrant(search.code).then(data => {
								_config.connection.access_token = data.body.access_token;
								_config.connection.refresh_token = data.body.refresh_token;

								instance.setAccessToken(_config.connection.access_token);
								instance.setRefreshToken(_config.connection.refresh_token);

								_sender('manager', 'config', _config);

								update_interface();
							}, err => {
								console.log('Spotify: Something went wrong!', err);
							});
						}

						return true;
					}
				}
			}

			return;
		}

		if (typeof instance[name] === 'function')
		{
			if (Array.isArray(data) && data.length)
				return await instance[name](...data);
			else
				return await instance[name]();
		}
	}
}
