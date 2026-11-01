const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { CookieVault } = require('../src/cookies');

test('session cookies are encrypted, restored, and cleared', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnos-cookies-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const secureStore = {
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(text.split('').reverse().join('')),
    decryptString: (bytes) => bytes.toString().split('').reverse().join('')
  };
  const vault = new CookieVault(dir, secureStore);
  const changed = new EventEmitter();
  const restored = [];
  const ses = {
    cookies: Object.assign(changed, {
      get: async () => [
        { name: 'sid', value: 'secret', domain: 'nas.local', path: '/', session: true, secure: false, httpOnly: true, hostOnly: true },
        { name: 'theme', value: 'light', domain: 'nas.local', path: '/', session: false }
      ],
      set: async (value) => restored.push(value)
    }),
    clearStorageData: async () => {},
    clearCache: async () => {}
  };
  await vault.save('account', ses);
  assert.equal(fs.readFileSync(vault.file('account'), 'utf8').includes('secret'), false);
  await vault.restore('account', ses);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].url, 'http://nas.local/');
  vault.watch('account', ses);
  await vault.clear('account', ses);
  changed.emit('changed');
  assert.equal(fs.existsSync(vault.file('account')), false);
});
