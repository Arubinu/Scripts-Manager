/* global TYPE_ENUM */

/**
 * Returns an object to communicate including information about the displayed page
 *
 * @param   {string} [target]  Extension type followed by the extension name separated by a colon
 * @returns {object}
 */
function get_target(target = window._target) {
  const split = target.split(':');
  const [event, name, property] = [
    split[0],
    split[1],
    ((split.length > 2) ? split[2] : 'index')
  ];

  return { event, name, method: 'interface', property };
}

/**
 * Modify the object returned by "get_target"
 *
 * @param   {string} [method]  Name of targeted function or data intent
 * @param   {any}    [data]    Data to be transmitted
 * @param   {string} [target]  Extension type followed by the extension name separated by a colon
 * @returns {object}
 */
function set_target(method, data, target) {
  target = target || get_target();

  if (typeof method === 'string') {
    target.method = method;
  }

  if (typeof data !== 'undefined') {
    target.data = data;
  }

  return target;
}

/**
 * Create a list, but can also serve as a sublist
 *
 * @param   {HTMLElement} parent  Element in which added
 * @returns {HTMLElement}
 */
function add_ul(parent) {
  const li = document.createElement('li'),
    ul = document.createElement('ul');

  li.appendChild(ul);
  parent.appendChild(li);

  return ul;
}

/**
 * Create a list item
 *
 * @param   {object}      configs  Configurations returned by the software
 * @param   {EVENT_ENUM}  event
 * @param   {string}      name     Name of addon or script
 * @param   {string}      title    Extension title including capitals and spaces
 * @param   {HTMLElement} parent   Element in which added
 * @returns {HTMLElement}
 */
