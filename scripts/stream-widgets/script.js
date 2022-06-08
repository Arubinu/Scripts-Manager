const	path = require('path'),
		keyevents = require('node-global-key-listener').GlobalKeyboardListener,
		{ app, screen, BrowserWindow, ipcMain } = require('electron');

let		win = null,
		_edit = false,
		_screen = 0,
		_config = {},
		_sender = null,
		_default = {
			settings: {
				screen:		0
			},
			presets: {},
			widgets: {}
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
		webPreferences: {
			preload: path.join(__dirname, 'widgets', 'preload.js')
		}
	});

	_screen = _config.settings.screen;
	next_screen(_screen);

	win.setMenu(null);
	win.setIgnoreMouseEvents(true);
	win.loadFile(path.join(__dirname, 'widgets', 'index.html')).then(() => {
		ipcMain.handle('move', (event, data) => {
			if (typeof(_config.widgets[data.id]) !== 'undefined')
			{
				let widget = JSON.parse(_config.widgets[data.id]);
				widget.x = data.x;
				widget.y = data.y;

				_config.widgets[data.id] = JSON.stringify(widget);
				save_config();
			}
		});

		//win.webContents.openDevTools();
		win.webContents.send('add', { id: '42', widget: JSON.parse(_config.widgets['42']) });
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

	win.webContents.send('flash');
}

module.exports = {
	init: (origin, config, sender) => {
		_sender = sender;
		_config = config;

		for (const section in _default)
		{
			if (typeof(_config[section]) !== 'object')
				_config[section] = {};

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
					else
						_config[section][name] = default_value;
				}
			}
		}

		_sender('manager', 'menu', [
			{ label: 'Edit Mode', click : () => {
				if (_config.default.enabled)
				{
					_edit = true;
					win.setIgnoreMouseEvents(!_edit);
					win.webContents.send('edit', _edit);
				}
			} },
			{ label: 'Next Screen', click : () => {
				next_screen();
				update_interface();
				save_config();
			} }
		]);

		(new keyevents()).addListener((event, down) => {
			if (event.name == 'ESCAPE' && event.state == 'DOWN')
			{
				_edit = false;
				win.setIgnoreMouseEvents(!_edit);
				win.webContents.send('edit', _edit);
			}
		});

		create_window();
	},
	receiver: (id, name, data) => {
		console.log('widget:', id, name, data);
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
					next_screen(data.screen);
			}
		}
	}
}
