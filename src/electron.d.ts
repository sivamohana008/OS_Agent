interface ElectronAPI {
    askAgent: (prompt: string) => Promise<string>;
    onRateLimit: (callback: () => void) => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export { };
