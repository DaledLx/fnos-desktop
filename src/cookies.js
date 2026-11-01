const fs = require('node:fs');
const path = require('node:path');

class CookieVault {
  constructor(directory, safeStorage) {
    this.directory = directory;
    this.safeStorage = safeStorage;
    this.timers = new Map();
    this.disabled = new Set();
  }

  file(id) {
    return path.join(this.directory, `${id}.bin`);
  }

  async restore(id, ses) {
    const file = this.file(id);
    if (!this.safeStorage.isEncryptionAvailable() || !fs.existsSync(file)) return;
    try {
      const cookies = JSON.parse(this.safeStorage.decryptString(fs.readFileSync(file)));
      for (const cookie of cookies) {
        const host = cookie.domain.replace(/^\./, '');
        const settings = {
          url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite
        };
        if (!cookie.hostOnly) settings.domain = cookie.domain;
        try { await ses.cookies.set(settings); } catch (error) {
          console.warn(`Cookie restore skipped for ${host}:`, error.message);
        }
      }
    } catch (error) {
      console.warn('Encrypted session could not be restored:', error.message);
    }
  }

  watch(id, ses) {
    this.disabled.delete(id);
    ses.cookies.on('changed', () => {
      if (this.disabled.has(id)) return;
      clearTimeout(this.timers.get(id));
      this.timers.set(id, setTimeout(() => this.save(id, ses), 500));
    });
  }

  async save(id, ses) {
    if (this.disabled.has(id) || !this.safeStorage.isEncryptionAvailable()) return;
    try {
      const cookies = (await ses.cookies.get({})).filter((cookie) => cookie.session);
      if (this.disabled.has(id)) return;
      fs.mkdirSync(this.directory, { recursive: true });
      fs.writeFileSync(this.file(id), this.safeStorage.encryptString(JSON.stringify(cookies)), { mode: 0o600 });
    } catch (error) {
      console.error('Could not save encrypted session:', error);
    }
  }

  async clear(id, ses) {
    this.disabled.add(id);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    await ses.clearStorageData();
    await ses.clearCache();
    fs.rmSync(this.file(id), { force: true });
  }
}

module.exports = { CookieVault };
