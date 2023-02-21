const { ipcRenderer } = require('electron');

ipcRenderer.on('flash', (event, data) => {
  document.body.removeAttribute('class');
  setTimeout(() => { document.body.classList.add(data || 'flash'); }, 20);
});

ipcRenderer.on('opacity', (event, data) => {
  document.body.removeAttribute('class');
  document.querySelector('#keyframes').innerHTML = `
    @keyframes flash { from { background: transparent; } to { background: rgba(255, 255, 255, ${(data / 100).toFixed(2)}); } }
    @keyframes connected { from { background: transparent; } to { background: rgba(0, 255, 0, ${(data / 100).toFixed(2)}); } }
    @keyframes disconnected { from { background: transparent; } to { background: rgba(255, 0, 0, ${(data / 100).toFixed(2)}); } }
  `;
});

ipcRenderer.on('duration', (event, data) => {
  document.body.removeAttribute('class');
  document.querySelector('#animations').innerHTML = `
    body.flash { animation: ${data}ms linear 0s 2 alternate flash; }
    body.connected { animation: ${data}ms linear 0s 2 alternate connected; }
    body.disconnected { animation: ${data}ms linear 0s 2 alternate disconnected; }
  `;
});
