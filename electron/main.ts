import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { GoogleGenAI, Type } from '@google/genai'
import { exec } from 'child_process'
import fs from 'fs'
import os from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

// Configuration file path to persist API Key
const CONFIG_PATH = path.join(app.getPath('userData'), 'os-agent-config.json')

// Simple dotenv loader to run at start of main process
function loadDotEnv() {
    const rootDir = process.env.VITE_DEV_SERVER_URL ? process.cwd() : app.getAppPath()
    const dotenvPath = path.resolve(rootDir, '.env')
    if (fs.existsSync(dotenvPath)) {
        try {
            const content = fs.readFileSync(dotenvPath, 'utf8')
            content.split(/\r?\n/).forEach(line => {
                // Ignore comments and empty lines
                if (line.trim().startsWith('#') || !line.trim()) return
                const idx = line.indexOf('=')
                if (idx !== -1) {
                    const key = line.substring(0, idx).trim()
                    let val = line.substring(idx + 1).trim()
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.substring(1, val.length - 1)
                    }
                    if (key && !process.env[key]) {
                        process.env[key] = val
                    }
                }
            })
        } catch (err) {
            console.error('Failed to parse .env file:', err)
        }
    }
}

// Load env variables at startup
loadDotEnv()

function getSavedApiKey(): string {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
            return config.apiKey || process.env.GEMINI_API_KEY || ''
        }
    } catch (e) {
        console.error('Error reading config file:', e)
    }
    return process.env.GEMINI_API_KEY || ''
}

function saveApiKey(apiKey: string) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ apiKey }, null, 2))
    } catch (e) {
        console.error('Error saving config file:', e)
    }
}

// Global active API Key
let activeApiKey = getSavedApiKey()


// Whitelist for application launcher
const APP_WHITELIST: Record<string, Record<string, string>> = {
    win32: {
        notepad: 'notepad.exe',
        calculator: 'calc.exe',
        calc: 'calc.exe',
        cmd: 'cmd.exe',
        powershell: 'powershell.exe',
        paint: 'mspaint.exe',
        explorer: 'explorer.exe UI',
    },
    darwin: {
        notepad: 'open -a TextEdit',
        calculator: 'open -a Calculator',
        terminal: 'open -a Terminal',
        safari: 'open -a Safari',
        chrome: 'open -a "Google Chrome"',
        notes: 'open -a Notes',
    },
    linux: {
        notepad: 'gedit',
        calculator: 'gnome-calculator',
        terminal: 'xterm',
    }
}

function execCommand(cmd: string): Promise<string> {
    return new Promise((resolve) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                resolve(`Error: ${error.message}`)
            } else {
                resolve(stdout || stderr || 'Command executed without output')
            }
        })
    })
}

function manageFileSystem(operation: string, targetPath: string, data?: string): string {
    const home = os.homedir()
    const resolvedPath = path.resolve(
        targetPath.startsWith('~')
            ? path.join(home, targetPath.slice(1))
            : targetPath
    )

    switch (operation) {
        case 'create': {
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
            fs.writeFileSync(resolvedPath, data || '', 'utf8')
            return `Successfully created file at "${resolvedPath}".`
        }
        case 'read': {
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`File does not exist: ${resolvedPath}`)
            }
            if (fs.statSync(resolvedPath).isDirectory()) {
                throw new Error(`Cannot read directory as file: ${resolvedPath}`)
            }
            return fs.readFileSync(resolvedPath, 'utf8')
        }
        case 'update': {
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
            fs.writeFileSync(resolvedPath, data || '', 'utf8')
            return `Successfully updated/overwrote file at "${resolvedPath}".`
        }
        case 'delete': {
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Path does not exist: ${resolvedPath}`)
            }
            const stat = fs.statSync(resolvedPath)
            if (stat.isDirectory()) {
                fs.rmSync(resolvedPath, { recursive: true, force: true })
                return `Successfully deleted folder recursively at "${resolvedPath}".`
            } else {
                fs.unlinkSync(resolvedPath)
                return `Successfully deleted file at "${resolvedPath}".`
            }
        }
        case 'listDir': {
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Path does not exist: ${resolvedPath}`)
            }
            const stat = fs.statSync(resolvedPath)
            if (!stat.isDirectory()) {
                throw new Error(`Path is a file, not a directory: ${resolvedPath}`)
            }
            const files = fs.readdirSync(resolvedPath)
            const items = files.map(file => {
                const itemPath = path.join(resolvedPath, file)
                try {
                    const itemStat = fs.statSync(itemPath)
                    return {
                        name: file,
                        isDirectory: itemStat.isDirectory(),
                        size: itemStat.size,
                        modifiedTime: itemStat.mtime
                    }
                } catch {
                    return { name: file, isDirectory: false, size: 0, error: 'Access denied' }
                }
            })
            return JSON.stringify(items, null, 2)
        }
        case 'search': {
            const query = (data || '').toLowerCase()
            const results: string[] = []
            function searchRecursive(dir: string, depth: number) {
                if (depth > 3) return
                try {
                    const entries = fs.readdirSync(dir, { withFileTypes: true })
                    for (const entry of entries) {
                        const full = path.join(dir, entry.name)
                        if (entry.name.toLowerCase().includes(query)) {
                            results.push(full)
                        }
                        if (entry.isDirectory()) {
                            searchRecursive(full, depth + 1)
                        }
                    }
                } catch {
                    // Ignore unreadable dirs
                }
            }
            searchRecursive(resolvedPath, 1)
            return JSON.stringify(results, null, 2)
        }
        default:
            throw new Error(`Unknown file operation: ${operation}`)
    }
}

