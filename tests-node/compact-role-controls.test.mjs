import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('role status pill uses compact content width', () => {
  assert.match(
    css,
    /\.status-badge\.role-state-control\s*\{[^}]*width:\s*fit-content;[^}]*min-height:\s*1\.8rem;[^}]*border:\s*0;/s
  );
});

test('next action selector avoids excessive horizontal whitespace', () => {
  assert.match(
    css,
    /\.next-action-select\s*\{[^}]*width:\s*8\.75rem;[^}]*min-height:\s*2rem;/s
  );
});
