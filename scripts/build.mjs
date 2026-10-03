// Builds the package three ways from one source tree:
//   dist/*.js + *.d.ts   native ES modules and types (tsc)     - used by the Angular apps and by Vite/Vitest
//   dist/index.cjs       one CommonJS file (esbuild)             - used when Node `require`s it (the NestJS server bundle)
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

rmSync(resolve(root, 'dist'), { recursive: true, force: true });

const tsc = require.resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.json')], { stdio: 'inherit', cwd: root });

const { build } = await import('esbuild');
await build({
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(root, 'dist/index.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
});
console.log('contracts built: dist/index.js, dist/index.d.ts, dist/index.cjs');
