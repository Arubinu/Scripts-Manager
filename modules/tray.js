const {
  Menu,
  Tray,
  app,
  shell
} = require('electron');


module.exports = (modules, addons, scripts, options, methods) => {
  let tray = new Tray(options.APP_ICON)
    interval = 0;

  /**
   * Generates the software menu on the systray icon
   */
  function generate() {
    let scripts_menu = [];
    for (let id in scripts) {
      try {
        const menu = scripts[id].menu;
        if (menu.length) {
          let tmp = { id, label: scripts[id].config.default.name };
          tmp.submenu = menu;

          Menu.buildFromTemplate([tmp]);
          scripts_menu.push(tmp);
        }
      } catch (e) {}
    }

    let parts = {
      settings: [
        { type: 'separator' },
        { label: 'Settings', click : async () => {
          if (modules.window && modules.window.instance) {
            modules.window.instance.show();
          }
        } }
      ],
      quit: [
        { type: 'separator' },
        { label: 'Restart', click : async () => {
          methods.relaunch_app();
        } },
        { label: 'Quit', click : async () => {
          console.log('Closing Scripts Manager');
          app.exit();
        } }
      ]
    };

    if (modules.communication.is_local()) {
      parts.settings.push({
        label: 'Open in browser', click : async () => {
          shell.openExternal(`http://localhost:${options.APP_PORT}/?token=${modules.websocket.token}`);
        }
      });
    }

    const menu = Menu.buildFromTemplate(scripts_menu.concat(parts.settings, parts.quit));
    tray.setContextMenu(menu);

    return menu;
  }

  tray.setToolTip('Scripts Manager');

  tray.on('double-click', event => {
    if (modules.window && modules.window.instance) {
      modules.window.instance.show();
    } else {
      clearInterval(interval);
      interval = setInterval(() => {
        if (modules.window && modules.window.instance) {
          clearInterval(interval);
          modules.window.instance.show();
        }
      }, 100);
    }
  });

  tray.on('click', event => {
    if (modules.window && modules.window.instance) {
      modules.window.instance.show();
      modules.window.instance.moveTop();
      modules.window.instance.focus();
    }
  });

  return {
    instance: tray,
    generate
  }
};