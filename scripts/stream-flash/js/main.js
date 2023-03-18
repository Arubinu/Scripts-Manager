document.addEventListener('DOMContentLoaded', () => {
  let _config = {};

  function update_buttons() {
    const buttons = document.querySelectorAll('.screen .buttons .button');
    for (let i = 0; i < buttons.length; ++i) {
      buttons[i].classList.toggle('is-selected', (i === _config.settings.screen));
    }
  }

  for (const name of ['opacity', 'duration', 'delay', 'pause']) {
    const elem = document.querySelector(`.${name} input`);
    const callback = event => {
      let data = {};
      data[name] = parseInt(elem.value);

      window.parent.postMessage(data, '*');
    };

    elem.addEventListener('input', callback);
  }

  document.querySelector('.reset.button').addEventListener('click', event => {
    event.target.blur();
    window.parent.postMessage('reset', '*');
  });

  for (const name of ['join', 'command']) {
    document.querySelector(`.${name} input`).addEventListener('change', event => {
      let data = {};
      data[name] = event.target.checked;

      window.parent.postMessage(data, '*');
    });
  }

  window.addEventListener('message', event => {
    if (event.origin !== 'null') {
      if (event.data.name === 'config') {
        _config = event.data.data;
        update_buttons();

        for (const name of ['flash', 'viewer', 'follower', 'subscriber', 'moderator']) {
          document.querySelector(`.info-${name} .title`).innerText = _config.statistics[name];
        }

        for (const name of ['opacity', 'duration', 'delay', 'pause']) {
          document.querySelector(`.${name} input`).value = _config.settings[name];
        }

        for (const name of ['join', 'command']) {
          document.querySelector(`.${name} input`).checked = _config.settings[name];
        }
      } else if (event.data.name === 'screens') {
        const buttons = document.querySelector('.screen .buttons');
        buttons.innerHTML = '';

        for (let i = 0; i < event.data.data; ++i) {
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
            window.parent.postMessage({screen: _config.settings.screen}, '*');
          });

          buttons.appendChild(button);
        }
      }
    }
  }, false);
}, false);