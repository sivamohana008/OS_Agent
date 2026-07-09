let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", { askAgent: (prompt) => electron.ipcRenderer.invoke("ask-agent", prompt) });
//#endregion
