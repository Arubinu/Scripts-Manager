/* global EVENT_ENUM, RESPONSE_ENUM */

document.addEventListener('DOMContentLoaded', () => {
  const login_box = document.querySelector('.login'),
    login_input = login_box.querySelector('.input'),
    disconnected = document.querySelector('.disconnected');

  let connected = false,
    reconnection = false;

  function login(password, is_token) {
  console.log('password:', typeof password, password);
    connect(password, () => {
      window.send_message = (target, data, tracking, to_object) => {
        let id;
        if (tracking) {
          id = window.store.generate();
          window.store.tracking(id, tracking, to_object);
        }

        window.socket.send(JSON.stringify({
          to: target,
          from: 'renderer',
          id,
          data
        }));
      };

      // send init to manager
      window.send_message('init');
    }, is_token);
  }

  function connect(password, callback, is_token) {
    window.socket = new WebSocket(`ws://${document.location.host}?token=${is_token ? password : btoa(password)}`);

    window.socket.onopen = event => {
      console.log('socket.onopen');

      connected = true;
      login_box.remove();
      if (callback) {
        callback();
      }
    };

    window.socket.onmessage = _event => {
      if (typeof _event.data === 'string') {
        let _data = _event.data;
        try {
          _data = JSON.parse(_data);
        } catch (e) {}

        if (typeof _data === 'object') {
          console.debug('\u001b[35mreceive:\u001b[0m', _data);
          const { to, event, id, method, name, data } = _data;
          if (to === 'init') {
            window._data = data;
            window.init();
          } else if (method === 'response' && (event === RESPONSE_ENUM.DONE || event === RESPONSE_ENUM.ERROR)) {
            window.store[event](id, data);
          } else {
            const respond = id && ((error, data) => window.store[error ? RESPONSE_ENUM.ERROR : RESPONSE_ENUM.DONE](id, error ? error : data));
            if (id) {
              window.store.tracking(id, data => {
                window.socket.send(JSON.stringify(data));
              }, true);
            }

            if (to === 'interface' && (event === EVENT_ENUM.ADDON || event === EVENT_ENUM.SCRIPT)) {
              window.to_interface(_data, respond);
            } else if (event === EVENT_ENUM.MANAGER || to === EVENT_ENUM.MANAGER) {
              window.to_manager(_data, respond);
            } else if (id) {
              window.store.error(id, 'bad request');
            }
          }
        }
      }
    };

    window.socket.onclose = event => {
      if (event.wasClean) {
        console.log(`socket.onclose: Connection closed cleanly, code=${event.code} reason=${event.reason}`);
      }

      if (connected) {
        reconnection = true;
        disconnected.classList.remove('is-hidden');

        setInterval(async () => {
          try {
            await fetch(document.location.origin)
            document.location.reload(true);
          } catch (e) {}
        }, 3000);
      }
    };

    window.socket.onerror = error => {
      if (error.message) {
        console.log('socket.onerror:', error.message);
      }

      window.socket.close();
    };
  }

  login_box.querySelector('.button').addEventListener('click', () => login(login_input.value), false);
  login_input.addEventListener('keyup', event => {
    if (event.key === 'Enter') {
      login(login_input.value);
    }
  }, false);

  const search = new URLSearchParams(document.location.search);
  window.history.replaceState({}, document.title, '/');
  if (search.get('token')) {
    login(search.get('token'), true);
  }
});