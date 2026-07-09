import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    askAgent: (prompt: string) => ipcRenderer.invoke('agent-request', prompt),
    onRateLimit: (callback: () => void) => {
        ipcRenderer.on('rate-limit-warning', () => callback())
    }
})
