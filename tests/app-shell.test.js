import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';

it('serves a complete HTML document with a responsive viewport', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const dom = new JSDOM(html);

  expect(dom.window.document.doctype?.name).toBe('html');
  expect(dom.window.document.documentElement.lang).toBe('zh-CN');
  expect(dom.window.document.head.querySelector('meta[charset]')?.getAttribute('charset').toLowerCase()).toBe('utf-8');
  expect(dom.window.document.head.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe('width=device-width, initial-scale=1');
  expect(dom.window.document.body.querySelector('#app')).not.toBeNull();
  expect(dom.window.document.body.querySelector('script[type="module"][src="/src/main.js"]')).not.toBeNull();
});

it('keeps existing Vercel security headers and denies framing', () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
  const headers = Object.fromEntries(
    config.headers[0].headers.map(header => [header.key.toLowerCase(), header.value])
  );

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
});
