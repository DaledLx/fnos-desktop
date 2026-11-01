const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  list: () => ipcRenderer.invoke('profiles:list'),
  upsert: (profile) => ipcRenderer.invoke('profiles:upsert', profile),
  remove: (id) => ipcRenderer.invoke('profiles:remove', id),
  select: (id) => ipcRenderer.invoke('profiles:select', id),
  setEditorOpen: (open) => ipcRenderer.invoke('page:editor', open),
  navigate: (action) => ipcRenderer.invoke('page:navigate', action),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('page:state', listener);
    return () => ipcRenderer.removeListener('page:state', listener);
  }
});
