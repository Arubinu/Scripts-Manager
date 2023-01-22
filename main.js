const	fs = require('fs'),
		ws = require('ws'),
		{ usb } = require('usb'),
		http = require('http'),
		path = require('path'),
		elog = require('electron-log'),
		estore = require('electron-store'),
		inifile = { read: require('read-ini-file'), write: require('write-ini-file') },
		{ app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');

const	port = 5042,
		icon = nativeImage.createFromPath(path.join(__dirname, 'public', 'images', 'logo.png')),
		store = new estore();

let		win,
		wss,
		tray,
		menus = {},
		addons = {},
		manager = {},
		scripts = {},
		app_exit = false,
		bluetooth_callback = null;

function create_server()
{
	const server = http.createServer({}, async (req, res) => {
		if (req.url != '/favicon.ico' && await all_methods('http', { req, res }))
			return;

		res.writeHead(200);
		res.end('success');
	});
	server.on('error', err => console.error(err));
	server.listen(port, () => console.log('Https running on port', port));

	wss = new ws.Server({server});
	wss.on('connection', client => {
		client.on('message', async data => {
			if (typeof(data) === 'object')
				data = String.fromCharCode.apply(null, new Uint16Array(data));

			try
			{
				data = JSON.parse(data);
			}
			catch (e) {}

			if (await all_methods('websocket', data))
				return;
		});
	});
}

function create_window()
{
	win = new BrowserWindow({
		show: false,
		icon: icon,
		width: 1140,
		height: 630,
		minWidth: 700,
		minHeight: 300,
		webPreferences: {
			//devTools: true,
			//nodeIntegration: true,
			//contextIsolation: true,
			preload: path.join(__dirname, 'preload.js')
		}
	});

	win.setMenu(null);
	win.setTitle('Scripts Manager');
	win.loadFile(path.join(__dirname, 'public', 'index.html')).then(() => {
		ipcMain.handleOnce('init', (event, data) => {
			ipcMain.handle('manager', (event, data) => {
				let id = 'manager';

				let obj = false;
				if (data.type == 'addons' && typeof(addons[data.id]) === 'object')
					obj = addons[data.id];
				else if (data.type == 'scripts' && typeof(scripts[data.id]) === 'object')
					obj = scripts[data.id];

				if (data.name == 'enabled')
				{
					obj.config.default.enabled = data.data;
					save_config(data.type, data.id);
				}
				else if (data.name == 'websocket')
				{
					for (const client of wss.clients)
						client.send(data.data);
				}
				else if (data.name == 'bluetooth:disconnect')
				{
					win.webContents.send('manager', { name: data.name, data: data.data });
					return;
				}
				else if (data.name == 'bluetooth:connect')
				{
					if (typeof(bluetooth_callback) === 'function')
						bluetooth_callback(data.data);
					return;
				}
				else if (data.name == 'bluetooth:data' || data.name == 'bluetooth:error')
				{
					all_methods('bluetooth', { name: data.name, data: data.data });
					return;
				}
				else if (data.name == 'browse:file' || data.name == 'browse:files')
				{
					dialog.showOpenDialog({
						properties: [(data.name == 'browse:files') ? 'openFiles' : 'openFile']
					}).then(result => {
						if (!result.canceled)
						{
							data.result = result;
							win.webContents.send('manager', data);
						}
					});
				}
				else if (data.name == 'browse:folder')
				{
					dialog.showOpenDialog({
						properties: ['openDirectory']
					}).then(result => {
						if (!result.canceled)
						{
							data.result = result;
							win.webContents.send('manager', data);
						}
					});
				}

				if (data.type == 'general')
				{
					if (data.name == 'save')
					{
						manager = Object.assign(manager, data.data);
						save_manager_config();
					}
					else if (data.name == 'browse')
					{
						win.webContents.send('manager', data);
					}
					else if (data.name == 'load')
					{
						data.data = JSON.parse(JSON.stringify(manager));
						win.webContents.send('manager', data);
					}
				}
				else if (obj && typeof(obj.include.receiver) === 'function')
					obj.include.receiver(id, data.name, data.data);
			});

			ipcMain.handle('message', (event, data) => {
				let obj = false;
				if (data.type == 'addons' && typeof(addons[data.id]) === 'object')
					obj = addons[data.id];
				else if (data.type == 'scripts' && typeof(scripts[data.id]) === 'object')
					obj = scripts[data.id];

				if (data.type == 'general')
					;
				else if (obj && typeof(obj.include.receiver) === 'function')
					obj.include.receiver('message', data.name, data.data);
			});

			win.webContents.on('select-bluetooth-device', (event, device_list, callback) => {
				event.preventDefault(); // important, otherwise first available device will be selected

				if (typeof(bluetooth_callback) !== 'function')
				{
					const timeout = setTimeout(() => {
						if (typeof(bluetooth_callback) === 'function')
							bluetooth_callback('');
					}, 30000);

					bluetooth_callback = device => {
						console.log('bluetooth selected:', device);

						bluetooth_callback = null;
						all_methods('bluetooth', { devices: false });

						clearTimeout(timeout);
						callback((typeof(device) === 'object' && typeof(device.deviceId) === 'string') ? device.deviceId : device);
					};
				}

				all_methods('bluetooth', device_list);
			});

			const vars = {
				http: `http://localhost:${port}`,
				websocket: `ws://localhost:${port}`
			};

			for (const id in addons)
			{
				const addon = addons[id];
				try
				{
					addon.include.initialized();
				}
				catch (e) {}
			}

			for (const id in scripts)
			{
				const script = scripts[id];
				try
				{
					script.include.initialized();
				}
				catch (e) {}
			}
		});

		let configs = { addons: {}, scripts: {} };
		for (const id in addons)
			configs.addons[id] = addons[id].config;
		for (const id in scripts)
			configs.scripts[id] = scripts[id].config;

		//win.webContents.openDevTools();
		win.webContents.executeJavaScript('console.log("user gesture fired");', true);
		win.webContents.send('init', { menus, configs });
	});

	win.on('close', event => {
		event.preventDefault();
		win.hide();
	});
}

function load_manager_config()
{
	try
	{
		const tmp = store.get('manager');
		if (typeof(tmp) === 'object')
			manager = tmp;
	}
	catch (e) {}
}

function save_manager_config()
{
	store.set('manager', manager);
}

async function save_config(type, id, data, override)
{
	let obj = null;
	let is_global = false;
	if (type == 'addons')
	{
		obj = addons[id].config;
		is_global = addons[id].is_global;
	}
	else if (type == 'scripts')
	{
		obj = scripts[id].config;
		is_global = scripts[id].is_global;
	}
	else
		return false;

	if (typeof(data) === 'object')
	{
		for (const section in data)
		{
			if (['default', 'menu'].indexOf(section) < 0 && typeof(data[section]) === 'object')
			{
				if (typeof(obj[section]) !== 'object')
					obj[section] = {};

				if (!override)
				{
					for (const name in data[section])
						obj[section][name] = data[section][name];
				}
				else
					obj[section] = JSON.parse(JSON.stringify(data[section]));
			}
		}
	}

	let config_path = path.join(__dirname, type, id);
	if (!fs.existsSync(config_path))
	{
		if (typeof(manager) === 'object' && typeof(manager.default) === 'object')
		{
			if (typeof(manager.default.all) === 'string')
				config_path = path.join(manager.default.all, type, id);
		}
	}

	if (is_global)
	{
		store.set(`${type}-${id}`, obj);
		return true;
	}

	return await inifile.write(path.join(config_path, 'config.ini'), obj);
}

function load_addons(dir, is_global)
{
	return new Promise((resolve, reject) => {
		fs.readdir(dir, (err, files) => {
			if (err)
				return reject(err);

			const vars = {
				http: `http://localhost:${port}`,
				websocket: `ws://localhost:${port}`
			};

			files.forEach(file => {
				if (typeof(addons[file]) !== 'undefined')
					return;

				let addon_path = path.join(dir, file);
				let addon_file = path.join(addon_path, 'addon.js');
				let config_file = path.join(addon_path, 'config.ini');
				if (fs.existsSync(addon_file) && fs.existsSync(config_file) && fs.existsSync(path.join(addon_path, 'index.html')))
				{
					try
					{
						let config = JSON.parse(JSON.stringify(inifile.read.sync(config_file)));
						if (typeof(config.default.name) === 'string')
						{
							if (is_global)
							{
								try
								{
									const tmp = store.get(`addons-${file}`);
									for (const key in tmp)
									{
										if (key == 'general')
											config[key].enabled = ((typeof(tmp[key].enabled) === 'boolean') ? tmp[key].enabled : false);
										else
											config[key] = Object.assign(((typeof(config[key]) === 'object') ? config[key] : {}), tmp[key]);
									}
								}
								catch (e) {}
							}

							addons[file] = {
								path: addon_path,
								config: config,
								include: require(addon_file),
								is_global: is_global
							}

							try
							{
								addons[file].include.init(addon_path, JSON.parse(JSON.stringify(addons[file].config)), async function() { return await all_sender('addons', file, ...arguments); }, vars);
							}
							catch (e) {}

							console.log('Addon loaded:', file);
						}
					}
					catch (e)
					{
						delete addons[file];
						console.log('Addon error:', file, e);
					}
				}
			});

			resolve(scripts);
		});
	});
}

function load_scripts(dir, is_global)
{
	return new Promise((resolve, reject) => {
		fs.readdir(dir, (err, files) => {
			if (err)
				return reject(err);

			const vars = {
				http: `http://localhost:${port}`,
				websocket: `ws://localhost:${port}`
			};

			files.forEach(file => {
				if (typeof(scripts[file]) !== 'undefined')
					return;

				let script_path = path.join(dir, file);
				let script_file = path.join(script_path, 'script.js');
				let config_file = path.join(script_path, 'config.ini');
				if (fs.existsSync(script_file) && fs.existsSync(config_file) && fs.existsSync(path.join(script_path, 'index.html')))
				{
					try
					{
						let config = JSON.parse(JSON.stringify(inifile.read.sync(config_file)));
						if (typeof(config.default.name) === 'string' && typeof(config.default.version) === 'string' && typeof(config.default.author) === 'string')
						{
							menus[file] = [];
							if (typeof(config.menu) === 'object')
							{
								for (let id in config.menu)
								{
									if (id.indexOf('/') < 0 && id.indexOf('\\') < 0 && fs.existsSync(path.join(script_path, `${id}.html`)))
										menus[file].push({ id: id, name: config.menu[id] });
								}
							}

							if (is_global)
							{
								try
								{
									const tmp = store.get(`scripts-${file}`);
									for (const key in tmp)
									{
										if (key == 'general')
											config[key].enabled = ((typeof(tmp[key].enabled) === 'boolean') ? tmp[key].enabled : false);
										else
											config[key] = Object.assign(((typeof(config[key]) === 'object') ? config[key] : {}), tmp[key]);
									}
								}
								catch (e) {}
							}

							scripts[file] = {
								menu: [],
								path: script_path,
								config: config,
								include: require(script_file),
								is_global: is_global
							}

							try
							{
								scripts[file].include.init(script_path, JSON.parse(JSON.stringify(scripts[file].config)), async function() { return await all_sender('scripts', file, ...arguments); }, vars);
							}
							catch (e) {}

							console.log('Script loaded:', file);
						}
					}
					catch (e)
					{
						delete scripts[file];
						console.log('Script error:', file, e);
					}
				}
			});

			resolve(scripts);
		});
	});
}

async function all_methods(type, data)
{
	for (const id in addons)
	{
		if (typeof(addons[id].config.default.methods) === 'string' && addons[id].config.default.methods.split(',').indexOf(type) >= 0)
		{
			if (await (addons[id].include.receiver('methods', type, data)))
				return true;
		}
	}

	for (const id in scripts)
	{
		if (typeof(scripts[id].config.default.methods) === 'string' && scripts[id].config.default.methods.split(',').indexOf(type) >= 0)
		{
			if (await (scripts[id].include.receiver('methods', type, data)))
				return true;
		}
	}

	return false;
}

async function all_sender(type, id, target, name, data)
{
	if (target == 'manager')
	{
		const names = name.split(':');

		if (names[0] == 'websocket')
		{
			data = JSON.stringify(data);
			for (const client of wss.clients)
				client.send(data);

			return;
		}
		else if (names[0] == 'bluetooth' && names.length > 1)
		{
			if (names[1] == 'scan' || names[1] == 'disconnect')
				win.webContents.send('manager', { type, id, name, data });
			else if (names[1] == 'list')
				all_methods('bluetooth', data);
			else if (names[1] == 'connect' && typeof(bluetooth_callback) === 'function')
				win.webContents.send('manager', { type, id, name, data });

			return;
		}
	}

	if (type == 'addons')
	{
		if (target == 'manager')
		{
			const split = name.split(':');
			if (split[0] == 'config')
				save_config(type, id, data, (split.length == 2 && split[1] == 'override'));
		}
		else if (target == 'message')
		{
			if (!win)
				return false;

			win.webContents.send('message', { type, id, name, data });
			return true;
		}
		else if (target == 'broadcast')
		{
			for (const sid in scripts)
			{
				if (typeof(scripts[sid].config.default.addons) === 'string' && scripts[sid].config.default.addons.split(',').indexOf(id) >= 0)
					scripts[sid].include.receiver(id, name, data);
			}
		}
	}
	else if (type == 'scripts')
	{
		if (target == 'manager')
		{
			const split = name.split(':');
			if (name == 'menu')
			{
				scripts[id].menu = data;
				generate_menu();
			}
			else if (split[0] == 'config')
				save_config(type, id, data, (split.length == 2 && split[1] == 'override'));
			else
				return 'feature not found';

			return true;
		}
		else if (target == 'message')
		{
			if (!win)
				return false;

			win.webContents.send('message', { type, id, name, data });
			return true;
		}

		if (typeof(addons[target]) !== 'object')
			return 'addon not found';
		else if (typeof(scripts[id].config.default.addons) !== 'string' || scripts[id].config.default.addons.split(',').indexOf(target) < 0)
			return 'unregistered addon';
		else if (typeof(scripts[id].include.receiver) !== 'function')
			return 'addon receiver not found';

		return await addons[target].include.receiver(id, name, data);
	}
}

function generate_menu()
{
	let scripts_menu = [];
	for (let name in scripts)
	{
		try
		{
			const menu = scripts[name].menu;
			if (menu.length)
			{
				let tmp = { label: scripts[name].config.default.name };
					tmp.submenu = menu;

				Menu.buildFromTemplate([tmp]);
				scripts_menu.push(tmp);
			}
		}
		catch (e) {}
	}

	tray.setContextMenu(Menu.buildFromTemplate(scripts_menu.concat([
		{ type: 'separator' },
		{ label: 'Settings', click : async () => {
			win.show();
		} },
		{ label: 'Quit', click : async () => {
			app.exit();
		} }
	])));
}

function usb_detection()
{
	usb.on('attach', device => all_methods('usb', { type: 'add', device }));
	usb.on('detach', device => all_methods('usb', { type: 'remove', device }));
}

const logpath = (process.env.PORTABLE_EXECUTABLE_DIR ? process.env.PORTABLE_EXECUTABLE_DIR : __dirname);
elog.transports.file.resolvePath = () => path.join(logpath, 'ScriptsManager.log');
Object.assign(console, elog.functions);

app.whenReady().then(() => {
	// init tray
	tray = new Tray(icon);
	tray.setToolTip('Scripts Manager');

	tray.on('double-click', () => {
		if (win)
			win.show();
	});

	// built-in scripts
	const next = () => {
		// user addons
		const next = () => {
			// user scripts
			const next = () => {
				// init app
				const next = () => {
					generate_menu();
					create_server();
					usb_detection();
					create_window();

					app.on('activate', () => {
						if (!win)
							create_window();
						else if (!win.isVisible())
							win.show();
					});
				};

				if (typeof(manager.default) === 'object' && typeof(manager.default.all) === 'string')
				{
					const scripts_path = path.join(manager.default.all, 'scripts');
					if (fs.existsSync(scripts_path))
					{
						load_scripts(scripts_path).then(next).catch(next);
						return;
					}
				}

				next();
			};

			load_manager_config();
			if (typeof(manager.default) === 'object' && typeof(manager.default.all) === 'string')
			{
				const addons_path = path.join(manager.default.all, 'addons');
				if (fs.existsSync(addons_path))
				{
					load_addons(addons_path).then(next).catch(next);
					return;
				}
			}

			next();
		};

		load_scripts(path.join(__dirname, 'scripts'), true).then(next).catch(next);
	};

	// built-in addons
	load_addons(path.join(__dirname, 'addons'), true).then(next).catch(next);
});
