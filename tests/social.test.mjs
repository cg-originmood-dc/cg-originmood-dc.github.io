import test from 'node:test';
import assert from 'node:assert/strict';
import {socialUrls} from '../src/lib/social.ts';

const site = new URL('https://cg-originmood-dc.github.io');
test('分享網址為絕對網址，中文編碼且不保留查詢或 hash', () => {
  const result = socialUrls(site, '/道具總覽?q=牛奶#results', '/', '/apple-touch-icon.png');
  assert.equal(result.url, site.origin + '/' + encodeURIComponent('道具總覽') + '/');
  assert.equal(result.image, site.origin + '/apple-touch-icon.png');
  assert.deepEqual(socialUrls(site, '/道具總覽/', '', '/apple-touch-icon.png'), result);
});

test('專案站與 PR preview 的頁面、圖片各保留一次 base', () => {
  for (const base of ['/repo/', '/pr-preview/pr-123/', '/repo/pr-preview/pr-123/']) {
    const result = socialUrls(site, base + encodeURIComponent('道具總覽'), base, '/apple-touch-icon.png');
    assert.equal(result.url, site.origin + base + encodeURIComponent('道具總覽') + '/');
    assert.equal(result.image, site.origin + base + 'apple-touch-icon.png');
  }
});

test('支援自訂部署網域', () => {
  const result = socialUrls(new URL('https://guide.example.com'), '/道具總覽/', '/', '/apple-touch-icon.png');
  assert.equal(new URL(result.url).origin, 'https://guide.example.com');
  assert.equal(new URL(result.image).origin, 'https://guide.example.com');
});
