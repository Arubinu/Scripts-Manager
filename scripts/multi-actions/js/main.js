document.addEventListener('DOMContentLoaded', () => {
  const drawflow = document.querySelector('.box-drawflow'),
    selector = document.querySelector('[select="module"]'),
    editor = new window.Drawflow(drawflow);

  let _config = false,
    view_locked = true,
    edit_target = false;

  window.editor = editor;
  window.loading = false;
  editor.draggable_inputs = false;

  if (typeof editor.toggleModule !== 'function') {
    editor.toggleModule = name => {
      const module_name = (typeof name === 'string' && name.length) ? name : editor.module,
        pos = _config.settings.disabled.indexOf(module_name);

      if (pos >= 0) {
        _config.settings.disabled.splice(pos, 1);
      } else {
        _config.settings.disabled.push(module_name);
      }

      window.parent.postMessage({ disabled: _config.settings.disabled }, '*');

      updateDisabled();
    };
  }

  if (typeof editor.renameModule !== 'function') {
    editor.renameModule = new_name => {
      if (typeof editor.drawflow.drawflow[new_name] === 'undefined') {
        const current = editor.module;
        editor.drawflow.drawflow[new_name] = editor.drawflow.drawflow[current];
        delete editor.drawflow.drawflow[current];

        const index = (_config.settings.sort || []).indexOf(current);
        if (index >= 0) {
          _config.settings.sort[index] = new_name;

          window.parent.postMessage({ sort: _config.settings.sort }, '*');
        }

        const pos = _config.settings.disabled.indexOf(current);
        if (pos >= 0) {
          _config.settings.disabled[pos] = new_name;
        }

        editor.changeModule(new_name);
        window.drawflow_save();
        window.drawflow_select(_config.settings.sort);
      }
    };
  }

  function updateDisabled() {
    if (_config) {
      for (const value of selector.getValues()) {
        selector.setEnabled(value, (_config.settings.disabled.indexOf(value) < 0));
      }

      const disabled = _config.settings.disabled.indexOf(editor.module) >= 0;
      selector.classList.toggle('disabled', disabled);
      document.querySelector('div.edit-module .module-enabled').classList.toggle('is-hidden', disabled);
      document.querySelector('div.edit-module .module-disabled').classList.toggle('is-hidden', !disabled);
    }
  }

  function cloneMouseEvent(event) {
    const copy = document.createEvent('MouseEvents');
    copy.initMouseEvent(event.type, event.bubbles, event.cancelable, event.view, event.detail,
      event.pageX || event.layerX, event.pageY || event.layerY, event.clientX, event.clientY, event.ctrlKey, event.altKey,
      event.shiftKey, event.metaKey, event.button, event.relatedTarget);

    return copy;
  }

  // Events!
  editor.on('nodeCreated', id => {
    window.drawflow_save();
  });

  editor.on('nodeRemoved', id => {
    window.drawflow_save();
  });

  editor.on('moduleCreated', name => {
    window.drawflow_save();
    window.drawflow_select();
  });

  editor.on('moduleChanged', name => {
    const init = () => {
      setTimeout(() => {
        if (!window.drawflow_initializer) {
          return init();
        }

        updateDisabled();
        window.drawflow_initializer(editor.drawflow.drawflow);
      }, 10);
    };

    init();
    if (!window.loading && typeof editor.drawflow.drawflow[name] !== 'undefined' && Object.keys(editor.drawflow.drawflow).length >= 2) {
      window.parent.postMessage({ module: name }, '*');
    }
  });

  editor.on('connectionCreated', connection => {
    window.drawflow_save();
  });

  editor.on('connectionRemoved', connection => {
    window.drawflow_save();
  });
  editor.on('nodeMoved', id => {
    window.drawflow_save();
  });

  editor.start();
  editor.removeModule('Home');

  selector.addEventListener('change', event => {
    editor.changeModule(selector.getValue());
  });

  document.querySelectorAll('[aria-label="close"]').forEach(elem => {
    elem.addEventListener('click', () => {
      const modal = elem.closest('.modal');
      if (modal) {
        modal.classList.remove('is-active');
      }
    }, false);
  });

  document.querySelector('i.add-module').addEventListener('click', event => {
    const elem = document.querySelector('div.add-module'),
      input = elem.querySelector('input');

    elem.classList.add('is-active');
    input.value = '';
    input.focus();
  });

  document.querySelector('div.add-module .modal-card-body input[type="text"]').addEventListener('keypress', event => {
    if (event.code === 'Enter') {
      document.querySelector('div.add-module .is-success').dispatchEvent(new Event('click', { bubbles: true }));
    }
  });

  document.querySelector('div.add-module .is-success').addEventListener('click', event => {
    const modal = event.target.closest('.modal');
    modal.classList.remove('is-active');

    const current = modal.querySelector('input').value.trim();
    editor.addModule(current);
    editor.changeModule(current);

    window.drawflow_save();
    window.drawflow_select();
  });

  document.querySelector('i.lock-view').addEventListener('click', event => {
    const elem = event.target;

    view_locked = !view_locked;
    elem.classList.toggle('fa-lock', view_locked);
    elem.classList.toggle('fa-lock-open', !view_locked);
  });

  document.querySelector('i.edit-module').addEventListener('click', event => {
    const elem = document.querySelector('div.edit-module'),
      input = elem.querySelector('input');

    updateDisabled();

    elem.classList.add('is-active');
    input.value = editor.module;
    input.focus();
    input.select();
  });

  document.querySelector('div.edit-module .modal-card-body input[type="text"]').addEventListener('keypress', event => {
    if (event.code === 'Enter') {
      document.querySelector('div.edit-module .is-success').dispatchEvent(new Event('click', { bubbles: true }));
    }
  });

  document.querySelector('div.edit-module .module-enabled').addEventListener('click', editor.toggleModule);
  document.querySelector('div.edit-module .module-disabled').addEventListener('click', editor.toggleModule);

  document.querySelector('div.edit-module .is-success').addEventListener('click', event => {
    const modal = event.target.closest('.modal');
    modal.classList.remove('is-active');

    editor.renameModule(modal.querySelector('input').value.trim());
  });

  document.querySelector('div.edit-module .delete-module').addEventListener('click', event => {
    const modal = event.target.closest('.modal'),
      modules = selector.getValues();

    modal.classList.remove('is-active');

    if (modules.length > 1) {
      const to_delete = editor.module;

      // editor.removeModule(to_delete); // not work
      if (typeof editor.drawflow.drawflow[to_delete] !== 'undefined') {
        delete editor.drawflow.drawflow[to_delete];
      }

      const pos = _config.settings.disabled.indexOf(to_delete);
      if (pos >= 0) {
        _config.settings.disabled.splice(pos, 1);
      }

      selector.removeItem(to_delete);

      window.drawflow_save();
      window.drawflow_select();
    }
  });

  document.addEventListener('dblclick', event => {
    const node = window.get_node(event.target),
      is_input = event.target.nodeName.toLowerCase() === 'input',
      is_textarea = event.target.nodeName.toLowerCase() === 'textarea';

    if (node && ((is_input && event.target.getAttribute('type') === 'text') || is_textarea)) {
      const elem = document.querySelector('div.edit-value'),
        textarea = elem.querySelector('textarea'),
        title = elem.querySelector('.modal-card-title'),
        name = elem.querySelector('.value-name');

      elem.classList.add('is-active');
      title.innerText = window.get_block(node.html).title;
      name.innerText = window.get_name(event.target);
      textarea.classList.toggle('has-text-centered', !is_textarea);
      textarea.value = event.target.value;
      textarea.focus();

      edit_target = event.target;
    }
  });

  document.querySelector('div.edit-value .is-success').addEventListener('click', event => {
    const node = window.get_node(event.target),
      elem = document.querySelector('div.edit-value'),
      modal = event.target.closest('.modal'),
      textarea = elem.querySelector('textarea');

    modal.classList.remove('is-active');
    edit_target.value = (edit_target.nodeName.toLowerCase() === 'input') ? textarea.value.replaceAll('\n', ' ') : textarea.value;
    edit_target.dispatchEvent(new Event('change', { bubbles: true }));
    edit_target = false;
  });

  const section_filter = event => {
    event.target.closest('.content').classList.toggle(`${event.target.getAttribute('section-filter')}-filter`);
  };
  for (const filter of document.querySelectorAll('[section-filter]')) {
    filter.addEventListener('click', section_filter);
  }

  document.addEventListener('mousedown', event => {
    if (!view_locked && event.target === editor.container) {
      editor.precanvas.dispatchEvent(cloneMouseEvent(event));
    } else if (view_locked && event.target === editor.precanvas) {
      event.stopPropagation();
    }
  }, true);
  document.addEventListener('mousemove', event => {
    if (!view_locked && event.target === editor.container) {
      editor.precanvas.dispatchEvent(cloneMouseEvent(event));
    }
  }, false);
  document.addEventListener('mouseup', event => {
    if (!view_locked && event.target === editor.container) {
      editor.precanvas.dispatchEvent(cloneMouseEvent(event));
    }
  }, false);

  window.message_event = event => {
    if (event.origin !== 'null') {
      if (event.data.name === 'config') {
        setTimeout(() => {
          _config = event.data.data;

          if (typeof _config.settings === 'undefined') {
            _config.settings = {};
          }
          if (!Array.isArray(_config.settings.disabled)) {
            _config.settings.disabled = [];
          }

          if (Object.keys(_config.actions).length) {
            window.loading = true;

            for (const module_name in _config.actions) {
              _config.actions[module_name].data = window.filter_nodes(_config.actions[module_name].data);

              for (const id in _config.actions[module_name].data) {
                const node = _config.actions[module_name].data[id],
                  block = window.get_block(node.data.type);

                if (block.outputs) {
                  for (let i = 1; i <= block.outputs; ++i) {
                    const name = `output_${i}`;
                    if (typeof node.outputs[name] === 'undefined') {
                      node.outputs[name] = { connections: [] };
                    }
                  }

                  for (let i = 1; i <= block.inputs; ++i) {
                    const name = `input_${i}`;
                    if (typeof node.inputs[name] === 'undefined') {
                      node.inputs[name] = { connections: [] };
                    }
                  }
                }
              }
            }

            editor.module = Object.keys(_config.actions)[0];
            editor.import({ drawflow: _config.actions });
            window.drawflow_select(_config.settings.sort);

            const module_name = ((_config.settings.module && typeof editor.drawflow.drawflow[_config.settings.module] !== 'undefined') ? _config.settings.module : Object.keys(_config.actions)[0]);
            if (module_name !== editor.module) {
              selector.setValue(module_name);
              editor.changeModule(module_name);
            } else {
              window.drawflow_initializer(_config.actions);
            }

            updateDisabled();
            setTimeout(() => {
              window.loading = false;
            }, 1000);
          } else {
            editor.module = 'Default';
            editor.addModule(editor.module);
            window.drawflow_save();
            window.drawflow_select();
          }
        }, 100);
      } else if (event.data.name === 'receive' && typeof window.drawflow_receiver === 'function') {
        window.drawflow_receiver(event.data.data.source, event.data.data.id, event.data.data.name, event.data.data.data);
      } else if (event.data.name === 'import') {
        window.import_nodes(window.filter_nodes(event.data.data));
      } else if (event.data.name === 'toggle-block' && typeof editor.drawflow.drawflow[event.data.data.module] !== 'undefined' && typeof editor.drawflow.drawflow[event.data.data.module].data[event.data.data.id] !== 'undefined') {
        editor.drawflow.drawflow[event.data.data.module].data[event.data.data.id].data.data.enabled = event.data.data.enabled;

        const node = window.get_node(event.data.data.id);
        if (node) {
          node.elem.classList.toggle('disabled', !event.data.data.enabled);
        }
      } else if (event.data.name === 'keyboard') {
        window.drawflow_receiver(false, 'manager', 'keyboard', event.data.data, event.data.separate);
      }
    }
  };
  window.addEventListener('message', window.message_event, false);

  window.drawflow_loader(editor);
}, false);