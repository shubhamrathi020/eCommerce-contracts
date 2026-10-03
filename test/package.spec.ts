import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// These tests run against the built files (`pnpm build` first, which `pnpm verify` does), because what matters is
// that both consumers - the Angular apps (ES modules) and the NestJS server (CommonJS) - get the same working code.
const require = createRequire(import.meta.url);

describe('@ecom/contracts package', () => {
  it('loads as an ES module, which is how the frontend and Vitest use it', async () => {
    const m = await import('../dist/index.js');
    expect(typeof m.priceCart).toBe('function');
    expect(m.MAX_LINE_QUANTITY).toBeGreaterThan(0);
    expect(m.ORDER_TRANSITIONS).toBeDefined();
  });

  it('loads as CommonJS, which is how the server bundle requires it', () => {
    const m = require('../dist/index.cjs');
    expect(typeof m.priceCart).toBe('function');
    expect(m.ORDER_TRANSITIONS).toBeDefined();
  });

  it('exposes the same names either way', async () => {
    const esm = Object.keys(await import('../dist/index.js')).sort();
    const cjs = Object.keys(require('../dist/index.cjs')).sort();
    expect(cjs).toEqual(esm);
  });
});
