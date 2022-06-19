const	{ ipcRenderer } = require('electron');

let		_edit = false,
		_move = false,
		_resize = false,
		_target = false,
		_widgets = {};

function get_widget(id)
{
	return document.querySelector(`[wid="${id}"]`);
}

function get_widget_id(widget)
{
	return widget.getAttribute('wid');
}

function update_widget(id, x, y, width, height)
{
	if (typeof(_widgets[id]) === 'undefined')
		return;

	const data = _widgets[id];
	const iframe = data.iframe;
	const widget = data.element;
	const rect = {
		x: ((typeof(x) !== 'undefined') ? x : data.x),
		y: ((typeof(y) !== 'undefined') ? y : data.y),
		width: ((typeof(width) !== 'undefined') ? width : data.width),
		height: ((typeof(height) !== 'undefined') ? height : data.height)
	};

	const positions = {
		x: {
			center: `(100% - ${rect.width}px) / 2 + ${rect.x}`,
			right: `100% - ${rect.width}px + ${rect.x}`
		},
		y: {
			middle: `(100% - ${rect.height}px) / 2 + ${rect.y}`,
			bottom: `100% - ${rect.height}px + ${rect.y}`
		}
	};

	widget.querySelector('.name').innerText = data.name;
	if (data.url != iframe.getAttribute('src'))
		iframe.setAttribute('src', data.url);

	widget.classList.toggle('is-hide', data.hide);

	widget.style.top = `calc(${(typeof(positions.y[data.anchor[0]]) === 'undefined') ? rect.y : positions.y[data.anchor[0]]}px)`;
	widget.style.left = `calc(${(typeof(positions.x[data.anchor[1]]) === 'undefined') ? rect.x : positions.x[data.anchor[1]]}px)`;
	widget.style.width = `${rect.width}px`;
	widget.style.height = `${rect.height}px`;
}

function move_mousedown(event)
{
	if (_edit && event.button == 0)
	{
		const widget = event.target.closest('[wid]');
		if (widget)
		{
			const id = get_widget_id(widget);
			if (typeof(_widgets[id]) !== 'undefined')
			{
				_move = true;
				_target = {
					id: id,
					widget: _widgets[id],
					move: { x: 0, y: 0 },
					start: { x: event.x, y: event.y },
				};
			}
		}
	}
}

function resize_mousedown(event)
{
	if (_edit && event.button == 0)
	{
		const widget = event.target.closest('[wid]');
		if (widget)
		{
			const id = get_widget_id(widget);
			const mode = event.target.getAttribute('mode');
			if (mode && typeof(_widgets[id]) !== 'undefined')
			{
				_resize = true;
				_target = {
					id: id,
					widget: _widgets[id],
					mode: mode,
					move: { x: 0, y: 0 },
					start: { x: event.x, y: event.y },
				};
			}
		}
	}
}

function mousemove(event)
{
	event.preventDefault();

	if (_edit)
	{
		if (_move)
		{
			_target.move = { x: event.x, y: event.y };
			_target.widget.temp = { x: (_target.widget.x + (_target.move.x - _target.start.x)), y: (_target.widget.y + (_target.move.y - _target.start.y)) }
			update_widget(_target.id, _target.widget.temp.x, _target.widget.temp.y);
		}
		else if (_resize)
		{
			_target.move = { x: event.x, y: event.y };
			_target.widget.temp = {};
			if (_target.mode.indexOf('n') >= 0)
			{
				const diff = (_target.move.y - _target.start.y);
				_target.widget.temp.height = Math.max(0, (_target.widget.height - diff));
				if (_target.widget.anchor[0] == 'middle')
				{
					_target.widget.temp.y = (_target.widget.y + (diff / 2));
					_target.widget.temp.height = Math.max(0, (_target.widget.height - diff));
				}
				else if (_target.widget.anchor[0] == 'top')
					_target.widget.temp.y = (_target.widget.y + diff);
			}
			if (_target.mode.indexOf('e') >= 0)
			{
				const diff = (_target.move.x - _target.start.x);
				_target.widget.temp.width = Math.max(0, (_target.widget.width + diff));
				if (_target.widget.anchor[1] == 'center')
					_target.widget.temp.x = (_target.widget.x + (diff / 2));
				else if (_target.widget.anchor[1] == 'right')
					_target.widget.temp.x = (_target.widget.x + diff);
			}
			if (_target.mode.indexOf('s') >= 0)
			{
				const diff = (_target.move.y - _target.start.y);
				_target.widget.temp.height = Math.max(0, (_target.widget.height + diff));
				if (_target.widget.anchor[0] == 'middle')
					_target.widget.temp.y = (_target.widget.y + (diff / 2));
				else if (_target.widget.anchor[0] == 'bottom')
					_target.widget.temp.y = (_target.widget.y + diff);
			}
			if (_target.mode.indexOf('w') >= 0)
			{
				const diff = (_target.move.x - _target.start.x);
				_target.widget.temp.width = Math.max(0, (_target.widget.width - diff));
				if (_target.widget.anchor[1] == 'center')
				{
					_target.widget.temp.x = (_target.widget.x + (diff / 2));
					_target.widget.temp.width = Math.max(0, (_target.widget.width - diff));
				}
				else if (_target.widget.anchor[1] == 'left')
					_target.widget.temp.x = (_target.widget.x + diff);
			}

			if (_target.widget.temp)
				update_widget(_target.id, _target.widget.temp.x, _target.widget.temp.y, _target.widget.temp.width, _target.widget.temp.height );
		}
	}
}

