document.addEventListener('DOMContentLoaded', () => {
	const	editor = window.editor,
			drawflow = document.querySelector('.box-drawflow'),
			show_blocks = document.querySelector('.show-blocks');

	let		global_datas = {},
			mobile_item_selec = '',
			mobile_last_move = null;

	function request(source_id, id, name, data)
	{
		window.parent.postMessage({request: [source_id, id, name, (data || [])]}, '*');
	}

	function drag(event)
	{
		const elem = event.target.closest('.drag-drawflow');

		document.body.classList.remove('show-blocks');
		if (event.type === 'touchstart')
			mobile_item_selec = elem.getAttribute('data-node');
		else
			event.dataTransfer.setData('node', elem.getAttribute('data-node'));
	}

	function drop(event)
	{
		if (event.type === 'touchend')
		{
			const touches = mobile_last_move.touches[0];
			const parentdrawflow = document.elementFromPoint(touches.clientX, touches.clientY).closest('.parent-drawflow');
			if (parentdrawflow != null)
				add_node(mobile_item_selec, touches.clientX, touches.clientY);

			mobile_item_selec = '';
		}
		else
		{
			event.preventDefault();
			var data = event.dataTransfer.getData('node');
			add_node(data, event.clientX, event.clientY);
		}
	}

	function drag_event(event)
	{
		const elem = event.target.closest('.drag-drawflow');

		if (elem)
		{
			switch (event.type)
			{
				case 'dragstart':
				case 'touchstart': drag(event); break;
				case 'touchmove': mobile_last_move = event; break;
				case 'touchend': drop(event); break;
			}
		}
	}

	function set_data(id, _data)
	{
		const node = editor.getNodeFromId(id);
		node.data.data = _data;

		editor.updateNodeDataFromId(node.data.id, node.data);
		window.drawflow_save();

		const node_elem = drawflow.querySelector(`#node-${id}`);
		for (const data_name of Object.keys(node.data.data))
		{
			const elem = node_elem.querySelector(`input[name="${data_name}"], select[name="${data_name}"], textarea[name="${data_name}"]`);
			if (elem)
			{
				const	is_input	= (elem.nodeName.toLowerCase() == 'input'),
						input_type	= (is_input && elem.getAttribute('type').toLowerCase());

				if (is_input && input_type == 'radio')
				{
					for (const elem of node_elem.querySelectorAll(`input[name="${data_name}"]`))
						elem.checked = (elem.value == node.data.data[data_name]);
				}
				else
					elem.value = node.data.data[data_name];
			}
		}
	};

	function add_node(type, pos_x, pos_y, data)
	{
		if (editor.editor_mode === 'fixed' || typeof blocks[type] === 'undefined')
			return false;

		pos_x = (pos_x * (editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom))) - (editor.precanvas.getBoundingClientRect().x * ( editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom)));
		pos_y = (pos_y * (editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom))) - (editor.precanvas.getBoundingClientRect().y * ( editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom)));

		const block = blocks[type];
		const id = editor.addNode(`${editor.nodeId}.${type}`, block.inputs, block.outputs, pos_x, pos_y, `block-${type}`, {}, type, true);

		editor.updateNodeDataFromId(id, { id: id, type: type, data: {} });
		set_data(id, Object.assign((block.data || {}), data));

		init_node(editor.getNodeFromId(id), true);
	}

	function init_node(node, first)
	{
		const	id			= node.data.id,
				block		= blocks[node.data.type],
				node_elem	= drawflow.querySelector(`#node-${id}`);

		if (block.width && block.width > 0)
			node_elem.style.width = `${block.width}px`;

		node_elem.querySelectorAll('input, select, textarea').forEach(elem => {
			const elem_name = elem.getAttribute('name');
			if (!elem_name)
				return;

			const	is_input	= elem.nodeName.toLowerCase() == 'input',
					input_type	= is_input && elem.getAttribute('type').toLowerCase(),
					data_exists	= typeof node.data.data[elem_name] !== 'undefined';

			if (is_input && input_type == 'checkbox')
			{
				if (data_exists)
					elem.checked = node.data.data[elem_name];
				else
					node.data.data[elem_name] = elem.checked;
			}
			else if (is_input && input_type == 'radio')
			{
				const radio_elems = node_elem.querySelectorAll(`input[name="${elem_name}"]`);
				for (const radio_elem of radio_elems)
				{
					if (data_exists)
						radio_elem.checked = (radio_elem.value == node.data.data[elem_name]);
					else if (radio_elem.checked)
						node.data.data[elem_name] = radio_elem.value;
				}
			}
			else
			{
				if (data_exists)
					elem.value = node.data.data[elem_name];
				else
					node.data.data[elem_name] = elem.value;
			}

			const update = event => {
				node.data.data[elem_name] = ((is_input && (input_type == 'radio' || input_type == 'checkbox')) ? elem.checked : elem.value);

				set_data(id, node.data.data);
				if (block.update)
					block.update(node.data.id, node_elem, node.data.data, _data => set_data(id, _data));
			};

			//elem.addEventListener('input', update, false);
			elem.addEventListener('change', update, false);
		});

		if (block.init)
			block.init(node.data.id, node_elem, node.data.data, _data => set_data(id, _data), first);

		set_data(id, node.data.data);
		if (block.update)
			block.update(node.data.id, node_elem, node.data.data, _data => set_data(id, _data));
	}

	const bodys = {
		text: (title, name) => {
			if (!name)
				name = title.toLowerCase().replace(/\s/g, '-');

			return `<p>${title}</p><input name="${name}" type="text" class="has-text-centered" />`;
		},
		number: (title, name, value, step, min, max) => {
			if (!name)
				name = title.toLowerCase().replace(/\s/g, '-');

			let attrs = '';
			if (typeof value === 'number')
				attrs += ` value="${value}"`;
			if (typeof step === 'number')
				attrs += ` step="${step}"`;
			if (typeof min === 'number')
				attrs += ` min="${min}"`;
			if (typeof max === 'number')
				attrs += ` max="${max}"`;

			return `<p>${title}</p><input name="${name}" type="number"${attrs} class="has-text-centered" />`;
		},
		select: (title, name, options, select) => {
			if (!name)
				name = title.toLowerCase().replace(/\s/g, '-');

			let list = '';
			if (options)
			{
				for (const option of options)
				{
					if (typeof option === 'object')
						list += `<option value="${option.value}"` + ((option.value == select) ? ' selected' : '') + `>${option.name}</option>`;
					else
						list += '<option' + ((option == select) ? ' selected' : '') + `>${option}</option>`;
				}
			}

			return `<p>${title}</p><select name="${name}" class="has-text-centered">${list}</select>`;
		},
		type: '<p>Type of value</p><hr /><label class="radio"><input name="type" type="radio" value="string" checked /><span>String</span></label><label class="radio"><input name="type" type="radio" value="number" /><span>Number</span></label><label class="radio"><input name="type" type="radio" value="boolean" /><span>Boolean</span></label>',
		match: '<label class="checkbox" title="The uppercase/lowercase will be taken into account" style="padding-left: 0em; width: 85%;"><input name="case" type="checkbox" /><span>Case sensitive</span></label><label class="checkbox" title="The message received contains the sentence (must be exact if unchecked)" style="padding-left: 0em; width: 85%;"><input name="contains" type="checkbox" /><span>Contains sentence</span></label>',
		viewers: '<p>Type of viewer</p><hr /><label class="checkbox"><input name="viewer" type="checkbox" /><span>Viewer</span></label><label class="checkbox"><input name="subscriber" type="checkbox" /><span>Subscriber</span></label><label class="checkbox"><input name="founder" type="checkbox" /><span>Founder</span></label><label class="checkbox"><input name="vip" type="checkbox" /><span>VIP</span></label><label class="checkbox"><input name="moderator" type="checkbox" /><span>Moderator</span></label><label class="checkbox"><input name="broadcaster" type="checkbox" /><span>Broadcaster</span></label>',
		state: (title, name, on, off) => {
			title = (title || 'State');
			if (!name)
				name = title.toLowerCase().replace(/\s/g, '-');

			return `<p>${title}</p><div><input name="${name}" type="checkbox" class="is-hidden" checked /><div class="field has-addons is-justify-content-center"><p class="control"><button class="button button-on"><span>${on || 'Start'}</span></button></p><p class="control"><button class="button button-off"><span>${off || 'Stop'}</span></button></p></div></div>`;
		},
		state_toggle: (title, name, on, off, toggle) => {
			title = (title || 'State');
			if (!name)
				name = title.toLowerCase().replace(/\s/g, '-');

			return `<p>${title}</p><div class="field has-addons is-justify-content-center"><p class="control"><input name="${name}" type="radio" value="on" class="is-hidden" checked /><button class="button button-on"><span>${on || 'Start'}</span></button></p><p class="control"><input name="${name}" type="radio" value="toggle" class="is-hidden" /><button class="button button-toggle"><span>${toggle || 'Toggle'}</span></button></p><p class="control"><input name="${name}" type="radio" value="off" class="is-hidden" /><button class="button button-off"><span>${off || 'Stop'}</span></button></p></div>`;
		},
	};

	const functions = {
		trim: (id, elem, data, set_data, receive, receive_data) => {
			let trim = false;
			for (const key in data)
			{
				const value = data[key];
				if (typeof value === 'string' && value != value.trim())
				{
					trim = true;
					data[key] = value.trim();
				}
			}

			if (trim)
				set_data(data);
		},
		number: (id, elem, data, set_data, receive, receive_data, arg, min, max) => {
			if (typeof min === 'number' && data[arg] < min)
			{
				data[arg] = min;
				set_data(data);
			}
			else if (typeof max === 'number' && data[arg] < max)
			{
				data[arg] = max;
				set_data(data);
			}
		},
		scene_source: (id, elem, data, set_data, receive, receive_data) => {
			const selects = elem.querySelectorAll('select');
			if (receive || global_datas.scene_source)
			{
				if (receive)
				{
					global_datas.scene_source = receive_data;

					global_datas.scene_source.sort((a, b) => {
						if (a.sceneName < b.sceneName)
							return -1;
						else if (a.sceneName > b.sceneName)
							return 1;
						return 0;
					});

					for (const scene of global_datas.scene_source)
					{
						scene.sources.sort((a, b) => {
							if (a.sourceName < b.sourceName)
								return -1;
							else if (a.sourceName > b.sourceName)
								return 1;
							return 0;
						});
					}
				}

				// source
				const scenes_changed = () => {
					const value = selects[0].value;
					if (value && selects.length > 1)
					{
						const selected = (selects[1].value || data.source);

						selects[1].innerHTML = '';
						selects[1].appendChild(document.createElement('option'));

						for (const scene of global_datas.scene_source)
						{
							if (scene.sceneName === value)
							{
								for (const source of scene.sources)
								{
									const option = document.createElement('option');
									option.value = source.sourceName;
									option.innerText = source.sourceName;
									selects[1].appendChild(option);
								}
							}
						}

						selects[1].value = selected;
					}
				};

				if (selects.length > 1)
				{
					if (!elem.classList.contains('block-init'))
					{
						elem.classList.add('block-init');
						selects[0].addEventListener('change', scenes_changed, false);
					}
				}

				// scene
				const selected = (selects[0].value || data.scene);

				selects[0].innerHTML = '';
				selects[0].appendChild(document.createElement('option'));

				for (const scene of global_datas.scene_source)
				{
					const option = document.createElement('option');
					option.value = scene.sceneName;
					option.innerText = scene.sceneName;
					selects[0].appendChild(option);
				}

				selects[0].value = selected;
				scenes_changed();
			}
			else if (!receive)
			{
				if (data.scene)
				{
					const option = document.createElement('option');
					option.value = data.scene;
					option.innerText = data.scene;

					selects[0].innerHTML = '';
					selects[0].appendChild(option);
				}

				if (data.source)
				{
					const option = document.createElement('option');
					option.value = data.source;
					option.innerText = data.source;

					selects[1].innerHTML = '';
					selects[1].appendChild(option);
				}

				request(id, 'obs-studio', 'GetScenes', [true]);
			}
		},
		source_filter: (id, elem, data, set_data, receive, receive_data) => {
			const selects = elem.querySelectorAll('select');
			if (receive || global_datas.source_filter)
			{
				if (receive)
				{
					global_datas.source_filter = receive_data;

					global_datas.source_filter.sort((a, b) => {
						if (a.sourceName < b.sourceName)
							return -1;
						else if (a.sourceName > b.sourceName)
							return 1;
						return 0;
					});

					for (const source of global_datas.source_filter)
					{
						source.filters.sort((a, b) => {
							if (a.filterName < b.filterName)
								return -1;
							else if (a.filterName > b.filterName)
								return 1;
							return 0;
						});
					}
				}

				// filter
				const source_changed = () => {
					const value = selects[0].value;
					if (value && selects.length > 1)
					{
						const selected = (selects[1].value || data.filter);

						selects[1].innerHTML = '';
						selects[1].appendChild(document.createElement('option'));

						for (const source of global_datas.source_filter)
						{

							if (source.sourceName === value)
							{
								for (const filter of source.filters)
								{
									const option = document.createElement('option');
									option.value = filter.filterName;
									option.innerText = filter.filterName;
									selects[1].appendChild(option);
								}
							}
						}

						selects[1].value = selected;
					}
				};

				if (selects.length > 1)
				{
					if (!elem.classList.contains('block-init'))
					{
						elem.classList.add('block-init');
						selects[0].addEventListener('change', source_changed, false);
					}
				}

				// source
				const selected = (selects[0].value || data.source);

				selects[0].innerHTML = '';
				selects[0].appendChild(document.createElement('option'));

				for (const source of global_datas.source_filter)
				{
					const option = document.createElement('option');
					option.value = source.sourceName;
					option.innerText = source.sourceName;
					selects[0].appendChild(option);
				}

				selects[0].value = selected;
				source_changed();
			}
			else if (!receive)
			{
				if (data.source)
				{
					const option = document.createElement('option');
					option.value = data.source;
					option.innerText = data.source;

					selects[0].innerHTML = '';
					selects[0].appendChild(option);
				}

				if (data.filter)
				{
					const option = document.createElement('option');
					option.value = data.filter;
					option.innerText = data.filter;

					selects[1].innerHTML = '';
					selects[1].appendChild(option);
				}

				request(id, 'obs-studio', 'GetSources', ['', true]);
			}
		},
		state: (id, elem, data, set_data, receive, receive_data, arg, callback) => {
			arg = (arg || 'state');

			const selector = `input[name="${arg}"]`;
			const inputs = elem.querySelectorAll(selector);
			const on = elem.querySelector(`${selector}[value="on"]`);
			const toggle = elem.querySelector(`${selector}[value="toggle"]`);
			const off = elem.querySelector(`${selector}[value="off"]`);

			if (inputs.length)
			{
				const button_on = (on ? on : inputs[0]).parentElement.querySelector('.button-on');
				const button_toggle = (toggle ? toggle : inputs[0]).parentElement.querySelector('.button-toggle');
				const button_off = (off ? off : inputs[0]).parentElement.querySelector('.button-off');

				const input_type = inputs[0].getAttribute('type').toLowerCase();

				if((input_type == 'checkbox' && button_on && button_off) || (input_type == 'radio' && on && off))
				{
					const change_state = (state, save) => {
						button_on.classList.toggle('is-active', (toggle ? (state == 'on') : state));
						button_off.classList.toggle('is-active', (toggle ? (state == 'off') : !state));
						if (button_toggle)
							button_toggle.classList.toggle('is-active', (state == 'toggle'));

						if (save)
						{
							data[arg] = state;
							set_data(data);
						}

						if (callback)
							callback(state);
					};

					if (!elem.querySelector('.is-active'))
					{
						button_on.addEventListener('click', () => change_state((toggle ? 'on' : true), true), false);
						button_off.addEventListener('click', () => change_state((toggle ? 'off' : false), true), false);
						if (button_toggle)
							button_toggle.addEventListener('click', () => change_state('toggle', true), false);
					}

					if (toggle)
					{
						let value = 'on';
						const radio_elems = elem.querySelectorAll(`input[name="${arg}"]`);
						for (const radio_elem of radio_elems)
						{
							if (radio_elem.checked)
								value = radio_elem.value;
						}

						change_state(value);
					}
					else
						change_state(inputs[0].checked);
						//change_state(elem.querySelector(`input[name="${arg}"]:checked`).value);
				}
			}
		}
	};

	const browse_fas = (id, type, elem, name) => {
		const target = `#node-${id} input[name="${name}"]`;

		const change = event => {
			const empty = !input.value;

			const fas = elem.querySelector('.fas');
			fas.classList.toggle('fa-ellipsis', empty);
			fas.classList.toggle('fa-xmark', !empty);

			if (!event && empty)
			{
				let node = editor.getNodeFromId(id);
				node.data.data[name] = input.value;
				set_data(node.data.id, node.data.data);
			}
		};

		elem.addEventListener('click', event => {
			const empty = !input.value;
			if (!empty)
			{
				input.value = '';
				event.preventDefault();
				event.stopPropagation();
			}

			change();
		}, true);

		elem.setAttribute(`browse-${type}`, target);

		const input = document.querySelector(target);
		input.addEventListener('change', change, false);

		change();
	};

	const display_image = (image, title) => {
		if (document.querySelector('.container-frame'))
			return;

		const container_frame = document.createElement('div');
		container_frame.classList.add('container-frame');
		container_frame.addEventListener('click', () => {
			container_frame.remove();
		}, false);

		const frame = document.createElement('div');
		container_frame.appendChild(frame);

		if (title)
		{
			const _title = document.createElement('div');
			_title.innerText = title;
			frame.appendChild(_title);
		}

		const _image = document.createElement('img');
		_image.setAttribute('src', image);
		frame.appendChild(_image);

		document.body.appendChild(container_frame);
	};

	const blocks = {
		'cooldown': {
			title: 'Cooldown',
			icon: 'cooldown',
			inputs: 1,
			outputs: 1,
			body: bodys.text('Variable name', 'variable') + bodys.number('Time in seconds', 'seconds', 10, 1),
			data: {},
			register: [],
			init: (id, elem, data, set_data, first) => {
				if (!data.variable)
				{
					data.variable = Date.now().toString();
					set_data(data);
				}
			},
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.trim(id, elem, data, set_data, receive, receive_data);
				functions.number(id, elem, data, set_data, receive, receive_data, 'seconds', 1);
			}
		},
		'http-request': {
			title: 'HTTP Request',
			icon: 'request',
			inputs: 1,
			outputs: 1,
			body: bodys.text('URL') + bodys.text('Method'),
			update: functions.trim
		},
		'socket-request': {
			title: 'Socket Request',
			icon: 'request',
			inputs: 1,
			outputs: 1,
			body: bodys.text('IPv4', 'host') + bodys.number('Port', false, 3000, 1, 1) + bodys.text('Data'),
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.trim(id, elem, data, set_data, receive, receive_data);
				functions.number(id, elem, data, set_data, receive, receive_data, 'port', 1);
			}
		},
		'websocket-request': {
			title: 'WebSocket Request',
			icon: 'request',
			inputs: 1,
			outputs: 1,
			body: bodys.text('URL') + bodys.text('Data'),
			update: functions.trim
		},
		'launch-app': {
			title: 'Launch App',
			icon: 'launch-app',
			inputs: 1,
			outputs: 1,
			body: '<p>Application</p><div class="is-browse launch-app"><input name="program" type="text" class="has-text-centered" readonly /><button><i class="fas fa-solid fa-ellipsis"></i></button></div>',
			update: (id, elem, data, set_data, receive, receive_data) => {
				if (!elem.classList.contains('block-init'))
				{
					elem.classList.add('block-init');
					browse_fas(id, 'file', elem.querySelector('.launch-app button'), 'program');
				}
			}
		},
		'open-url': {
			title: 'Open URL',
			icon: 'open-url',
			inputs: 1,
			outputs: 0,
			body: bodys.text('Address'),
			update: functions.trim
		},
		'self-timer': {
			title: 'Self-Timer',
			icon: 'self-timer',
			inputs: 1,
			outputs: 1,
			body: bodys.number('Time in milliseconds', 'millis', 1000, 100),
			update: (id, elem, data, set_data, receive, receive_data) => functions.number(id, elem, data, set_data, receive, receive_data, 'millis', 1)
		},
		'variable-setter': {
			title: 'Variable Setter',
			icon: 'variable-setter',
			inputs: 1,
			outputs: 1,
			body: bodys.text('Variable name', 'variable') + bodys.text('Value', 'string') + bodys.number('Value', 'number', 0) + bodys.select('Value', 'boolean', ['false', 'true']) + bodys.state_toggle('Variable type', 'type', 'String', 'Boolean', 'Number') + bodys.state_toggle('Scope', false, 'Global', 'Next', 'Local'), // + bodys.type
			update: (id, elem, data, set_data, receive, receive_data) => {
				const change_state = state => {
					const names = { on: 'string', toggle: 'number', off: 'boolean' };
					state = names[state];

					for (const input of elem.querySelectorAll(`select, input:not([type="radio"])`))
					{
						const name = input.getAttribute('name');
						if (name != 'variable')
						{
							input.previousElementSibling.style.display = ((name == state) ? 'block' : 'none');
							input.style.display = ((name == state) ? 'block' : 'none');
						}
					}
				};

				functions.trim(id, elem, data, set_data, receive, receive_data);
				functions.state(id, elem, data, set_data, receive, receive_data, 'type', change_state);
				functions.state(id, elem, data, set_data, receive, receive_data, 'scope');
			}
		},
		'variable-remove': {
			title: 'Variable Remove',
			icon: 'variable-remove',
			inputs: 1,
			outputs: 1,
			body: bodys.text('Variable name', 'variable'),
			update: functions.trim
		},
		'trigger-discord-webhook': {
			type: 'discord',
			title: 'Webhook',
			tooltip: 'Discord - Webhook',
			icon: 'webhook',
			width: 500,
			inputs: 1,
			outputs: 0,
			body: '<p>Webhook <i class="fas fa-solid fa-circle-info is-pulled-right"></i></p><input name="webhook" type="url" class="has-text-centered" /><div class="columns"><div class="column"><p>Title</p><input name="title" type="text" class="has-text-centered" /></div><div class="column"><p>URL</p><input name="url" type="url" class="has-text-centered" /></div></div><div class="columns"><div class="column"><p>Thumbnail</p><div class="is-browse discord-thumbnail"><input name="thumbnail" type="text" class="has-text-centered" readonly /><button><i class="fas fa-solid fa-ellipsis"></i></button></div></div><div class="column"><p>Big Image</p><div class="is-browse discord-big-image"><input name="big-image" type="text" class="has-text-centered" readonly /><button><i class="fas fa-solid fa-ellipsis"></i></button></div></div></div><p>Inline 1</p><div class="columns"><div class="column"><input name="inline-1-title" type="text" class="has-text-centered" placeholder="Title" /></div><div class="column"><input name="inline-1-content" type="text" class="has-text-centered" placeholder="Content" /></div></div><p>Inline 2</p><div class="columns"><div class="column"><input name="inline-2-title" type="text" class="has-text-centered" placeholder="Title" /></div><div class="column"><input name="inline-2-content" type="text" class="has-text-centered" placeholder="Content" /></div></div>',
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.trim(id, elem, data, set_data, receive, receive_data);

				if (!elem.classList.contains('block-init'))
				{
					elem.classList.add('block-init');

					browse_fas(id, 'file', elem.querySelector('.discord-thumbnail button'), 'thumbnail');
					browse_fas(id, 'file', elem.querySelector('.discord-big-image button'), 'big-image');

					elem.querySelector('.fa-circle-info').addEventListener('click', () => {
						display_image('guide.png', 'Discord Publication - Guide');
					}, false);
				}
			}
		},
		/*'event-obs-studio-authentification': {
			type: 'obs-studio',
			title: 'Authentification',
			tooltip: 'OBS Studio - Authentification',
			icon: 'authentification',
			inputs: 0,
			outputs: 1,
			body: bodys.state(false, false, 'Success', 'Failure'),
			update: functions.state
		},*/
		'event-obs-studio-connection': {
			type: 'obs-studio',
			title: 'Connection',
			tooltip: 'OBS Studio - Connection',
			icon: 'connection',
			inputs: 0,
			outputs: 1,
			body: bodys.state(false, false, 'Opened', 'Closed'),
			update: functions.state
		},
		'event-obs-studio-exit': {
			type: 'obs-studio',
			title: 'Exit',
			tooltip: 'OBS Studio - Exit',
			icon: 'exit',
			inputs: 0,
			outputs: 1
		},
		'event-obs-studio-recording': {
			type: 'obs-studio',
			title: 'Recording',
			tooltip: 'OBS Studio - Recording',
			icon: 'recording',
			inputs: 0,
			outputs: 1,
			body: bodys.state(),
			update: functions.state
		},
		'trigger-obs-studio-recording': {
			type: 'obs-studio',
			title: 'Recording',
			tooltip: 'OBS Studio - Recording',
			icon: 'recording',
			inputs: 1,
			outputs: 0,
			body: bodys.state_toggle(false),
			update: functions.state
		},
		'event-obs-studio-replay': {
			type: 'obs-studio',
			title: 'Replay',
			tooltip: 'OBS Studio - Replay',
			icon: 'replay',
			inputs: 0,
			outputs: 1,
			body: bodys.state(),
			update: functions.state
		},
		'trigger-obs-studio-replay': {
			type: 'obs-studio',
			title: 'Replay',
			tooltip: 'OBS Studio - Replay',
			icon: 'replay',
			inputs: 1,
			outputs: 0,
			body: bodys.state_toggle(false),
			update: functions.state
		},
		'event-obs-studio-save-replay': {
			type: 'obs-studio',
			title: 'Save Replay',
			tooltip: 'OBS Studio - Save Replay',
			icon: 'replay',
			inputs: 0,
			outputs: 1
		},
		'trigger-obs-studio-save-replay': {
			type: 'obs-studio',
			title: 'Save Replay',
			tooltip: 'OBS Studio - Save Replay',
			icon: 'replay',
			inputs: 1,
			outputs: 0,
		},
		'event-obs-studio-streaming': {
			type: 'obs-studio',
			title: 'Streaming',
			tooltip: 'OBS Studio - Streaming',
			icon: 'streaming',
			inputs: 0,
			outputs: 1,
			body: bodys.state(),
			update: functions.state
		},
		'trigger-obs-studio-streaming': {
			type: 'obs-studio',
			title: 'Streaming',
			tooltip: 'OBS Studio - Streaming',
			icon: 'streaming',
			inputs: 1,
			outputs: 0,
			body: bodys.state_toggle(false),
			update: functions.state
		},
		/*'event-obs-studio-studio-mode': {
			type: 'obs-studio',
			title: 'Studio Mode',
			tooltip: 'OBS Studio - Studio Mode',
			icon: 'studio',
			inputs: 0,
			outputs: 1,
			body: bodys.state(false, false, 'On', 'Off'),
			update: functions.state
		},
		'trigger-obs-studio-studio-mode': {
			type: 'obs-studio',
			title: 'Studio Mode',
			tooltip: 'OBS Studio - Studio Mode',
			icon: 'studio',
			inputs: 1,
			outputs: 0,
			body: bodys.state_toggle(false, false, 'On', 'Off', 'Toggle'),
			update: functions.state
		},*/
		'event-obs-studio-switch-scene': {
			type: 'obs-studio',
			title: 'Switch Scene',
			tooltip: 'OBS Studio - Switch Scene',
			icon: 'switch-scene',
			inputs: 0,
			outputs: 1,
			body: bodys.select('Scene name', 'scene'),
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
			update: functions.scene_source
		},
		'trigger-obs-studio-switch-scene': {
			type: 'obs-studio',
			title: 'Switch Scene',
			tooltip: 'OBS Studio - Switch Scene',
			icon: 'switch-scene',
			inputs: 1,
			outputs: 0,
			body: bodys.select('Scene name', 'scene'),
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
			update: functions.scene_source
		},
		'event-obs-studio-source-selected': {
			type: 'obs-studio',
			title: 'Source Selected',
			tooltip: 'OBS Studio - Source Selected',
			icon: 'selected',
			inputs: 0,
			outputs: 1,
			body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source'),
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
			update: functions.scene_source
		},
		'event-obs-studio-lock-source': {
			type: 'obs-studio',
			title: 'Lock Source',
			tooltip: 'OBS Studio - Lock Source',
			icon: 'locked',
			inputs: 0,
			outputs: 1,
			body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source') + bodys.state(false, false, 'On', 'Off'),
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.scene_source(id, elem, data, set_data, receive, receive_data);
				if (!receive)
					functions.state(id, elem, data, set_data, receive, receive_data);
			}
		},
		'trigger-obs-studio-lock-source': {
			type: 'obs-studio',
			title: 'Lock Source',
			tooltip: 'OBS Studio - Lock Source',
			icon: 'locked',
			inputs: 1,
			outputs: 0,
			body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source') + bodys.state_toggle(false, false, 'On', 'Off', 'Toggle'),
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.scene_source(id, elem, data, set_data, receive, receive_data);
				if (!receive)
					functions.state(id, elem, data, set_data, receive, receive_data);
			}
		},
		'event-obs-studio-toggle-source': {
			type: 'obs-studio',
			title: 'Toggle Source',
			tooltip: 'OBS Studio - Toggle Source',
			icon: 'toggle-source',
			inputs: 0,
			outputs: 1,
			body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source') + bodys.state(false, false, 'Show', 'Hide'),
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.scene_source(id, elem, data, set_data, receive, receive_data);
				if (!receive)
					functions.state(id, elem, data, set_data, receive, receive_data);
			}
		},
		'trigger-obs-studio-toggle-source': {
			type: 'obs-studio',
			title: 'Toggle Source',
			tooltip: 'OBS Studio - Toggle Source',
			icon: 'toggle-source',
			inputs: 1,
			outputs: 0,
			body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source') + bodys.state_toggle(false, false, 'Show', 'Hide'),
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.scene_source(id, elem, data, set_data, receive, receive_data);
				if (!receive)
					functions.state(id, elem, data, set_data, receive, receive_data);
			}
		},
		'event-obs-studio-toggle-filter': {
			type: 'obs-studio',
			title: 'Toggle Filter',
			tooltip: 'OBS Studio - Toggle Filter',
			icon: 'toggle-source',
			inputs: 0,
			outputs: 1,
			body: bodys.select('Source name', 'source') + bodys.select('Filter name', 'filter') + bodys.state(false, false, 'Show', 'Hide'),
			register: [['obs-studio', 'GetSources'], ['obs-studio', 'SceneListChanged']],
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.source_filter(id, elem, data, set_data, receive, receive_data);
				if (!receive)
					functions.state(id, elem, data, set_data, receive, receive_data);
			}
		},
		'trigger-obs-studio-toggle-filter': {
			type: 'obs-studio',
			title: 'Toggle Filter',
			tooltip: 'OBS Studio - Toggle Filter',
			icon: 'toggle-source',
			inputs: 1,
			outputs: 0,
			body: bodys.select('Source name', 'source') + bodys.select('Filter name', 'filter') + bodys.state_toggle(false, false, 'Show', 'Hide'),
			register: [['obs-studio', 'GetSources'], ['obs-studio', 'SceneListChanged']],
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.source_filter(id, elem, data, set_data, receive, receive_data);
				if (!receive)
					functions.state(id, elem, data, set_data, receive, receive_data);
			}
		},
		'event-obs-studio-virtualcam': {
			type: 'obs-studio',
			title: 'Virtual Camera',
			tooltip: 'OBS Studio - Virtual Camera',
			icon: 'virtual-camera',
			inputs: 0,
			outputs: 1,
			body: bodys.state(),
			update: functions.state
		},
		'trigger-obs-studio-virtualcam': {
			type: 'obs-studio',
			title: 'Virtual Camera',
			tooltip: 'OBS Studio - Virtual Camera',
			icon: 'virtual-camera',
			inputs: 1,
			outputs: 0,
			body: bodys.state_toggle(false),
			update: functions.state
		},
		'trigger-spotify-play-pause': {
			type: 'spotify',
			title: 'Play/Pause',
			tooltip: 'Spotify - Play/Pause',
			icon: 'play',
			inputs: 1,
			outputs: 0,
			body: bodys.text('Track') + bodys.state_toggle(false, false, 'Play', 'Pause', 'Toggle'),
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.trim(id, elem, data, set_data, receive, receive_data);
				functions.state(id, elem, data, set_data, receive, receive_data);
			}
		},
		'trigger-spotify-prev-next': {
			type: 'spotify',
			title: 'Prev/Next',
			tooltip: 'Spotify - Prev/Next',
			icon: 'next',
			inputs: 1,
			outputs: 0,
			body: bodys.state(false, false, 'Previous', 'Next'),
			update: functions.state
		},
		'trigger-spotify-shuffle': {
			type: 'spotify',
			title: 'Shuffle',
			tooltip: 'Spotify - Shuffle',
			icon: 'shuffle',
			inputs: 1,
			outputs: 0,
			body: bodys.state_toggle(false, false, 'On', 'Off', 'Toggle'),
			update: functions.state
		},
		'trigger-spotify-volume': {
			type: 'spotify',
			title: 'Volume',
			tooltip: 'Spotify - Volume',
			icon: 'shuffle',
			inputs: 1,
			outputs: 0,
			body: bodys.number('Volume', false, 100, 1, 0, 100)
		},
		'event-twitch-action': {
			type: 'twitch',
			title: 'Action',
			tooltip: 'Twitch - Action',
			icon: 'action',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Message') + bodys.match + bodys.viewers,
			update: functions.trim
		},
		'trigger-twitch-action': {
			type: 'twitch',
			title: 'Action',
			tooltip: 'Twitch - Action',
			icon: 'action',
			inputs: 1,
			outputs: 0,
			body: bodys.text('Message'),
			update: functions.trim
		},
		'event-twitch-announcement': {
			type: 'twitch',
			title: 'Announcement',
			tooltip: 'Twitch - Announcement',
			icon: 'announce',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Message') + bodys.match + bodys.viewers,
			update: functions.trim
		},
		'trigger-twitch-announce': {
			type: 'twitch',
			title: 'Announce',
			tooltip: 'Twitch - Announce',
			icon: 'announce',
			inputs: 1,
			outputs: 0,
			body: bodys.text('Message'),
			update: functions.trim
		},
		'event-twitch-any-message': {
			type: 'twitch',
			title: 'Any Message',
			tooltip: 'Twitch - Any Message',
			icon: 'message',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Message') + bodys.match + bodys.viewers,
			update: functions.trim
		},
		'event-twitch-first-message': {
			type: 'twitch',
			title: 'First Message',
			tooltip: 'Twitch - First Message',
			icon: 'first',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Message') + bodys.select('For all viewers', 'all', ['false', 'true']) + bodys.match + bodys.viewers,
			update: functions.trim
		},
		'event-twitch-ban': {
			type: 'twitch',
			title: 'Ban',
			tooltip: 'Twitch - Ban',
			icon: 'ban',
			inputs: 0,
			outputs: 1
		},
		'trigger-twitch-ban': {
			type: 'twitch',
			title: 'Ban',
			tooltip: 'Twitch - Ban',
			icon: 'ban',
			inputs: 1,
			outputs: 0,
			body: bodys.text('User') + bodys.text('Reason'),
			update: functions.trim
		},
		'event-twitch-chat-clear': {
			type: 'twitch',
			title: 'Chat Clear',
			tooltip: 'Twitch - Chat Clear',
			icon: 'chat-clear',
			inputs: 0,
			outputs: 1
		},
		'trigger-twitch-chat-clear': {
			type: 'twitch',
			title: 'Chat Clear',
			tooltip: 'Twitch - Chat Clear',
			icon: 'chat-clear',
			inputs: 1,
			outputs: 0
		},
		'event-twitch-command': {
			type: 'twitch',
			title: 'Command',
			tooltip: 'Twitch - Command',
			icon: 'command',
			inputs: 0,
			outputs: 1,
			body: '<p>Command</p><div class="is-command"><input name="command" type="text" class="has-text-centered" /></div>' + bodys.viewers,
			update: functions.trim
		},
		'event-twitch-community-pay-forward': {
			type: 'twitch',
			title: 'Community Pay Forward',
			tooltip: 'Twitch - Community Pay Forward',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-community-sub': {
			type: 'twitch',
			title: 'Community Sub',
			tooltip: 'Twitch - Community Sub',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-community-sub': {
			type: 'twitch',
			title: 'Community Sub',
			tooltip: 'Twitch - Community Sub',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-emote-only': {
			type: 'twitch',
			title: 'Emote Only',
			tooltip: 'Twitch - Emote Only',
			icon: 'emotes',
			inputs: 0,
			outputs: 1,
			body: bodys.state_toggle(false, false, 'On', 'Off', 'Both'),
			update: functions.state
		},
		'trigger-twitch-emote-only': {
			type: 'twitch',
			title: 'Emote Only',
			tooltip: 'Twitch - Emote Only',
			icon: 'emotes',
			inputs: 1,
			outputs: 0,
			body: bodys.state(),
			update: functions.state
		},
		'event-twitch-followers-only': {
			type: 'twitch',
			title: 'Followers Only',
			tooltip: 'Twitch - Followers Only',
			icon: 'followers',
			inputs: 0,
			outputs: 1,
			body: bodys.state_toggle(false, false, 'On', 'Off', 'Both'),
			update: functions.state
		},
		'trigger-twitch-followers-only': {
			type: 'twitch',
			title: 'Followers Only',
			tooltip: 'Twitch - Followers Only',
			icon: 'followers',
			inputs: 1,
			outputs: 0,
			body: bodys.state(),
			update: functions.state
		},
		'event-twitch-gift-paid-upgrade': {
			type: 'twitch',
			title: 'Gift Paid Upgrade',
			tooltip: 'Twitch - Gift Paid Upgrade',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-host': {
			type: 'twitch',
			title: 'Host',
			tooltip: 'Twitch - Host',
			icon: 'host',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Channel'),
			update: functions.trim
		},
		'event-twitch-hosted': {
			type: 'twitch',
			title: 'Hosted',
			tooltip: 'Twitch - Hosted',
			icon: 'host',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Channel'),
			update: functions.trim
		},
		'trigger-twitch-host': {
			type: 'twitch',
			title: 'Host',
			tooltip: 'Twitch - Host',
			icon: 'host',
			inputs: 1,
			outputs: 0,
			body: bodys.text('Channel'),
			update: functions.trim
		},
		'trigger-twitch-info': {
			type: 'twitch',
			title: 'Info',
			tooltip: 'Twitch - Info',
			icon: 'info',
			inputs: 1,
			outputs: 0,
			body: bodys.text('Status') + bodys.text('Game'),
			update: functions.trim
		},
		'event-twitch-message': {
			type: 'twitch',
			title: 'Message',
			tooltip: 'Twitch - Message',
			icon: 'message',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Message') + bodys.match + bodys.viewers,
			update: functions.trim
		},
		'trigger-twitch-message': {
			type: 'twitch',
			title: 'Message',
			tooltip: 'Twitch - Message',
			icon: 'message',
			inputs: 1,
			outputs: 0,
			body: bodys.text('Message'),
			update: functions.trim
		},
		'event-twitch-message-remove': {
			type: 'twitch',
			title: 'Message Remove',
			tooltip: 'Twitch - Message Remove',
			icon: 'message-remove',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Message') + bodys.match + bodys.viewers,
			update: functions.trim
		},
		'event-twitch-prime-community-gift': {
			type: 'twitch',
			title: 'Prime Community Gift',
			tooltip: 'Twitch - Prime Community Gift',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-prime-paid-upgrade': {
			type: 'twitch',
			title: 'Prime Paid Upgrade',
			tooltip: 'Twitch - Prime Paid Upgrade',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-raid': {
			type: 'twitch',
			title: 'Raid',
			tooltip: 'Twitch - Raid',
			icon: 'raid',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Channel'),
			update: functions.trim
		},
		'trigger-twitch-raid': {
			type: 'twitch',
			title: 'Raid',
			tooltip: 'Twitch - Raid',
			icon: 'raid',
			inputs: 1,
			outputs: 0,
			body: bodys.text('Channel'),
			update: functions.trim
		},
		'event-twitch-raid-cancel': {
			type: 'twitch',
			title: 'Raid Cancel',
			tooltip: 'Twitch - Raid Cancel',
			icon: 'raid-cancel',
			inputs: 0,
			outputs: 1
		},
		'trigger-twitch-raid-cancel': {
			type: 'twitch',
			title: 'Raid Cancel',
			tooltip: 'Twitch - Raid Cancel',
			icon: 'raid-cancel',
			inputs: 1,
			outputs: 0
		},
		'event-twitch-redemption': {
			type: 'twitch',
			title: 'Redemption',
			tooltip: 'Twitch - Redemption',
			icon: 'redemption',
			inputs: 0,
			outputs: 1,
			body: bodys.select('Reward'),
			register: [['twitch', 'getAllRewards']],
			update: (id, elem, data, set_data, receive, receive_data) => {
				const select = elem.querySelector('select');
				if (!select.children.length)
				{
					if (receive || global_datas.rewards)
					{
						if (Array.isArray(receive_data) && receive_data.length)
							global_datas.rewards = receive_data;

						const selected = (select.value || data.reward);

						select.innerHTML = '';
						select.appendChild(document.createElement('option'));

						for (const reward of global_datas.rewards)
						{
							const option = document.createElement('option');
							option.value = reward.id;
							option.innerText = reward.title;
							select.appendChild(option);
						}

						select.value = selected;
					}
					else if (!receive)
						request(id, 'twitch', 'getAllRewards', { type: 'Methods:convert', args: [ false, false ] });
				}
			}
		},
		'event-twitch-reward-gift': {
			type: 'twitch',
			title: 'Reward Gift',
			tooltip: 'Twitch - Reward Gift',
			icon: 'reward-gift',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-ritual': {
			type: 'twitch',
			title: 'Ritual',
			tooltip: 'Twitch - Ritual',
			icon: 'ritual',
			inputs: 0,
			outputs: 1,
			body: bodys.text('User') + bodys.number('Duration') + bodys.text('Reason'),
			update: functions.trim
		},
		'event-twitch-slow': {
			type: 'twitch',
			title: 'Slow',
			tooltip: 'Twitch - Slow',
			icon: 'slow',
			inputs: 0,
			outputs: 1
		},
		'trigger-twitch-slow': {
			type: 'twitch',
			title: 'Slow',
			tooltip: 'Twitch - Slow',
			icon: 'slow',
			inputs: 1,
			outputs: 0,
			body: bodys.state(),
			update: functions.state
		},
		'event-twitch-standard-pay-forward': {
			type: 'twitch',
			title: 'Standard Pay Forward',
			tooltip: 'Twitch - Standard Pay Forward',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-sub': {
			type: 'twitch',
			title: 'Subscribe',
			tooltip: 'Twitch - Subscribe',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-resub': {
			type: 'twitch',
			title: 'Subscribe Again',
			tooltip: 'Twitch - Subscribe Again',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-sub-extend': {
			type: 'twitch',
			title: 'Subscribe Extend',
			tooltip: 'Twitch - Subscribe Extend',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-sub-gift': {
			type: 'twitch',
			title: 'Subscribe Gift',
			tooltip: 'Twitch - Subscribe Gift',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1
		},
		'event-twitch-subs-only': {
			type: 'twitch',
			title: 'Subscribers Only',
			tooltip: 'Twitch - Subscribers Only',
			icon: 'subscribers',
			inputs: 0,
			outputs: 1,
			body: bodys.state_toggle(false, false, 'On', 'Off', 'Both'),
			update: functions.state
		},
		'trigger-twitch-subs-only': {
			type: 'twitch',
			title: 'Subscribers Only',
			tooltip: 'Twitch - Subscribers Only',
			icon: 'subscribers',
			inputs: 1,
			outputs: 0,
			body: bodys.state(),
			update: functions.state
		},
		'event-twitch-timeout': {
			type: 'twitch',
			title: 'Timeout',
			tooltip: 'Twitch - Timeout',
			icon: 'timeout',
			inputs: 0,
			outputs: 1
		},
		'trigger-twitch-timeout': {
			type: 'twitch',
			title: 'Timeout',
			tooltip: 'Twitch - Timeout',
			icon: 'timeout',
			inputs: 1,
			outputs: 0,
			body: bodys.text('User') + bodys.number('Duration', false, 300, 10) + bodys.text('Reason'),
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.trim(id, elem, data, set_data, receive, receive_data);
				functions.number(id, elem, data, set_data, receive, receive_data, 'duration', 1);
			}
		},
		'event-twitch-unhost': {
			type: 'twitch',
			title: 'Unhost',
			tooltip: 'Twitch - Unhost',
			icon: 'unhost',
			inputs: 0,
			outputs: 1
		},
		'trigger-twitch-unhost': {
			type: 'twitch',
			title: 'Unhost',
			tooltip: 'Twitch - Unhost',
			icon: 'unhost',
			inputs: 1,
			outputs: 0
		},
		'event-twitch-unique-message': {
			type: 'twitch',
			title: 'Unique Message',
			tooltip: 'Twitch - Unique Message',
			icon: 'message',
			inputs: 0,
			outputs: 1,
			body: bodys.state(),
			update: functions.state
		},
		'trigger-twitch-unique-message': {
			type: 'twitch',
			title: 'Unique Message',
			tooltip: 'Twitch - Unique Message',
			icon: 'message',
			inputs: 1,
			outputs: 0,
			body: bodys.state(),
			update: functions.state
		},
		'event-twitch-whisper': {
			type: 'twitch',
			title: 'Whisper',
			tooltip: 'Twitch - Whisper',
			icon: 'whisper',
			inputs: 0,
			outputs: 1,
			body: bodys.text('Message') + bodys.match,
			update: functions.trim
		},
		'trigger-twitch-whisper': {
			type: 'twitch',
			title: 'Whisper',
			tooltip: 'Twitch - Whisper',
			icon: 'whisper',
			inputs: 1,
			outputs: 0,
			body: bodys.text('User') + bodys.text('Message'),
			update: functions.trim
		},
	};

	window.drawflow_initializer = actions => {
		if (typeof actions[editor.module] === 'object')
		{
			const nodes = actions[editor.module].data;
			for (const id in nodes)
				init_node(nodes[id]);
		}
	}

	window.drawflow_receiver = (source, id, name, data) => {
		try
		{
			let node;
			for (const i in editor.drawflow.drawflow[editor.module].data)
			{
				const	node	= editor.getNodeFromId(i);

				if (node.data.id === source && typeof blocks[node.data.type] !== 'undefined')
				{
					const	block	= blocks[node.data.type];

					if (Array.isArray(block.register))
					{
						let check = false;
						for (const item of block.register)
							check = (check || (item[0] == id && item[1] == name));

						if (check)
						{
							const node_elem = drawflow.querySelector(`#node-${node.data.id}`);
							if (block.update)
								block.update(node.data.id, node_elem, node.data.data, _data => set_data(node.data.id, _data), true, data);
						}
					}
				}
			}
		}
		catch (e) {}
	};

	for (const name in blocks)
	{
		const block_data = blocks[name];
		const block_icon = `./icons/${block_data.icon}.png`;

		const block = document.querySelector('#template .block-drawflow').cloneNode(true);
		const button = document.querySelector('#template .drag-drawflow').cloneNode(true);

		const title = block.querySelector('.title-box span');
		const icon = block.querySelector('.title-box img');
		const body = block.querySelector('.box');

		block.classList.toggle('is-inputs', block_data.inputs);
		block.classList.toggle('is-outputs', block_data.outputs);

		icon.setAttribute('src', block_icon);
		icon.addEventListener('error', () => {
			const block_icon = `./icons/empty.png`;
			icon.setAttribute('src', block_icon);
			button.querySelector('.icon img').setAttribute('src', block_icon);
		}, false);

		title.innerHTML = block_data.title;
		if (block_data.tooltip)
			title.parentElement.setAttribute('title', block_data.tooltip);

		if (!block_data.body)
		{
			block.classList.add('no-box');
			body.remove();
		}
		else
			body.innerHTML = block_data.body;

		editor.registerNode(name, block);

		let type = name.split('-')[0];
		if (['event', 'trigger'].indexOf(type) < 0)
			type = 'fonctionnality';

		button.setAttribute('data-node', name);
		button.setAttribute('title', block_data.title);

		button.classList.toggle('is-inputs', block_data.inputs);
		button.classList.toggle('is-outputs', block_data.outputs);

		button.querySelector('.icon img').setAttribute('src', block_icon);
		button.querySelector('.name').innerText = block_data.title;

		document.querySelector(`[blocks-type="${block_data.type || ''}"]`).appendChild(button);
	}

	drawflow.addEventListener('drop', drop, false);
	drawflow.addEventListener('dragover', event => event.preventDefault(), false);

	show_blocks.addEventListener('click', () => {
		document.body.classList.toggle('show-blocks');
	}, false);

	document.addEventListener('dragstart', drag_event, false);
	document.addEventListener('touchend', drag_event, false);
	document.addEventListener('touchmove', drag_event, false);
	document.addEventListener('touchstart', drag_event, false);

	document.addEventListener('mousedown', event => {
		if (event.target.closest('[id^="node-"] input'))
			event.stopPropagation();
	}, true);

	let double_click = 0;
	let node_selected = -1;
	const reset_selection = () => {
		node_selected = -1;
	};

	editor.on('moduleChanged', reset_selection);
	editor.on('nodeUnselected', reset_selection);
	editor.on('nodeRemoved', reset_selection);
	editor.on('nodeSelected', id => {
		node_selected = id;
	});
	editor.on('contextmenu', event => {
		const	dbclick		= (double_click && (Date.now() - double_click) <= 250);
				duplicate	= (dbclick && node_selected >= 0);

		double_click = Date.now();
		if (duplicate)
		{
			const	node	= editor.drawflow.drawflow[editor.module].data[node_selected],
					type	= node.html,
					block	= blocks[type],
					pos_x	= ((typeof event.touches !== 'undefined') ? event.touches[0].clientX : event.clientX),
					pos_y	= ((typeof event.touches !== 'undefined') ? event.touches[0].clientY : event.clientY),
					elem	= document.querySelector(`#node-${node_selected}`);

			add_node(type, pos_x, pos_y, Object.assign({}, node.data.data));
		}
		else if (dbclick)
		{
			const	elem	= event.target.closest('[id^="node-"]'),
					id		= parseInt(elem.getAttribute('id').substr(5)),
					node	= editor.drawflow.drawflow[editor.module].data[id];

			if (!isNaN(id) && event.target.classList.contains('output'))
			{
				for (const output of Object.keys(node.outputs))
				{
					if (event.target.classList.contains(output))
					{
						const connections = node.outputs[output].connections;
						for (let i = (connections.length - 1); i >= 0; --i)
						{
							const connection = connections[i];
							editor.removeSingleConnection(id, parseInt(connection.node), output, connection.output);
						}

						break;
					}
				}
			}
			else if (!isNaN(id) && event.target.classList.contains('input'))
			{
				for (const input of Object.keys(node.inputs))
				{
					if (event.target.classList.contains(input))
					{
						const connections = node.inputs[input].connections;
						for (let i = (connections.length - 1); i >= 0; --i)
						{
							const connection = connections[i];
							editor.removeSingleConnection(parseInt(connection.node), id, connection.input, input);
						}

						break;
					}
				}
			}
		}
	});
});
