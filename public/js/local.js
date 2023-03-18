window.send_message = (target, data) => {
  window.socket.send(JSON.stringify({
    from: 'renderer',
    target,
    data
  }));
};

document.addEventListener('DOMContentLoaded', () => {
  const disconnected = document.querySelector('.disconnected');

  let reconnection = false;
  function connect(callback) {
    window.socket = new WebSocket('ws://localhost:5042');

    window.socket.onopen = event => {
      console.log('socket.onopen');

      if (reconnection) {
        document.location.reload(true);
      }

      if (callback) {
        callback();
      }
    };

    window.socket.onmessage = event => {
      if (typeof event.data === 'string') {
        let data = event.data;
        try {
          data = JSON.parse(data);
        } catch (e) {}
  
        if (typeof data === 'object') {
          if (data.from === 'manager') {
            if (data.name === 'init') {
              window._data = data.data;
              window.init();
            } else if (data.name === 'manager' || data.name === 'response') {
              window.manager_conn(data.data);
            } else if (data.name === 'message') {
              window.message_conn(data.data);
            }
          }
        }
      }
    };

    window.socket.onclose = event => {
      if (event.wasClean) {
        console.log(`socket.onclose: Connection closed cleanly, code=${event.code} reason=${event.reason}`);
      }

      reconnection = true;
      disconnected.classList.remove('is-hidden');

      setTimeout(connect, 3000);
    };

    window.socket.onerror = error => {
      if (error.message) {
        console.log('socket.onerror:', error.message);
      }
  
      window.socket.close();
    };
  }

  connect(() => {
    // send init to manager
    window.send_message('init');
  });
});