// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

const	fs = require('fs'),
		path = require('path'),
		{ shell, ipcRenderer } = require('electron');

let		_target = '';
		_manager = {};

function get_target(target = _target)
{
	const split = target.split(':');
	const [type, id, name] = [
		split[0],
		split[1],
		((split.length > 2) ? split[2] : 'index')
	];

	return { type, id, name, target };
}

ipcRenderer.on('init', (event, data) => {
	let index = 0;
	const list = document.querySelector('.menu');
	const iframe = document.querySelector('.content > iframe');

	// define iframe height
	setInterval(() => {
		iframe.style.height = `${iframe.contentWindow.document.body.scrollHeight - 20}px`;
	}, 1000);

	// menu generation
	const add_ul = (type, name, parent) => {
		const li = document.createElement('li');
		const ul = document.createElement('ul');

		li.appendChild(ul);
		parent.appendChild(li);

		return ul;
	};

	const add_li = (type, id, name, parent) => {
		const a = document.createElement('a');
		const li = document.createElement('li');

		a.innerText = name;
		a.setAttribute('data-target', `${type}:${id}`);
		li.appendChild(a);

		if (id.indexOf(':') < 0)
		{
			const label = document.createElement('label');
			label.setAttribute('for', `checkbox_${index}`);
			label.classList.add('switch');

			const checkbox = document.createElement('input');
			checkbox.setAttribute('type', 'checkbox');
			checkbox.setAttribute('id', `checkbox_${index}`);
			checkbox.checked = !!data.configs[type][id].default.enabled;

			const slider = document.createElement('div');
			slider.classList.add('slider', 'round');

			label.appendChild(checkbox);
			label.appendChild(slider);
			li.appendChild(label);

			++index;
		}

		parent.appendChild(li);

		return li;
	};

	for (const type in data.configs)
	{
		const list = document.querySelector(`.${type}-list`);
		for (const id in data.configs[type])
		{
			let name = data.configs[type][id].default.name;
			let li = add_li(type, id, name, list);

			if (type == 'scripts')
			{
				const menu = data.menus[id];
				if (menu.length)
				{
					let ul = add_ul(name, li, list);
					for (let submenu of menu)
						add_li(type, `${id}:${submenu.id}`, submenu.name, ul);
				}
			}
		}
	}

	// from main
	ipcRenderer.on('manager', (event, data) => {
		if (data.target == get_target().target)
		{
			const iframe_doc = iframe.contentWindow.document;

			if (data.name == 'load')
			{
				if (data.target == 'general:about')
				{
					_manager = data.data;
					if (typeof(_manager) === 'object' && typeof(_manager.default) === 'object')
					{
						let browse = iframe_doc.querySelector('.browse input');
						if (typeof(_manager.default.all) === 'string')
							browse.value = _manager.default.all;
					}
				}
			}
			else if (data.name == 'browse')
			{
				let elem = iframe_doc.querySelector(data.data)
				elem.value = data.result.filePaths[0];
				elem.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
			}
		}
	});
	ipcRenderer.on('message', (event, data) => {
		let target = get_target();
		if (data.type == target.type && data.id == target.id)
		{
			// to renderer
			iframe.contentWindow.postMessage(data, '*');
		}
	});

	// from renderer
	window.addEventListener('message', event => {
		if (event.origin !== 'null')
		{
			let target = get_target();
			target.data = event.data;

			// to main
			ipcRenderer.invoke('message', target);
		}
	});

	// target changed
	iframe.addEventListener('load', event => {
		const iframe_doc = iframe.contentWindow.document;

		const config_stylesheet = iframe_doc.querySelector(`#config_stylesheet`);
		if (config_stylesheet)
			config_stylesheet.setAttribute('href', path.join(__dirname, 'public/css/config.css'));

		// get new target
		let target = get_target();
		target.name = 'show';
		target.data = true;

		// display versions
		if (target.target == 'general:about')
		{
			const this_ = iframe_doc.querySelector('.this-version');
			const this_file = path.join(__dirname, 'package.json');
			if (fs.existsSync(this_file))
			{
				const package = require(this_file);
				this_.innerText = package.version;
				this_.parentElement.children[0].innerText = package.name;
			}
			else
				this_.parentElement.remove();

			let browse = iframe_doc.querySelector('.browse input');
			browse.addEventListener('change', () => {
				let target = get_target();
				target.name = 'save';
				target.data = { default: { all: browse.value } };

				ipcRenderer.invoke('manager', target);
			}, false);

			iframe_doc.querySelector('.node-version').innerText = process.versions.node;
			iframe_doc.querySelector('.chrome-version').innerText = process.versions.chrome;
			iframe_doc.querySelector('.electron-version').innerText = process.versions.electron;

			let target = get_target();
			target.name = 'load';

			ipcRenderer.invoke('manager', target);
		}

		// open links in default browser and open dialog
		iframe_doc.addEventListener('click', event => {
			let elem = event.target.closest('[browse-file], [external-link]');
			if (!elem)
				elem = event.target;

			if (elem.matches('[browse-file]'))
			{
				let target = get_target();
				target.name = 'browse';
				target.data = elem.getAttribute('browse-file');

				ipcRenderer.invoke('manager', target);
			}
			else if (elem.matches('[external-link]'))
			{
				event.preventDefault();
				shell.openExternal(elem.getAttribute('external-link'));
			}
		});

		// removes focus from buttons and links so as not to have the blue outline
		iframe_doc.addEventListener('mouseup', event => {
			if (!event.target.matches('input, textarea') && !event.target.closest('input, textarea'))
				iframe.blur();
		});

		// to main
		ipcRenderer.invoke('manager', target);
	});

	// click on menu link
	document.addEventListener('click', event => {
		if (event.target.matches('.menu a'))
		{
			// unselect all
			list.querySelectorAll('li, li > a').forEach(elem => {
				elem.classList.remove('is-active');
			});

			// select with parent
			event.target.classList.add('is-active');
			const parent = event.target.parentElement.parentElement.closest('li');
			if (parent && parent.previousSibling)
				parent.previousSibling.classList.add('is-active');

			// change target
			let target = event.target.getAttribute('data-target');
			if (target)
			{
				if (_target)
				{
					// get old target
					let target = get_target();
					target.name = 'show';
					target.data = false;

					ipcRenderer.invoke('manager', target);
				}

				// get/set new target
				_target = target;
				target = get_target();

				let uri = `../${target.type}/${target.id}/${target.name}.html`;
				if (target.type == 'general')
					uri = `../public/${target.id}.html`;

				if (!fs.existsSync(path.join(__dirname, 'erase', uri)))
				{
					if (typeof(_manager) === 'object' && typeof(_manager.default) === 'object')
					{
						if (typeof(_manager.default.all) === 'string')
							uri = path.join(_manager.default.all, 'erase', uri);
					}
				}

				iframe.setAttribute('src', uri);
			}
		}

		// send a message to the switch
		if (event.target.matches('.menu .switch .slider'))
		{
			setTimeout(() => {
				let target = get_target(event.target.parentElement.parentElement.querySelector('a').getAttribute('data-target'));
				target.name = 'enabled';
				target.data = event.target.parentElement.querySelector('input').checked;

				// to main
				ipcRenderer.invoke('manager', target);
			}, 10);
		}
	});

	// enable default target
	setTimeout(() => {
		const elem = document.querySelector('[data-target].is-active');
		_target = elem.getAttribute('data-target');
		elem.click();
	}, 10);
});
