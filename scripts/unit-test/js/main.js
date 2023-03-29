document.addEventListener('DOMContentLoaded', () => {
  let _config = {};

  for (const button of document.querySelectorAll('.level .button')) {
    button.addEventListener('click', event => {
      event.target.blur();
      window.parent.postMessage({ check: event.target.parentElement.getAttribute('class').split('-')[1] }, '*');
    });
  }

  document.querySelector('.reset.button').addEventListener('click', event => {
    event.target.blur();
    window.parent.postMessage({ reset: true }, '*');
  });

  window.addEventListener('message', _event => {
    const { to, event, name, method, property, data } = _event.data;
    if (event.origin !== 'null' && to === 'interface') {
      if (property === 'config') {
        _config = data;

        for (const name in _config.statistics) {
          document.querySelector(`.info-${name} .title`).innerText = _config.statistics[name];
        }
      }
    }
  }, false);
}, false);