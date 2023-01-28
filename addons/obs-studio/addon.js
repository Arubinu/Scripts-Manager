const	{
			default: OBSWebSocket,
			EventSubscription
		} = require('obs-websocket-js'),
		obs = new OBSWebSocket();

let		_logs = [],
		_config = {},
		_sender = null,
		_changes = false,
		_connected = false;

const	functions = {
	GetScenes: async withSources => {
		let scenes = [];
		for (let scene of (await obs.call('GetSceneList')).scenes)
		{
			if (withSources)
				scene.sources = await functions.GetSources(scene.sceneName);

			scenes.push(scene);
		}

		return scenes;
	},
	GetScene: async (sceneName, withSources) => {
		for (const scene of await functions.GetScenes(withSources))
		{
			if (sceneName.toLowerCase() == scene.sceneName.toLowerCase())
				return scene;
		}

		return false;
	},
	GetSources: async sceneName => {
		return (await obs.call('GetSceneItemList', { sceneName })).sceneItems;
	},
	GetSource: async (source_name, sceneName) => {
		for (const source of await functions.GetSources(sceneName))
		{
			if (source_name.toLowerCase() == source.sourceName.toLowerCase())
				return source;
		}

		return false;
	},
	SetCurrentScene: async sceneName => {
		return await obs.call('SetCurrentProgramScene', { sceneName });
	},
	ToggleSource: async (source, sceneName, sceneItemEnabled) => {
		if (typeof source === 'string' || typeof source === 'object')
			source = await functions.GetSource(((typeof source === 'string') ? source : source.sourceName), sceneName);

		if (typeof sceneItemEnabled === 'undefined')
			sceneItemEnabled = !source.sceneItemEnabled;

		return await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: source.sceneItemId, sceneItemEnabled });
	}
}

function connect()
{
	global_send('Connection', []);
	obs.connect(_config.connection.address, _config.connection.password, {
		eventSubscriptions: EventSubscription.All,
		rpcVersion: 1
	}).then(() => {
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
	if (typeof broadcast === 'undefined' || broadcast)
		global_send('Disconnection', []);

	_changes = false;
	if (_connected)
		obs.disconnect().catch(() => {});
}

async function global_send(type, obj)
{
	_sender('broadcast', type, obj);
	_sender('manager', 'websocket', { name: type, target: 'obs-studio', data: obj });
}


module.exports = {
	init: (origin, config, sender) => {
		_sender = sender;
		_config = config;
	},
	initialized: () => {
		const methods = [
				'CurrentSceneCollectionChanged',
				'CurrentSceneCollectionChanging',
				'CurrentSceneTransitionChanged',
				'CurrentPreviewSceneChanged',
				'CurrentProfileChanged',
				'CurrentProfileChanging',
				'CurrentProgramSceneChanged',
				'CurrentSceneTransitionDurationChanged',
				'CustomEvent',
				'ExitStarted',
				'InputCreated',
				'InputActiveStateChanged',
				'InputAudioBalanceChanged',
				'InputAudioMonitorTypeChanged',
				'InputAudioSyncOffsetChanged',
				'InputAudioTracksChanged',
				'InputMuteStateChanged',
				'InputNameChanged',
				'InputRemoved',
				'InputShowStateChanged',
				'InputVolumeChanged',
				'InputVolumeMeters',
				'MediaInputActionTriggered',
				'MediaInputPlaybackEnded',
				'MediaInputPlaybackStarted',
				'ProfileListChanged',
				'RecordStateChanged',
				'ReplayBufferSaved',
				'ReplayBufferStateChanged',
				'SceneCreated',
				'SceneCollectionListChanged',
				'SceneItemCreated',
				'SceneItemEnableStateChanged',
				'SceneItemListReindexed',
				'SceneItemLockStateChanged',
				'SceneItemRemoved',
				'SceneItemSelected',
				'SceneItemTransformChanged',
				'SceneListChanged',
				'SceneNameChanged',
				'SceneRemoved',
				'SceneTransitionEnded',
				'SceneTransitionStarted',
				'SceneTransitionVideoEnded',
				'ScreenshotSaved',
				'SourceFilterCreated',
				'SourceFilterEnableStateChanged',
				'SourceFilterListReindexed',
				'SourceFilterNameChanged',
				'SourceFilterRemoved',
				'StreamStateChanged',
				'StudioModeStateChanged',
				'VendorEvent',
				'VirtualcamStateChanged',

				'ConnectionOpened',
				'ConnectionClosed',
				'AuthenticationSuccess',
				'AuthenticationFailure',
				'error'
			],
			deprecated = {
				'CurrentPreviewSceneChanged': 'PreviewSceneChanged',
				'CurrentSceneTransitionChanged': 'SwitchTransition',
				'InputVolumeChanged': 'SourceVolumeChanged',
				'MediaInputPlaybackEnded': 'MediaStopped',
				'MediaInputPlaybackStarted': 'MediaStarted',
				'SceneTransitionEnded': 'TransitionEnd',
				'SceneTransitionStarted': 'TransitionBegin',
				'SourceFilterEnableStateChanged': 'SourceFilterVisibilityChanged',
			};

		for (const method of methods)
		{
			obs.on(method, data => {
				if ((_connected && method == 'ConnectionOpened') || (!_connected && method == 'ConnectionClosed'))
					return;
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

				data = ((typeof data !== 'undefined') ? JSON.parse(JSON.stringify(data)) : data);

				_sender('message', 'logs', obj);
				global_send(method, data);

				// deprecated
				if (method === 'CurrentProgramSceneChanged')
				{
					global_send('SwitchScenes', data);
					global_send('ScenesChanged', data);
				}
				else if (method === 'ReplayBufferStateChanged')
				{
					global_send(((data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') ? 'ReplayStarting' : 'ReplayStopping'), data);
					global_send(((data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') ? 'ReplayStarted' : 'ReplayStopped'), data);
				}
				else if (method === 'RecordStateChanged')
					global_send(((data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') ? 'RecordingStarted' : 'RecordingStopped'), data);
				else if (method === 'StreamStateChanged')
					global_send(((data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') ? 'StreamStarted' : 'StreamStopped'), data);
				else if (typeof deprecated[method] !== 'undefined')
					global_send(deprecated[method], data);
			});
		}

		if (_config.default.enabled)
			connect();

		setInterval(() => {
			if (_config.default.enabled && !_connected)
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
			if (typeof data === 'object')
			{
				const name = Object.keys(data)[0];
				if (name == 'refresh')
				{
					if (_config.default.enabled)
						reconnect();

					return;
				}

				if (typeof data[name] === typeof _config.connection[name])
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
			if (typeof functions[name] === 'function')
			{
				if (Array.isArray(data) && data.length)
					return await functions[name](...data);
				else
					return await functions[name]();
			}
			else
				return await obs.call(name, data);
		}
	}
}
