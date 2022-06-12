document.addEventListener('DOMContentLoaded', () => {
	const	editor = window.editor,
			drawflow = document.querySelector('.box-drawflow'),
			show_blocks = document.querySelector('.show-blocks');

	let		global_datas = {},
			mobile_item_selec = '',
			mobile_last_move = null;

	function request(id, name, data)
	{
		window.parent.postMessage({request: [id, name, (data || [])]}, '*');
	}

	function drag(event)
	{
		document.body.classList.remove('show-blocks');
		if (event.type === 'touchstart')
			mobile_item_selec = event.target.closest('.drag-drawflow').getAttribute('data-node');
		else
			event.dataTransfer.setData('node', event.target.getAttribute('data-node'));
	}

	function drop(event)
	{
		if (event.type === 'touchend')
		{
			var parentdrawflow = document.elementFromPoint( mobile_last_move.touches[0].clientX, mobile_last_move.touches[0].clientY).closest('.parent-drawflow');
			if (parentdrawflow != null)
				add_node(mobile_item_selec, mobile_last_move.touches[0].clientX, mobile_last_move.touches[0].clientY);

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
				elem.value = node.data.data[data_name];
		}
	};

	function add_node(type, pos_x, pos_y)
	{
		if (editor.editor_mode === 'fixed' || typeof(blocks[type]) === 'undefined')
			return false;

		pos_x = (pos_x * (editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom))) - (editor.precanvas.getBoundingClientRect().x * ( editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom)));
		pos_y = (pos_y * (editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom))) - (editor.precanvas.getBoundingClientRect().y * ( editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom)));

		const block = blocks[type];
		const id = editor.addNode(`${editor.nodeId}.${type}`, block.inputs, block.outputs, pos_x, pos_y, `block-${type}`, {}, type, true);

		let data = { id: id, type: type, data: block.data };
		editor.updateNodeDataFromId(id, data);
		set_data(id, block.data);

		init_node(editor.getNodeFromId(id));
	}

	function init_node(node)
	{
		const id = node.data.id;
		const block = blocks[node.data.type];
		const node_elem = drawflow.querySelector(`#node-${id}`);
		node_elem.querySelectorAll('input, select, textarea').forEach(elem => {
			const elem_name = elem.getAttribute('name');
			if (!elem_name)
				return ;

			const is_input = (elem.nodeName.toLowerCase() == 'input');
			const input_type = (is_input && elem.getAttribute('type').toLowerCase());
			const data_exists = (typeof(node.data.data[elem_name]) !== 'undefined');

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

			set_data(id, node.data.data);
			if (block.update)
				block.update(node.data.id, node_elem, node.data.data, _data => set_data(id, _data));

			const update = event => {
				node.data.data[elem_name] = elem.value;

				set_data(id, node.data.data);
				if (block.update)
					block.update(node.data.id, node_elem, node.data.data, _data => set_data(id, _data));
			};

			//elem.addEventListener('input', update, false);
			elem.addEventListener('change', update, false);
		});
	}

	const bodys = {
		trim: '<p>Message</p><input name="message" type="text" class="has-text-centered" />',
		switch_state: '<p>State</p><input name="state" type="checkbox" class="is-hidden" checked /><div class="field has-addons is-justify-content-center"><p class="control"><button class="button button-on"><span>Start</span></button></p><p class="control"><button class="button button-off"><span>Stop</span></button></p></div>',
		switch_scenes: '<p>Scene name</p><select name="scene" class="has-text-centered"></select>',
	};

	const functions = {
		trim: (id, elem, data, set_data, receive) => {
			let trim = false;
			for (const key in data)
			{
				const value = data[key];
				if (typeof(value) === 'string' && value != value.trim())
				{
					trim = true;
					data[key] = value.trim();
				}
			}

			if (trim)
				set_data(data);
		},
		switch_scenes: (id, elem, data, set_data, receive) => {
			const select = elem.querySelector('select');
			if (receive)
			{
				const selected = (select.value || data.scene);

				select.innerHTML = '';
				select.appendChild(document.createElement('option'));

				for (const scene of receive.scenes)
				{
					const option = document.createElement('option');
					option.value = scene.name;
					option.innerText = scene.name;
					select.appendChild(option);
				}

				select.value = selected;
			}
			else if (!select.children.length)
				request('obs-studio', 'GetScenes');
		},
		switch_state: (id, elem, data, set_data, receive) => {
			const input = elem.querySelector('input');
			const on = elem.querySelector('.button-on');
			const off = elem.querySelector('.button-off');

			const change_state = (state, save) => {
				on.classList.toggle('is-active', state);
				off.classList.toggle('is-active', !state);

				if (save)
				{
					data.state = state;
					set_data(data);
				}
			};

			if (!elem.querySelector('.is-active'))
			{
				on.addEventListener('click', () => change_state(true, true), false);
				off.addEventListener('click', () => change_state(false, true), false);
			}

			change_state(input.checked);
		}
	};

	const blocks = {
		'self-timer': {
			title: 'Self-Timer',
			icon: ['clock'],
			inputs: 1,
			outputs: 1,
			body: '<p>Time in milliseconds</p><input name="millis" type="number" step="100" value="1000" class="has-text-centered" />',
			data: {},
			update: (id, elem, data, set_data, receive) => {
				if (data.millis < 1)
				{
					data.millis = 1;
					set_data(data);
				}
			}
		},
		'event-twitch-chat': {
			type: 'twitch',
			title: 'Chat',
			tooltip: 'Twitch - Chat',
			icon: ['circle-arrow-down', 'message'],
			inputs: 0,
			outputs: 1,
			body: bodys.trim,
			data: {},
			register: [['twitch', 'Chat']],
			update: functions.trim
		},
		'event-twitch-command': {
			type: 'twitch',
			title: 'Command',
			tooltip: 'Twitch - Command',
			icon: ['circle-arrow-down', 'terminal'],
			inputs: 0,
			outputs: 1,
			body: '<p>Command</p><div class="twitch-command"><input name="command" type="text" class="has-text-centered" /></div>',
			data: {},
			register: [['twitch', 'Command']],
			update: functions.trim
		},
		'event-obs-studio-recording': {
			type: 'obs-studio',
			title: 'Recording',
			tooltip: 'OBS Studio - Recording',
			icon: ['circle-arrow-down', 'floppy-disk'],
			inputs: 0,
			outputs: 1,
			body: bodys.switch_state,
			data: {},
			register: [],
			update: functions.switch_state
		},
		'event-obs-studio-replay': {
			type: 'obs-studio',
			title: 'Replay',
			tooltip: 'OBS Studio - Replay',
			icon: ['circle-arrow-down', 'video'],
			inputs: 0,
			outputs: 1,
			body: bodys.switch_state,
			data: {},
			register: [],
			update: functions.switch_state
		},
		'event-obs-studio-streaming': {
			type: 'obs-studio',
			title: 'Streaming',
			tooltip: 'OBS Studio - Streaming',
			icon: ['circle-arrow-down', 'video'],
			inputs: 0,
			outputs: 1,
			body: bodys.switch_state,
			data: {},
			register: [],
			update: functions.switch_state
		},
		'event-obs-studio-switch-scene': {
			type: 'obs-studio',
			title: 'Switch Scene',
			tooltip: 'OBS Studio - Switch Scene',
			icon: ['circle-arrow-down', 'repeat'],
			inputs: 0,
			outputs: 1,
			body: bodys.switch_scenes,
			data: {},
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'ScenesChanged']],
			update: functions.switch_scenes
		},
		'trigger-twitch-chat': {
			type: 'twitch',
			title: 'Chat',
			tooltip: 'Twitch - Chat',
			icon: ['circle-arrow-up', 'message'],
			inputs: 1,
			outputs: 0,
			body: bodys.trim,
			data: {},
			register: [['twitch', 'Chat']],
			update: functions.trim
		},
		'trigger-obs-studio-toggle-source': {
			type: 'obs-studio',
			title: 'Toggle Source',
			tooltip: 'OBS Studio - Toggle Source',
			icon: ['circle-arrow-up', 'eye'],
			inputs: 1,
			outputs: 0,
			body: '<p>Scene name</p><select name="scene" class="has-text-centered"></select><p>Source name</p><select name="source" class="has-text-centered"></select><p>State</p><div class="field has-addons is-justify-content-center"><p class="control"><input name="state" type="radio" value="on" class="is-hidden" checked /><button class="button button-on"><span>Start</span></button></p><p class="control"><input name="state" type="radio" value="toggle" class="is-hidden" /><button class="button button-toggle"><span>Toggle</span></button></p><p class="control"><input name="state" type="radio" value="off" class="is-hidden" /><button class="button button-off"><span>Stop</span></button></p></div>',
			data: {},
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'ScenesChanged']],
			update: (id, elem, data, set_data, receive) => {
				//switch_state
				const input = elem.querySelector('input');
				const on = elem.querySelector('.button-on');
				const toggle = elem.querySelector('.button-toggle');
				const off = elem.querySelector('.button-off');

				const change_state = (state, save) => {
					on.classList.toggle('is-active', (toggle ? (state == 'on') : state));
					off.classList.toggle('is-active', (toggle ? (state == 'off') : !state));
					if (toggle)
						toggle.classList.toggle('is-active', (state == 'toggle'));

					if (save)
					{
						data.state = state;
						set_data(data);
					}
				};

				if (!elem.querySelector('.is-active'))
				{
					on.addEventListener('click', () => change_state((toggle ? 'on' : true), true), false);
					off.addEventListener('click', () => change_state((toggle ? 'off' : false), true), false);
					if (toggle)
						toggle.addEventListener('click', () => change_state('toggle', true), false);
				}

				if (toggle)
				{
					let value = 'on';
					const radio_elems = elem.querySelectorAll(`input[name="${input.getAttribute('name')}"]`);
					for (const radio_elem of radio_elems)
					{
						if (radio_elem.checked)
							value = radio_elem.value;
					}

					change_state(value);
				}
				else
					change_state(input.checked);

				// switch_scenes
				const selects = elem.querySelectorAll('select');
				if (!selects[0].children.length)
				{
					if (receive || global_datas.scenes)
					{
						if (receive)
							global_datas.scenes = receive.scenes;

						// source
						const scene_schanged = () => {
							const value = selects[0].value;
							if (value)
							{
								const selected = (selects[1].value || data.source);

								selects[1].innerHTML = '';
								selects[1].appendChild(document.createElement('option'));

								for (const scene of global_datas.scenes)
								{
									if (scene.name == value)
									{
										for (const source of scene.sources)
										{
											const option = document.createElement('option');
											option.value = source.name;
											option.innerText = source.name;
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
								selects[0].addEventListener('change', scene_schanged, false);
							}
						}

						// scene
						const selected = (selects[0].value || data.scene);

						selects[0].innerHTML = '';
						selects[0].appendChild(document.createElement('option'));

						for (const scene of global_datas.scenes)
						{
							const option = document.createElement('option');
							option.value = scene.name;
							option.innerText = scene.name;
							selects[0].appendChild(option);
						}

						selects[0].value = selected;
						scene_schanged();
					}
					else
						request('obs-studio', 'GetScenes');
				}
			}
		},
		'trigger-obs-studio-recording': {
			type: 'obs-studio',
			title: 'Recording',
			tooltip: 'OBS Studio - Recording',
			icon: ['circle-arrow-up', 'floppy-disk'],
			inputs: 1,
			outputs: 0,
			body: bodys.switch_state,
			data: {},
			register: [],
			update: functions.switch_state
		},
		'trigger-obs-studio-replay': {
			type: 'obs-studio',
			title: 'Replay',
			tooltip: 'OBS Studio - Replay',
			icon: ['circle-arrow-up', 'video'],
			inputs: 1,
			outputs: 0,
			body: bodys.switch_state,
			data: {},
			register: [],
			update: functions.switch_state
		},
		'trigger-obs-studio-streaming': {
			type: 'obs-studio',
			title: 'Streaming',
			tooltip: 'OBS Studio - Streaming',
			icon: ['circle-arrow-up', 'video'],
			inputs: 1,
			outputs: 0,
			body: bodys.switch_state,
			data: {},
			register: [],
			update: functions.switch_state
		},
		'trigger-obs-studio-switch-scene': {
			type: 'obs-studio',
			title: 'Switch Scene',
			tooltip: 'OBS Studio - Switch Scene',
			icon: ['circle-arrow-up', 'repeat'],
			inputs: 1,
			outputs: 0,
			body: bodys.switch_scenes,
			data: {},
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'ScenesChanged']],
			update: functions.switch_scenes
		},
	};

	window.drawflow_initializer = actions => {
		if (typeof(actions[editor.module]) === 'object')
		{
			const nodes = actions[editor.module].data;
			for (const id in nodes)
				init_node(nodes[id]);
		}
	}

	window.drawflow_receiver = (id, name, data) => {
		try
		{
			let i = 1;
			let node;
			do
			{
				node = editor.getNodeFromId(i++);
				const block = blocks[node.data.type];

				let check = false;
				for (const item of block.register)
					check = (check || (item[0] == id && item[1] == name));

				if (check)
				{
					const node_elem = drawflow.querySelector(`#node-${node.data.id}`);
					if (block.update)
						block.update(node.data.id, node_elem, node.data.data, _data => set_data(node.data.id, _data), data);
				}
			} while (node);
		}
		catch (e) {}
	};

	for (const name in blocks)
	{
		const block_data = blocks[name];
		const block = document.createElement('div');
		const title = document.createElement('div');
		const body = document.createElement('div');

		title.classList.add('title-box');
		title.innerHTML = block_data.title;
		if (block_data.tooltip)
			title.setAttribute('title', block_data.tooltip);
		if (block_data.icon)
		{
			for (const icon_name of block_data.icon.reverse())
			{
				const icon = document.createElement('i');
				icon.classList.add('fas', `fa-${icon_name}`);
				title.prepend(icon);
			}
		}

		body.classList.add('box');
		body.innerHTML = block_data.body;

		block.appendChild(title);
		block.appendChild(body);

		editor.registerNode(name, block);

		let type = name.split('-')[0];
		if (['event', 'trigger'].indexOf(type) < 0)
			type = 'fonctionnality';

		const button = title.cloneNode(true);
		button.removeAttribute('class');
		button.classList.add('button', 'm-1', 'drag-drawflow');
		button.setAttribute('draggable', 'true');
		button.setAttribute('data-node', name);
		document.querySelector(`.blocks-${type} [blocks-type="${block_data.type || ''}"]`).appendChild(button);
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
});
