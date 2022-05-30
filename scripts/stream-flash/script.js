const	path = require('path'),
		{ app, screen, BrowserWindow } = require('electron');

let		win = null,
		_last = 0,
		_pause = 0;
		_screen = 0,
		_sender = null,
		_config = {},
		_default = {
			settings: {
				screen:		0,
				delay:		15,
				pause:		1,
				duration:	400
			},
			statistics: {
				flash:		0,
				viewer:		0,
				subscriber:	0,
				moderator:	0
			}
		};

function is_numeric(n)
{
	return (!isNaN(parseFloat(n)) && isFinite(n));
}

function create_window()
{
	win = new BrowserWindow({
		show: false,
		width: 1920,
		height: 1080,
		movable: false,
		closable: false,
		focusable: false,
		hasShadow: false,
		resizable: false,
		thickFrame: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		transparent: true,
		titleBarStyle: 'hidden',
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'flash', 'preload.js')
		}
	});

	_screen = _config.settings.screen;
	next_screen(_screen);

	win.setIgnoreMouseEvents(true);
	win.loadFile(path.join(__dirname, 'flash', 'index.html')).then(() => {
		set_duration(_config.settings.duration);
		win.show();
	});
}

function update_interface()
{
	const screens = screen.getAllDisplays();

	_sender('message', 'config', _config);
	_sender('message', 'screens', screens.length);
}

function save_config()
{
	_sender('manager', 'config', _config);
}

function set_duration(duration)
{
	duration = Math.max(100, duration);
	win.webContents.send('duration', duration);
}

function next_screen(index)
{
	const screens = screen.getAllDisplays();
	if (typeof(index) === 'undefined')
	{
		_screen = ((_screen + 1) % screens.length);
		_config.settings.screen = _screen;
	}
	else
		_screen = ((index < screens.length) ? index : 0);

	const bounds = screens[_screen].bounds;
	win.setPosition(bounds.x, bounds.y);
	win.setSize(bounds.width, bounds.height);
}

function flash_screen(name, force)
{
	let now = Date.now();
	if (force || !_last || (_last + (_config.settings.delay * 1000)) < now)
	{
		_last = now;
		win.webContents.send('flash', name);
		return true;
	}

	return false;
}

module.exports = {
	init: (origin, config, sender) => {
		_sender = sender;
		_config = config;

		for (const section in _default)
		{
			if (typeof(_config[section]) !== 'object')
				_config[section] = {}

			for (const name in _default[section])
			{
				const config_value = _config[section][name];
				const default_value = _default[section][name];
				const config_type = typeof(config_value);
				const default_type = typeof(default_value);
				if (config_type !== default_type)
				{
					if (default_type === 'number' && config_type === 'string' && is_numeric(config_value))
						_config[section][name] = parseFloat(config_value);
					else if (default_type === 'boolean' && config_type === 'string')
						_config[section][name] = (['1', 'true'].indexOf(config_value) >= 0);
					else
						_config[section][name] = default_value;
				}
			}
		}

		_config.settings.delay = Math.max(1, _config.settings.delay);
		_config.settings.duration = Math.max(100, _config.settings.duration);

		_sender('manager', 'menu', [
			{ label: 'Pause', type: 'checkbox', click : item => {
				clearTimeout(_pause);
				_pause = 0;

				if (item.checked)
				{
					_pause = setTimeout(() => {
						_pause = 0;
						item.checked = false;
					}, (_config.settings.pause * 1000 * 60));
				}
			} },
			{ label: 'Next Screen', click : () => {
				next_screen();
				update_interface();
				save_config();

				flash_screen(false, true);
			} }
		]);

		create_window();
	},
	receiver: (id, name, data) => {
		//console.log('stream-flash receive:', id, name, data);
		if (id == 'manager')
		{
			if (name == 'show')
				update_interface();
			else if (name == 'enabled')
				_config.default.enabled = data;
		}

		if (id == 'message')
		{
			if (typeof(data) === 'object')
			{
				const name = Object.keys(data)[0];
				if (typeof(data[name]) === typeof(_config.settings[name]))
					_config.settings[name] = data[name];
				save_config();

				if (name == 'screen')
				{
					next_screen(data.screen);
					flash_screen(false, true);
				}
				else if (name == 'duration')
					set_duration(data.duration);
			}
			else if (data == 'reset')
			{
				_config.statistics.flash = 0;
				_config.statistics.viewer = 0;
				_config.statistics.moderator = 0;
				_config.statistics.subscriber = 0;

				update_interface();
				save_config();
			}
		}

		if (_config.default.enabled)
		{
			if (id == 'twitch' && name == 'Connected')
				flash_screen('connected');
			//	_sender('twitch', 'GetChannelRewards', ['my-client-id', true]).then(data => console.log('GetChannelRewards:', data));

			if (id == 'twitch' && name == 'Chat')
			{
				const [user, message, flags, self, extra] = data;
				if (_pause || !flash_screen())
					return;

				++_config.statistics.flash;
				if (!flags.broadcaster)
				{
					let viewer = true;
					if (flags.mod && !(viewer = false))
						++_config.statistics.moderator;
					if (flags.subscriber && !(viewer = false))
						++_config.statistics.subscriber;

					if (viewer)
						++_config.statistics.viewer;
				}

				update_interface();
				save_config();
			}
		}
	}
}
