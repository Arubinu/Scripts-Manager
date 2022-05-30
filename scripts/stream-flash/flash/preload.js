const { ipcRenderer } = require('electron');

ipcRenderer.on('flash', (event, data) => {
	document.body.removeAttribute('class');
	setTimeout(() => { document.body.classList.add(data || 'flash'); }, 20);
});

ipcRenderer.on('duration', (event, data) => {
	document.body.removeAttribute('class');
	document.querySelector('#types').innerText = `
		body.flash { animation: ${data}ms linear 0s 2 alternate flash; }
		body.connected { animation: ${data}ms linear 0s 2 alternate connected; }
		body.disconnected { animation: ${data}ms linear 0s 2 alternate disconnected; }
	`;
});
