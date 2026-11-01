const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function normalizeNasUrl(input) {
  const value = String(input ?? '').trim();
  if (!value) throw new Error('请输入飞牛网页地址');
  let url;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`);
  } catch {
    throw new Error('地址格式不正确，请输入浏览器中访问飞牛的完整地址');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('仅支持不含账号密码的 HTTP 或 HTTPS 地址');
  }
  return `${url.origin}${url.pathname}`;
}

function validateProfile(input, existing = []) {
  const name = String(input?.name ?? '').trim();
  if (!name || name.length > 40) throw new Error('名称须为 1 至 40 个字符');
  const url = normalizeNasUrl(input.url);
  if (existing.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== input.id)) {
    throw new Error('这个名称已存在');
  }
  return { name, url };
}

class ProfileStore {
  constructor(file) {
    this.file = file;
    this.profiles = [];
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data.profiles)) throw new Error('账号配置文件格式错误');
      this.profiles = data.profiles;
    }
  }

  list() {
    return this.profiles.map(({ id, name, url }) => ({ id, name, url }));
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ profiles: this.profiles }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  upsert(input) {
    const values = validateProfile(input, this.profiles);
    const index = this.profiles.findIndex((item) => item.id === input.id);
    if (input.id && index < 0) throw new Error('账号不存在');
    const profile = { id: index < 0 ? randomUUID() : input.id, ...values };
    if (index < 0) this.profiles.push(profile);
    else this.profiles[index] = profile;
    this.save();
    return profile;
  }

  remove(id) {
    const index = this.profiles.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('账号不存在');
    this.profiles.splice(index, 1);
    this.save();
  }
}

module.exports = { normalizeNasUrl, validateProfile, ProfileStore };
