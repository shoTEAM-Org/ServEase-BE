const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const scopeDir = path.join(root, 'node_modules', '@app');

const aliases = {
  common: path.join(root, 'dist', 'libs', 'common', 'src', 'index.js'),
  database: path.join(root, 'dist', 'libs', 'database', 'src', 'index.js'),
};

fs.mkdirSync(scopeDir, { recursive: true });

for (const [name, entry] of Object.entries(aliases)) {
  const packageDir = path.join(scopeDir, name);
  const relativeMain = path.relative(packageDir, entry).replaceAll(path.sep, '/');

  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    `${JSON.stringify(
      {
        name: `@app/${name}`,
        private: true,
        main: relativeMain,
      },
      null,
      2,
    )}\n`,
  );
}
