const	fs = require('fs'),
		path = require('path'),
		estore = require('electron-store'),
		inifile = { read: require('read-ini-file'), write: require('write-ini-file') },
		{ app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');

const	icon = nativeImage.createFromPath(path.join(__dirname, 'public', 'images', 'logo.png')),
		store = new estore();

let		win,
		tray,
		menus = {},
		addons = {},
		manager = {},
		scripts = {},
		app_exit = false;

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
		ipcMain.handle('manager', (event, data) => {
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
			else if (data.name == 'browse')
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
				//console.log('main manager receive:', data);
				if (data.name == 'save')
				{
					manager = Object.assign(manager, data.data);
					save_manager_config();
				}
				else if (data.name == 'load')
				{
					data.data = JSON.parse(JSON.stringify(manager));
					win.webContents.send('manager', data);
				}
			}
			else if (obj && typeof(obj.include.receiver) === 'function')
				obj.include.receiver('manager', data.name, data.data);
		});
		ipcMain.handle('message', (event, data) => {
			let obj = false;
			if (data.type == 'addons' && typeof(addons[data.id]) === 'object')
				obj = addons[data.id];
			else if (data.type == 'scripts' && typeof(scripts[data.id]) === 'object')
				obj = scripts[data.id];

			if (data.type == 'general')
				; //console.log('main message receive:', data);
			else if (obj && typeof(obj.include.receiver) === 'function')
				obj.include.receiver('message', data.name, data.data);
		});

		let configs = { addons: {}, scripts: {} };
		for (const id in addons)
			configs.addons[id] = addons[id].config;
		for (const id in scripts)
			configs.scripts[id] = scripts[id].config;

		//win.webContents.openDevTools();
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

			files.forEach(file => {
				if (typeof(addons[file]) !== 'undefined')
					return ;

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
								config: config,
								include: require(addon_file),
								is_global: is_global
							}

							if (typeof(addons[file].include.init) === 'function')
								addons[file].include.init(addon_path, JSON.parse(JSON.stringify(addons[file].config)), async function() { return await script_sender('addons', file, ...arguments); });

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

			files.forEach(file => {
				if (typeof(scripts[file]) !== 'undefined')
					return ;

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
								config: config,
								include: require(script_file),
								is_global: is_global
							}

							if (typeof(scripts[file].include.init) === 'function')
								scripts[file].include.init(script_path, JSON.parse(JSON.stringify(scripts[file].config)), async function() { return await script_sender('scripts', file, ...arguments); });

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

async function script_sender(type, id, target, name, data)
{
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
				return 'feature not found'; // retourner une exception

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
			return 'addon not found'; // retourner une exception
		else if (typeof(scripts[id].config.default.addons) !== 'string' || scripts[id].config.default.addons.split(',').indexOf(target) < 0)
			return 'unregistered addon'; // retourner une exception
		else if (typeof(scripts[id].include.receiver) !== 'function')
			return 'addon receiver not found'; // retourner une exception

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

app.whenReady().then(() => {
	// init tray
	tray = new Tray(icon);
	tray.setToolTip('ScriptManager');

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
						return ;
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
					return ;
				}
			}

			next();
		};

		load_scripts(path.join(__dirname, 'scripts'), true).then(next).catch(next);
	};

	// built-in addons
	load_addons(path.join(__dirname, 'addons'), true).then(next).catch(next);
});
