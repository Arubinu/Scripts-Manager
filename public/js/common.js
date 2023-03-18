function get_target(target = window._target) {
  const split = target.split(':');
  const [type, id, name] = [
    split[0],
    split[1],
    ((split.length > 2) ? split[2] : 'index')
  ];

  return { type, id, name, target };
}

function set_target(name, data, target) {
  target = target || window.get_target();

  if (typeof name === 'string') {
    target.name = name;
  }

  if (typeof name !== 'undefined') {
    target.data = data;
  }

  return target;
}

function add_ul(type, name, parent) {
  const li = document.createElement('li'),
    ul = document.createElement('ul');

  li.appendChild(ul);
  parent.appendChild(li);

  return ul;
}

function add_li(configs, type, id, name, parent) {
  const a = document.createElement('a'),
    li = document.createElement('li');

  a.innerText = name;
  a.setAttribute('data-target', `${type}:${id}`);
  li.appendChild(a);

  if (id.indexOf(':') < 0) {
    const label = document.createElement('label');
    label.setAttribute('for', `checkbox_${window._index}`);
    label.classList.add('switch');

    const checkbox = document.createElement('input');
    checkbox.setAttribute('type', 'checkbox');
    checkbox.setAttribute('id', `checkbox_${window._index}`);
    checkbox.checked = !!configs[type][id].default.enabled;

    const slider = document.createElement('div');
    slider.classList.add('slider', 'round');

    label.appendChild(checkbox);
    label.appendChild(slider);
    li.appendChild(label);

    ++window._index;
  }

  parent.appendChild(li);

  return li;
}

function load_manager() {
  window.send_message('manager', set_target('load'));
}

