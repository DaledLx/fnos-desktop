const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeNasUrl, ProfileStore } = require('../src/profiles');

test('accepts local and remote NAS addresses without storing query tokens', () => {
  assert.equal(normalizeNasUrl(' 192.168.1.10:5666 '), 'http://192.168.1.10:5666/');
  assert.equal(normalizeNasUrl('https://nas.example.com/web?token=secret#page'), 'https://nas.example.com/web');
});

test('rejects non-web URLs and embedded credentials', () => {
  for (const value of ['', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@example.com']) {
    assert.throws(() => normalizeNasUrl(value));
  }
});

test('profiles are durable, distinct even at one address, and removable', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnos-profiles-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'profiles.json');
  const store = new ProfileStore(file);
  const first = store.upsert({ name: '家里', url: 'http://nas.local:5666' });
  const second = store.upsert({ name: '工作', url: 'http://nas.local:5666' });
  assert.notEqual(first.id, second.id);
  assert.equal(new ProfileStore(file).list().length, 2);
  assert.throws(() => store.upsert({ name: '家里', url: 'http://other.local' }), /名称/);
  store.upsert({ id: first.id, name: '家庭', url: first.url });
  store.remove(second.id);
  assert.deepEqual(new ProfileStore(file).list().map((item) => item.name), ['家庭']);
});
