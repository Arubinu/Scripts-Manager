const fs = require('node:fs'),
  path = require('node:path');

exports.default = async function(context) {
  for (const target of context.targets) {
    if (target.name === 'portable') {
      const timeout = setInterval(() => {
        try {
          fs.rmSync(path.join(context.appOutDir, 'resources', 'elevate.exe'));
          console.log('  [31m•[0m elevate.exe removed')
          clearTimeout(timeout);
        } catch (e) {}
      }, 10);

      break;
    }
  }
};