function mouseup(event)
{
	if (_edit)
	{
		if ((_move || _resize) && _target.widget.temp)
			ipcRenderer.invoke('edit', { id: _target.id, x: _target.widget.temp.x, y: _target.widget.temp.y, width: _target.widget.temp.width, height: _target.widget.temp.height });
	}

	_move = false;
	_resize = false;
	if (_target)
	{
		if (typeof(_target.widget.temp) !== 'undefined')
		{
			if (typeof(_target.widget.temp.x) !== 'undefined')
				_target.widget.x = _target.widget.temp.x;
			if (typeof(_target.widget.temp.y) !== 'undefined')
				_target.widget.y = _target.widget.temp.y;
			if (typeof(_target.widget.temp.width) !== 'undefined')
				_target.widget.width = _target.widget.temp.width;
			if (typeof(_target.widget.temp.height) !== 'undefined')
				_target.widget.height = _target.widget.temp.height;

			delete _target.widget.temp;
		}

		update_widget(_target.id);
		_target = false;
	}
}

ipcRenderer.on('flash', (event, data) => {
	document.body.classList.remove('flash');
	setTimeout(() => { document.body.classList.add(data || 'flash'); }, 20);
});

ipcRenderer.on('enabled', (event, data) => {
	document.body.classList.toggle('show', data);
});

ipcRenderer.on('add', (event, data) => {
	let widget = get_widget(data.id);
	if (!widget)
	{
		widget = document.querySelector('#template > [wid]').cloneNode(true);

		widget.querySelector('.move').addEventListener('mousedown', move_mousedown);
		widget.querySelector('.resize').addEventListener('mousedown', resize_mousedown);
		widget.querySelector('.resize').addEventListener('mousemove', function(event) {
			if (!_resize)
			{
				const margin = 5;
				const rect = this.getBoundingClientRect();

				const top = Math.abs(event.y - rect.top);
				const right = Math.abs(event.x - rect.right);
				const bottom = Math.abs(event.y - rect.bottom);
				const left = Math.abs(event.x - rect.left);

				const n = (top < margin);
				const e = (right < margin);
				const s = (bottom < margin);
				const w = (left < margin);

				let mode = '';
				mode = ((!mode && (n && w)) ? 'nw' : mode );
				mode = ((!mode && (s && e)) ? 'se' : mode );
				mode = ((!mode && (n && e)) ? 'ne' : mode );
				mode = ((!mode && (s && w)) ? 'sw' : mode );
				mode = ((!mode && n) ? 'n' : mode );
				mode = ((!mode && e) ? 'e' : mode );
				mode = ((!mode && s) ? 's' : mode );
				mode = ((!mode && w) ? 'w' : mode );

				let cursor = '';
				cursor = ((!cursor && ((n && w) || (s && e))) ? 'nwse-resize' : cursor );
				cursor = ((!cursor && ((n && e) || (s && w))) ? 'nesw-resize' : cursor );
				cursor = ((!cursor && (n || s)) ? 'ns-resize' : cursor );
				cursor = ((!cursor && (e || w)) ? 'ew-resize' : cursor );

				this.setAttribute('mode', mode);
				this.style.cursor = cursor;
			}
		});

		data.widget.iframe = widget.querySelector('iframe');
		data.widget.element = widget;

		_widgets[data.id] = data.widget;
		widget.setAttribute('wid', data.id);
		document.body.appendChild(widget);
	}
	else
	{
		for (const attr in data.widget)
			_widgets[data.id][attr] = data.widget[attr];
	}

	update_widget(data.id);
});

ipcRenderer.on('remove', (event, data) => {
	if (typeof(_widgets[data.id]) !== 'undefined')
	{
		_widgets[data.id].element.remove();
		delete _widgets[data.id];
	}

	const widget = get_widget(data.id);
	if (widget)
		widget.remove();
});

ipcRenderer.on('edit', (event, data) => {
	_edit = data;
	document.body.classList.toggle('edit', _edit);
});

document.addEventListener('dragstart', event => {
	event.preventDefault();
	return false;
});

document.addEventListener('drop', event => {
	event.preventDefault();
	return false;
});

document.addEventListener('mousemove', mousemove);
document.addEventListener('mouseup', mouseup);

window.addEventListener('resize', event => {
	for (const id in _widgets)
		update_widget(id);
}, true);