function load_iframe() {
  const iframe = document.querySelector('.content > iframe'),
    iframe_doc = iframe.contentWindow.document,
    config_script = iframe_doc.querySelector(`#config_script`),
    config_stylesheet = iframe_doc.querySelector(`#config_stylesheet`);

  // force show/hide content right margin
  setTimeout(() => {
    window.dispatchEvent(new Event('resize', { bubbles: true }));
  }, 1000);

  // global script
  if (config_script) {
    const path = window._internal ? `${window._data.asar || window._data.path}/public` : '';
    config_script.setAttribute('src', `${path}/js/shared.js`);
  }

  // global stylesheet
  if (config_stylesheet) {
    const path = window._internal ? `${window._data.asar || window._data.path}/public` : '';
    config_stylesheet.setAttribute('href', `${path}/css/shared.css`);
  }

  // get new target
  const target = set_target('show', true);

  // pages
  if (target.target === 'general:settings') {
    const browse = iframe_doc.querySelector('.browse input'),
      import_input = iframe_doc.querySelector('.import input'),
      export_input = iframe_doc.querySelector('.export input'),
      export_button = iframe_doc.querySelector('.export .button'),
      reset = iframe_doc.querySelector('.reset-app .is-success'),
      reload_dialog = iframe_doc.querySelector('div.reload-app'),
      reset_dialog = iframe_doc.querySelector('div.reset-app'),
      settings = Object.assign({
        all: browse.value,
        local: false,
        startup: false,
        systray: false
      }, (window._data.settings || {})),
      button_action = key => {
        const buttons = iframe_doc.querySelectorAll(`.${key} .button`),
          callback = event => {
            for (const button of buttons) {
              button.classList.remove('is-selected');
            }

            const on = event.target.getAttribute('name') === 'on';
            event.target.classList.add('is-selected');

            settings[key] = on;
            if (event.type !== 'update') {
              save_settings();
            }
          };

        for (const button of buttons) {
          button.addEventListener('click', callback, false);
          button.addEventListener('update', callback, false);
        }
      },
      get_save_target = () => {
        return set_target('save', { default: settings });
      },
      save_settings = () => {
        window.send_message('manager', get_save_target());
      };

    browse.addEventListener('update', () => {
      settings.all = browse.value;
    }, false);

    browse.addEventListener('change', () => {
      if (browse.value === settings.all) {
        return;
      }

      settings.all = browse.value;
      save_settings();
    }, false);

    button_action('local');
    button_action('startup');
    button_action('systray');

    import_input.addEventListener('change', event => {
      console.log('import change:', import_input.value);
      if (!import_input.value.indexOf('blob:')) {
        window.download_text(import_input.value)
          .then(data => {
            window.send_message('manager', set_target('import', data));
          });
      } else {
        window.send_message('manager', set_target('import', import_input.value));
      }
    }, false);

    export_button.addEventListener('click', event => {
      if (!window._internal) {
        event.stopPropagation();

        window.send_message('manager', set_target('export', false));
      }
    }, false);
    export_input.addEventListener('change', event => {
      window.send_message('manager', set_target('export', export_input.value));
    }, false);

    reset.addEventListener('click', () => {
      window.send_message('manager', set_target('reset'));
    }, false);

    iframe_doc.querySelectorAll('[aria-label="close"]').forEach(elem => {
      elem.addEventListener('click', () => {
        const modal = elem.closest('.modal');
        if (modal) {
          modal.classList.remove('is-active');
        }
      }, false);
    });

    iframe_doc.querySelector('.reset').addEventListener('click', () => {
      reset_dialog.classList.add('is-active');
    }, false);

    window.load_manager();
  } else if (target.target === 'general:about') {
    const this_version = iframe_doc.querySelector('.this-version');
    this_version.innerText = window._data.pkg.version + (window._data.mode === 'development' ? 'a' : '');
    this_version.parentElement.children[0].innerText = window._data.pkg.name;

    fetch('https://api.github.com/repos/Arubinu/Scripts-Manager/releases/latest')
      .then(async res => {
        const data = await res.json();
        if (data.tag_name !== `v${window._data.pkg.version}`) {
          const elem = iframe_doc.querySelector('.new-version');
          elem.classList.remove('is-hidden');
          elem.querySelector('span').innerText = data.tag_name.substring(1);
        }
      })
      .catch(() => {
        console.error('Impossible de récupérer les informations de mise à jour du projet!');
      });

    iframe_doc.querySelector('.node-version').innerText = window._data.versions.node;
    iframe_doc.querySelector('.chrome-version').innerText = window._data.versions.chrome;
    iframe_doc.querySelector('.electron-version').innerText = window._data.versions.electron;

    window.load_manager();
  }

  // open links in default browser and open dialog
  iframe_doc.addEventListener('click', event => {
    let elem = event.target.closest('[browse-file], [browse-file], [browse-folder], [external-link]');
    if (!elem) {
      elem = event.target;
    }

    if (elem.matches('[browse-file], [browse-files]')) {
      const type = (elem.hasAttribute('browse-file') ? 'file' : 'files'),
        data = {
          elem: elem.getAttribute(`browse-${type}`),
          name: elem.getAttribute(`browse-file-name`),
          ext: elem.getAttribute(`browse-file-ext`)
        };

      if (window._internal) {
        window.send_message('manager', set_target(`browse:${type}`, data));
      } else {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        if (data.ext) {
          input.setAttribute('accept', '.' + data.ext.split(',').join(',.'));
        }
        if (type === 'files') {
          input.setAttribute('multiple', '');
        }
        input.addEventListener('change', event => {
          if (type === 'files') {
            manager_conn(Object.assign(set_target(`browse:${type}`, data), { result: { filePaths: event.target.files } }));
          } else {
            manager_conn(Object.assign(set_target(`browse:${type}`, data), { result: { filePath: event.target.files[0] } }));
          }
        }, false);
        input.click();
      }
    } else if (elem.matches('[browse-folder]')) {
      const data = {
        elem: elem.getAttribute('browse-folder')
      };

      if (window._internal) {
        window.send_message('manager', set_target('browse:folder', data));
      } else {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('directory', '');
        input.addEventListener('change', event => {
          manager_conn(Object.assign(set_target('browse:folder', data), { result: { filePath: event.target.files[0] } }));
        }, false);
        input.click();
      }
    } else if (elem.matches('[external-link]')) {
      event.preventDefault();

      if (typeof window.open_link !== 'undefined') {
        return window.open_link(elem.getAttribute('external-link'));
      }

      const link = document.createElement('a');
      link.setAttribute('href', elem.getAttribute('external-link'));
    }
  }, false);

  // removes focus from buttons and links so as not to have the blue outline
  iframe_doc.addEventListener('mouseup', event => {
    if (!event.target.matches('input, select, textarea') && !event.target.closest('input, select, textarea')) {
      iframe.blur();
    }
  }, false);

  window.send_message('manager', target);
}

function update_state(target, data) {
  const elem = document.querySelector(`[data-target="${target}"]`);
  if (elem) {
    if (data) {
      elem.setAttribute('state', data);
    } else {
      elem.removeAttribute('state');
    }
  }
}

