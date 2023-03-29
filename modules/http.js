const fs = require('node:fs'),
  http = require('node:http'),
  path = require('node:path'),
  sstatic = require('serve-static');


module.exports = (modules, addons, scripts, options, methods) => {
  let http_routes = {};

  /**
   * Makes the content of a folder and its children accessible on the web server
   *
   * @param   {string} _path  Folder to make accessible on the web server
   * @param   {object} req    Request Information
   * @param   {object} res    Allows you to answer the request
   * @param   {object} next   Pass the request to the next route
   * @returns {object|undefined}
   */
  function get_static(_path, req, res, next) {
    const url = req.url,
      split = url.substring(1).split('/');

    _path = path.join(_path, split[0]);
    req.url = '/' + split.slice(1).join('/');

    if (fs.existsSync(_path)) {
      return sstatic(_path)(req, res, async () => {
        req.url = url;
        await next();
      });
    }
  }

  const istatic = sstatic(path.join(__dirname, '..', 'public'), { index: 'local.html' }),
    server = http.createServer({}, async (req, res) => {
      const next = async () => {
          for (const target in http_routes) {
            const routes = http_routes[target];
            if (Array.isArray(routes)) {
              for (const route of routes) {
                if (typeof route === 'object' && route.route === req.url.split('?')[0].split('&')[0]) {
                  const send = async (route, passe) => {
                    if (typeof route.file === 'string' && route.file.length) {
                      if (fs.existsSync(route.file)) {
                        set_header(route.code, route.type);
                        return res.end(fs.readFileSync(route.file, 'utf-8'));
                      } else {
                        res.writeHead(404);
                        return res.end();
                      }
                    } else if (typeof route.content === 'string') {
                      set_header(route.code, route.type);
                      return res.end(route.content);
                    } else if (!passe) {
                      const pos = target.indexOf(':'),
                        name = target.substring(pos + 1),
                        event = target.substring(0, pos);

                      let obj = null;
                      if (event === 'addon') {
                        obj = modules.loader.get_addon(name, 'http');
                      } else if (event === 'script') {
                        obj = modules.loader.get_script(name, 'http');
                      }

                      if (obj) {
                        await new Promise(resolve => {
                          const timeout = setTimeout(resolve, 30000),
                            id = modules.store.tracking('http', async (error, data) => {
                              await send(Object.assign({}, route, data), true);
                              clearTimeout(timeout);
                              resolve();
                            });

                          obj.receiver({
                            event: 'method',
                            id,
                            method: 'http',
                            property: req.method,
                            data: {
                              register: JSON.parse(JSON.stringify(route)),
                              url: req.url,
                              body: req.body,
                              headers: req.headers
                            }
                          });
                        });

                        return;
                      }
                    }
                  };

                  return await send(route);
                }
              }
            }
          }

          res.writeHead(403);
          res.end();
        },
        set_header = (code, type) => {
          if (typeof type === 'string' && type.length) {
            res.writeHead((code || 200), { 'Content-Type': type });
          } else {
            res.writeHead(code || 200);
          }
        };

      if (modules.communication.is_local() && req.url !== '/index.html' && req.url !== '/local.html') {
        return istatic(req, res, async () => {
          const split = req.url.substring(1).split('/');
          if (split.length > 2 && ['addons', 'scripts'].indexOf(split[0]) >= 0) {
            return get_static(path.dirname(__dirname), req, res, async () => {
              if (typeof options.manager.default.all === 'string') {
                return get_static(options.manager.default.all, req, res, async () => {
                  await next();
                });
              }

              await next();
            });
          }

          await next();
        });
      }

      await next();
    });

  server.listen(options.APP_PORT, '0.0.0.0', () => {
    console.log('HTTP running on port', options.APP_PORT);
  });

  return {
    instance: server,
    set_routes: (key, data) => {
      http_routes[key] = data;
    }
  };
};