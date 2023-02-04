const	spotify = require('spotify-web-api-node'),
		querystring = require('node:querystring');

const	{
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
		} = require('./auth.json');

let		_vars = {},
		_config = {},
		_sender = null,
		instance = new spotify();

function update_interface()
{
	const scopes = [
		'user-read-playback-state',
		'user-modify-playback-state',
		'playlist-read-private',
		'playlist-modify-public',
		'playlist-modify-private',
	];

	_sender('message', 'config', Object.assign({
		authorize: instance.createAuthorizeURL(scopes, ''),
		redirect_url: `${_vars.http}/spotify/authorize`
	}, _config));
}

const	functions = {
	Search: async track => {
		const	data	= await instance.searchTracks(track);

		if (typeof data.body === 'object' && typeof data.body.tracks === 'object' && Array.isArray(data.body.tracks.items) && data.body.tracks.items.length)
			return data.body.tracks.items[0];
	},
	GetDevices: async () => {
		const	data	= await instance.getMyDevices();

		return data.body.devices;
	},
	GetActiveDevice: async () => {
		const	devices	= await functions.GetDevices();

		if (devices.length >= 0)
		{
			for (const device of devices)
			{
				if (device.is_active)
					return device;
			}

			return devices[0];
		}
	}
};

module.exports = {
	init: (origin, config, sender, vars) => {
		_vars = vars;
		_sender = sender;
		_config = config;

		instance.setRedirectURI(`${_vars.http}/spotify/authorize`);
	},
	initialized: () => {
		instance.setClientId(_config.connection.client_id || CLIENT_ID);
		instance.setClientSecret(_config.connection.client_secret || CLIENT_SECRET);
		if (_config.connection.access_token)
			instance.setAccessToken(_config.connection.access_token);
		if (_config.connection.refresh_token)
			instance.setRefreshToken(_config.connection.refresh_token);
	},
	receiver: async (id, name, data) => {
		if (id === 'manager')
		{
			if (name === 'show')
				update_interface();
			else if (name === 'enabled')
				_config.default.enabled = data;

			return;
		}
		else if (id === 'message')
		{
			if (typeof(data) === 'object')
			{
				const name = Object.keys(data)[0];

				if (typeof(data[name]) === typeof(_config.connection[name]))
				{
					_config.connection[name] = data[name];

					instance.setClientId(_config.connection.client_id || CLIENT_ID);
					instance.setClientSecret(_config.connection.client_secret || CLIENT_SECRET);
					instance.setAccessToken(_config.connection.access_token);
					instance.setRefreshToken(_config.connection.refresh_token);

					update_interface();
				}
				_sender('manager', 'config', _config);
			}

			return;
		}
		else if (id === 'methods')
		{
			const url = '/spotify/authorize';

			if (name === 'http' && data.req && data.req.url.split('?')[0] === url)
			{
				const search = querystring.parse(data.req.url.split('?')[1]);

				data.res.writeHead(200);
				data.res.end(`<h1 style="font-family: sans-serif;">You can now close this page ...</h1>`);

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

			return;
		}

		if (typeof functions[name] === 'function')
		{
			if (Array.isArray(data) && data.length)
				return await functions[name](...data);
			else
				return await functions[name]();
		}
		else if (typeof instance[name] === 'function')
		{
			if (Array.isArray(data) && data.length)
				return await instance[name](...data);
			else
				return await instance[name]();
		}
	}
}