function add_li(configs, event, name, title, parent) {
  const a = document.createElement('a'),
    li = document.createElement('li');

  a.innerText = title;
  a.setAttribute('data-target', `${event}:${name}`);
  li.appendChild(a);

  if (name.indexOf(':') < 0) {
    const label = document.createElement('label');
    label.setAttribute('for', `checkbox_${window._index}`);
    label.classList.add('switch');

    const checkbox = document.createElement('input');
    checkbox.setAttribute('type', 'checkbox');
    checkbox.setAttribute('id', `checkbox_${window._index}`);
    checkbox.checked = !!configs[event][name].default.enabled;

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

/**
 * Process information returned by software to display configurations
 *
 * @param   {any} error  If an error is returned by the software
 * @param   {any} data   Data requested
 */
function load_manager(error, data) {
  if (error) {
    throw error;
  }

  const target = get_target(),
    iframe = document.querySelector('.content > iframe'),
    iframe_doc = iframe.contentWindow.document;

  if (typeof data === 'object' && typeof data.settings === 'object') {
    window._data = data;
  }

  if (target.name === 'profiles') {
    const profiles_box = iframe_doc.querySelector('.profiles'),
      edit_button = iframe_doc.querySelector('.edit-profiles'),
      restart_button = iframe_doc.querySelector('.restart-app'),
      add_profile_elem = iframe_doc.querySelector('.add_profile'),
      edit_profile = (profile_elem, enabled) => {
        const name = profile_elem.getAttribute('profile'),
          name_input = profile_elem.querySelector('.name'),
          figure_elem = profile_elem.querySelector('figure'),
          image_fas = figure_elem.querySelector(':scope > i.fas');

        if (enabled) {
          name_input.removeAttribute('readonly');
          image_fas.classList.remove('fa-user-secret');
          image_fas.classList.add('fa-file-import');
          image_fas.setAttribute('browse-file', `.profile[profile="${name}"] figure > input`);
          image_fas.setAttribute('browse-file-ext', 'gif,jpg,jpeg,png');
        } else {
          name_input.setAttribute('readonly', 'readonly');
          image_fas.classList.remove('fa-file-import');
          image_fas.classList.add('fa-user-secret');
          image_fas.removeAttribute('browse-file');
          image_fas.removeAttribute('browse-file-ext');
        }
      },
      exists_profile = (name, exclude) => {
        let profiles = [];
        for (const profile of window._data.profiles.profiles) {
          if (profile !== exclude) {
            profiles.push(profile.trim().toLowerCase());
          }
        }

        return name.trim().length && profiles.indexOf(name.trim().toLowerCase()) >= 0;
      },
      switch_mode = () => {
        if (iframe_doc.body.classList.contains('edit')) {
          for (const profile_elem of iframe_doc.querySelectorAll('.profiles .profile')) {
            const name = profile_elem.getAttribute('profile'),
              name_input = profile_elem.querySelector('.name');

            if (exists_profile(name_input.value, name)) {
              return;
            }
          }

          const current_profile = iframe_doc.querySelector(`.profiles .profile[profile="${window._data.profiles.current}"]`);
          if (current_profile.querySelector('.name').value !== window._data.profiles.current) {
            iframe_doc.querySelector('div.restart-profile').classList.add('is-active');
          } else {
            save_profiles();
          }
        } else {
          edit_button.innerText = 'Save';
          iframe_doc.body.classList.add('edit');

          for (const profile_elem of iframe_doc.querySelectorAll('.profiles .profile')) {
            edit_profile(profile_elem, true);
          }
        }
      },
      save_profiles = restart => {
        for (const profile_elem of iframe_doc.querySelectorAll('.profiles .profile')) {
          const name = profile_elem.getAttribute('profile'),
            added = profile_elem.classList.contains('added'),
            name_input = profile_elem.querySelector('.name'),
            figure_elem = profile_elem.querySelector('figure'),
            image_elem = figure_elem.querySelector(':scope > img'),
            image_input = figure_elem.querySelector(':scope > input');

          if (!name_input.value.trim().length) {
            if (added) {
              continue;
            }

            name_input.value = name;
          }

          const new_name = name_input.value.trim();
          if (added) {
            window.send_message(TYPE_ENUM.MANAGER, set_target('add_profile', [new_name, (image_input.value || undefined)]));
          } else {
            if (image_elem.classList.contains('is-hidden')) {
              window.send_message(TYPE_ENUM.MANAGER, set_target('image_profile', [name, undefined]));
            } else if (image_input.value && image_input.value !== window._data.profiles.images[name]) {
              window.send_message(TYPE_ENUM.MANAGER, set_target('image_profile', [name, image_input.value]));
            }

            if (new_name !== name) {
              window.send_message(TYPE_ENUM.MANAGER, set_target('rename_profile', [name, new_name]));
            }
          }
        }

        if (restart) {
          setTimeout(() => {
            window.send_message(TYPE_ENUM.MANAGER, set_target('restart'));
          }, 1000);
        } else {
          iframe_doc.location.reload(true);
        }
      },
      display_profile = (name, image, selected, current) => {
        const added = !name,
          profile_elem = iframe_doc.querySelector('#template > .profile').cloneNode(true),
          name_input = profile_elem.querySelector('.name'),
          figure_elem = profile_elem.querySelector('figure'),
          image_fas = figure_elem.querySelector(':scope > i.fas'),
          image_elem = figure_elem.querySelector(':scope > img'),
          image_cross = figure_elem.querySelector(':scope > .cross'),
          image_input = figure_elem.querySelector(':scope > input'),
          delete_elem = profile_elem.querySelector('.delete');

        if (added) {
          profile_elem.classList.add('added');
          name = name || Math.random().toString(16).slice(2);
        }

        profile_elem.setAttribute('profile', name);
        profile_elem.classList.toggle('is-current', current);
        profile_elem.classList.toggle('is-selected', selected);

        name_input.value = added ? '' : name;
        if (image) {
          image_fas.classList.add('is-hidden');
          image_elem.setAttribute('src', image);
        } else {
          image_elem.classList.add('is-hidden');
          image_cross.classList.add('is-hidden');
        }

        if (current) {
          delete_elem.remove();
        } else {
          delete_elem.addEventListener('click', () => {
            if (added) {
              profile_elem.remove();
              return;
            }

            const modal = iframe_doc.querySelector('div.delete-profile');
            modal.setAttribute('profile', name);
            modal.querySelector('.name').innerText = name;
            modal.classList.add('is-active');
          }, false);
        }

        profile_elem.addEventListener('click', () => {
          if (!iframe_doc.body.classList.contains('edit')) {
            for (const profile_elem of iframe_doc.querySelectorAll('.profiles .profile')) {
              profile_elem.classList.remove('is-selected');
            }

            profile_elem.classList.add('is-selected');
            window.send_message(TYPE_ENUM.MANAGER, set_target('change_profile', name));
          }
        }, false);

        image_elem.addEventListener('click', () => {
          if (iframe_doc.body.classList.contains('edit')) {
            image_elem.classList.add('is-hidden');
            image_cross.classList.add('is-hidden');
            image_fas.classList.remove('is-hidden');
          }
        }, false);

        image_input.addEventListener('change', () => {
          image_fas.classList.add('is-hidden');
          image_elem.setAttribute('src', image_input.value);
          image_elem.classList.remove('is-hidden');
          image_cross.classList.remove('is-hidden');
        }, false);

        name_input.addEventListener('keyup', () => {
          name_input.classList.toggle('has-text-danger', exists_profile(name_input.value, name));
        }, false);

        profiles_box.insertBefore(profile_elem, add_profile_elem);
        return profile_elem;
      };

    iframe_doc.querySelector('div.restart-profile .is-success').addEventListener('click', () => {
      save_profiles(true);
    }, false);

    iframe_doc.querySelector('div.delete-profile .is-success').addEventListener('click', () => {
      const modal = iframe_doc.querySelector('div.delete-profile'),
        name = modal.getAttribute('profile'),
        profile_element = iframe_doc.querySelector(`.profiles .profile[profile="${name}"]`);

      profile_element.remove();
      modal.querySelector('.delete').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      window.send_message(TYPE_ENUM.MANAGER, set_target('remove_profile', name));
    }, false);

    edit_button.addEventListener('click', switch_mode, false);
    restart_button.addEventListener('click', () => {
      window.send_message(TYPE_ENUM.MANAGER, set_target('restart'));
    }, false);

    for (const name of window._data.profiles.profiles) {
      display_profile(name, window._data.profiles.images[name], (name === window._data.profiles.default), (name === window._data.profiles.current));
    }

    add_profile_elem.addEventListener('click', () => {
      edit_profile(display_profile(false, false, false, false), true);
    }, false);
  } else if (target.name === 'settings') {
    const check = typeof window._data.settings === 'object',
      browse = iframe_doc.querySelector('.browse input'),
      local_password = iframe_doc.querySelector('.local_password input'),
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

    for (const elem of iframe_doc.querySelectorAll('.fa-eye, .fa-eye-slash')) {
      elem.addEventListener('click', event => {
        const slash = event.target.matches('.fa-eye-slash');

        event.target.classList.remove(slash ? 'fa-eye-slash' : 'fa-eye');
        event.target.classList.add(slash ? 'fa-eye' : 'fa-eye-slash');

        event.target.parentElement.previousElementSibling.setAttribute('type', (slash ? 'text' : 'password'));
      });
    }

    if (check) {
      if (typeof window._data.settings.all === 'string') {
        browse.value = window._data.settings.all;
        browse.dispatchEvent(new Event('update', { bubbles: true, cancelable: true }));
      }

      if (typeof window._data.settings.local_password === 'string') {
        local_password.value = window._data.settings.local_password;
        local_password.dispatchEvent(new Event('update', { bubbles: true, cancelable: true }));
      }
    }

    button_action('local');
    button_action('startup');
    button_action('systray');
  }
}

/**
 * Called when the displayed page changes
 */
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
  if (target.event === 'manager') {
    iframe_doc.querySelectorAll('[aria-label="close"]').forEach(elem => {
      elem.addEventListener('click', () => {
        const modal = elem.closest('.modal');
        if (modal) {
          modal.classList.remove('is-active');
        }
      }, false);
    });

    if (target.name === 'profiles') {
      window.send_message(TYPE_ENUM.MANAGER, set_target('load'), load_manager);
    } else if (target.name === 'settings') {
      const browse = iframe_doc.querySelector('.browse input'),
        local_password = iframe_doc.querySelector('.local_password input'),
        import_input = iframe_doc.querySelector('.import input'),
        export_input = iframe_doc.querySelector('.export input'),
        export_button = iframe_doc.querySelector('.export .button'),
        reset = iframe_doc.querySelector('.reset-app .is-success'),
        reset_dialog = iframe_doc.querySelector('div.reset-app'),
        settings = Object.assign({
          all: browse.value,
          local: false,
          local_password: local_password.value,
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
          window.send_message(TYPE_ENUM.MANAGER, get_save_target());
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

      local_password.addEventListener('update', event => {
        settings.local_password = local_password.value;
      }, false);

      local_password.addEventListener('change', event => {
        if (local_password.value === settings.local_password) {
          return;
        }

        settings.local_password = local_password.value;
        save_settings();
      }, false);

      import_input.addEventListener('change', event => {
        if (!import_input.value.indexOf('blob:')) {
          window.download_text(import_input.value)
            .then(data => {
              window.send_message(TYPE_ENUM.MANAGER, set_target('import', data));
            });
        } else {
          window.send_message(TYPE_ENUM.MANAGER, set_target('import', import_input.value));
        }
      }, false);

      export_button.addEventListener('click', event => {
        if (!window._internal) {
          event.stopPropagation();

          window.send_message(TYPE_ENUM.MANAGER, set_target('export', false));
        }
      }, false);
      export_input.addEventListener('change', event => {
        window.send_message(TYPE_ENUM.MANAGER, set_target('export', export_input.value));
      }, false);

      reset.addEventListener('click', () => {
        window.send_message(TYPE_ENUM.MANAGER, set_target('reset'));
      }, false);

      iframe_doc.querySelector('.reset').addEventListener('click', () => {
        reset_dialog.classList.add('is-active');
      }, false);

      window.send_message(TYPE_ENUM.MANAGER, set_target('load'), load_manager);
    } else if (target.name === 'about') {
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

      window.send_message(TYPE_ENUM.MANAGER, set_target('load'), load_manager);
    }
  }

  // open links in default browser and open dialog
  iframe_doc.addEventListener('click', event => {
    const callback = (error, data) => {
      if (error) {
        throw error;
      }

      const elem = iframe_doc.querySelector(data.elem);
      if ((data.result.filePath || data.result.filePaths[0]) instanceof File) {
        data.result.filePath = URL.createObjectURL(data.result.filePath || data.result.filePaths[0]);
      }

      elem.value = data.result.filePath || data.result.filePaths[0];
      elem.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    };

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

      if (window._internal || ['localhost', '127.0.0.1'].indexOf(document.location.hostname) >= 0) {
        window.send_message(TYPE_ENUM.MANAGER, Object.assign(set_target('browse', data), { property: type }), callback);
      } else {
        alert('This feature can only be used on the computer where the software is launched!');
      }
    } else if (elem.matches('[browse-folder]')) {
      const data = {
        elem: elem.getAttribute('browse-folder')
      };

      if (window._internal || ['localhost', '127.0.0.1'].indexOf(document.location.hostname) >= 0) {
        window.send_message(TYPE_ENUM.MANAGER, Object.assign(set_target('browse', data), { property: 'folder' }), callback);
      } else {
        alert('This feature can only be used on the computer where the software is launched!');
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

  window.send_message(TYPE_ENUM.EXTENSION, target);
}

/**
 * Displays and modifies the colored square to the left of a menu item
 *
 * @param   {EVENT_ENUM} event
 * @param   {string}     name   Name of addon or script
 * @param   {string}     state  Extension Status
 */
function update_state(event, name, state) {
  const target_key = `${event}:${name}`,
    elem = document.querySelector(`[data-target="${target_key}"]`);
  if (elem) {
    if (state) {
      elem.setAttribute('state', state);
    } else {
      elem.removeAttribute('state');
    }
  }
}

/**
 * Processes software data when it concerns the "manager"
 *
 * @param   {any}      _data       Object returned by the software
 * @param   {function} [callback]  Returns a result if there is a return to do
 */
function to_manager(_data, callback) {
  const target = get_target(),
    iframe = document.querySelector('.content > iframe'),
    iframe_doc = iframe.contentWindow.document,
    { event, name, method, data } = _data,
    _callback = (error, data) => {
      if (callback) {
        callback(error, data);
      }

      return data;
    };

  if (name === 'update' && typeof data === 'object') {
    window._data = data;
    return;
  }

  if (method === 'export') {
    window.text_to_file('settings.sms', data, 'application/json');
  } else if (method === 'reload' && target.event === 'manager' && target.name === 'settings') {
    const reload_dialog = iframe_doc.querySelector('div.reload-app');
    if (reload_dialog) {
      reload_dialog.classList.add('is-active');
    }
  } else {
    if (event === target.event && name === target.name) {
      if (method === 'browse') {
        const elem = iframe_doc.querySelector(data.elem);
        if ((data.result.filePath || data.result.filePaths[0]) instanceof File) {
          data.result.filePath = URL.createObjectURL(data.result.filePath || data.result.filePaths[0]);
        }

        elem.value = data.result.filePath || data.result.filePaths[0];
        elem.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      }
    }
  }
}

/**
 * Processes software data when it concerns the "interface"
 *
 * @param   {any}      _data       Object returned by the software
 * @param   {function} [callback]  Returns a result if there is a return to do
 */
function to_interface(_data, callback) {
  const target = get_target(),
    { event, name, method, property, data } = _data,
    target_key = `${event}:${name}`,
    _callback = (error, data) => {
      if (callback) {
        callback(error, data);
      }

      return data;
    };

  if (method === 'enable') {
    /**
     * Enabling or disabling an extension
     */
    const elem = document.querySelector(`[data-target="${target_key}"]`);
    if (elem) {
      const state = elem.parentElement.querySelector('[type="checkbox"]').checked;
      if (window._accept.enable && data.state !== state) {
        window._accept.enable = false;
        setTimeout(() => { window._accept.enable = true; }, 100);

        elem.parentElement.querySelector('.slider').click();
      }
    }
  } else if (method === 'state') {
    /**
     * Changes the state square of an extension
     */
    if (['set', 'unset'].indexOf(property) >= 0) {
      update_state(event, name, ((property === 'set') ? data : false));
    }
  } else if (event === target.event && name === target.name) {
    /**
     * Sends the message to the displayed page if it matches
     */
    const iframe = document.querySelector('.content > iframe');
    iframe.contentWindow.postMessage(_data, '*');
  }
}

/**
 * Called after interface load to initialize all components
 */
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

      if (type === 'script') {
        const menu = window._data.menus[id];
        if (Array.isArray(menu) && menu.length) {
          const ul = add_ul(list);
          for (const submenu of menu) {
            add_li(window._data.configs, type, `${id}:${submenu.id}`, submenu.name, ul);
          }
        }
      }
    }
  }

  for (const target in window._data.states) {
    update_state(...target.split(':'), window._data.states[target]);
  }

  // target changed
  iframe.addEventListener('load', load_iframe);

  // click on menu link
  document.addEventListener('click', event => {
    // minimize menu
    if (event.target.matches('.lateral-menu > .minimize')) {
      document.body.classList.add('minimize');
    } else if (event.target.closest('body.minimize .lateral-menu')) {
      document.body.classList.remove('minimize');
    }

    // change target
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
          window.send_message(TYPE_ENUM.EXTENSION, set_target('show', false));
        }

        // get/set new target
        window._target = target;
        target = get_target();

        let uri = `${target.event}${(['addon', 'script'].indexOf(target.event) >= 0) ? 's' : ''}/${target.name}/${target.property}.html`;
        if (target.event === 'manager') {
          uri = `./${target.name}.html`;
        } else if (!window._internal) {
          uri = `./${uri}`;
        } else if (typeof window._data.settings.all === 'string' && window._data.settings.all && window.file_exists(window._data.settings.all, uri)) {
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
    if (window._accept.enable && event.target.matches('.menu .switch .slider')) {
      setTimeout(() => {
        const elem = event.target.closest('li').querySelector('[data-target]'),
          target = get_target(elem.getAttribute('data-target'));

        window._accept.enable = false;
        setTimeout(() => { window._accept.enable = true; }, 100);

        window.send_message(TYPE_ENUM.MANAGER, set_target('enable', event.target.parentElement.querySelector('input').checked, target));
      }, 10);
    }
  }, false);

  // show/hide content right margin
  window.addEventListener('resize', () => {
    const elem = document.querySelector('.content');
    elem.classList.toggle('is-scrollbar', (elem.scrollHeight > elem.clientHeight));
  });

  // from iframe
  window.addEventListener('message', _event => {
    if (_event.origin !== 'null') {
      const { event, id, name, data } = set_target(false, _event.data),
        property = Object.keys(data)[0],
        respond = id && (data => {
          const target = get_target();
          if (event === target.event && name === target.name) {
            iframe.contentWindow.postMessage(data, '*');
          }
        });

      window.send_message(TYPE_ENUM.EXTENSION, {
        event,
        name,
        method: 'interface',
        property,
        data: data[property]
      }, respond, true);
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
window._accept = { enable: true };
window._target = '';
window._internal = ['http:', 'https:'].indexOf(document.location.protocol) < 0;

// functions
window.init = init;
window.to_manager = to_manager;
window.to_interface = to_interface;