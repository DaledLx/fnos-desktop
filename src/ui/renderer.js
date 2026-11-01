/* global lucide */
lucide.createIcons();

const $ = (id) => document.getElementById(id);
let profiles = [];
let activeId = null;
let editingId = null;

function showNotice(message) {
  $('notice-text').textContent = message;
  $('notice').hidden = false;
}

function renderProfiles() {
  $('profiles').replaceChildren();
  for (const profile of profiles) {
    const item = document.createElement('button');
    item.className = `profile${profile.id === activeId ? ' active' : ''}`;
    item.type = 'button';
    item.title = profile.url;
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = profile.name.slice(0, 1).toUpperCase();
    const text = document.createElement('span');
    text.className = 'profile-text';
    const name = document.createElement('span');
    name.className = 'profile-name';
    name.textContent = profile.name;
    const address = document.createElement('span');
    address.className = 'profile-url';
    address.textContent = profile.url;
    text.append(name, address);
    item.append(avatar, text);
    item.addEventListener('click', () => select(profile.id));
    $('profiles').append(item);
  }
  $('welcome').hidden = Boolean(activeId);
  $('edit').hidden = !activeId;
  for (const id of ['reload', 'home']) $(id).disabled = !activeId;
}

async function select(id) {
  try {
    activeId = id;
    $('notice').hidden = true;
    renderProfiles();
    $('page-title').textContent = profiles.find((item) => item.id === id)?.name || '工作空间';
    await window.desktop.select(id);
  } catch (error) { showNotice(error.message); }
}

async function openEditor(profile) {
  editingId = profile?.id || null;
  $('dialog-title').textContent = profile ? '编辑账号' : '添加账号';
  $('name').value = profile?.name || '';
  $('url').value = profile?.url || '';
  $('delete').hidden = !profile;
  $('form-error').hidden = true;
  try {
    await window.desktop.setEditorOpen(true);
    $('editor').showModal();
    $('name').focus();
  } catch (error) {
    window.desktop.setEditorOpen(false);
    showNotice(error.message);
  }
}

async function save(event) {
  event.preventDefault();
  $('form-error').hidden = true;
  $('save').disabled = true;
  try {
    const profile = await window.desktop.upsert({ id: editingId, name: $('name').value, url: $('url').value });
    profiles = await window.desktop.list();
    $('editor').close();
    await select(profile.id);
  } catch (error) {
    $('form-error').textContent = error.message;
    $('form-error').hidden = false;
  } finally { $('save').disabled = false; }
}

async function remove() {
  const profile = profiles.find((item) => item.id === editingId);
  if (!profile || !confirm(`删除“${profile.name}”及其本机登录数据？`)) return;
  try {
    profiles = await window.desktop.remove(profile.id);
    $('editor').close();
    if (activeId === profile.id) {
      activeId = null;
      $('page-title').textContent = '工作空间';
      $('address').textContent = '选择账号以打开飞牛 NAS';
      $('back').disabled = true;
      $('forward').disabled = true;
      if (profiles.length) await select(profiles[0].id);
    }
    renderProfiles();
  } catch (error) { showNotice(error.message); }
}

$('add').addEventListener('click', () => openEditor());
$('welcome-add').addEventListener('click', () => openEditor());
$('edit').addEventListener('click', () => openEditor(profiles.find((item) => item.id === activeId)));
$('profile-form').addEventListener('submit', save);
$('editor').addEventListener('close', () => window.desktop.setEditorOpen(false));
$('delete').addEventListener('click', remove);
for (const id of ['cancel', 'cancel-x']) $(id).addEventListener('click', () => $('editor').close());
for (const action of ['back', 'forward', 'reload', 'home']) $(action).addEventListener('click', () => window.desktop.navigate(action));
$('notice-close').addEventListener('click', () => { $('notice').hidden = true; });
window.desktop.onState((state) => {
  if (state.activeId !== activeId) return;
  if (state.error) { showNotice(state.error); return; }
  $('address').textContent = state.url || profiles.find((item) => item.id === activeId)?.url || '';
  $('loading').hidden = !state.loading;
  $('back').disabled = !state.canGoBack;
  $('forward').disabled = !state.canGoForward;
});

window.desktop.list().then((items) => {
  profiles = items;
  renderProfiles();
  if (profiles.length) select(profiles[0].id);
}).catch((error) => showNotice(error.message));
