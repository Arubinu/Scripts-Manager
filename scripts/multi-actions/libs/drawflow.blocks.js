document.addEventListener('DOMContentLoaded', () => {
	const	editor			= window.editor,
			drawflow		= document.querySelector('.box-drawflow'),
			show_blocks		= document.querySelector('.show-blocks'),
			options			= document.querySelector('#template .drawflow-options').cloneNode(true),
			options_test	= options.querySelector('.test-action'),
			options_export	= options.querySelector('.export-action'),
			options_toggle	= options.querySelector('.toggle-action'),
			button_import	= document.querySelector('.container .hero-body input');

	let		global_datas = {},
			radios_index = {},
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

	function next_index(name)
	{
		if (typeof radios_index[name] === 'undefined')
			radios_index[name] = 0;

		return radios_index[name]++;
	}

	function get_node(elem)
	{
		if (['string', 'number'].indexOf(typeof elem) >= 0)
			elem = document.querySelector(`#node-${elem}`);
		else
			elem = elem.closest('[id^="node-"]');

		if (!elem)
			return false;

		return Object.assign(
			{ elem },
			editor.drawflow.drawflow[editor.module].data[parseInt(elem.getAttribute('id').substr(5))]
		);
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

				if (is_input && input_type === 'radio')
				{
					for (const elem of node_elem.querySelectorAll(`input[name="${data_name}"]`))
					{
						if (elem.value === node.data.data[data_name])
							elem.checked = true;
						else
							elem.removeAttribute('checked');
					}
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
		return id;
	}

	function move_node(id, pos_x, pos_y)
	{
		editor.drawflow.drawflow[editor.module].data[id].pos_x = pos_x;
		editor.drawflow.drawflow[editor.module].data[id].pos_y = pos_y;

		const node = get_node(id);
		node.elem.style.top = `${node.pos_y}px`;
		node.elem.style.left = `${node.pos_x}px`;

		editor.updateConnectionNodes(`node-${id}`);
		window.drawflow_save();
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

			const	is_input	= elem.nodeName.toLowerCase() === 'input',
					input_type	= is_input && elem.getAttribute('type').toLowerCase(),
					data_exists	= typeof node.data.data[elem_name] !== 'undefined';

			if (is_input && input_type === 'checkbox')
			{
				if (data_exists)
				{
					if (node.data.data[elem_name])
						elem.checked = true;
					else
						elem.removeAttribute('checked');
				}
				else
					node.data.data[elem_name] = elem.checked;
			}
			else if (is_input && input_type === 'radio')
			{
				for (const radio_elem of node_elem.querySelectorAll(`input[name="${elem_name}"]`))
				{
					if (data_exists)
					{
						if (radio_elem.value == node.data.data[elem_name])
						{
							radio_elem.checked = true;
							set_value(radio_elem, radio_elem.parentElement.innerText.trim());
						}
						else
							radio_elem.removeAttribute('checked');
					}

					if (radio_elem.checked)
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
				node.data.data[elem_name] = ((is_input && input_type === 'checkbox') ? elem.checked : elem.value);

				set_data(id, node.data.data);
				if (block.update)
				{
					for (const update of (Array.isArray(block.update) ? block.update : [block.update]))
						update(node.data.id, node_elem, node.data.data, _data => set_data(id, _data));
				}

				set_value(elem, elem.value);
			};

			elem.addEventListener('change', update, false);
		});

		node_elem.querySelectorAll('p > .fa-eye, p > .fa-eye-slash').forEach(elem => {
			const	parent	= elem.parentElement,
					toggle	= show => {
						if (typeof show !== 'boolean')
							show = elem.classList.contains('fa-eye-slash');

						elem.classList.remove(show ? 'fa-eye-slash' : 'fa-eye');
						elem.classList.add(show ? 'fa-eye' : 'fa-eye-slash');

						let next = parent;
						while (next.nextElementSibling && next.nextElementSibling.nodeName.toLocaleLowerCase() !== 'p')
						{
							next = next.nextElementSibling;
							if (!next.classList.contains('no-eye'))
							{
								if (show)
									next.style.removeProperty('display');
								else
									next.style.display = 'none';
							}
						}

						editor.updateConnectionNodes(`node-${id}`);
					};

			if (elem.classList.contains('fa-eye-slash'))
				toggle(false);

			elem.addEventListener('click', toggle);
		});

		if (block.init)
			block.init(node.data.id, node_elem, node.data.data, _data => set_data(id, _data), first);

		set_data(id, node.data.data);
		if (block.update)
		{
			for (const update of (Array.isArray(block.update) ? block.update : [block.update]))
				update(node.data.id, node_elem, node.data.data, _data => set_data(id, _data));
		}
	}

	function set_value(elem, value)
	{
		if (elem.classList.contains('no-eye'))
			return;

		let level = parseInt(elem.getAttribute('level'));
		for (; level > 0; --level)
			elem = elem.parentElement;

		while (elem.previousElementSibling && elem.previousElementSibling.nodeName.toLocaleLowerCase() !== 'p')
			elem = elem.previousElementSibling;

		if (elem && elem.previousElementSibling)
		{
			const value_elem = elem.previousElementSibling.querySelector('.value');
			if (value_elem)
				value_elem.innerText = value ? `: ${value}` : '';
		}
	}

	const bodys = {
		text: (title, name) => {
			if (!name)
				name = title.toLowerCase().replace(/\s/g, '-');

			return `<p>${title}</p><input name="${name}" type="text" class="has-text-centered" />`;
		},
		number: (title, name, value, step, min, max, eye) => {
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

			if (eye)
				eye = '<span class="value"></span><i class="fas fa-eye-slash"></i>';

			return `<p>${title}${eye || ''}</p><input name="${name}" type="number"${attrs} class="has-text-centered no-eye" level="0" />`;
		},
		number_unit: (title, name, value, step, min, max, units) => {
			if (!name)
				name = title.toLowerCase().replace(/\s/g, '-');

			let units_html = '';
			for (const unit of units)
				units_html += `<label class="radio"><input name="number_unit" type="radio" value="${unit.toLowerCase()}" level="1" ${!units_html ? 'checked' : ''}/><span>${unit}</span></label>`;

			return bodys.number(title, name, value, step, min, max, true) + `<hr />${units_html}`;
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
		type: '<p>Type of value<span class="value"></span><i class="fas fa-eye-slash"></i></p><hr /><label class="radio"><input name="type" type="radio" value="string" level="1" checked /><span>String</span></label><label class="radio"><input name="type" type="radio" value="number" level="1" /><span>Number</span></label><label class="radio"><input name="type" type="radio" value="boolean" level="1" /><span>Boolean</span></label>',
		match: '<label class="checkbox" title="The uppercase/lowercase will be taken into account" style="padding-left: 0em; width: 85%;"><input name="case" type="checkbox" level="1" /><span>Case sensitive</span></label><label class="checkbox" title="The message received contains the sentence (must be exact if unchecked)" style="padding-left: 0em; width: 85%;"><input name="contains" type="checkbox" level="1" /><span>Contains sentence</span></label>',
		viewers: '<p>Type of viewer<i class="fas fa-eye-slash"></i></p><hr /><label class="checkbox"><input name="viewer" type="checkbox" level="1" /><span>Viewer</span></label><label class="checkbox"><input name="follower" type="checkbox" level="1" /><span>Follower</span></label><label class="checkbox"><input name="subscriber" type="checkbox" level="1" /><span>Subscriber</span></label><label class="checkbox"><input name="founder" type="checkbox" level="1" /><span>Founder</span></label><label class="checkbox"><input name="vip" type="checkbox" level="1" /><span>VIP</span></label><label class="checkbox"><input name="moderator" type="checkbox" level="1" /><span>Moderator</span></label><label class="checkbox"><input name="broadcaster" type="checkbox" level="1" /><span>Broadcaster</span></label>',
		state: (title, name, on, off) => {
			title = (title || 'State');
			if (!name)
				name = title.toLowerCase().replace(/\s/g, '-');

			return `<p>${title}<span class="value"></span><i class="fas fa-eye-slash"></i></p><div><input name="${name}" type="checkbox" class="is-hidden" level="1" checked /><div class="field has-addons is-justify-content-center"><p class="control"><button class="button button-on" name="${name}" level="3"><span>${on || 'Start'}</span></button></p><p class="control"><button class="button button-off" name="${name}" level="3"><span>${off || 'Stop'}</span></button></p></div></div>`;
		},
		state_toggle: (title, name, on, off, toggle) => {
			title = (title || 'State');
			if (!name)
				name = title.toLowerCase().replace(/\s/g, '-');

			return `<p>${title}<span class="value"></span><i class="fas fa-eye-slash"></i></p><div class="field has-addons is-justify-content-center"><p class="control"><input name="${name}" type="radio" value="on" class="is-hidden" level="2" checked /><button class="button button-on" name="${name}" level="2"><span>${on || 'Start'}</span></button></p><p class="control"><input name="${name}" type="radio" value="toggle" class="is-hidden" level="2" /><button class="button button-toggle" name="${name}" level="2"><span>${toggle || 'Toggle'}</span></button></p><p class="control"><input name="${name}" type="radio" value="off" class="is-hidden" level="2" /><button class="button button-off" name="${name}" level="2"><span>${off || 'Stop'}</span></button></p></div>`;
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
			const data_elem = elem.querySelector(`input[type="number"][name="${arg}"]`);
			if (data_elem && typeof min === 'number' && data[arg] < min)
			{
				data[arg] = min;
				set_data(data);
			}
			else if (data_elem && typeof max === 'number' && data[arg] > max)
			{
				data[arg] = max;
				set_data(data);
			}
		},
		number_unit: (id, elem, data, set_data, receive, receive_data, arg, min, max) => {
			functions.number(id, elem, data, set_data, receive, receive_data, arg, min, max);

			if (!receive)
			{
				const index = elem.getAttribute('radio-number_unit');
				for (const radio of elem.querySelectorAll(`input[name="number_unit[${index}]"]`))
				{
					radio.addEventListener('click', event => {
						data.number_unit = radio.value;
						set_data(data);
					}, false);
				}
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
			if (receive)
				return;

			const	name_selector	= `[name="${arg}"]`,
					selectors		= { name: name_selector, input: `input${name_selector}`, active: `${name_selector}.is-active` },
					inputs			= elem.querySelectorAll(`input${selectors.name}`),
					input_type		= inputs[0].getAttribute('type').toLowerCase(),
					on				= elem.querySelector(`input${selectors.name}[value="on"]`),
					toggle			= elem.querySelector(`input${selectors.name}[value="toggle"]`),
					off				= elem.querySelector(`input${selectors.name}[value="off"]`),
					button_on		= elem.querySelector(`${selectors.name}.button-on`),
					button_toggle	= elem.querySelector(`${selectors.name}.button-toggle`),
					button_off		= elem.querySelector(`${selectors.name}.button-off`),
					change_state	= (state, save, state_string) => {
						button_on.classList.toggle('is-active', (toggle ? (state === 'on') : state));
						button_off.classList.toggle('is-active', (toggle ? (state === 'off') : !state));
						if (button_toggle)
							button_toggle.classList.toggle('is-active', (state === 'toggle'));

						if (save)
						{
							data[arg] = state;
							set_data(data);
						}

						if (typeof state_string !== 'string')
						{
							state_string = state;
							if (typeof state_string !== 'string')
							{
								const active = inputs[0].parentElement.querySelector(selectors.active);
								if (active)
									state_string = active.innerText.trim();
								else
									state_string = state ? 'on' : 'off';
							}
						}

						set_value(inputs[0], state_string);

						if (callback)
							callback(state);
					};

			if (inputs.length && ((input_type == 'checkbox' && button_on && button_off) || (input_type == 'radio' && on && off)))
			{
				if (!elem.querySelector(selectors.active))
				{
					button_on.addEventListener('click', () => change_state((toggle ? 'on' : true), true, button_on.innerText), false);
					button_off.addEventListener('click', () => change_state((toggle ? 'off' : false), true, button_off.innerText), false);
					if (button_toggle)
						button_toggle.addEventListener('click', () => change_state('toggle', true, button_toggle.innerText), false);
				}

				if (toggle)
				{
					let name = 'On';
					let value = 'on';
					const radio_elems = elem.querySelectorAll(selectors.input);
					for (const radio_elem of radio_elems)
					{
						if (radio_elem.checked)
						{
							name = radio_elem.parentElement.innerText.trim();
							value = radio_elem.value;
						}
					}

					change_state(value, undefined, name);
				}
				else
					change_state(inputs[0].checked);
					//change_state(elem.querySelector(`input[name="${arg}"]:checked`).value);
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
			body: bodys.text('Variable name', 'variable') + bodys.number_unit('Time', 'seconds', 10, 1, 1, undefined, ['Milliseconds', 'Seconds', 'Minutes']),
			data: {},
			register: [],
			init: (id, elem, data, set_data, first) => {
				if (!data.variable)
				{
					data.variable = Date.now().toString();
					set_data(data);
				}

				const index = next_index('number_unit');
				elem.setAttribute('radio-number_unit', index);
				for (const radio of elem.querySelectorAll('input[name="number_unit"]'))
					radio.setAttribute('name', `number_unit[${index}]`)
			},
			update: (id, elem, data, set_data, receive, receive_data) => {
				functions.trim(id, elem, data, set_data, receive, receive_data);
				functions.number_unit(id, elem, data, set_data, receive, receive_data, 'seconds', 1);
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
			body: '<p>Application</p><div class="is-browse launch-app"><input name="program" type="text" class="has-text-centered" readonly /><button><i class="fas fa-ellipsis"></i></button></div>',
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
			body: bodys.number_unit('Time', 'millis', 1000, 100, 1, undefined, ['Milliseconds', 'Seconds', 'Minutes']),
			init: (id, elem, data, set_data, first) => {
				const index = next_index('number_unit');
				elem.setAttribute('radio-number_unit', index);
				for (const radio of elem.querySelectorAll('input[name="number_unit"]'))
					radio.setAttribute('name', `number_unit[${index}]`)
			},
			update: (id, elem, data, set_data, receive, receive_data) => functions.number_unit(id, elem, data, set_data, receive, receive_data, 'millis', 1)
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
						if (name !== 'variable')
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
			body: '<div class="columns"><div class="column"><p>Title</p><input name="title" type="text" class="has-text-centered" /></div><div class="column"><p>URL<i class="fas fa-circle-info is-pulled-right"></i></p><input name="url" type="url" class="has-text-centered" /></div></div><div class="columns"><div class="column"><p>Thumbnail</p><div class="is-browse discord-thumbnail"><input name="thumbnail" type="text" class="has-text-centered" readonly /><button><i class="fas fa-ellipsis"></i></button></div></div><div class="column"><p>Big Image</p><div class="is-browse discord-big-image"><input name="big-image" type="text" class="has-text-centered" readonly /><button><i class="fas fa-ellipsis"></i></button></div></div></div><p>Webhook<i class="fas fa-eye-slash"></i></p><input name="webhook" type="url" class="has-text-centered" /><p>Message<i class="fas fa-eye-slash"></i></p><input name="message" type="text" class="has-text-centered" /><p>Inline 1<i class="fas fa-eye-slash"></i></p><div class="columns clear"><div class="column"><input name="inline-1-title" type="text" class="has-text-centered" placeholder="Title" /></div><div class="column"><input name="inline-1-content" type="text" class="has-text-centered" placeholder="Content" /></div></div><p>Inline 2<i class="fas fa-eye-slash"></i></p><div class="columns clear"><div class="column"><input name="inline-2-title" type="text" class="has-text-centered" placeholder="Title" /></div><div class="column"><input name="inline-2-content" type="text" class="has-text-centered" placeholder="Content" /></div></div>',
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
			update: [ functions.scene_source, functions.state ]
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
			update: [ functions.scene_source, functions.state ]
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
			update: [ functions.scene_source, functions.state ]
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
			update: [ functions.scene_source, functions.state ]
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
			update: [ functions.source_filter, functions.state ]
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
			update: [ functions.source_filter, functions.state ]
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
			update: [ functions.trim, functions.state ]
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
		'trigger-spotify-repeat': {
			type: 'spotify',
			title: 'Repeat',
			tooltip: 'Spotify - Repeat',
			icon: 'repeat',
			inputs: 1,
			outputs: 0,
			body: bodys.state_toggle(false, false, 'Off', 'Context', 'Track'),
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
			icon: 'volume',
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
		const	block_data	= blocks[name],
				block_icon	= `./icons/${block_data.icon}.png`,
				block		= document.querySelector('#template .block-drawflow').cloneNode(true),
				button		= document.querySelector('#template .drag-drawflow').cloneNode(true),
				title		= block.querySelector('.title-box span'),
				icon		= block.querySelector('.title-box img'),
				body		= block.querySelector('.box');

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

	let options_target = false;
	document.querySelector('.container').appendChild(options);
	document.addEventListener('mousedown', event => {
		if (options_target && !event.target.closest('.drawflow-options'))
			options.style.display = 'none';

		if (event.target.closest('.block-drawflow .title-box .fa-caret-down'))
		{
			event.stopPropagation();

			const node = get_node(event.target);
			options_toggle.querySelector('.far, .fas').classList.add((typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled) ? 'fas' : 'far');
			options_toggle.querySelector('.far, .fas').classList.remove((typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled) ? 'far' : 'fas');
			if (!Object.keys(node.inputs).length)
				options_export.style.removeProperty('display');
			else
				options_export.style.display = 'none';

			options.style.top = `${event.clientY}px`;
			options.style.left = `${event.clientX}px`;
			options.style.display = 'block';

			options_target = node;
		}
		else if (event.target.closest('[id^="node-"] input'))
			event.stopPropagation();
	}, true);
	options_toggle.addEventListener('click', event => {
		const node = options_target;
		node.data.data.enabled = (typeof node.data.data.enabled !== 'boolean') ? false : !node.data.data.enabled;
		set_data(node.id, node.data.data);

		options.style.display = 'none';
	}, false);
	options_test.addEventListener('click', event => {
		const node = options_target;
		if (typeof node.outputs.output_1 !== 'undefined')
		{
			for (const connection of node.outputs.output_1.connections)
				window.parent.postMessage({test: [editor.module, parseInt(connection.node)]}, '*');
		}
		else if (typeof node.inputs.input_1 !== 'undefined')
			window.parent.postMessage({test: [editor.module, node.id]}, '*');

		options.style.display = 'none';
	}, false);
	options_export.addEventListener('click', event => {
		options.style.display = 'none';
	}, false);
	options_export.querySelector('input').addEventListener('change', event => {
		window.parent.postMessage({export: [event.target.value, JSON.stringify(export_node(options_target.id))]}, '*');
	}, false);
	button_import.addEventListener('change', event => {
		window.parent.postMessage({import: event.target.value}, '*');
	}, false);

	function export_node(id, nodes)
	{
		const	reindex	= !nodes;

		nodes = nodes || {};
		if (typeof nodes[id] === 'undefined')
		{
			let copy = {};

			const node = get_node(id);
			for (const key in node)
			{
				if (key === 'elem')
					continue;

				if (typeof node[key] === 'object')
				{
					copy[key] = JSON.parse(JSON.stringify(node[key]));

					if (key === 'outputs')
					{
						for (const skey of Object.keys(copy[key]))
						{
							const connections = copy[key][skey].connections;
							for (let c = (connections.length - 1); c >= 0; --c)
								export_node(parseInt(connections[c].node), nodes);
						}
					}
				}
				else
					copy[key] = node[key];
			}

			nodes[id] = copy;
		}

		if (reindex)
		{
			let keys = Object.keys(nodes);
			keys.sort((a, b) => parseInt(a) - parseInt(b));

			let sort_nodes = {};
			for (let i = 0; i < keys.length; ++i)
			{
				const	id	= i + 1,
						key	= parseInt(keys[i]);

				nodes[key].id = id;
				nodes[key].name = `${id}.${nodes[key].html}`;
				nodes[key].data.id = id;
				for (const ckey of ['inputs', 'outputs'])
				{
					for (const cskey of Object.keys(nodes[key][ckey]))
					{
						const connections = nodes[key][ckey][cskey].connections;
						for (let c = (connections.length - 1); c >= 0; --c)
							connections[c].node = (keys.indexOf(connections[c].node) + 1).toString();
					}
				}

				sort_nodes[id] = nodes[key];
			}

			nodes = sort_nodes;
		}

		return nodes;
	}

	function import_node(nodes)
	{
		let relations = {};
		for (const node of Object.values(nodes))
		{
			const id = add_node(node.html, node.pos_x, node.pos_y, Object.assign({}, node.data.data));
			relations[node.id] = id;
		}

		for (const node of Object.values(nodes))
		{
			for (const output of Object.keys(node.outputs))
			{
				const connections = node.outputs[output].connections;
				for (let c = (connections.length - 1); c >= 0; --c)
				{
					const connection = connections[c];
					editor.addConnection(relations[node.id], relations[parseInt(connection.node)], output, connection.output);
				}
			}
		}
	}
	window.import_node = import_node;

	let double_click = 0;
	let node_selected = -1;
	const reset_selection = () => {
		node_selected = -1;
	};

	editor.on('moduleChanged', reset_selection);
	editor.on('nodeUnselected', reset_selection);
	editor.on('nodeRemoved', reset_selection);
	editor.on('nodeSelected', id => {
		node_selected = parseInt(id);
	});
	editor.on('contextmenu', event => {
		const	dbclick		= (double_click && (Date.now() - double_click) <= 250);
				duplicate	= (dbclick && node_selected >= 0);

		double_click = Date.now();
		if (duplicate)
		{
			const	node	= get_node(node_selected),
					type	= node.html,
					pos_x	= ((typeof event.touches !== 'undefined') ? event.touches[0].clientX : event.clientX),
					pos_y	= ((typeof event.touches !== 'undefined') ? event.touches[0].clientY : event.clientY);

			add_node(type, pos_x, pos_y, Object.assign({}, node.data.data));
		}
		else if (dbclick)
		{
			const node = get_node(event.target);
			if (node && event.target.classList.contains('output'))
			{
				for (const output of Object.keys(node.outputs))
				{
					if (event.target.classList.contains(output))
					{
						const connections = node.outputs[output].connections;
						for (let c = (connections.length - 1); c >= 0; --c)
						{
							const connection = connections[c];
							editor.removeSingleConnection(node.id, parseInt(connection.node), output, connection.output);
						}

						break;
					}
				}
			}
			else if (node && event.target.classList.contains('input'))
			{
				for (const input of Object.keys(node.inputs))
				{
					if (event.target.classList.contains(input))
					{
						const connections = node.inputs[input].connections;
						for (let c = (connections.length - 1); c >= 0; --c)
						{
							const connection = connections[c];
							editor.removeSingleConnection(parseInt(connection.node), node.id, connection.input, input);
						}

						break;
					}
				}
			}
		}
	});

	let multi_move = false;
	let multi_selection = {};
	document.addEventListener('mousedown', event => {
		const node = get_node(event.target);
		if (!node || event.button || (typeof multi_selection[node.id] === 'undefined' && !event.shiftKey))
		{
			for (const node of Object.values(multi_selection))
			{
				if (node.id !== node_selected)
					node.elem.classList.remove('selected');
			}

			multi_selection = {};
		}
		else
		{
			if (typeof multi_selection[node.id] === 'undefined')
			{
				if (!multi_selection.length && node_selected >= 0)
				{
					const node = get_node(node_selected);
					multi_selection[node_selected] = node;
				}
				multi_selection[node.id] = node;
			}

			if (!node)
				console.log('prout');
			multi_move = node;
		}
	}, true);
	document.addEventListener('mousemove', event => {
		if (multi_move)
		{
			const origin = get_node(multi_move.id);
			const move = { pos_x: (multi_move.pos_x - origin.pos_x), pos_y: (multi_move.pos_y - origin.pos_y) };
			for (const node of Object.values(multi_selection))
			{
				if (node.id !== node_selected)
					move_node(node.id, (node.pos_x - move.pos_x), (node.pos_y - move.pos_y));
			}
		}
	}, true);
	document.addEventListener('mouseup', event => {
		for (const node of Object.values(multi_selection))
		{
			if (node.id !== node_selected)
				editor.updateConnectionNodes(`node-${node.id}`);
		}

		multi_move = false;
	});
	editor.on('nodeSelected', id => {
		for (const node of Object.values(multi_selection))
			node.elem.classList.add('selected');
	});
});
