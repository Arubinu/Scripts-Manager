const	OBSWebSocket = require( 'obs-websocket-js' ),
		obs = new OBSWebSocket();

let		_logs = [],
		_config = {},
		_sender = null,
		_changes = false,
		_connected = false;

const	functions = {
	GetScenes: async function() {
		return await obs.send('GetSceneList');
	},
	GetScene: async function(scene_name) {
		for (let scene of (await functions.GetScenes()).scenes)
		{
			if (scene_name.toLowerCase() == scene.name.toLowerCase())
				return scene;
		}

		return false;
	},
	GetSources: async function(scene_name) {
		return await functions.GetScene(scene_name).sources;
	},
	GetSource: async function(source_name, scene_name) {
		return await obs.send('GetSceneItemProperties', { 'item': { 'name': source_name }, 'scene-name': scene_name });
	},
	SetCurrentScene: async function(scene_name) {
		return await obs.send('SetCurrentScene', { 'scene-name': scene_name });
	},
	ToggleSource: async function(source, scene_name, visible) {
		if (typeof(source) === 'string' || typeof(source) === 'object')
			source = await functions.GetSource(((typeof(source) === 'string') ? source : source.name), scene_name);

		if (typeof(visible) === 'undefined')
			visible = !source.visible;

		return await obs.send('SetSceneItemProperties', { 'item': source, 'scene-name': scene_name, 'visible': visible });
	}
}

function connect()
{
	_sender('broadcast', 'Connextion', []);
	obs.connect(url = _config.connection.address, password = _config.connection.password).then(() => {
		//console.log(`${_config.default.name} connected`);
	}).catch(error => {
		//console.log(`${_config.default.name} connection error:`, error);
	});
}

function reconnect()
{
	disconnect(false);
	connect();
}

function disconnect(broadcast)
{
	if (typeof(broadcast) === 'undefined' || broadcast)
		_sender('broadcast', 'Disconnection', []);

	_changes = false;
	if (obs._connected)
		obs.disconnect().catch(() => {});
}

module.exports = {
	init: (origin, config, sender) => {
		_sender = sender;
		_config = config;

		const methods = [
			'CurrentSceneCollectionChanging',
			'CurrentSceneTransitionChanged',
			'MediaInputPlaybackStarted',
			'StudioModeStateChanged',

			'RecordingStarted',
			'RecordingStopped',
			'ReplayStarting',
			'ReplayStarted',
			'ReplayStopping',
			'ReplayStopped',
			'StreamStarted',
			'StreamStopped',
			'SwitchScenes',
			'ScenesChanged',
			'SourceFilterVisibilityChanged',
			'SourceVolumeChanged',
			'SwitchTransition',
			'TransitionListChanged',
			'TransitionBegin',
			'TransitionEnd',
			'PreviewSceneChanged',
			'MediaPlaying',
			'MediaPaused',
			'MediaRestarted',
			'MediaStopped',
			'MediaNext',
			'MediaPrevious',
			'MediaStarted',
			'MediaEnded',

			'ConnectionOpened',
			'ConnectionClosed',
			'AuthenticationSuccess',
			'AuthenticationFailure',
			'error'
		];

		for (const method of methods)
		{
			obs.on(method, data => {
				if ((_connected && method == 'ConnectionOpened') || (!_connected && method == 'ConnectionClosed'))
					return ;
				else if (method == 'ConnectionOpened')
					_connected = true;
				else if (method == 'ConnectionClosed')
					_connected = false;

				const obj = {
					type: method,
					date: Date.now()
				};

				_logs.unshift(obj);
				for (let i = (_logs.length - 1); i >= 20; --i)
					delete _logs[i];

				_sender('message', 'logs', obj);
				_sender('broadcast', method, ((typeof(data) !== 'undefined') ? JSON.parse(JSON.stringify(data)) : data));
			});
		}

		if (_config.default.enabled)
			connect();

		setInterval(() => {
			if (_config.default.enabled && !obs._connected)
				connect();
		}, 5000);
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
			if (typeof(functions[name]) === 'function')
			{
				if (Array.isArray(data) && data.length)
					return await functions[name](...data);
				else
					return await functions[name]();
			}
			else
				return await obs.send(name, data);
		}
	}
}
