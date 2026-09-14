import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('dashboard spacing', () => {
  it('keeps the desktop hero close to the header divider', () => {
    expect(styles).toMatch(
      /\.tracker-hero\s*\{\s*padding:\s*clamp\(2\.2rem,\s*4vw,\s*3\.5rem\)\s+0\s+1\.5rem;\s*\}/
    );
  });
});
