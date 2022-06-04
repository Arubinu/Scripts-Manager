const	{ ipcRenderer } = require('electron');

let		_edit = false,
		_move = false,
		_widgets = {};

function get_widget(id)
{
	return document.querySelector(`#widget_${id}`);
}

function get_widget_id(widget)
{
	const attr = widget.getAttribute('id');
	if (attr)
	{
		const split = attr.split('widget_');
		if (split.length == 2 && !split[0].length && split[1].length)
			return split[1];
	}

	return false;
}

function update_widget(id, x, y)
{
	if (typeof(_widgets[id]) === 'undefined')
		return ;

	const data = _widgets[id];
	const widget = data.element;
	const position = {
		x: ((typeof(x) !== 'undefined') ? x : data.x),
		y: ((typeof(y) !== 'undefined') ? y : data.y)
	};

	const positions = {
		x: {
			center: `(100% - ${data.width}px) / 2 + ${position.x}`,
			right: `100% - ${data.width}px + ${position.x}`
		},
		y: {
			middle: `(100% - ${data.height}px) / 2 + ${position.y}`,
			bottom: `100% - ${data.height}px + ${position.y}`
		}
	};

	widget.setAttribute('scrolling', 'no');
	widget.setAttribute('src', data.url);

	widget.style.top = `calc(${positions.y[data.anchor[0]] || position.y}px)`;
	widget.style.left = `calc(${positions.x[data.anchor[1]] || position.x}px)`;
	widget.style.width = `${data.width}px`;
	widget.style.height = `${data.height}px`;
}

function mousedown(event)
{
	if (_edit)
	{
		const widget = document.elementFromPoint(event.x, event.y);
		if (widget)
		{
			const id = get_widget_id(widget);
			if (typeof(_widgets[id]) !== 'undefined')
			{
				_move = {
					id: id,
					widget: _widgets[id],
					move: { x: 0, y: 0 },
					start: { x: event.x, y: event.y },
				};
			}
		}
	}
}

function mousemove(event)
{
	if (_edit && _move)
	{
		_move.move = { x: event.x, y: event.y };
		update_widget(_move.id, (_move.widget.x + (_move.move.x - _move.start.x)), (_move.widget.y + (_move.move.y - _move.start.y)));
	}
}

function mouseup(event)
{
	if (_edit && _move)
	{
		_move.widget.x += (_move.move.x - _move.start.x);
		_move.widget.y += (_move.move.y - _move.start.y);

		ipcRenderer.invoke('move', { id: _move.id, x: _move.widget.x, y: _move.widget.y });
		update_widget(_move.id);
		_move = false;
	}
}

ipcRenderer.on('flash', (event, data) => {
	document.body.classList.remove('flash');
	setTimeout(() => { document.body.classList.add(data || 'flash'); }, 20);
});

ipcRenderer.on('add', (event, data) => {
	const widget = (get_widget(data.id) || document.createElement('iframe'));
	data.widget.element = widget;
	_widgets[data.id] = data.widget;

	/*if (!widget.getAttribute('id'))
	{
		widget.addEventListener('load', () => {
			widget.contentWindow.document.addEventListener('mousedown', mousedown);
			widget.contentWindow.document.addEventListener('mousemove', mousemove);
			widget.contentWindow.document.addEventListener('mouseup', mouseup);

			widget.contentWindow.document.addEventListener('dragstart', event => {
				event.preventDefault();
				return false;
			});

			widget.contentWindow.document.addEventListener('drop', event => {
				event.preventDefault();
				return false;
			});
		});
	}*/

	widget.setAttribute('id', `widget_${data.id}`);
	update_widget(data.id);

	document.body.appendChild(widget);
});

ipcRenderer.on('remove', (event, data) => {
	if (typeof(_widgets[id]) !== 'undefined')
	{
		_widgets[id].element.remove();
		delete _widgets[id];
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

document.addEventListener('mousedown', mousedown);
document.addEventListener('mousemove', mousemove);
document.addEventListener('mouseup', mouseup);

window.addEventListener('resize', event => {
	for (const id in _widgets)
		update_widget(id);
}, true);
