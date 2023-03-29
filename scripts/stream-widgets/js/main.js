document.addEventListener('DOMContentLoaded', () => {
  const anchors = document.querySelectorAll('.anchor > div');
  const widgets = document.querySelector('.widgets');

  let _config = {};

  function get_widget(obj) {
    const selected = widgets.querySelector('.is-selected');
    const eye = (selected ? selected.querySelector('.fa-eye, .fa-eye-slash') : false);
    const hide = (eye ? eye.classList.contains('fa-eye-slash') : false);

    for (const attr of ['x', 'y', 'width', 'height', 'name', 'url']) {
      let value = document.querySelector(`input[name="${attr}"]`).value;
      if (['x', 'y', 'width', 'height'].indexOf(attr) >= 0) {
        value = parseInt(value);
      }

      obj[attr] = value;
    }

    obj.hide = hide;
    obj.anchor = document.querySelector('.anchor > .is-selected').getAttribute('title').toLowerCase().split('-');

    return obj;
  }

  function load_widget(event) {
    [...widgets.children].forEach(widget => {
      widget.classList.remove('is-selected');
    });

    const elem = ((event instanceof HTMLElement) ? event : event.target.closest('[value]'));
    const id = elem.getAttribute('value');
    elem.classList.add('is-selected');

    let widget = JSON.parse(_config.widgets[id]);
    for (const attr of ['x', 'y', 'width', 'height', 'name', 'url']) {
      document.querySelector(`input[name="${attr}"]`).value = widget[attr];
    }

    const anchor = widget.anchor[0][0].toUpperCase() + widget.anchor[0].substring(1) + '-' + widget.anchor[1][0].toUpperCase() + widget.anchor[1].substring(1);
    document.querySelector(`.anchor > [title="${anchor}"]`).click();
  }

  function update_widget(id) {
    const widget = JSON.parse(_config.widgets[id]);

    let elem = document.querySelector(`.widgets [value="${id}"]`);
    if (!elem) {
      let init = true;

      elem = document.createElement('div');
      elem.addEventListener('click', load_widget, false);
      elem.setAttribute('value', id);

      const content = document.createElement('span');
      elem.appendChild(content);

      const eye = document.createElement('i');
      eye.classList.add('fas', 'fa-eye', 'is-pulled-right', 'mt-1', 'ml-2');
      eye.setAttribute('title', 'Show/Hide');
      elem.appendChild(eye);

      eye.addEventListener('click', event => {
        event.stopPropagation();
        if (!init) {
          elem.click();
        }

        const hide = (init ? (typeof widget.hide !== 'undefined' && widget.hide) : eye.classList.contains('fa-eye'));
        eye.classList.toggle('fa-eye', !hide);
        eye.classList.toggle('fa-eye-slash', hide);

        if (!init) {
          document.querySelector('.update-widget').click();
        }
        init = false;
      }, true);
      eye.click();

      const refresh = document.createElement('i');
      refresh.classList.add('fas', 'fa-arrows-rotate', 'is-pulled-right', 'mt-1', 'ml-2');
      refresh.setAttribute('title', 'Refresh');
      elem.appendChild(refresh);

      refresh.addEventListener('click', event => {
        event.stopPropagation();
        window.parent.postMessage({ refresh: { id, widget: JSON.stringify(get_widget(widget)) } }, '*');
      }, true);

      widgets.appendChild(elem);
    } else {
      const eye = elem.querySelector('.fa-eye, .fa-eye-slash');
      if (typeof widget.hide !== 'undefined' && widget.hide !== eye.classList.contains('fa-eye-slash')) {
        eye.click();
      }
    }

    elem.querySelector('span').innerText = widget.name;
  }

  function update_buttons() {
    const buttons = document.querySelectorAll('.screen .buttons .button');
    for (let i = 0; i < buttons.length; ++i) {
      buttons[i].classList.toggle('is-selected', (i === _config.settings.screen));
    }
  }

  for (const anchor of anchors) {
    anchor.addEventListener('click', event => {
      anchors.forEach(anchor => {
        anchor.classList.remove('is-selected');
      });

      anchor.classList.add('is-selected');
    });
  }

  document.querySelector('.create-widget').addEventListener('click', () => {
    const widget = get_widget({});
    if (widget.name.trim().length && widget.url.trim().length) {
      window.parent.postMessage({ create: { widget: JSON.stringify(get_widget({})) } }, '*');
    }
  }, false);

  document.querySelector('.update-widget').addEventListener('click', () => {
    const widget = get_widget({});
    if (widget.name.trim().length && widget.url.trim().length) {
      const selected = document.querySelector('.widgets .is-selected');
      if (selected) {
        const id = selected.getAttribute('value');
        const widget = get_widget(JSON.parse(_config.widgets[id]));

        selected.querySelector('span').innerText = widget.name;
        const eye = selected.querySelector('.fa-eye, .fa-eye-slash');
        eye.classList.toggle('fa-eye', !widget.hide);
        eye.classList.toggle('fa-eye-slash', widget.hide);

        _config.widgets[id] = JSON.stringify(widget);
        window.parent.postMessage({ update: { id, widget: _config.widgets[id] } }, '*');
      }
    }
  }, false);

  document.querySelector('.delete-widget').addEventListener('click', () => {
    const selected = document.querySelector('.widgets .is-selected');
    if (selected) {
      const id = selected.getAttribute('value');
      window.parent.postMessage({ delete: { id } }, '*');
      selected.remove();
    }
  }, false);

  window.addEventListener('message', _event => {
    const { to, event, name, method, property, data } = _event.data;
    if (event.origin !== 'null' && to === 'interface') {
      if (property === 'config') {
        _config = data;
        update_buttons();

        for (const widget_index in _config.widgets) {
          update_widget(widget_index);
        }
      } else if (property === 'add') {
        const data = data;
        _config.widgets[data.id] = data.widget;
        update_widget(data.id);

        let elem = document.querySelector(`.widgets [value="${data.id}"]`);
        if (elem) {
          load_widget(elem);
        }
      } else if (property === 'screens') {
        const buttons = document.querySelector('.screen .buttons');
        buttons.innerHTML = '';

        for (let i = 0; i < data; ++i) {
          const button = document.createElement('button');
          button.innerText = (i + 1).toString();

          button.classList.add('button');
          if (i === _config.settings.screen) {
            button.classList.add('is-selected');
          }

          button.addEventListener('click', event => {
            _config.settings.screen = Array.prototype.indexOf.call(buttons.children, button);
            update_buttons();

            event.target.blur();
            window.parent.postMessage({ screen: _config.settings.screen }, '*');
          });

          buttons.appendChild(button);
        }
      }
    }
  }, false);
}, false);