async function getSystemMetrics(): Promise<string> {
    const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(2) + ' GB'
    const freeMem = (os.freemem() / (1024 ** 3)).toFixed(2) + ' GB'
    const cpuCores = os.cpus().length
    const cpuModel = os.cpus()[0]?.model || 'Unknown'
    const loadAvg = os.loadavg()
    const platform = os.platform()

    let diskSpace = 'Unable to fetch disk metrics'
    let batteryState = 'Unable to fetch battery metrics'

    try {
        if (platform === 'win32') {
            diskSpace = await execCommand('powershell -Command "Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object DeviceID, @{Name=\'SizeGB\';Expression={[Math]::Round($_.Size/1GB,2)}}, @{Name=\'FreeGB\';Expression={[Math]::Round($_.FreeSpace/1GB,2)}} | ConvertTo-Json"')
            batteryState = await execCommand('powershell -Command "Get-CimInstance -ClassName Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json"')
        } else {
            diskSpace = await execCommand('df -h /')
            if (platform === 'darwin') {
                batteryState = await execCommand('pmset -g batt')
            } else {
                batteryState = await execCommand("upower -i /org/freedesktop/UPower/devices/battery_BAT0 | grep -E 'state|percentage'")
            }
        }
    } catch (err: any) {
        console.error('Metrics fetch error:', err)
    }

    return JSON.stringify({
        platform,
        cpu: { model: cpuModel, cores: cpuCores, loadAverage: loadAvg },
        memory: { total: totalMem, free: freeMem },
        disk: diskSpace.trim(),
        battery: batteryState.trim()
    }, null, 2)
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'OS.Agent - AI Host Controller',
        // Elegant frame styling
        frame: true,
        show: false,
    })

    // Remove menu bar for a premium clean UI
    mainWindow.removeMenu()

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
    })

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

