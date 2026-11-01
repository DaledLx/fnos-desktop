const path = require('node:path');
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, safeStorage, screen } = require('electron');
const { ProfileStore } = require('./profiles');
const { CookieVault } = require('./cookies');

const SIDEBAR = 252;
const TOOLBAR = 104;
let window;
let store;
let vault;
let activeId = null;
let editorOpen = false;
const views = new Map();
const readySessions = new Map();

function state(view = views.get(activeId)) {
  if (!window || window.isDestroyed()) return;
  const page = view?.webContents;
  window.webContents.send('page:state', {
    activeId,
    url: page?.getURL() || '',
    title: page?.getTitle() || '',
    loading: page?.isLoading() || false,
    canGoBack: page?.navigationHistory.canGoBack() || false,
    canGoForward: page?.navigationHistory.canGoForward() || false
  });
}

function fitView() {
  if (!window) return;
  const [width, height] = window.getContentSize();
  for (const view of views.values()) {
    view.setBounds({ x: SIDEBAR, y: TOOLBAR, width: Math.max(1, width - SIDEBAR), height: Math.max(1, height - TOOLBAR) });
  }
}

function isProfileOrigin(id, url) {
  const profile = store.list().find((item) => item.id === id);
  if (!profile) return false;
  try {
    const target = new URL(url);
    const configured = new URL(profile.url);
    return ['http:', 'https:'].includes(target.protocol) &&
      target.hostname === configured.hostname &&
      (configured.protocol === 'http:' || target.protocol === 'https:');
  } catch { return false; }
}

function openExternal(url) {
  try {
    if (['http:', 'https:'].includes(new URL(url).protocol)) shell.openExternal(url);
  } catch { /* Ignore malformed links supplied by a web page. */ }
}

async function getSession(profile) {
  if (readySessions.has(profile.id)) return readySessions.get(profile.id);
  const pending = (async () => {
    const ses = session.fromPartition(`persist:fnos-${profile.id}`);
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    await vault.restore(profile.id, ses);
    vault.watch(profile.id, ses);
    return ses;
  })();
  readySessions.set(profile.id, pending);
  return pending;
}

async function selectProfile(id) {
  const profile = store.list().find((item) => item.id === id);
  if (!profile) throw new Error('账号不存在');
  const previous = views.get(activeId);
  if (previous) window.contentView.removeChildView(previous);
  activeId = id;
  let view = views.get(id);
  if (!view) {
    const ses = await getSession(profile);
    view = new WebContentsView({ webPreferences: {
      session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false
    } });
    views.set(id, view);
    const page = view.webContents;
    page.setWindowOpenHandler(({ url }) => {
      if (isProfileOrigin(id, url)) page.loadURL(url).catch(() => {});
      else openExternal(url);
      return { action: 'deny' };
    });
    page.on('will-navigate', (event, url) => {
      if (!isProfileOrigin(id, url)) {
        event.preventDefault();
        openExternal(url);
      }
    });
    page.on('will-redirect', (event, url) => {
      if (!isProfileOrigin(id, url)) {
        event.preventDefault();
        openExternal(url);
      }
    });
    for (const event of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) {
      page.on(event, () => { if (activeId === id) state(view); });
    }
    page.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && activeId === id) {
        window.webContents.send('page:state', { activeId: id, error: `无法打开 ${url}：${description}` });
      }
    });
    page.loadURL(profile.url).catch(() => {});
  }
  if (activeId !== id || !store.list().some((item) => item.id === id)) return;
  window.contentView.addChildView(view);
  view.setVisible(!editorOpen);
  fitView();
  state(view);
}

function registerHandlers() {
  ipcMain.handle('profiles:list', () => store.list());
  ipcMain.handle('profiles:upsert', async (_event, input) => {
    const old = store.list().find((item) => item.id === input.id);
    const profile = store.upsert(input);
    if (old && old.url !== profile.url) {
      const view = views.get(profile.id);
      if (view) view.webContents.loadURL(profile.url).catch(() => {});
    }
    return profile;
  });
  ipcMain.handle('profiles:remove', async (_event, id) => {
    if (!store.list().some((item) => item.id === id)) throw new Error('账号不存在');
    const view = views.get(id);
    if (view) {
      if (activeId === id) window.contentView.removeChildView(view);
      view.webContents.close();
      views.delete(id);
    }
    if (activeId === id) activeId = null;
    const ses = await getSession(store.list().find((item) => item.id === id));
    await vault.clear(id, ses);
    readySessions.delete(id);
    store.remove(id);
    state();
    return store.list();
  });
  ipcMain.handle('profiles:select', async (_event, id) => {
    await selectProfile(id);
    return true;
  });
  ipcMain.handle('page:editor', (_event, open) => {
    editorOpen = Boolean(open);
    views.get(activeId)?.setVisible(!editorOpen);
  });
  ipcMain.handle('page:navigate', (_event, action) => {
    const page = views.get(activeId)?.webContents;
    if (!page) return;
    const history = page.navigationHistory;
    if (action === 'back' && history.canGoBack()) history.goBack();
    if (action === 'forward' && history.canGoForward()) history.goForward();
    if (action === 'reload') page.reload();
    if (action === 'home') page.loadURL(store.list().find((item) => item.id === activeId).url).catch(() => {});
  });
}

app.whenReady().then(() => {
  store = new ProfileStore(path.join(app.getPath('userData'), 'profiles.json'));
  vault = new CookieVault(path.join(app.getPath('userData'), 'session-cookies'), safeStorage);
  registerHandlers();
  const { width: availableWidth, height: availableHeight } = screen.getPrimaryDisplay().workAreaSize;
  window = new BrowserWindow({
    width: Math.min(1600, Math.max(760, Math.floor(availableWidth * 0.92))),
    height: Math.min(960, Math.max(520, Math.floor(availableHeight * 0.92))),
    minWidth: 760, minHeight: 520, center: true,
    title: '飞牛桌面', backgroundColor: '#f4f6f7',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  window.removeMenu();
  window.on('resize', fitView);
  window.on('closed', () => {
    for (const view of views.values()) view.webContents.close();
    views.clear();
    window = null;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, 'ui', 'index.html'));
});

app.on('window-all-closed', () => app.quit());
