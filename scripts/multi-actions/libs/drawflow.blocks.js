document.addEventListener('DOMContentLoaded', () => {
  const editor = window.editor,
    drawflow = document.querySelector('.box-drawflow'),
    show_blocks = document.querySelector('.show-blocks'),
    options = document.querySelector('#template .drawflow-options').cloneNode(true),
    options_test = options.querySelector('.test-action'),
    options_delete = options.querySelector('.delete-action'),
    options_export = options.querySelector('.export-action'),
    options_select = options.querySelector('.select-action'),
    options_toggle = options.querySelector('.toggle-action'),
    button_export = document.querySelector('.container .hero-body input.export'),
    button_import = document.querySelector('.container .hero-body input.import');

  let global_datas = {},
    radios_index = {},
    mobile_item_selec = '',
    mobile_last_move = null;

  function request(source_id, id, name, data) {
    window.parent.postMessage({ request: [source_id, id, name, (data || [])] }, '*');
  }

  function drag(event) {
    const elem = event.target.closest('.drag-drawflow');

    document.body.classList.remove('show-blocks');
    if (event.type === 'touchstart') {
      mobile_item_selec = elem.getAttribute('data-node');
    } else {
      event.dataTransfer.setData('node', elem.getAttribute('data-node'));
    }
  }

  function drop(event) {
    if (event.type === 'touchend') {
      const touches = mobile_last_move.touches[0],
        parentdrawflow = document.elementFromPoint(touches.clientX, touches.clientY).closest('.parent-drawflow');

      if (parentdrawflow !== null) {
        add_node(mobile_item_selec, touches.clientX, touches.clientY);
      }

      mobile_item_selec = '';
    } else {
      event.preventDefault();
      var data = event.dataTransfer.getData('node');
      add_node(data, event.clientX, event.clientY);
    }
  }

  function drag_event(event) {
    const elem = event.target.closest('.drag-drawflow');

    if (elem) {
      switch (event.type) {
        case 'dragstart':
        case 'touchstart': drag(event); break;
        case 'touchmove': mobile_last_move = event; break;
        case 'touchend': drop(event); break;
      }
    }
  }

  function next_index(name) {
    if (typeof radios_index[name] === 'undefined') {
      radios_index[name] = 0;
    }

    return radios_index[name]++;
  }

  function get_eye(with_value, options) {
    let value = '';
    if (with_value) {
      const prefix = (typeof options === 'object') ? options.prefix : '',
        suffix = (typeof options === 'object') ? options.suffix : '';

      value = `<span class="value" value-prefix="${prefix || ''}" value-suffix="${suffix || ''}"></span>`;
    }

    return value + '<i class="fas fa-eye-slash"></i>';
  }

  function get_node(elem) {
    if (['string', 'number'].indexOf(typeof elem) >= 0) {
      elem = drawflow.querySelector(`#node-${elem}`);
    } else {
      elem = elem.closest('[id^="node-"]');
    }

    if (!elem) {
      return false;
    }

    return Object.assign(
      { elem },
      editor.drawflow.drawflow[editor.module].data[parseInt(elem.getAttribute('id').substr(5))]
    );
  }

  function set_data(id, _data) {
    const node = editor.getNodeFromId(id);
    node.data.data = _data;

    editor.updateNodeDataFromId(node.id, node.data);
    drawflow_save();

    const node_elem = drawflow.querySelector(`#node-${id}`);
    for (const data_name of Object.keys(node.data.data)) {
      const elem = node_elem.querySelector(`input[name="${data_name}"], select[name="${data_name}"], textarea[name="${data_name}"]`);
      if (elem) {
        const is_input = elem.nodeName.toLowerCase() === 'input',
          input_type = is_input && elem.getAttribute('type').toLowerCase();

        if (is_input && input_type === 'radio') {
          for (const elem of node_elem.querySelectorAll(`input[name="${data_name}"]`)) {
            if (elem.value === node.data.data[data_name]) {
              elem.checked = true;
            } else {
              elem.removeAttribute('checked');
            }
          }
        } else {
          elem.value = node.data.data[data_name];
        }
      }
    }
  }

  function get_name(elem) {
    elem = level_elem(elem);
    while (elem.previousElementSibling && elem.previousElementSibling.nodeName.toLowerCase() !== 'p') {
      elem = elem.previousElementSibling;
    }

    if (elem && elem.previousElementSibling) {
      return elem.previousElementSibling.innerText.trim();
    }
  }

  function set_value(elem, value) {
    if (elem.closest('.no-eye')) {
      return;
    }

    elem = level_elem(elem);
    while (elem.previousElementSibling && elem.previousElementSibling.nodeName.toLowerCase() !== 'p') {
      elem = elem.previousElementSibling;
    }

    if (elem && elem.previousElementSibling) {
      const value_elem = elem.previousElementSibling.querySelector('.value');
      if (value_elem) {
        const prefix = value_elem.getAttribute('value-prefix') || '',
          suffix = value_elem.getAttribute('value-suffix') || '';

        value_elem.innerText = value ? `: ${prefix}${value}${suffix}` : '';
      }
    }
  }

  function add_node(type, pos_x, pos_y, data) {
    if (editor.editor_mode === 'fixed' || typeof blocks[type] === 'undefined') {
      return false;
    }

    const block = blocks[type];
    if (block) {
      pos_x = (pos_x * (editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom))) - (editor.precanvas.getBoundingClientRect().x * ( editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom)));
      pos_y = (pos_y * (editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom))) - (editor.precanvas.getBoundingClientRect().y * ( editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom)));

      const id = editor.addNode(`${editor.nodeId}.${type}`, block.inputs, block.outputs, pos_x, pos_y, `block-${type}`, {}, type, true);
      editor.updateNodeDataFromId(id, { id: id, type: type, data: {} });
      set_data(id, Object.assign((block.data || {}), data));

      init_node(editor.getNodeFromId(id), true);
      return id;
    }
  }

  function move_node(id, pos_x, pos_y) {
    editor.drawflow.drawflow[editor.module].data[id].pos_x = pos_x;
    editor.drawflow.drawflow[editor.module].data[id].pos_y = pos_y;

    const node = get_node(id);
    node.elem.style.top = `${node.pos_y}px`;
    node.elem.style.left = `${node.pos_x}px`;

    editor.updateConnectionNodes(`node-${id}`);
    drawflow_save();
  }

  function init_node(node, first) {
    const block = blocks[node.data.type],
      node_elem = drawflow.querySelector(`#node-${node.id}`);

    if (!block) {
      try {
        editor.removeNodeId(`node-${node.id}`);
      }
      catch (e) {}

      return;
    }

    let id_string = `[${node.id}]`;
    node_elem.classList.toggle('disabled', !(typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled));
    const title_box = node_elem.querySelector('.title-box');
    if (title_box) {
      title_box.setAttribute('title', `${id_string} ${block.tooltip ? block.tooltip : block.title}`);
    }

    if (block.width && block.width > 0) {
      node_elem.style.width = `${block.width}px`;
    }

    const help_elem = node_elem.querySelector('.help');
    if (help_elem) {
      if (block.help) {
        node_elem.classList.add('helper');
        help_elem.addEventListener('mousedown', event => {
          event.stopPropagation();
          window.parent.postMessage({ open: `https://github.com/Arubinu/Scripts-Manager/wiki/Multi-Actions#${block.help}` }, '*');
        }, true);
      } else {
        help_elem.remove();
      }
    }

    node_elem.querySelectorAll('input, select, textarea').forEach(elem => {
      const elem_name = elem.getAttribute('name');
      if (!elem_name) {
        return;
      }

      const is_input = elem.nodeName.toLowerCase() === 'input',
        input_type = is_input && elem.getAttribute('type').toLowerCase(),
        data_exists = typeof node.data.data[elem_name] !== 'undefined';

      if (is_input && input_type === 'checkbox') {
        if (data_exists) {
          if (node.data.data[elem_name]) {
            elem.checked = true;
          } else {
            elem.removeAttribute('checked');
          }
        } else {
          node.data.data[elem_name] = elem.checked;
        }
      } else if (is_input && input_type === 'radio') {
        for (const radio_elem of node_elem.querySelectorAll(`input[name="${elem_name}"]`)) {
          if (data_exists) {
            if (radio_elem.value === node.data.data[elem_name]) {
              radio_elem.checked = true;
              set_value(radio_elem, radio_elem.parentElement.innerText.trim());
            } else {
              radio_elem.removeAttribute('checked');
            }
          }

          if (radio_elem.checked) {
            node.data.data[elem_name] = radio_elem.value;
          }
        }
      } else {
        if (data_exists) {
          elem.value = node.data.data[elem_name];
        } else {
          node.data.data[elem_name] = elem.value;
        }
      }

      const update = event => {
        node.data.data[elem_name] = ((is_input && input_type === 'checkbox') ? elem.checked : elem.value);

        set_data(node.id, node.data.data);
        if (block.update) {
          for (const update of (Array.isArray(block.update) ? block.update : [block.update])) {
            update(node.id, node_elem, node.data.data, _data => set_data(node.id, _data));
          }
        }

        if (elem.nextElementSibling && elem.nextElementSibling.nodeName.toLowerCase() === 'span') {
          set_value(elem, elem.nextElementSibling.innerText.trim());
        } else {
          set_value(elem, elem.value);
        }
      };

      elem.addEventListener('change', update, false);
    });

    node_elem.querySelectorAll('p > .fa-eye, p > .fa-eye-slash').forEach(elem => {
      const parent = elem.parentElement,
        toggle = show => {
          if (typeof show !== 'boolean') {
            show = elem.classList.contains('fa-eye-slash');
          }

          elem.classList.remove(show ? 'fa-eye-slash' : 'fa-eye');
          elem.classList.add(show ? 'fa-eye' : 'fa-eye-slash');

          let next = parent;
          while (next.nextElementSibling && next.nextElementSibling.nodeName.toLowerCase() !== 'p') {
            next = next.nextElementSibling;
            if (!next.classList.contains('no-eye')) {
              if (show) {
                next.style.removeProperty('display');
              } else {
                next.style.display = 'none';
              }
            }
          }

          setTimeout(() => {
            editor.updateConnectionNodes(`node-${node.id}`);
          }, 10);
        };

      if (elem.classList.contains('fa-eye-slash')) {
        toggle(false);
      }

      elem.addEventListener('click', toggle);
    });

    if (block.init) {
      block.init(node.id, node_elem, node.data.data, _data => set_data(node.id, _data), first);
    }

    set_data(node.id, node.data.data);
    if (block.update) {
      for (const update of (Array.isArray(block.update) ? block.update : [block.update])) {
        update(node.id, node_elem, node.data.data, _data => set_data(node.id, _data));
      }
    }
  }

  function level_elem(elem) {
    let level = parseInt(elem.getAttribute('level'));
    if (!isNaN(level)) {
      for (; level > 0; --level) {
        elem = elem.parentElement;
      }
    }

    return elem;
  }

  function sort_object(k) {
    return (a, b) => {
      if (a[k] < b[k]) {
        return -1;
      }
      else if (a[k] > b[k]) {
        return 1;
      }
      return 0;
    };
  }

  const bodys = {
    type: '<p>Type of value<span class="value"></span><i class="fas fa-eye-slash"></i></p><hr /><label class="radio"><input name="type" type="radio" value="string" level="1" checked /><span>String</span></label><label class="radio"><input name="type" type="radio" value="number" level="1" /><span>Number</span></label><label class="radio"><input name="type" type="radio" value="boolean" level="1" /><span>Boolean</span></label>',
    match: '<label class="checkbox no-eye" title="The uppercase/lowercase will be taken into account" style="padding-left: 0em; width: 85%;"><input name="case" type="checkbox" level="1" /><span>Case sensitive</span></label><label class="checkbox no-eye" title="The message received contains the sentence (must be exact if unchecked)" style="padding-left: 0em; width: 85%;"><input name="contains" type="checkbox" level="1" /><span>Contains sentence</span></label>',
    command: '<p>Command</p><div class="is-command"><input name="command" type="text" class="has-text-centered" level="1" /></div>',
    viewers: () => {
      return `<p>Type of viewer<i class="fas fa-eye-slash"></i></p><hr />${bodys.checkbox('Viewer', false, 1)}${bodys.checkbox('Follower', false, 1)}${bodys.checkbox('Subscriber', false, 1)}${bodys.checkbox('Founder', false, 1)}${bodys.checkbox('VIP', false, 1)}${bodys.checkbox('Moderator', false, 1)}${bodys.checkbox('Broadcaster', false, 1)}`;
    },
    checkbox: (title, name, level) => {
      if (!name) {
        name = title.toLowerCase().replace(/\s/g, '-');
      }

      return `<label class="checkbox"><input name="${name}" type="checkbox" level="${(typeof level === 'number') ? level : 1}" /><span>${title}</span></label>`;
    },
    file: (title, name, classes) => {
      if (!name) {
        name = title.toLowerCase().replace(/\s/g, '-');
      }

      return `<p>${title}</p><div class="is-browse ${classes || ''}"><input name="${name}" type="text" class="has-text-centered" readonly /><button><i class="fas fa-ellipsis"></i></button></div>`;
    },
    text: (title, name) => {
      if (!name) {
        name = title.toLowerCase().replace(/\s/g, '-');
      }

      return `<p>${title}</p><input name="${name}" type="text" class="has-text-centered" level="0" />`;
    },
    number: (title, name, value, step, min, max, eye, eye_input) => {
      if (!name) {
        name = title.toLowerCase().replace(/\s/g, '-');
      }

      let attrs = '';
      if (typeof value === 'number') {
        attrs += ` value="${value}"`;
      }
      if (typeof step === 'number') {
        attrs += ` step="${step}"`;
      }
      if (typeof min === 'number') {
        attrs += ` min="${min}"`;
      }
      if (typeof max === 'number') {
        attrs += ` max="${max}"`;
      }

      if (eye) {
        eye = get_eye(true, eye);
      }

      return `<p>${title}${eye || ''}</p><input name="${name}" type="number"${attrs} class="has-text-centered ${eye ? '' : 'no-eye'}" level="0" />`;
    },
    number_unit: (title, name, value, step, min, max, units) => {
      if (!name) {
        name = title.toLowerCase().replace(/\s/g, '-');
      }

      let units_html = '';
      for (const unit of units) {
        units_html += `<label class="radio"><input name="number_unit" type="radio" value="${unit.toLowerCase()}" level="1" ${!units_html ? 'checked' : ''}/><span>${unit}</span></label>`;
      }

      return bodys.number(title, name, value, step, min, max, true).replace('text-centered', 'text-centered no-eye') + `<hr />${units_html}`;
    },
    select: (title, name, options, select, eye) => {
      if (!name) {
        name = title.toLowerCase().replace(/\s/g, '-');
      }

      let list = '';
      if (options) {
        for (const option of options) {
          if (typeof option === 'object') {
            list += `<option value="${option.value}"` + ((option.value === select) ? ' selected' : '') + `>${option.name}</option>`;
          } else {
            list += '<option' + ((option === select) ? ' selected' : '') + `>${option}</option>`;
          }
        }
      }

      if (eye) {
        eye = get_eye(true, eye);
      }

      return `<p>${title}${eye || ''}</p><select name="${name}" class="has-text-centered ${eye ? '' : 'no-eye'}">${list}</select>`;
    },
    state: (title, name, on, off) => {
      title = (title || 'State');
      if (!name) {
        name = title.toLowerCase().replace(/\s/g, '-');
      }

      return `<p>${title}<span class="value"></span><i class="fas fa-eye-slash"></i></p><div><input name="${name}" type="checkbox" class="is-hidden" level="1" checked /><div class="field has-addons is-justify-content-center"><p class="control"><button class="button button-on" name="${name}" level="3"><span>${on || 'Start'}</span></button></p><p class="control"><button class="button button-off" name="${name}" level="3"><span>${off || 'Stop'}</span></button></p></div></div>`;
    },
    state_toggle: (title, name, on, off, toggle) => {
      title = (title || 'State');
      if (!name) {
        name = title.toLowerCase().replace(/\s/g, '-');
      }

      return `<p>${title}<span class="value"></span><i class="fas fa-eye-slash"></i></p><div class="field has-addons is-justify-content-center"><p class="control"><input name="${name}" type="radio" value="on" class="is-hidden" level="2" checked /><button class="button button-on" name="${name}" level="2"><span>${on || 'Start'}</span></button></p><p class="control"><input name="${name}" type="radio" value="toggle" class="is-hidden" level="2" /><button class="button button-toggle" name="${name}" level="2"><span>${toggle || 'Toggle'}</span></button></p><p class="control"><input name="${name}" type="radio" value="off" class="is-hidden" level="2" /><button class="button button-off" name="${name}" level="2"><span>${off || 'Stop'}</span></button></p></div>`;
    },
  };

  const functions = {
    trim: (id, elem, data, set_data, receive, receive_data) => {
      let trim = false;
      for (const key in data) {
        const value = data[key];
        if (typeof value === 'string' && value !== value.trim()) {
          trim = true;
          data[key] = value.trim();
        }
      }

      if (trim) {
        set_data(data);
      }
    },
    number: (id, elem, data, set_data, receive, receive_data, arg, min, max) => {
      const data_elem = elem.querySelector(`input[type="number"][name="${arg}"]`);
      if (data_elem) {
        if (typeof min === 'number' && data[arg] < min) {
          data[arg] = min;
          set_data(data);
        } else if (typeof max === 'number' && data[arg] > max) {
          data[arg] = max;
          set_data(data);
        }

        set_value(data_elem, data[arg]);
      }
    },
    number_unit: (id, elem, data, set_data, receive, receive_data, arg, min, max) => {
      functions.number(id, elem, data, set_data, receive, receive_data, arg, min, max);

      if (!receive) {
        const index = elem.getAttribute('radio-number_unit');
        for (const radio of elem.querySelectorAll(`input[name="number_unit[${index}]"]`)) {
          radio.addEventListener('click', event => {
            data.number_unit = radio.value;
            set_data(data);
          }, false);
        }
      }
    },
    select: (id, elem, data, set_data, receive, receive_data, arg) => {
      const data_elem = elem.querySelector(`select[name="${arg}"]`);
      if (data_elem) {
        set_value(data_elem, data_elem.value);
      }
    },
    scene_source: (id, elem, data, set_data, receive, receive_data) => {
      const selects = elem.querySelectorAll('select');
      if (receive || global_datas.scene_source) {
        if (receive) {
          global_datas.scene_source = receive_data;

          global_datas.scene_source.sort(sort_object('sceneName'));
          for (const scene of global_datas.scene_source) {
            scene.sources.sort(sort_object('sourceName'));
          }
        }

        // source
        const scenes_changed = () => {
          const value = selects[0].value;
          if (value && selects.length > 1) {
            const selected = selects[1].value || data.source;

            selects[1].innerHTML = '';
            selects[1].appendChild(document.createElement('option'));

            let names = [];
            for (const scene of global_datas.scene_source) {
              if (scene.sceneName === value) {
                for (const source of scene.sources) {
                  names.push(source.sourceName);

                  const option = document.createElement('option');
                  option.value = source.sourceName;
                  option.innerText = source.sourceName;
                  selects[1].appendChild(option);
                }
              }
            }

            if (selected && names.indexOf(selected) < 0) {
              const option = document.createElement('option');
              option.classList.add('disabled');
              option.value = selected;
              option.innerText = selected;

              selects[1].appendChild(option);
            }

            selects[1].value = selected;
          }
        };

        if (selects.length > 1) {
          if (!elem.classList.contains('block-init')) {
            elem.classList.add('block-init');
            selects[0].addEventListener('change', scenes_changed, false);
          }
        }

        // scene
        const selected = selects[0].value || data.scene;

        selects[0].innerHTML = '';
        selects[0].appendChild(document.createElement('option'));

        let names = [];
        for (const scene of global_datas.scene_source) {
          names.push(scene.sceneName);

          const option = document.createElement('option');
          option.value = scene.sceneName;
          option.innerText = scene.sceneName;
          selects[0].appendChild(option);
        }

        if (selected && names.indexOf(selected) < 0) {
          const option = document.createElement('option');
          option.classList.add('disabled');
          option.value = selected;
          option.innerText = selected;

          selects[0].appendChild(option);
        }

        selects[0].value = selected;
        scenes_changed();
      } else if (!receive) {
        if (data.scene) {
          const option = document.createElement('option');
          option.value = data.scene;
          option.innerText = data.scene;

          selects[0].innerHTML = '';
          selects[0].appendChild(option);
        }

        if (data.source) {
          const option = document.createElement('option');
          option.value = data.source;
          option.innerText = data.source;

          selects[1].innerHTML = '';
          selects[1].appendChild(option);
        }

        request(id, 'obs-studio', 'GetScenes', [true]);
      }
    },
    source_filter: (id, elem, data, set_data, receive, receive_data, with_scenes) => {
      const selects = elem.querySelectorAll('select');
      if (receive || global_datas.source_filter) {
        if (receive) {
          if (with_scenes) {
            let tmp = { sources: [], names: [] };
            for (const scene of receive_data)
            {
              for (const source of scene.sources) {
                if (tmp.names.indexOf(source.sourceName) < 0) {
                  tmp.names.push(source.sourceName);
                  tmp.sources.push(source);
                }
              }
            }

            for (const scene of receive_data)
            {
              if (tmp.names.indexOf(scene.sceneName) < 0) {
                tmp.names.push(scene.sceneName);
                tmp.sources.push({
                  filters: scene.filters,
                  inputKind: null,
                  sceneItemId: scene.sceneIndex,
                  sourceName: scene.sceneName,
                  sourceType: 'OBS_SOURCE_TYPE_SCENE'
                });
              }
            }

            receive_data = tmp.sources;
          }

          global_datas.source_filter = receive_data;

          global_datas.source_filter.sort(sort_object('sourceName'));
          for (const source of global_datas.source_filter) {
            if (source.filters) {
              source.filters.sort(sort_object('filterName'));
            }
          }
        }

        // filter
        const source_changed = () => {
          const value = selects[0].value;
          if (value && selects.length > 1) {
            const selected = selects[1].value || data.filter;

            selects[1].innerHTML = '';
            selects[1].appendChild(document.createElement('option'));

            let names = [];
            for (const source of global_datas.source_filter) {
              if (source.sourceName === value) {
                for (const filter of source.filters) {
                  names.push(filter.filterName);

                  const option = document.createElement('option');
                  option.value = filter.filterName;
                  option.innerText = filter.filterName;
                  selects[1].appendChild(option);
                }
              }
            }

            if (selected && names.indexOf(selected) < 0) {
              const option = document.createElement('option');
              option.classList.add('disabled');
              option.value = selected;
              option.innerText = selected;

              selects[1].appendChild(option);
            }

            selects[1].value = selected;
          }
        };

        if (selects.length > 1) {
          if (!elem.classList.contains('block-init')) {
            elem.classList.add('block-init');
            selects[0].addEventListener('change', source_changed, false);
          }
        }

        // source
        const selected = (selects[0].value || data.source);

        selects[0].innerHTML = '';
        selects[0].appendChild(document.createElement('option'));

        let names = [];
        for (const source of global_datas.source_filter) {
          names.push(source.sourceName);

          const option = document.createElement('option');
          option.value = source.sourceName;
          option.innerText = source.sourceName;
          selects[0].appendChild(option);
        }

        if (selected && names.indexOf(selected) < 0) {
          const option = document.createElement('option');
          option.classList.add('disabled');
          option.value = selected;
          option.innerText = selected;

          selects[0].appendChild(option);
        }

        selects[0].value = selected;
        source_changed();
      } else if (!receive) {
        if (data.source) {
          const option = document.createElement('option');
          option.value = data.source;
          option.innerText = data.source;

          selects[0].innerHTML = '';
          selects[0].appendChild(option);
        }

        if (data.filter && selects.length > 1) {
          const option = document.createElement('option');
          option.value = data.filter;
          option.innerText = data.filter;

          selects[1].innerHTML = '';
          selects[1].appendChild(option);
        }

        if (with_scenes) {
          request(id, 'obs-studio', 'GetScenes', [true, (selects.length > 1)]);
        } else {
          request(id, 'obs-studio', 'GetSources', ['', (selects.length > 1)]);
        }
      }
    },
    usb_devices: (id, elem, data, set_data, receive, receive_data) => {
      const select = elem.querySelector('select[name="device"]');
      if (receive || global_datas.usb_devices) {
        if (receive) {
          global_datas.usb_devices = receive_data;

          global_datas.usb_devices.sort(sort_object('productName'));
        }

        const selected = select.value || data.device;

        select.innerHTML = '';
        select.appendChild(document.createElement('option'));

        let names = [];
        for (const device of global_datas.usb_devices) {
          if (typeof device.productName === 'string' && device.productName.trim().length && names.indexOf(device.productName) < 0) {
            names.push(device.productName);

            const option = document.createElement('option');
            option.value = device.productName;
            option.innerText = device.productName;
            select.appendChild(option);
          }
        }

        if (selected && names.indexOf(selected) < 0) {
          const option = document.createElement('option');
          option.classList.add('disabled');
          option.value = selected;
          option.innerText = selected;

          select.appendChild(option);
        }

        select.value = selected;
      } else if (!receive) {
        if (data.device) {
          const option = document.createElement('option');
          option.value = data.device;
          option.innerText = data.device;

          select.innerHTML = '';
          select.appendChild(option);
        }

        request(id, 'manager', 'usb:devices');
      }
    },
    state: (id, elem, data, set_data, receive, receive_data, arg, callback) => {
      arg = (arg || 'state');
      if (receive) {
        return;
      }

      const name_selector = `[name="${arg}"]`,
        selectors = { name: name_selector, input: `input${name_selector}`, active: `${name_selector}.is-active` },
        inputs = elem.querySelectorAll(`input${selectors.name}`),
        input_type = inputs[0].getAttribute('type').toLowerCase(),
        on = elem.querySelector(`input${selectors.name}[value="on"]`),
        toggle = elem.querySelector(`input${selectors.name}[value="toggle"]`),
        off = elem.querySelector(`input${selectors.name}[value="off"]`),
        button_on = elem.querySelector(`${selectors.name}.button-on`),
        button_toggle = elem.querySelector(`${selectors.name}.button-toggle`),
        button_off = elem.querySelector(`${selectors.name}.button-off`),
        change_state = (state, save, state_string, force) => {
          button_on.classList.toggle('is-active', (toggle ? (state === 'on') : state));
          button_off.classList.toggle('is-active', (toggle ? (state === 'off') : !state));
          if (button_toggle) {
            button_toggle.classList.toggle('is-active', (state === 'toggle'));
          }

          const original = data[arg];
          if (save) {
            data[arg] = state;
            set_data(data);
          }

          if (typeof state_string !== 'string') {
            state_string = state;
            if (typeof state_string !== 'string') {
              const active = inputs[0].parentElement.querySelector(selectors.active);
              if (active) {
                state_string = active.innerText.trim();
              } else {
                state_string = state ? 'on' : 'off';
              }
            }
          }

          set_value(inputs[0], state_string);

          if (callback && (force || original !== state)) {
            callback(state);
          }
        };

      if (inputs.length && ((input_type === 'checkbox' && button_on && button_off) || (input_type === 'radio' && on && off))) {
        if (!elem.querySelector(selectors.active)) {
          button_on.addEventListener('click', () => change_state((toggle ? 'on' : true), true, button_on.innerText), false);
          button_off.addEventListener('click', () => change_state((toggle ? 'off' : false), true, button_off.innerText), false);
          if (button_toggle) {
            button_toggle.addEventListener('click', () => change_state('toggle', true, button_toggle.innerText), false);
          }
        }

        if (toggle) {
          let name = 'On';
          let value = 'on';
          const radio_elems = elem.querySelectorAll(selectors.input);
          for (const radio_elem of radio_elems) {
            if (radio_elem.checked) {
              name = radio_elem.parentElement.innerText.trim();
              value = radio_elem.value;
            }
          }

          change_state(value, undefined, name, true);
        } else {
          change_state(inputs[0].checked, undefined, undefined, true);
        }
      }
    }
  };

  const browse_fas = (id, type, elem, name, filename, extension) => {
    const target = `#node-${id} input[name="${name}"]`;

    const change = event => {
      const empty = !input.value;

      const fas = elem.querySelector('.fas');
      fas.classList.toggle('fa-ellipsis', empty);
      fas.classList.toggle('fa-xmark', !empty);

      if (!event && empty) {
        const node = get_node(id);
        node.data.data[name] = input.value;
        set_data(node.id, node.data.data);
      }
    };

    elem.addEventListener('click', event => {
      const empty = !input.value;
      if (!empty) {
        input.value = '';
        event.preventDefault();
        event.stopPropagation();
      }

      change();
    }, true);

    elem.setAttribute(`browse-${type}`, target);
    if (filename) {
      elem.setAttribute('browse-file-name', filename);
    }
    if (extension) {
      elem.setAttribute('browse-file-ext', extension);
    }

    const input = document.querySelector(target);
    input.addEventListener('change', change, false);

    change();
  };

  const display_image = (image, title) => {
    if (document.querySelector('.container-frame')) {
      return;
    }

    const container_frame = document.createElement('div');
    container_frame.classList.add('container-frame');
    container_frame.addEventListener('click', () => {
      container_frame.remove();
    }, false);

    const frame = document.createElement('div');
    container_frame.appendChild(frame);

    if (title) {
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
    'outputs-app-status': {
      title: 'App Status',
      help: 'app-status',
      icon: 'application',
      inputs: 0,
      outputs: 1,
      body: bodys.file('Application', 'program', 'app-status') + bodys.state(false, false, 'Launch', 'Closing'),
      update: [functions.state, (id, elem, data, set_data, receive, receive_data) => {
        if (!elem.classList.contains('block-init')) {
          elem.classList.add('block-init');
          browse_fas(id, 'file', elem.querySelector('.app-status button'), 'program', false, 'exe');
        }
      }]
    },
    'inputs-audio-play': {
      title: 'Audio Play',
      help: 'audio-play',
      icon: 'play',
      inputs: 1,
      outputs: 0,
      body: bodys.file('File', false, 'audio-play') + bodys.number('Volume', false, 100, 1, 0, 100, { suffix: '%' }) + bodys.select('Device', false, false, false, true),
      register: [['manager', 'audio:list']],
      update: (id, elem, data, set_data, receive, receive_data) => {
        functions.number(id, elem, data, set_data, receive, receive_data, 'volume', 0, 100);
        functions.select(id, elem, data, set_data, receive, receive_data, 'device');

        if (!elem.classList.contains('block-init')) {
          elem.classList.add('block-init');
          browse_fas(id, 'file', elem.querySelector('.audio-play button'), 'file', false, 'mp3,ogg,wav');
        }
        const select = elem.querySelector('select');
        if (receive || global_datas.audio_devices) {
          if (receive) {
            global_datas.audio_devices = receive_data;

            global_datas.audio_devices.sort(sort_object('label'));
          }

          const selected = (select.value || data.device);

          select.innerHTML = '';
          select.appendChild(document.createElement('option'));

          let names = [];
          for (const device of global_datas.audio_devices) {
            names.push(device.label);

            const option = document.createElement('option');
            option.value = device.label;
            option.innerText = device.label;
            select.appendChild(option);
          }

          if (selected && names.indexOf(selected) < 0) {
            const option = document.createElement('option');
            option.classList.add('disabled');
            option.value = selected;
            option.innerText = selected;

            select.appendChild(option);
          }

          select.value = selected;
        } else if (!receive) {
          if (data.device) {
            const option = document.createElement('option');
            option.value = data.device;
            option.innerText = data.device;

            select.innerHTML = '';
            select.appendChild(option);
          }

          request(id, 'manager', 'audio:devices');
        }
      }
    },
    'inputs-audio-stop': {
      title: 'Audio Stop',
      help: 'audio-stop',
      icon: 'stop',
      inputs: 1,
      outputs: 0
    },
    'both-cooldown': {
      title: 'Cooldown',
      help: 'cooldown',
      icon: 'cooldown',
      inputs: 1,
      outputs: 1,
      body: bodys.text('Variable name', 'variable') + bodys.number_unit('Time', 'seconds', 10, 1, 1, undefined, ['Milliseconds', 'Seconds', 'Minutes']),
      init: (id, elem, data, set_data, first) => {
        if (!data.variable) {
          data.variable = Date.now().toString();
          set_data(data);
        }

        const index = next_index('number_unit');
        elem.setAttribute('radio-number_unit', index);
        for (const radio of elem.querySelectorAll('input[name="number_unit"]')) {
          radio.setAttribute('name', `number_unit[${index}]`);
        }
      },
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        functions.number_unit(id, elem, data, set_data, receive, receive_data, 'seconds', 1);
      }]
    },
    'both-http-request': {
      title: 'HTTP Request',
      help: 'http-request',
      icon: 'request',
      inputs: 1,
      outputs: 1,
      body: bodys.text('URL') + bodys.text('Method'),
      update: functions.trim
    },
    'inputs-kill-app': {
      title: 'Kill App',
      help: 'kill-app',
      icon: 'kill',
      inputs: 1,
      outputs: 0,
      body: bodys.file('Application', 'program', 'kill-app'),
      update: (id, elem, data, set_data, receive, receive_data) => {
        if (!elem.classList.contains('block-init')) {
          elem.classList.add('block-init');
          browse_fas(id, 'file', elem.querySelector('.kill-app button'), 'program', false, 'exe');
        }
      }
    },
    'both-launch-app': {
      title: 'Launch App',
      help: 'launch-app',
      icon: 'launch',
      inputs: 1,
      outputs: 1,
      body: bodys.file('Application', 'program', 'launch-app'),
      update: (id, elem, data, set_data, receive, receive_data) => {
        if (!elem.classList.contains('block-init')) {
          elem.classList.add('block-init');
          browse_fas(id, 'file', elem.querySelector('.launch-app button'), 'program', false, 'exe');
        }
      }
    },
    'note': {
      title: 'Note',
      help: 'note',
      icon: 'text',
      inputs: 0,
      outputs: 0,
      content: '<div contenteditable="true" spellcheck="false"></div>',
      init: (id, elem, data, set_data, first) => {
        elem.querySelector('[contenteditable]').innerText = data.content || 'Write a note replacing this text !';
      }
    },
    'inputs-notification': {
      title: 'Notification',
      help: 'notification',
      icon: 'notification',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Title') + bodys.text('Message') + bodys.file('Icon', 'icon', 'notif-icon') + bodys.number_unit('Duration', false, 1000, 100, 1, undefined, ['Milliseconds', 'Seconds', 'Minutes']),
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        if (!elem.classList.contains('block-init')) {
          elem.classList.add('block-init');
          browse_fas(id, 'file', elem.querySelector('.notif-icon button'), 'icon', false, 'png');
        }
      }]
    },
    'inputs-open-url': {
      title: 'Open URL',
      help: 'open-url',
      icon: 'open-url',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Address'),
      update: functions.trim
    },
    'outputs-launch': {
      title: 'Scripts Manager Launch',
      help: 'scripts-manager-launch',
      icon: 'launch',
      inputs: 0,
      outputs: 1
    },
    'both-self-timer': {
      title: 'Self-Timer',
      help: 'self-timer',
      icon: 'self-timer',
      inputs: 1,
      outputs: 1,
      body: bodys.number_unit('Time', 'millis', 1000, 100, 1, undefined, ['Milliseconds', 'Seconds', 'Minutes']),
      init: (id, elem, data, set_data, first) => {
        const index = next_index('number_unit');
        elem.setAttribute('radio-number_unit', index);
        for (const radio of elem.querySelectorAll('input[name="number_unit"]')) {
          radio.setAttribute('name', `number_unit[${index}]`);
        }
      },
      update: (id, elem, data, set_data, receive, receive_data) => functions.number_unit(id, elem, data, set_data, receive, receive_data, 'millis', 1)
    },
    'both-socket-request': {
      title: 'Socket Request',
      help: 'socket-request',
      icon: 'request',
      inputs: 1,
      outputs: 1,
      body: bodys.text('IPv4', 'host') + bodys.number('Port', false, 3000, 1, 1) + bodys.text('Data'),
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        functions.number(id, elem, data, set_data, receive, receive_data, 'port', 1);
      }]
    },
    'outputs-toggle-block': {
      title: 'Toggle Block',
      help: 'toggle-block',
      icon: 'toggle',
      inputs: 0,
      outputs: 1,
      body: bodys.number('Block ID', 'id', 0, 1, 0) + bodys.state_toggle(false, false, 'On', 'Off', 'Both'),
      update: functions.state
    },
    'inputs-toggle-block': {
      title: 'Toggle Block',
      help: 'toggle-block',
      icon: 'toggle',
      inputs: 1,
      outputs: 0,
      body: bodys.number('Block ID', 'id', 0, 1, 0) + bodys.state_toggle(false, false, 'On', 'Off', 'Toggle'),
      update: [functions.state, (id, elem, data, set_data, receive, receive_data) => {
        functions.number(id, elem, data, set_data, receive, receive_data, 'id', 0);
      }]
    },
    'outputs-usb-detection': {
      title: 'USB Detection',
      help: 'usb-detection',
      icon: 'connection',
      inputs: 0,
      outputs: 1,
      body: bodys.select('Device') + bodys.state(false, false, 'Connection', 'Disconnection'),
      register: [['manager', 'usb:devices']],
      update: [functions.usb_devices, functions.state]
    },
    'both-variable-condition': {
      title: 'Variable Condition',
      help: 'variable-condition',
      icon: 'variable-condition',
      inputs: 1,
      outputs: 1,
      body: bodys.text('Value 1') + bodys.select('Condition') + bodys.text('Value 2', 'string') + bodys.select('Value 2', 'boolean', ['false', 'true']) + bodys.number('Value 2', 'number', 0) + bodys.state_toggle('Variable type', 'type', 'String', 'Boolean', 'Number'),
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        const conditions = {
            'string': [
              'Equal',
              'Not Equal',
              'Contains',
              'Not Contains',
              'Starts with',
              'Not Starts with'
            ],
            'number': [
              'Equal',
              'Not Equal',
              'Less',
              'Greater',
              'Less or Equal',
              'Greater or Equal',
            ],
            'boolean': [
              'Equal',
              'Not Equal'
            ]
          },
          change_state = state => {
            const names = { on: 'string', toggle: 'number', off: 'boolean' };
            state = names[state];

            for (const input of elem.querySelectorAll(`input[name="string"], input[name="number"], select[name="boolean"]`)) {
              const name = input.getAttribute('name'),
                elem = level_elem(input);

              elem.previousElementSibling.style.display = ((name === state) ? 'block' : 'none');
              elem.style.display = ((name === state) ? 'block' : 'none');
            }

            const select_type = elem.getAttribute('select-type');
            elem.setAttribute('select-type', state);

            if (select_type !== state) {
              const select = elem.querySelector('select[name="condition"]');

              select.innerHTML = '';
              select.appendChild(document.createElement('option'));

              for (const condition of conditions[state]) {
                const option = document.createElement('option');
                option.value = condition.toLowerCase().replace(/\s/g, '-');
                option.innerText = condition;
                select.appendChild(option);

                if (option.value === data.condition) {
                  option.selected = true;
                }
              }
            }
          };

        functions.state(id, elem, data, set_data, receive, receive_data, 'type', change_state);
        functions.number(id, elem, data, set_data, receive, receive_data, 'number');
      }]
    },
    'both-variable-increment': {
      title: 'Variable Increment',
      help: 'variable-increment',
      icon: 'variable-increment',
      inputs: 1,
      outputs: 1,
      body: bodys.text('Variable name', 'variable') + bodys.number('Increment', 'number', 0, false, false, false, true) + bodys.state_toggle('Scope', false, 'Global', 'Next', 'Local'),
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        functions.number(id, elem, data, set_data, receive, receive_data, 'number');
        functions.state(id, elem, data, set_data, receive, receive_data, 'scope');
      }]
    },
    'both-variable-remove': {
      title: 'Variable Remove',
      help: 'variable-remove',
      icon: 'variable-remove',
      inputs: 1,
      outputs: 1,
      body: bodys.text('Variable name', 'variable') + bodys.state_toggle('Scope', false, 'Global', 'Next', 'Local'),
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        functions.state(id, elem, data, set_data, receive, receive_data, 'scope');
      }]
    },
    'both-variable-replace': {
      title: 'Variable Replace',
      help: 'variable-replace',
      icon: 'rename',
      inputs: 1,
      outputs: 1,
      body: bodys.text('Variable name', 'variable') + bodys.text('Value') + bodys.text('Search') + bodys.text('Replace') + bodys.checkbox('Replace all', 'all', 1) + bodys.state_toggle('Scope', false, 'Global', 'Next', 'Local'),
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        functions.state(id, elem, data, set_data, receive, receive_data, 'scope');
      }]
    },
    'both-variable-setter': {
      title: 'Variable Setter',
      help: 'variable-setter',
      icon: 'variable-setter',
      inputs: 1,
      outputs: 1,
      body: bodys.text('Variable name', 'variable') + bodys.text('Value', 'string') + bodys.number('Value', 'number', 0) + bodys.select('Value', 'boolean', ['false', 'true']) + bodys.state_toggle('Variable type', 'type', 'String', 'Boolean', 'Number') + bodys.state_toggle('Scope', false, 'Global', 'Next', 'Local'),
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        const change_state = state => {
          const names = { on: 'string', toggle: 'number', off: 'boolean' };
          state = names[state];

          for (const input of elem.querySelectorAll(`input[name="string"], input[name="number"], select[name="boolean"]`)) {
            const name = input.getAttribute('name'),
              elem = level_elem(input);

            elem.previousElementSibling.style.display = ((name === state) ? 'block' : 'none');
            elem.style.display = ((name === state) ? 'block' : 'none');
          }
        };

        functions.state(id, elem, data, set_data, receive, receive_data, 'type', change_state);
        functions.state(id, elem, data, set_data, receive, receive_data, 'scope');
      }]
    },
    'both-websocket-request': {
      title: 'WebSocket Request',
      help: 'websocket-request',
      icon: 'request',
      inputs: 1,
      outputs: 1,
      body: bodys.text('URL') + bodys.text('Data'),
      update: functions.trim
    },
    'inputs-discord-webhook-embed': {
      type: 'discord',
      title: 'Webhook Embed',
      help: 'discord---webhook-embed',
      tooltip: 'Discord - Webhook Embed',
      icon: 'webhook',
      width: 500,
      inputs: 1,
      outputs: 0,
      body: '<div class="columns"><div class="column"><p>Title</p><input name="title" type="text" class="has-text-centered" /></div><div class="column"><p>URL<i class="fas fa-circle-info is-pulled-right"></i></p><input name="url" type="url" class="has-text-centered" /></div></div><div class="columns"><div class="column"><p>Thumbnail</p><div class="is-browse discord-thumbnail"><input name="thumbnail" type="text" class="has-text-centered" readonly /><button><i class="fas fa-ellipsis"></i></button></div></div><div class="column"><p>Big Image</p><div class="is-browse discord-big-image"><input name="big-image" type="text" class="has-text-centered" readonly /><button><i class="fas fa-ellipsis"></i></button></div></div></div><p>Webhook<i class="fas fa-eye-slash"></i></p><input name="webhook" type="url" class="has-text-centered" /><p>Message<i class="fas fa-eye-slash"></i></p><input name="message" type="text" class="has-text-centered" /><p>Inline 1<i class="fas fa-eye-slash"></i></p><div class="columns clear"><div class="column"><input name="inline-1-title" type="text" class="has-text-centered" placeholder="Title" /></div><div class="column"><input name="inline-1-content" type="text" class="has-text-centered" placeholder="Content" /></div></div><p>Inline 2<i class="fas fa-eye-slash"></i></p><div class="columns clear"><div class="column"><input name="inline-2-title" type="text" class="has-text-centered" placeholder="Title" /></div><div class="column"><input name="inline-2-content" type="text" class="has-text-centered" placeholder="Content" /></div></div>',
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        if (!elem.classList.contains('block-init')) {
          elem.classList.add('block-init');

          browse_fas(id, 'file', elem.querySelector('.discord-thumbnail button'), 'thumbnail');
          browse_fas(id, 'file', elem.querySelector('.discord-big-image button'), 'big-image');

          elem.querySelector('.box .fa-circle-info').addEventListener('click', () => {
            display_image('guide.png', 'Discord Publication - Guide');
          }, false);
        }
      }]
    },
    'inputs-discord-webhook-message': {
      type: 'discord',
      title: 'Webhook Message',
      help: 'discord---webhook-message',
      tooltip: 'Discord - Webhook Message',
      icon: 'webhook',
      width: 500,
      inputs: 1,
      outputs: 0,
      body: '<p>Webhook<i class="fas fa-eye-slash"></i></p><input name="webhook" type="url" class="has-text-centered" /><p>Message<i class="fas fa-eye-slash"></i></p><textarea name="message" style="height: 120px; resize: none;"></textarea>',
      update: functions.trim
    },
    'outputs-obs-studio-connection': {
      type: 'obs-studio',
      title: 'Connection',
      help: 'obs-studio---connection',
      tooltip: 'OBS Studio - Connection',
      icon: 'connection',
      inputs: 0,
      outputs: 1,
      body: bodys.state(false, false, 'Opened', 'Closed'),
      update: functions.state
    },
    'outputs-obs-studio-exit': {
      type: 'obs-studio',
      title: 'Exit',
      help: 'obs-studio---exit',
      tooltip: 'OBS Studio - Exit',
      icon: 'exit',
      inputs: 0,
      outputs: 1
    },
    'outputs-obs-studio-lock-source': {
      type: 'obs-studio',
      title: 'Lock Source',
      help: 'obs-studio---lock-source',
      tooltip: 'OBS Studio - Lock Source',
      icon: 'locked',
      inputs: 0,
      outputs: 1,
      body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source') + bodys.state(false, false, 'On', 'Off'),
      register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
      update: [ functions.scene_source, functions.state ]
    },
    'inputs-obs-studio-lock-source': {
      type: 'obs-studio',
      title: 'Lock Source',
      help: 'obs-studio---lock-source',
      tooltip: 'OBS Studio - Lock Source',
      icon: 'locked',
      inputs: 1,
      outputs: 0,
      body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source') + bodys.state_toggle(false, false, 'On', 'Off', 'Toggle'),
      register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
      update: [ functions.scene_source, functions.state ]
    },
    'outputs-obs-studio-recording': {
      type: 'obs-studio',
      title: 'Recording',
      help: 'obs-studio---recording',
      tooltip: 'OBS Studio - Recording',
      icon: 'recording',
      inputs: 0,
      outputs: 1,
      body: bodys.state(),
      update: functions.state
    },
    'inputs-obs-studio-recording': {
      type: 'obs-studio',
      title: 'Recording',
      help: 'obs-studio---recording',
      tooltip: 'OBS Studio - Recording',
      icon: 'recording',
      inputs: 1,
      outputs: 0,
      body: bodys.state_toggle(false),
      update: functions.state
    },
    'outputs-obs-studio-replay': {
      type: 'obs-studio',
      title: 'Replay',
      help: 'obs-studio---replay',
      tooltip: 'OBS Studio - Replay',
      icon: 'replay',
      inputs: 0,
      outputs: 1,
      body: bodys.state(),
      update: functions.state
    },
    'inputs-obs-studio-replay': {
      type: 'obs-studio',
      title: 'Replay',
      help: 'obs-studio---replay',
      tooltip: 'OBS Studio - Replay',
      icon: 'replay',
      inputs: 1,
      outputs: 0,
      body: bodys.state_toggle(false),
      update: functions.state
    },
    'outputs-obs-studio-save-replay': {
      type: 'obs-studio',
      title: 'Save Replay',
      help: 'obs-studio---save-replay',
      tooltip: 'OBS Studio - Save Replay',
      icon: 'replay',
      inputs: 0,
      outputs: 1
    },
    'inputs-obs-studio-save-replay': {
      type: 'obs-studio',
      title: 'Save Replay',
      help: 'obs-studio---save-replay',
      tooltip: 'OBS Studio - Save Replay',
      icon: 'replay',
      inputs: 1,
      outputs: 0,
    },
    'inputs-obs-studio-set-text': {
      type: 'obs-studio',
      title: 'Set Text',
      help: 'obs-studio---set-text',
      tooltip: 'OBS Studio - Set Text',
      icon: 'text',
      inputs: 1,
      outputs: 0,
      body: bodys.select('Source name', 'source') + bodys.text('Text'),
      register: [['obs-studio', 'GetSources'], ['obs-studio', 'SceneListChanged']],
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        if (receive && Array.isArray(receive_data)) {
          for (let i = (receive_data.length - 1); i >= 0; --i) {
            if (!receive_data[i].inputKind || receive_data[i].inputKind.indexOf('text_gdiplus')) {
              receive_data.splice(i, 1);
            }
          }
        }
      }, functions.source_filter]
    },
    'outputs-obs-studio-source-selected': {
      type: 'obs-studio',
      title: 'Source Selected',
      help: 'obs-studio---source-selected',
      tooltip: 'OBS Studio - Source Selected',
      icon: 'selected',
      inputs: 0,
      outputs: 1,
      body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source'),
      register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
      update: functions.scene_source
    },
    'outputs-obs-studio-streaming': {
      type: 'obs-studio',
      title: 'Streaming',
      help: 'obs-studio---streaming',
      tooltip: 'OBS Studio - Streaming',
      icon: 'streaming',
      inputs: 0,
      outputs: 1,
      body: bodys.state(),
      update: functions.state
    },
    'inputs-obs-studio-streaming': {
      type: 'obs-studio',
      title: 'Streaming',
      help: 'obs-studio---streaming',
      tooltip: 'OBS Studio - Streaming',
      icon: 'streaming',
      inputs: 1,
      outputs: 0,
      body: bodys.state_toggle(false),
      update: functions.state
    },
    'outputs-obs-studio-switch-scene': {
      type: 'obs-studio',
      title: 'Switch Scene',
      help: 'obs-studio---switch-scene',
      tooltip: 'OBS Studio - Switch Scene',
      icon: 'shuffle',
      inputs: 0,
      outputs: 1,
      body: bodys.select('Scene name', 'scene'),
      register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
      update: functions.scene_source
    },
    'inputs-obs-studio-switch-scene': {
      type: 'obs-studio',
      title: 'Switch Scene',
      help: 'obs-studio---switch-scene',
      tooltip: 'OBS Studio - Switch Scene',
      icon: 'shuffle',
      inputs: 1,
      outputs: 0,
      body: bodys.select('Scene name', 'scene'),
      register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
      update: functions.scene_source
    },
    'outputs-obs-studio-toggle-filter': {
      type: 'obs-studio',
      title: 'Toggle Filter',
      help: 'obs-studio---toggle-filter',
      tooltip: 'OBS Studio - Toggle Filter',
      icon: 'toggle',
      inputs: 0,
      outputs: 1,
      body: bodys.select('Source name', 'source') + bodys.select('Filter name', 'filter') + bodys.state(false, false, 'Show', 'Hide'),
      register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
      update: [ (id, elem, data, set_data, receive, receive_data) => {
        functions.source_filter(id, elem, data, set_data, receive, receive_data, true);
      }, functions.state ]
    },
    'inputs-obs-studio-toggle-filter': {
      type: 'obs-studio',
      title: 'Toggle Filter',
      help: 'obs-studio---toggle-filter',
      tooltip: 'OBS Studio - Toggle Filter',
      icon: 'toggle',
      inputs: 1,
      outputs: 0,
      body: bodys.select('Source name', 'source') + bodys.select('Filter name', 'filter') + bodys.state_toggle(false, false, 'Show', 'Hide'),
      register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
      update: [ (id, elem, data, set_data, receive, receive_data) => {
        functions.source_filter(id, elem, data, set_data, receive, receive_data, true);
      }, functions.state ]
    },
    'outputs-obs-studio-toggle-source': {
      type: 'obs-studio',
      title: 'Toggle Source',
      help: 'obs-studio---toggle-source',
      tooltip: 'OBS Studio - Toggle Source',
      icon: 'toggle',
      inputs: 0,
      outputs: 1,
      body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source') + bodys.state(false, false, 'Show', 'Hide'),
      register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
      update: [ functions.scene_source, functions.state ]
    },
    'inputs-obs-studio-toggle-source': {
      type: 'obs-studio',
      title: 'Toggle Source',
      help: 'obs-studio---toggle-source',
      tooltip: 'OBS Studio - Toggle Source',
      icon: 'toggle',
      inputs: 1,
      outputs: 0,
      body: bodys.select('Scene name', 'scene') + bodys.select('Source name', 'source') + bodys.state_toggle(false, false, 'Show', 'Hide'),
      register: [['obs-studio', 'GetScenes'], ['obs-studio', 'SceneListChanged']],
      update: [ functions.scene_source, functions.state ]
    },
    'outputs-obs-studio-virtualcam': {
      type: 'obs-studio',
      title: 'Virtual Camera',
      help: 'obs-studio---virtual-camera',
      tooltip: 'OBS Studio - Virtual Camera',
      icon: 'virtual-camera',
      inputs: 0,
      outputs: 1,
      body: bodys.state(),
      update: functions.state
    },
    'inputs-obs-studio-virtualcam': {
      type: 'obs-studio',
      title: 'Virtual Camera',
      help: 'obs-studio---virtual-camera',
      tooltip: 'OBS Studio - Virtual Camera',
      icon: 'virtual-camera',
      inputs: 1,
      outputs: 0,
      body: bodys.state_toggle(false),
      update: functions.state
    },
    'inputs-spotify-add-to-queue': {
      type: 'spotify',
      title: 'Add To Queue',
      help: 'spotify---add-to-queue',
      tooltip: 'Spotify - Add To Queue',
      icon: 'add',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Track'),
      update: functions.trim
    },
    'inputs-spotify-play-pause': {
      type: 'spotify',
      title: 'Play/Pause',
      help: 'spotify---playpause',
      tooltip: 'Spotify - Play/Pause',
      icon: 'play',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Track') + bodys.state_toggle(false, false, 'Play', 'Pause', 'Toggle'),
      update: [ functions.trim, functions.state ]
    },
    'inputs-spotify-prev-next': {
      type: 'spotify',
      title: 'Prev/Next',
      help: 'spotify---prevnext',
      tooltip: 'Spotify - Prev/Next',
      icon: 'next',
      inputs: 1,
      outputs: 0,
      body: bodys.state(false, false, 'Previous', 'Next'),
      update: functions.state
    },
    'inputs-spotify-repeat': {
      type: 'spotify',
      title: 'Repeat',
      help: 'spotify---repeat',
      tooltip: 'Spotify - Repeat',
      icon: 'repeat',
      inputs: 1,
      outputs: 0,
      body: bodys.state_toggle(false, false, 'Off', 'Context', 'Track'),
      update: functions.state
    },
    'both-spotify-search': {
      type: 'spotify',
      title: 'Search',
      help: 'spotify---search',
      tooltip: 'Spotify - Search',
      icon: 'search',
      inputs: 1,
      outputs: 1,
      body: bodys.text('Track'),
      update: functions.trim
    },
    'inputs-spotify-shuffle': {
      type: 'spotify',
      title: 'Shuffle',
      help: 'spotify---shuffle',
      tooltip: 'Spotify - Shuffle',
      icon: 'shuffle',
      inputs: 1,
      outputs: 0,
      body: bodys.state_toggle(false, false, 'On', 'Off', 'Toggle'),
      update: functions.state
    },
    'inputs-spotify-volume': {
      type: 'spotify',
      title: 'Volume',
      help: 'spotify---volume',
      tooltip: 'Spotify - Volume',
      icon: 'volume',
      inputs: 1,
      outputs: 0,
      body: bodys.number('Volume', false, 100, 1, 0, 100),
      update: (id, elem, data, set_data, receive, receive_data) => {
        functions.number(id, elem, data, set_data, receive, receive_data, 'volume', 0, 100);
      }
    },
    'outputs-twitch-action': {
      type: 'twitch',
      title: 'Action',
      help: 'twitch---action',
      tooltip: 'Twitch - Action',
      icon: 'action',
      inputs: 0,
      outputs: 1,
      body: bodys.text('Message') + bodys.match + bodys.viewers(),
      update: functions.trim
    },
    'inputs-twitch-action': {
      type: 'twitch',
      title: 'Action',
      help: 'twitch---action',
      tooltip: 'Twitch - Action',
      icon: 'action',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Message'),
      update: functions.trim
    },
    'outputs-twitch-announcement': {
      type: 'twitch',
      title: 'Announcement',
      help: 'twitch---announce',
      tooltip: 'Twitch - Announcement',
      icon: 'announce',
      inputs: 0,
      outputs: 1,
      body: bodys.text('Message') + bodys.match + bodys.viewers(),
      update: functions.trim
    },
    'inputs-twitch-announce': {
      type: 'twitch',
      title: 'Announce',
      help: 'twitch---announce',
      tooltip: 'Twitch - Announce',
      icon: 'announce',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Message'),
      update: functions.trim
    },
    'outputs-twitch-ban': {
      type: 'twitch',
      title: 'Ban',
      help: 'twitch---ban',
      tooltip: 'Twitch - Ban',
      icon: 'ban',
      inputs: 0,
      outputs: 1
    },
    'inputs-twitch-ban': {
      type: 'twitch',
      title: 'Ban',
      help: 'twitch---ban',
      tooltip: 'Twitch - Ban',
      icon: 'ban',
      inputs: 1,
      outputs: 0,
      body: bodys.text('User') + bodys.text('Reason'),
      update: functions.trim
    },
    'outputs-twitch-chat-clear': {
      type: 'twitch',
      title: 'Chat Clear',
      help: 'twitch---chat-clear',
      tooltip: 'Twitch - Chat Clear',
      icon: 'chat-clear',
      inputs: 0,
      outputs: 1
    },
    'inputs-twitch-chat-clear': {
      type: 'twitch',
      title: 'Chat Clear',
      help: 'twitch---chat-clear',
      tooltip: 'Twitch - Chat Clear',
      icon: 'chat-clear',
      inputs: 1,
      outputs: 0
    },
    'outputs-twitch-cheer': {
      type: 'twitch',
      title: 'Cheer',
      help: 'twitch---cheer',
      tooltip: 'Twitch - Cheer',
      icon: 'crystals',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-command': {
      type: 'twitch',
      title: 'Command',
      help: 'twitch---command',
      tooltip: 'Twitch - Command',
      icon: 'command',
      inputs: 0,
      outputs: 1,
      body: bodys.command + bodys.viewers(),
      update: functions.trim
    },
    'outputs-twitch-community-pay-forward': {
      type: 'twitch',
      title: 'Community Pay Forward',
      help: 'twitch---community-pay-forward',
      tooltip: 'Twitch - Community Pay Forward',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-community-sub': {
      type: 'twitch',
      title: 'Community Sub',
      help: 'twitch---community-sub',
      tooltip: 'Twitch - Community Sub',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'inputs-twitch-delete-message': {
      type: 'twitch',
      title: 'Delete Message',
      help: 'twitch---delete-message',
      tooltip: 'Twitch - Delete Message',
      icon: 'message',
      inputs: 1,
      outputs: 0,
      body: bodys.state('Type', false, 'All', 'By variable'),
      update: (id, elem, data, set_data, receive, receive_data) => {
        functions.state(id, elem, data, set_data, receive, receive_data, 'type');
      }
    },
    'outputs-twitch-emote-only': {
      type: 'twitch',
      title: 'Emote Only',
      help: 'twitch---emote-only',
      tooltip: 'Twitch - Emote Only',
      icon: 'emotes',
      inputs: 0,
      outputs: 1,
      body: bodys.state_toggle(false, false, 'On', 'Off', 'Both'),
      update: functions.state
    },
    'inputs-twitch-emote-only': {
      type: 'twitch',
      title: 'Emote Only',
      help: 'twitch---emote-only',
      tooltip: 'Twitch - Emote Only',
      icon: 'emotes',
      inputs: 1,
      outputs: 0,
      body: bodys.state(false, false, 'On', 'Off'),
      update: functions.state
    },
    'outputs-twitch-first-message': {
      type: 'twitch',
      title: 'First Message',
      help: 'twitch---first-message',
      tooltip: 'Twitch - First Message',
      icon: 'first',
      inputs: 0,
      outputs: 1,
      body: bodys.command + bodys.text('Message') + bodys.state('Type', false, 'Command', 'Message') + bodys.select('For all viewers', 'all', ['false', 'true'], false, true) + bodys.match + bodys.viewers(),
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        const change_state = state => {
          const names = ['command', 'message'];
          state = names[state ? 0 : 1];

          for (const input of elem.querySelectorAll(`input[name="command"], input[name="message"]`)) {
            const name = input.getAttribute('name'),
              elem = level_elem(input);

            elem.previousElementSibling.style.display = ((name === state) ? 'block' : 'none');
            elem.style.display = (name === state) ? 'block' : 'none';
          }

          const is_command = (state === 'command');
          elem.querySelector('[name="case"]').disabled = is_command;
          elem.querySelector('[name="contains"]').disabled = is_command;
        };

        functions.state(id, elem, data, set_data, receive, receive_data, 'type', change_state);
        functions.select(id, elem, data, set_data, receive, receive_data, 'all');
      }]
    },
    'outputs-twitch-follow': {
      type: 'twitch',
      title: 'Follow',
      help: 'twitch---follow',
      tooltip: 'Twitch - Follow',
      icon: 'follow',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-followers-only': {
      type: 'twitch',
      title: 'Followers Only',
      help: 'twitch---followers-only',
      tooltip: 'Twitch - Followers Only',
      icon: 'follow',
      inputs: 0,
      outputs: 1,
      body: bodys.state_toggle(false, false, 'On', 'Off', 'Both'),
      update: functions.state
    },
    'inputs-twitch-followers-only': {
      type: 'twitch',
      title: 'Followers Only',
      help: 'twitch---followers-only',
      tooltip: 'Twitch - Followers Only',
      icon: 'follow',
      inputs: 1,
      outputs: 0,
      body: bodys.state(false, false, 'On', 'Off'),
      update: functions.state
    },
    'both-twitch-game': {
      type: 'twitch',
      title: 'Game',
      help: 'twitch---game',
      tooltip: 'Twitch - Game',
      icon: 'game',
      inputs: 1,
      outputs: 1,
      body: bodys.text('Game'),
      update: functions.trim
    },
    'outputs-twitch-gift-paid-upgrade': {
      type: 'twitch',
      title: 'Gift Paid Upgrade',
      help: 'twitch---gift-paid-upgrade',
      tooltip: 'Twitch - Gift Paid Upgrade',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-host': {
      type: 'twitch',
      title: 'Host',
      help: 'twitch---host',
      tooltip: 'Twitch - Host',
      icon: 'host',
      inputs: 0,
      outputs: 1,
      body: bodys.text('Channel'),
      update: functions.trim
    },
    'inputs-twitch-host': {
      type: 'twitch',
      title: 'Host',
      help: 'twitch---host',
      tooltip: 'Twitch - Host',
      icon: 'host',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Channel'),
      update: functions.trim
    },
    'outputs-twitch-hosted': {
      type: 'twitch',
      title: 'Hosted',
      help: 'twitch---hosted',
      tooltip: 'Twitch - Hosted',
      icon: 'host',
      inputs: 0,
      outputs: 1,
      body: bodys.text('Channel'),
      update: functions.trim
    },
    'outputs-twitch-info': {
      type: 'twitch',
      title: 'Info',
      help: 'twitch---info',
      tooltip: 'Twitch - Info',
      icon: 'info',
      inputs: 0,
      outputs: 1
    },
    'both-twitch-info': {
      type: 'twitch',
      title: 'Info',
      help: 'twitch---info',
      tooltip: 'Twitch - Info',
      icon: 'info',
      inputs: 1,
      outputs: 1,
      body: bodys.text('Channel'),
      update: functions.trim
    },
    'inputs-twitch-info': {
      type: 'twitch',
      title: 'Info',
      help: 'twitch---info',
      tooltip: 'Twitch - Info',
      icon: 'info',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Status') + bodys.text('Game'),
      update: functions.trim
    },
    'outputs-twitch-message': {
      type: 'twitch',
      title: 'Message',
      help: 'twitch---message',
      tooltip: 'Twitch - Message',
      icon: 'message',
      inputs: 0,
      outputs: 1,
      body: bodys.text('Message') + bodys.match + bodys.viewers(),
      update: functions.trim
    },
    'inputs-twitch-message': {
      type: 'twitch',
      title: 'Message',
      help: 'twitch---message',
      tooltip: 'Twitch - Message',
      icon: 'message',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Message'),
      update: functions.trim
    },
    'inputs-twitch-message-delay': {
      type: 'twitch',
      title: 'Message Delay',
      help: 'twitch---message-delay',
      tooltip: 'Twitch - Message Delay',
      icon: 'slow',
      inputs: 1,
      outputs: 0,
      body: bodys.number('Delay', false, 5, 1, 1, 100) + bodys.state(false, false, 'On', 'Off'),
      update: [functions.state, (id, elem, data, set_data, receive, receive_data) => {
        functions.number(id, elem, data, set_data, receive, receive_data, 'delay', 1);
      }]
    },
    'outputs-twitch-message-remove': {
      type: 'twitch',
      title: 'Message Remove',
      help: 'twitch---message-remove',
      tooltip: 'Twitch - Message Remove',
      icon: 'message-remove',
      inputs: 0,
      outputs: 1,
      body: bodys.text('Message') + bodys.match + bodys.viewers(),
      update: functions.trim
    },
    'outputs-twitch-prime-community-gift': {
      type: 'twitch',
      title: 'Prime Community Gift',
      help: 'twitch---prime-community-gift',
      tooltip: 'Twitch - Prime Community Gift',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-prime-paid-upgrade': {
      type: 'twitch',
      title: 'Prime Paid Upgrade',
      help: 'twitch---prime-paid-upgrade',
      tooltip: 'Twitch - Prime Paid Upgrade',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-raid': {
      type: 'twitch',
      title: 'Raid',
      help: 'twitch---raid',
      tooltip: 'Twitch - Raid',
      icon: 'raid',
      inputs: 0,
      outputs: 1,
      body: bodys.text('Channel'),
      update: functions.trim
    },
    'inputs-twitch-raid': {
      type: 'twitch',
      title: 'Raid',
      help: 'twitch---raid',
      tooltip: 'Twitch - Raid',
      icon: 'raid',
      inputs: 1,
      outputs: 0,
      body: bodys.text('Channel'),
      update: functions.trim
    },
    'outputs-twitch-raid-cancel': {
      type: 'twitch',
      title: 'Raid Cancel',
      help: 'twitch---raid-cancel',
      tooltip: 'Twitch - Raid Cancel',
      icon: 'raid-cancel',
      inputs: 0,
      outputs: 1
    },
    'inputs-twitch-raid-cancel': {
      type: 'twitch',
      title: 'Raid Cancel',
      help: 'twitch---raid-cancel',
      tooltip: 'Twitch - Raid Cancel',
      icon: 'raid-cancel',
      inputs: 1,
      outputs: 0
    },
    'outputs-twitch-redemption': {
      type: 'twitch',
      title: 'Redemption',
      help: 'twitch---redemption',
      tooltip: 'Twitch - Redemption',
      icon: 'redemption',
      inputs: 0,
      outputs: 1,
      body: bodys.select('Reward'),
      register: [['twitch', 'getAllRewards']],
      update: (id, elem, data, set_data, receive, receive_data) => {
        const select = elem.querySelector('select');
        if (!select.children.length) {
          if (receive || global_datas.rewards) {
            if (Array.isArray(receive_data) && receive_data.length) {
              global_datas.rewards = receive_data;
            }

            const selected = select.value || data.reward;

            select.innerHTML = '';
            select.appendChild(document.createElement('option'));

            let names = [];
            for (const reward of global_datas.rewards) {
              names.push(reward.id);

              const option = document.createElement('option');
              option.value = reward.id;
              option.innerText = reward.title;
              select.appendChild(option);
            }

            if (selected && names.indexOf(selected) < 0) {
              const option = document.createElement('option');
              option.classList.add('disabled');
              option.value = selected;
              option.innerText = 'Not Found';

              select.appendChild(option);
            }

            select.value = selected;
          } else if (!receive) {
            request(id, 'twitch', 'getAllRewards', { type: 'Methods:convert', args: [ false, false ] });
          }
        }
      }
    },
    'outputs-twitch-reward-gift': {
      type: 'twitch',
      title: 'Reward Gift',
      help: 'twitch---reward-gift',
      tooltip: 'Twitch - Reward Gift',
      icon: 'reward-gift',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-ritual': {
      type: 'twitch',
      title: 'Ritual',
      help: 'twitch---ritual',
      tooltip: 'Twitch - Ritual',
      icon: 'ritual',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-slow': {
      type: 'twitch',
      title: 'Slow Mode',
      help: 'twitch---slow-mode',
      tooltip: 'Twitch - Slow Mode',
      icon: 'slow',
      inputs: 0,
      outputs: 1,
      body: bodys.state_toggle(false, false, 'On', 'Off', 'Both'),
      update: functions.state
    },
    'inputs-twitch-slow': {
      type: 'twitch',
      title: 'Slow Mode',
      help: 'twitch---slow-mode',
      tooltip: 'Twitch - Slow Mode',
      icon: 'slow',
      inputs: 1,
      outputs: 0,
      body: bodys.number('Delay', false, 5, 1, 1, 100) + bodys.state(false, false, 'On', 'Off'),
      update: [functions.state, (id, elem, data, set_data, receive, receive_data) => {
        functions.number(id, elem, data, set_data, receive, receive_data, 'delay', 1);
      }]
    },
    'outputs-twitch-standard-pay-forward': {
      type: 'twitch',
      title: 'Standard Pay Forward',
      help: 'twitch---standard-pay-forward',
      tooltip: 'Twitch - Standard Pay Forward',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-sub': {
      type: 'twitch',
      title: 'Subscribe',
      help: 'twitch---subscribe',
      tooltip: 'Twitch - Subscribe',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-resub': {
      type: 'twitch',
      title: 'Subscribe Again',
      help: 'twitch---subscribe-again',
      tooltip: 'Twitch - Subscribe Again',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-sub-extend': {
      type: 'twitch',
      title: 'Subscribe Extend',
      help: 'twitch---subscribe-extend',
      tooltip: 'Twitch - Subscribe Extend',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-sub-gift': {
      type: 'twitch',
      title: 'Subscribe Gift',
      help: 'twitch---subscribe-gift',
      tooltip: 'Twitch - Subscribe Gift',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1
    },
    'outputs-twitch-subs-only': {
      type: 'twitch',
      title: 'Subscribers Only',
      help: 'twitch---subscribers-only',
      tooltip: 'Twitch - Subscribers Only',
      icon: 'subscribers',
      inputs: 0,
      outputs: 1,
      body: bodys.state_toggle(false, false, 'On', 'Off', 'Both'),
      update: functions.state
    },
    'inputs-twitch-subs-only': {
      type: 'twitch',
      title: 'Subscribers Only',
      help: 'twitch---subscribers-only',
      tooltip: 'Twitch - Subscribers Only',
      icon: 'subscribers',
      inputs: 1,
      outputs: 0,
      body: bodys.state(false, false, 'On', 'Off'),
      update: functions.state
    },
    'outputs-twitch-timeout': {
      type: 'twitch',
      title: 'Timeout',
      help: 'twitch---timeout',
      tooltip: 'Twitch - Timeout',
      icon: 'timeout',
      inputs: 0,
      outputs: 1
    },
    'inputs-twitch-timeout': {
      type: 'twitch',
      title: 'Timeout',
      help: 'twitch---timeout',
      tooltip: 'Twitch - Timeout',
      icon: 'timeout',
      inputs: 1,
      outputs: 0,
      body: bodys.text('User') + bodys.text('Reason') + bodys.number('Duration', false, 300, 10),
      update: [functions.trim, (id, elem, data, set_data, receive, receive_data) => {
        functions.number(id, elem, data, set_data, receive, receive_data, 'duration', 1);
      }]
    },
    'outputs-twitch-unhost': {
      type: 'twitch',
      title: 'Unhost',
      help: 'twitch---unhost',
      tooltip: 'Twitch - Unhost',
      icon: 'unhost',
      inputs: 0,
      outputs: 1
    },
    'inputs-twitch-unhost': {
      type: 'twitch',
      title: 'Unhost',
      help: 'twitch---unhost',
      tooltip: 'Twitch - Unhost',
      icon: 'unhost',
      inputs: 1,
      outputs: 0
    },
    'outputs-twitch-unique-message': {
      type: 'twitch',
      title: 'Unique Message',
      help: 'twitch---unique-message',
      tooltip: 'Twitch - Unique Message',
      icon: 'message',
      inputs: 0,
      outputs: 1,
      body: bodys.state_toggle(false, false, 'On', 'Off', 'Both'),
      update: functions.state
    },
    'inputs-twitch-unique-message': {
      type: 'twitch',
      title: 'Unique Message',
      help: 'twitch---unique-message',
      tooltip: 'Twitch - Unique Message',
      icon: 'message',
      inputs: 1,
      outputs: 0,
      body: bodys.state(false, false, 'On', 'Off'),
      update: functions.state
    },
    'outputs-twitch-whisper': {
      type: 'twitch',
      title: 'Whisper',
      help: 'twitch---whisper',
      tooltip: 'Twitch - Whisper',
      icon: 'whisper',
      inputs: 0,
      outputs: 1,
      body: bodys.text('Message') + bodys.match,
      update: functions.trim
    },
    'inputs-twitch-whisper': {
      type: 'twitch',
      title: 'Whisper',
      help: 'twitch---whisper',
      tooltip: 'Twitch - Whisper',
      icon: 'whisper',
      inputs: 1,
      outputs: 0,
      body: bodys.text('User') + bodys.text('Message'),
      update: functions.trim
    },
  };

  function drawflow_initializer(actions) {
    if (typeof actions[editor.module] === 'object') {
      const nodes = actions[editor.module].data;
      for (const id in nodes) {
        init_node(nodes[id]);
      }
    }
  }

  function drawflow_save() {
    window.parent.postMessage({ save: editor.export().drawflow }, '*');
  }

  function drawflow_select() {
    const selector = document.querySelector('.modules');

    selector.innerHTML = '';
    for (const name in editor.drawflow.drawflow) {
      const option = document.createElement('option');
      option.value = name;
      option.innerText = name;
      selector.appendChild(option);
    }

    const current = editor.module;
    let module_name = current;
    if (!current || typeof editor.drawflow.drawflow[current] === 'undefined') {
      module_name = Object.keys(editor.drawflow.drawflow)[0];
    }

    selector.value = module_name;
    if (module_name !== current) {
      editor.changeModule(module_name);
    }
  }

  function drawflow_receiver(source, id, name, data) {
    try {
      for (const i in editor.drawflow.drawflow[editor.module].data) {
        const node = get_node(i),
          block = blocks[node.data.type];

        if ((source === false || node.id === source) && typeof block !== 'undefined' && Array.isArray(block.register)) {
          let check = false;
          for (const item of block.register) {
            check = check || (item[0] === id && item[1] === name);
          }

          if (check) {
            if (block.update) {
              for (const update of (Array.isArray(block.update) ? block.update : [block.update])) {
                update(node.id, node.elem, node.data.data, _data => set_data(node.id, _data), true, data);
              }
            }
          }
        }
      }
    }
    catch (e) {}
  }

  for (const name in blocks) {
    const block_data = blocks[name],
      block_icon = `./icons/${block_data.icon}.png`,
      block = document.querySelector('#template .block-drawflow').cloneNode(true),
      button = document.querySelector('#template .drag-drawflow').cloneNode(true),
      title = block.querySelector('.title-box span'),
      icon = block.querySelector('.title-box img'),
      body = block.querySelector('.box');

    block.classList.toggle('is-inputs', block_data.inputs);
    block.classList.toggle('is-outputs', block_data.outputs);

    icon.setAttribute('src', block_icon);
    icon.addEventListener('error', () => {
      const block_icon = `./icons/empty.png`;
      icon.setAttribute('src', block_icon);
      button.querySelector('.icon img').setAttribute('src', block_icon);
    }, false);

    title.innerHTML = block_data.title;
    if (block_data.tooltip) {
      title.parentElement.setAttribute('title', block_data.tooltip);
    }

    if (block_data.content) {
      block.innerHTML = block_data.content;
    } else if (!block_data.body) {
      block.classList.add('no-box');
      body.remove();
    } else {
      body.innerHTML = block_data.body;
    }

    editor.registerNode(name, block);

    let type = name.split('-')[0];
    if (['event', 'trigger'].indexOf(type) < 0) {
      type = 'fonctionnality';
    }

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
    if (options_target && !event.target.closest('.drawflow-options')) {
      options.style.display = 'none';
    }

    if (event.target.closest('.block-drawflow .title-box .fa-caret-down')) {
      event.stopPropagation();

      const node = get_node(event.target);
      options_toggle.querySelector('.far, .fas').classList.add((typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled) ? 'fas' : 'far');
      options_toggle.querySelector('.far, .fas').classList.remove((typeof node.data.data.enabled !== 'boolean' || node.data.data.enabled) ? 'far' : 'fas');
      if (!Object.keys(node.inputs).length) {
        options_export.style.removeProperty('display');
      } else {
        options_export.style.display = 'none';
      }

      options.style.top = `${event.clientY}px`;
      options.style.left = `${event.clientX}px`;
      options.style.display = 'block';

      options_target = node;
    } else if (event.target.closest('[id^="node-"] input')) {
      event.stopPropagation();
    }
  }, true);
  options_toggle.addEventListener('click', event => {
    const node = options_target;
    node.data.data.enabled = (typeof node.data.data.enabled !== 'boolean') ? false : !node.data.data.enabled;
    node.elem.classList.toggle('disabled', !node.data.data.enabled);
    set_data(node.id, node.data.data);

    request(node.id, 'multi-actions', 'toggle-block', { id: node.id, module: editor.module, enabled: node.data.data.enabled });

    options.style.display = 'none';
  }, false);
  options_test.addEventListener('click', event => {
    const node = options_target;
    if (typeof node.inputs.input_1 !== 'undefined') {
      window.parent.postMessage({ test: [editor.module, node.id] }, '*');
    } else if (typeof node.outputs.output_1 !== 'undefined') {
      for (const connection of node.outputs.output_1.connections) {
        window.parent.postMessage({ test: [editor.module, parseInt(connection.node)] }, '*');
      }
    }

    options.style.display = 'none';
  }, false);
  options_select.addEventListener('click', event => {
    const node = options_target,
      select_connections = (node, selected) => {
        if (!node) {
          return;
        } else if (typeof selected === 'undefined') {
          selected = [];
        }

        let outputs = [];
        if (typeof node.outputs.output_1 !== 'undefined') {
          for (const connection of node.outputs.output_1.connections) {
            outputs.push(parseInt(connection.node));
          }
        }

        let inputs = [];
        if (typeof node.inputs.input_1 !== 'undefined') {
          for (const connection of node.inputs.input_1.connections) {
            inputs.push(parseInt(connection.node));
          }
        }

        selected.push(node.id);
        multi_selection[node.id] = get_node(node.id);
        node.elem.classList.add('selected');
        for (const id of outputs.concat(inputs)) {
          if (id !== node.id && selected.indexOf(id) < 0) {
            select_connections(get_node(id), selected);
          }
        }
      };

    select_connections(node);

    options.style.display = 'none';
  }, false);
  options_delete.addEventListener('click', event => {
    const node = options_target,
      elem = document.querySelector('div.delete-blocks');

    elem.classList.add('is-active');
    elem.querySelector('.block-name').innerText = node.title;

    options.style.display = 'none';
  }, false);
  options_export.addEventListener('click', event => {
    options.style.display = 'none';
  }, false);
  options_export.querySelector('input').addEventListener('change', event => {
    window.parent.postMessage({ export: { path: event.target.value, data: JSON.stringify(export_nodes(options_target.id)) } }, '*');
  }, false);
  button_export.addEventListener('change', event => {
    window.parent.postMessage({ export: { path: event.target.value, data: JSON.stringify(export_module(editor.module)) } }, '*');
  }, false);
  button_import.addEventListener('change', event => {
    window.parent.postMessage({ import: { path: event.target.value } }, '*');
  }, false);

  document.querySelector('div.delete-blocks .is-success').addEventListener('click', event => {
    const node = options_target,
      modal = event.target.closest('.modal'),
      delete_connections = node => {
        if (!node) {
          return;
        }

        let outputs = [];
        if (typeof node.outputs.output_1 !== 'undefined') {
          for (const connection of node.outputs.output_1.connections) {
            outputs.push(parseInt(connection.node));
          }
        }

        let inputs = [];
        if (typeof node.inputs.input_1 !== 'undefined') {
          for (const connection of node.inputs.input_1.connections) {
            inputs.push(parseInt(connection.node));
          }
        }

        editor.removeNodeId(`node-${node.id}`);
        for (const id of outputs.concat(inputs)) {
          if (id !== node.id) {
            delete_connections(get_node(id));
          }
        }
      };

    modal.classList.remove('is-active');

    delete_connections(node);
  });

  function get_block(name) {
    if (typeof blocks[name] !== 'undefined') {
      return Object.assign({}, blocks[name]);
    }
  }

  function block_exists(name) {
    return typeof blocks[name] !== 'undefined';
  }

  function filter_nodes(nodes) {
    let _nodes = {};
    for (const id in nodes) {
      const action = nodes[id];
      if (window.block_exists(action.html)) {
        _nodes[id] = action;
      }
    }

    for (const id in _nodes) {
      const action = _nodes[id];
      for (const ckey of ['inputs', 'outputs']) {
        for (const cskey of Object.keys(action[ckey])) {
          const connections = action[ckey][cskey].connections;
          for (let c = (connections.length - 1); c >= 0; --c) {
            const connection = connections[c];
            if (typeof _nodes[parseInt(connection.node)] === 'undefined') {
              connections.splice(c, 1);
            }
          }
        }
      }
    }

    return _nodes;
  }

  function reindex_nodes(nodes) {
    let keys = Object.keys(nodes);
    keys.sort((a, b) => parseInt(a) - parseInt(b));

    let sort_nodes = {};
    for (let i = 0; i < keys.length; ++i) {
      const id = i + 1,
        key = parseInt(keys[i]);

      nodes[key].id = id;
      nodes[key].name = `${id}.${nodes[key].html}`;
      nodes[key].data.id = id;
      for (const ckey of ['inputs', 'outputs']) {
        for (const cskey of Object.keys(nodes[key][ckey])) {
          const connections = nodes[key][ckey][cskey].connections;
          for (let c = (connections.length - 1); c >= 0; --c) {
            connections[c].node = (keys.indexOf(connections[c].node) + 1).toString();
          }
        }
      }

      sort_nodes[id] = nodes[key];
    }

    return sort_nodes;
  }

  function export_module(module_name) {
    let nodes = {};
    for (const id in editor.drawflow.drawflow[module_name].data) {
      nodes = export_nodes(id, nodes);
    }

    return reindex_nodes(nodes);
  }

  function export_nodes(id, nodes) {
    const reindex = !nodes;

    nodes = nodes || {};
    if (typeof nodes[id] === 'undefined') {
      let copy = {};

      const node = get_node(id);
      for (const key in node) {
        if (key === 'elem') {
          continue;
        }

        if (typeof node[key] === 'object') {
          copy[key] = JSON.parse(JSON.stringify(node[key]));
        } else {
          copy[key] = node[key];
        }
      }

      nodes[id] = copy;
      for (const key of ['outputs', 'inputs']) {
        if (key === 'outputs' || (key === 'inputs' && !reindex)) {
          for (const skey of Object.keys(copy[key])) {
            const connections = copy[key][skey].connections;
            for (let c = (connections.length - 1); c >= 0; --c) {
              const cid = parseInt(connections[c].node);
              if (cid !== id && typeof nodes[cid] === 'undefined') {
                export_nodes(cid, nodes);
              }
            }
          }
        }
      }
    }

    if (reindex) {
      nodes = reindex_nodes(nodes);
    }

    return nodes;
  }

  function import_nodes(nodes) {
    const offset = {
      y: drawflow.offsetTop,
      x: drawflow.offsetLeft
    };

    let relations = {};
    for (const node of Object.values(nodes)) {
      const id = add_node(node.html, node.pos_x + offset.x, node.pos_y + offset.y, Object.assign({}, node.data.data));
      relations[node.id] = id;
    }

    for (const node of Object.values(nodes)) {
      for (const output of Object.keys(node.outputs)) {
        const connections = node.outputs[output].connections;
        for (let c = (connections.length - 1); c >= 0; --c) {
          const connection = connections[c];
          editor.addConnection(relations[node.id], relations[parseInt(connection.node)], output, connection.output);
        }
      }
    }
  }

  let double_click = 0;
  let node_selected = -1;
  const reset_selection = () => {
    node_selected = -1;
  };

  drawflow.addEventListener('click', event => {
    if (event.target.hasAttribute('contenteditable')) {
      editor.drag = false;
      event.target.focus();
    } else if (!event.target.closest('[id^="node-"]')) {
      for (const node of drawflow.querySelectorAll('[id^="node-"]')) {
        node.classList.remove('selected');
      }
    }
  }, true);
  drawflow.addEventListener('blur', event => {
    let check = false;
    for (const id in editor.drawflow.drawflow[editor.module].data) {
      const node = get_node(id);
      if (node && node.html === 'note') {
        const elem = node.elem.querySelector('[contenteditable]'),
          content = elem.innerText.trim();

        if (content.length) {
          window.getSelection().removeAllRanges();

          if (node.data.data.content !== content) {
            check = true;
            node.data.data.content = content;
            editor.updateNodeDataFromId(node.id, node.data);
          }
        } else {
          editor.removeNodeId(`node-${node.id}`);
        }
      }
    }

    if (check) {
      drawflow_save();
    }
  });

  editor.on('moduleChanged', () => {
    reset_selection();

    setTimeout(() => {
      document.querySelector('.export-blocks').setAttribute('browse-file-name', editor.module);
    }, 10);
  });
  editor.on('nodeUnselected', reset_selection);
  editor.on('nodeRemoved', reset_selection);
  editor.on('nodeSelected', id => {
    node_selected = parseInt(id);
  });
  editor.on('contextmenu', event => {
    const dbclick = double_click && (Date.now() - double_click) <= 250,
      duplicate = dbclick && node_selected >= 0;

    double_click = Date.now();
    if (duplicate) {
      const node = get_node(node_selected),
        type = node.html,
        pos_x = (typeof event.touches !== 'undefined') ? event.touches[0].clientX : event.clientX,
        pos_y = (typeof event.touches !== 'undefined') ? event.touches[0].clientY : event.clientY;

      setTimeout(() => {
        const id = add_node(type, pos_x, pos_y, Object.assign({}, node.data.data)),
          copy = get_node(id),
          delete_button = node.elem.querySelector('.drawflow-delete');

        if (delete_button) {
          delete_button.remove();
        }

        copy.elem.dispatchEvent(new Event('mousedown', { bubbles: true }));
        copy.elem.dispatchEvent(new Event('mouseup', { bubbles: true }));
      }, 10);
    } else if (dbclick) {
      const node = get_node(event.target);
      if (node && event.target.classList.contains('output')) {
        for (const output of Object.keys(node.outputs)) {
          if (event.target.classList.contains(output)) {
            const connections = node.outputs[output].connections;
            for (let c = (connections.length - 1); c >= 0; --c) {
              const connection = connections[c];
              editor.removeSingleConnection(node.id, parseInt(connection.node), output, connection.output);
            }

            break;
          }
        }
      } else if (node && event.target.classList.contains('input')) {
        for (const input of Object.keys(node.inputs)) {
          if (event.target.classList.contains(input)) {
            const connections = node.inputs[input].connections;
            for (let c = (connections.length - 1); c >= 0; --c) {
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
    if (node && node_selected !== node.id && event.target.closest('input, select')) {
      node_selected = node.id;
      node.elem.classList.add('selected');
    }

    if (!node || event.button || (typeof multi_selection[node.id] === 'undefined' && !event.shiftKey)) {
      for (const node of Object.values(multi_selection)) {
        if (node.id !== node_selected) {
          node.elem.classList.remove('selected');
        }
      }

      multi_selection = {};
    } else {
      if (typeof multi_selection[node.id] === 'undefined') {
        if (!multi_selection.length && node_selected >= 0) {
          multi_selection[node_selected] = get_node(node_selected);
        }
        multi_selection[node.id] = node;
      }

      multi_move = Object.assign({ move: false }, node);
    }
  }, true);
  document.addEventListener('mousemove', event => {
    if (multi_move) {
      if (!multi_move.move) {
        multi_move.move = true;

        for (const id in multi_selection) {
          multi_selection[id] = get_node(id);
        }
      }

      const origin = get_node(multi_move.id);
      const move = { pos_x: (multi_move.pos_x - origin.pos_x), pos_y: (multi_move.pos_y - origin.pos_y) };
      for (const node of Object.values(multi_selection)) {
        if (node.id !== node_selected) {
          move_node(node.id, (node.pos_x - move.pos_x), (node.pos_y - move.pos_y));
        }
      }
    }
  }, true);
  document.addEventListener('mouseup', event => {
    for (const node of Object.values(multi_selection)) {
      if (node.id !== node_selected) {
        editor.updateConnectionNodes(`node-${node.id}`);
      }
    }

    multi_move = false;
  });
  editor.on('nodeSelected', id => {
    for (const node of Object.values(multi_selection)) {
      node.elem.classList.add('selected');
    }
  });

  window.get_name = get_name;
  window.get_node = get_node;
  window.get_block = get_block;
  window.block_exists = block_exists;
  window.filter_nodes = filter_nodes;
  window.import_nodes = import_nodes;
  window.export_module = export_module;
  window.drawflow_save = drawflow_save;
  window.drawflow_select = drawflow_select;
  window.drawflow_receiver = drawflow_receiver;
  window.drawflow_initializer = drawflow_initializer;
});