app.whenReady().then(() => {
    // IPC Handler
    ipcMain.handle('agent-request', async (_, prompt: string) => {
        const logs: string[] = []

        // If starting with key command, allow setting/storing API Key
        if (prompt.startsWith('/key ')) {
            const newKey = prompt.replace('/key ', '').trim()
            if (newKey) {
                activeApiKey = newKey
                saveApiKey(newKey)
                logs.push('[System] API Key updated and stored securely.')
                return JSON.stringify({
                    reply: 'Vite system has saved your Gemini API Key. You can now start issuing natural language commands!',
                    logs
                })
            } else {
                return JSON.stringify({
                    reply: 'Blank key provided. Format command: `/key YOUR_API_KEY`',
                    logs
                })
            }
        }

        const apiKey = activeApiKey || process.env.GEMINI_API_KEY
        if (!apiKey) {
            logs.push('[System Warning] Gemini API Key is not set.')
            return JSON.stringify({
                reply: 'Please set your Gemini API Key first by typing `/key YOUR_API_KEY` in the input field, or configure the GEMINI_API_KEY environment variable.',
                logs
            })
        }

        try {
            logs.push(`[Agent Status] Processing text command: "${prompt}"`)

            const genAI = new GoogleGenAI({ apiKey: apiKey })
            let currentContents: any[] = [{ role: 'user', parts: [{ text: prompt }] }]
            let loopCount = 0
            const maxLoops = 5

            while (loopCount < maxLoops) {
                logs.push(`[Model Call] Calling gemini-2.5-flash (Turn ${loopCount + 1})...`)

                const response = await genAI.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: currentContents,
                    config: {
                        systemInstruction: `You are the ultimate local computer operator. You have full root-level control over the host laptop. Analyze the user's request, choose the appropriate system, file, or resource tool, and execute it flawlessly. If a task requires multiple steps, execute them sequentially. If the user asks for general information, explanations, research, or coding tips, answer them conversationally in text without executing tools. Today's date is 2026-07-08.`,
                        tools: [
                            {
                                functionDeclarations: [
                                    {
                                        name: 'muteSystem',
                                        description: 'Toggles the laptop master audio volume between muted and unmuted.',
                                        parameters: {
                                            type: Type.OBJECT,
                                            properties: {}
                                        }
                                    },
                                    {
                                        name: 'openApplication',
                                        description: 'Safe application launcher for whitelisted programs. Supported apps: notepad, calculator, cmd, powershell, paint, explorer.',
                                        parameters: {
                                            type: Type.OBJECT,
                                            properties: {
                                                appName: {
                                                    type: Type.STRING,
                                                    description: 'The name of the application to open.'
                                                }
                                            },
                                            required: ['appName']
                                        }
                                    },
                                    {
                                        name: 'runSystemOperation',
                                        description: 'Execute a command-line operation directly on the user host OS in target terminal (PowerShell/CMD on Windows, Bash on macOS/Linux). Use this for resource commands, configuration changes, app management, display adjustments, process lifecycle control.',
                                        parameters: {
                                            type: Type.OBJECT,
                                            properties: {
                                                systemCommand: {
                                                    type: Type.STRING,
                                                    description: 'The raw system CLI command execution string.'
                                                }
                                            },
                                            required: ['systemCommand']
                                        }
                                    },
                                    {
                                        name: 'manageFileSystem',
                                        description: 'Comprehensive directory explorer, search query, creator, reader, updater, remover interface for files and folders.',
                                        parameters: {
                                            type: Type.OBJECT,
                                            properties: {
                                                operation: {
                                                    type: Type.STRING,
                                                    description: 'Action execution option: create, read, update, delete, listDir, search.'
                                                },
                                                targetPath: {
                                                    type: Type.STRING,
                                                    description: 'Path of the directory/file. Can use ~ to designate root user directory.'
                                                },
                                                data: {
                                                    type: Type.STRING,
                                                    description: 'Optional content payload, search key queries or options.'
                                                }
                                            },
                                            required: ['operation', 'targetPath']
                                        }
                                    },
                                    {
                                        name: 'getSystemMetrics',
                                        description: 'Retrieves current hardware telemetry (CPU average load, total/available memory size, logical drives status, battery statistics).',
                                        parameters: {
                                            type: Type.OBJECT,
                                            properties: {}
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                })

                const functionCalls = response.functionCalls
                if (!functionCalls || functionCalls.length === 0) {
                    logs.push(`[Model Success] Generation finished with text reply.`)
                    return JSON.stringify({
                        reply: response.text || 'Action complete.',
                        logs
                    })
                }

                const modelParts: any[] = []
                const functionResponseParts: any[] = []

                for (const call of functionCalls) {
                    const { name, args } = call
                    logs.push(`[Agent Step] Model requested tool: "${name}"` + (args ? ` with parameters: ${JSON.stringify(args)}` : ''))

                    let result = ''
                    if (name === 'muteSystem') {
                        try {
                            let cmd = ''
                            if (process.platform === 'win32') {
                                cmd = 'powershell -Command "(New-Object -ComObject Wscript.Shell).SendKeys([char]173)"'
                            } else if (process.platform === 'darwin') {
                                cmd = 'osascript -e "set volume output muted not (output muted of (get volume settings))"'
                            } else {
                                cmd = 'amixer set Master toggle || pactl set-sink-mute @DEFAULT_SINK@ toggle'
                            }

                            logs.push(`[OS Exec] Running volume toggle command...`)
                            const runOutput = await execCommand(cmd)
                            result = `System audio volume toggle action completed successfully. Output: ${runOutput}`
                            logs.push('[OS Success] System audio volume toggled.')
                        } catch (err: any) {
                            result = `Failed to toggle system volume: ${err.message}`
                            logs.push(`[OS Error] Failed to toggle volume: ${err.message}`)
                        }
                    } else if (name === 'openApplication') {
                        const appName = (args as any)?.appName
                        if (!appName) {
                            result = 'Error: appName parameter is required'
                            logs.push('[OS Error] Missing appName parameter.')
                        } else {
                            const platform = process.platform
                            const normalized = appName.toLowerCase().trim()
                            const platformWhitelist = APP_WHITELIST[platform] || {}
                            const sysCmd = platformWhitelist[normalized]

                            if (sysCmd) {
                                try {
                                    logs.push(`[OS Exec] Launching "${normalized}"...`)
                                    exec(sysCmd)
                                    result = `Successfully launched "${normalized}".`
                                    logs.push(`[OS Success] Application "${normalized}" started.`)
                                } catch (err: any) {
                                    result = `Failed to launch "${normalized}": ${err.message}`
                                    logs.push(`[OS Error] Launch error: ${err.message}`)
                                }
                            } else {
                                result = `Security Block: Application "${appName}" is not in the whitelist for platform "${platform}".`
                                logs.push(`[Security Check] Command "${appName}" blocked. Not whitelisted.`)
                            }
                        }
                    } else if (name === 'runSystemOperation') {
                        const systemCommand = (args as any)?.systemCommand
                        if (!systemCommand) {
                            result = 'Error: systemCommand parameter is required'
                            logs.push('[OS Error] Missing systemCommand parameter.')
                        } else {
                            try {
                                logs.push(`[OS Exec] Running command: "${systemCommand}"`)
                                const runOutput = await execCommand(systemCommand)
                                result = runOutput
                                logs.push(`[OS Success] Command execution completed.`)
                            } catch (err: any) {
                                result = `Execution Error: ${err.message}`
                                logs.push(`[OS Error] Command failed: ${err.message}`)
                            }
                        }
                    } else if (name === 'manageFileSystem') {
                        const operation = (args as any)?.operation
                        const targetPath = (args as any)?.targetPath
                        const data = (args as any)?.data
                        if (!operation || !targetPath) {
                            result = 'Error: operation and targetPath parameters are required'
                            logs.push('[OS Error] Missing operation or targetPath parameters.')
                        } else {
                            try {
                                logs.push(`[OS Exec] FileSystem operation "${operation}" on "${targetPath}"`)
                                const fsOutput = manageFileSystem(operation, targetPath, data)
                                result = fsOutput
                                logs.push(`[OS Success] FileSystem operation completed successfully.`)
                            } catch (err: any) {
                                result = `FileSystem Error: ${err.message}`
                                logs.push(`[OS Error] FileSystem operation failed: ${err.message}`)
                            }
                        }
                    } else if (name === 'getSystemMetrics') {
                        try {
                            logs.push('[OS Exec] Fetching device metrics...')
                            const metrics = await getSystemMetrics()
                            result = metrics
                            logs.push('[OS Success] Metrics fetched successfully.')
                        } catch (err: any) {
                            result = `Metrics Error: ${err.message}`
                            logs.push(`[OS Error] Fetching metrics failed: ${err.message}`)
                        }
                    } else {
                        result = `Error: Unknown tool "${name}"`
                        logs.push(`[Agent Step] Unknown tool execution blocked.`)
                    }

                    modelParts.push({ functionCall: call })
                    functionResponseParts.push({
                        functionResponse: {
                            name,
                            response: { result }
                        }
                    })
                }

                // Add back-and-forth results into the conversation history context
                currentContents.push({ role: 'model', parts: modelParts })
                currentContents.push({ role: 'function', parts: functionResponseParts })
                loopCount++
            }

            return JSON.stringify({
                reply: 'Loop limit exceeded. Agent tool steps might be recursive.',
                logs
            })
        } catch (e: any) {
            logs.push(`[Agent Error] ${e.message}`)
            return JSON.stringify({
                reply: `An error occurred while calling the Gemini API: ${e.message}`,
                logs
            })
        }
    })

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
