import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const file of ['src/pages/skill/[scope]/[name].astro', 'src/pages/道具總覽/[name].astro']) {
  test(`${file} breadcrumb 由共用樣式加分隔符號`, () => {
    const page = readFileSync(file, 'utf8');
    const crumbs = page.match(/<nav class="crumbs"[\s\S]*?<\/nav>/)?.[0];
    assert(crumbs);
    assert(crumbs.includes('aria-label="階層"'));
    assert(crumbs.includes('aria-current="page"'));
    assert.equal((crumbs.match(/<a /g) ?? []).length, 2);
    assert.equal((crumbs.match(/<span /g) ?? []).length, 1);
    assert(!/>\s*\/\s*</.test(crumbs));
  });
}
