import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('dashboard spacing', () => {
  it('keeps the desktop hero compact so the statistics sit close below it', () => {
    expect(styles).toMatch(
      /\.tracker-hero\s*\{[^}]*padding:\s*clamp\(1\.6rem,\s*3vw,\s*2\.5rem\)\s+0\s+1rem;/
    );
  });

  it('renders the daily goal as a compact right-aligned desktop widget', () => {
    expect(styles).toMatch(
      /\.daily-goal-card\s*\{[^}]*max-width:\s*30rem;[^}]*justify-self:\s*end;[^}]*gap:\s*0\.65rem;[^}]*padding:\s*clamp\(0\.85rem,\s*1\.5vw,\s*1\.05rem\);/
    );
    expect(styles).toMatch(
      /\.goal-form input\s*\{[^}]*min-height:\s*2\.1rem;/
    );
  });
});