function manager_conn(data) {
  const iframe = document.querySelector('.content > iframe'),
    iframe_doc = iframe.contentWindow.document;

  if (data.name === 'enabled') {
    const elem = document.querySelector(`[data-target="${data.data.type}:${data.data.name}"]`);
    if (elem) {
      const state = elem.parentElement.querySelector('[type="checkbox"]').checked;
      if (data.data.state !== state) {
        elem.parentElement.querySelector('.slider').click();
      }
    }

    return;
  } else if (data.name === 'state') {
    return update_state(`${data.type}:${data.id}`, data.data);
  } else if (data.name === 'export') {
    window.text_to_file('settings.sms', data.data, 'application/json');
  } else if (data.name === 'reload' && get_target().target === 'general:settings') {
    const reload_dialog = iframe_doc.querySelector('div.reload-app');
    if (reload_dialog) {
      reload_dialog.classList.add('is-active');
    }

    return;
  }

  if (data.target === get_target().target) {
    if (data.name === 'load') {
      if (['general:about', 'general:settings'].indexOf(data.target) >= 0 && typeof data.data === 'object' && typeof data.data.default === 'object') {
        window._data.settings = data.data.default;
      }

      if (!window._internal && data.target === 'general:settings') {
        iframe_doc.querySelector('.browse [browse-folder]').parentElement.remove();
      }

      if (data.target === 'general:settings') {
        const check = typeof window._data.settings === 'object',
          browse = iframe_doc.querySelector('.browse input'),
          button_action = key => {
            const buttons = iframe_doc.querySelectorAll(`.${key} .button`),
              state = (check && window._data.settings[key] === true) ? 'on' : 'off';

            for (const button of buttons) {
              const selected = button.getAttribute('name') === state;
              button.classList.toggle('is-selected', selected);
              if (selected) {
                button.dispatchEvent(new Event('update', { bubbles: true, cancelable: true }));
              }
            }
          };

        if (check) {
          if (typeof window._data.settings.all === 'string') {
            browse.value = window._data.settings.all;
            browse.dispatchEvent(new Event('update', { bubbles: true, cancelable: true }));
          }
        }

        button_action('local');
        button_action('startup');
        button_action('systray');
      }
    } else if (!data.name.indexOf('browse:')) {
      const elem = iframe_doc.querySelector(data.data.elem);
      if ((data.result.filePath || data.result.filePaths[0]) instanceof File) {
        data.result.filePath = URL.createObjectURL(data.result.filePath || data.result.filePaths[0]);
      }

      elem.value = data.result.filePath || data.result.filePaths[0];
      elem.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
  }
}

function message_conn(data) {
  const target = get_target();
  if (data.type === target.type && data.id === target.id) {
    const iframe = document.querySelector('.content > iframe');
    iframe.contentWindow.postMessage(data, '*');
  }
}

function init() {
  const list = document.querySelector('.menu'),
    iframe = document.querySelector('.content > iframe');

  // production/development
  document.body.setAttribute('mode', window._data.mode);

  // define iframe height
  setInterval(() => {
    if (iframe.contentWindow.document.body) {
      iframe.style.height = `${iframe.contentWindow.document.body.scrollHeight - 20}px`;
    }
  }, 1000);

  // menu generation
  for (const type in window._data.configs) {
    const list = document.querySelector(`.${type}-list`);
    for (const id in window._data.configs[type]) {
      const name = window._data.configs[type][id].default.name,
        li = add_li(window._data.configs, type, id, name, list);

      if (type === 'scripts') {
        const menu = window._data.menus[id];
        if (menu.length) {
          const ul = add_ul(name, li, list);
          for (const submenu of menu) {
            add_li(window._data.configs, type, `${id}:${submenu.id}`, submenu.name, ul);
          }
        }
      }
    }
  }

  for (const target in window._data.states) {
    update_state(target, window._data.states[target]);
  }

  // target changed
  iframe.addEventListener('load', load_iframe);

  // click on menu link
  document.addEventListener('click', event => {
    if (event.target.matches('.menu a')) {
      // unselect all
      list.querySelectorAll('li, li > a').forEach(elem => {
        elem.classList.remove('is-active');
      });

      // select with parent
      event.target.classList.add('is-active');
      const parent = event.target.parentElement.parentElement.closest('li');
      if (parent && parent.previousSibling) {
        parent.previousSibling.classList.add('is-active');
      }

      // change target
      let target = event.target.getAttribute('data-target');
      if (target) {
        if (window._target) {
          // old target
          window.send_message('manager', set_target('show', false));
        }

        // get/set new target
        window._target = target;
        target = get_target();

        let uri = `${target.type}/${target.id}/${target.name}.html`;
        if (target.type === 'general') {
          uri = `./${target.id}.html`;
        } else if (!window._internal) {
          uri = `./${uri}`;
        } else if (window._data.settings.all && window.file_exists(window._data.settings.all, uri)) {
          uri = `${window._data.settings.all}/${uri}`;
        } else {
          uri = `../${uri}`;
        }

        if (window._internal) {
          uri += '?internal';
        }

        iframe.setAttribute('src', uri);
      }
    }

    // send a message to the switch
    if (event.target.matches('.menu .switch .slider')) {
      setTimeout(() => {
        const elem = event.target.closest('li').querySelector('[data-target]'),
          target = get_target(elem.getAttribute('data-target'));

        window.send_message('manager', set_target('enabled', event.target.parentElement.querySelector('input').checked, target));
      }, 10);
    }
  }, false);

  // show/hide content right margin
  window.addEventListener('resize', () => {
    const elem = document.querySelector('.content');
    elem.classList.toggle('is-scrollbar', (elem.scrollHeight > elem.clientHeight));
  });

  // from iframe
  window.addEventListener('message', event => {
    if (event.origin !== 'null') {
      window.send_message('message', set_target(false, event.data));
    }
  }, false);

  // enable default target
  setTimeout(() => {
    const elem = document.querySelector('[data-target].is-active');
    window._target = elem.getAttribute('data-target');
    elem.click();

    document.querySelector('.loading').remove();
  }, 10);
}

// variables
window._data = {};
window._index = 0;
window._target = '';
window._internal = ['http:', 'https:'].indexOf(document.location.protocol) < 0;

// functions
window.init = init;
window.manager_conn = manager_conn;
window.message_conn = message_conn;