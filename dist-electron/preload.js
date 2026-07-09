let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	askAgent: (prompt) => electron.ipcRenderer.invoke("agent-request", prompt),
	onRateLimit: (callback) => {
		electron.ipcRenderer.on("rate-limit-warning", () => callback());
	}
});
//#endregion
