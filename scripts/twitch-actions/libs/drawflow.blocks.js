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

			if (typeof(node.data.data[elem_name]) !== 'undefined')
				elem.value = node.data.data[elem_name];
			else
				node.data.data[elem_name] = elem.value;

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
			body: '<p>Message</p><input name="message" type="text" class="has-text-centered" />',
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
		'event-obs-studio-switch-scene': {
			type: 'obs-studio',
			title: 'Switch Scene',
			tooltip: 'OBS Studio - Switch Scene',
			icon: ['circle-arrow-down', 'repeat'],
			inputs: 0,
			outputs: 1,
			body: '<p>Scene name</p><select name="scene" class="has-text-centered"></select>',
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
			body: '<p>Message</p><input name="message" type="text" class="has-text-centered" />',
			data: {},
			register: [['twitch', 'Chat']],
			update: functions.trim
		},
		'trigger-obs-studio-switch-scene': {
			type: 'obs-studio',
			title: 'Switch Scene',
			tooltip: 'OBS Studio - Switch Scene',
			icon: ['circle-arrow-up', 'repeat'],
			inputs: 1,
			outputs: 0,
			body: '<p>Scene name</p><select name="scene" class="has-text-centered"></select>',
			data: {},
			register: [['obs-studio', 'GetScenes'], ['obs-studio', 'ScenesChanged']],
			update: functions.switch_scenes
		},
	};

	window.drawflow_initializer = (actions) => {
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
