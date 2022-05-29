// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

const	{ ipcRenderer } = require('electron');

let		_target = '';

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
	console.log('init:', data);

	const add_ul = (type, name, parent) => {
		let li = document.createElement('li');
		let ul = document.createElement('ul');

		li.appendChild(ul);
		parent.appendChild(li);

		return ul;
	};

	const add_li = (type, id, name, parent) => {
		let a = document.createElement('a');
		let li = document.createElement('li');

		a.innerText = name;
		a.setAttribute('data-target', `${type}:${id}`);

		li.appendChild(a);
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
});

window.addEventListener('DOMContentLoaded', () => {
	const list = document.querySelector('.menu');
	const iframe = document.querySelector('.content > iframe');

	// from main
	ipcRenderer.on('message', (event, data) => {
		console.log('from main:', data);
		let target = get_target();
		if (data.type == target.type && data.id == target.id)
		{
			// to renderer
			console.log('to renderer:', data);
			iframe.contentWindow.postMessage(data, '*');
		}
	});

	// from renderer
	window.addEventListener('message', event => {
		console.log('from renderer:', event.data);
		if (event.origin !== 'null')
		{
			let target = get_target();
			target.data = event.data;

			// to main
			console.log('to main:', target);
			ipcRenderer.invoke('message', target);
		}
	});

	// target changed
	iframe.addEventListener('load', event => {
		let target = get_target();
		target.name = 'show';
		target.data = null;

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
				_target = target;
				target = get_target();

				let uri = `../${target.type}/${target.id}/${target.name}.html`;
				if (target.type == 'general')
					uri = `../public/${target.id}.html`;

				iframe.setAttribute('src', uri);
			}
		}
	});

	// enable default target
	setTimeout(() => {
		const elem = document.querySelector('[data-target].is-active');
		_target = elem.getAttribute('data-target');
		elem.click();
	}, 10);
});
