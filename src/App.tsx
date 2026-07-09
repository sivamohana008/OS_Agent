import React, { useState, useEffect, useRef } from 'react'
import {
  Send,
  Terminal,
  VolumeX,
  AppWindow,
  Key,
  Cpu,
  Loader2,
  Play
} from 'lucide-react'
import './App.css'

interface Message {
  id: string
  role: 'user' | 'agent'
  text: string
  timestamp: Date
}

interface AgentLog {
  id: string
  text: string
  timestamp: string
  type: 'success' | 'error' | 'warn' | 'step' | 'exec' | 'sys'
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'agent',
      text: 'Welcome to OS.Agent. I can interact with your host operating system. Try asking me to "mute the system volume" or "open notepad".\n\nIf you haven\'t set your Gemini API key in your environment, setup your key using: `/key YOUR_API_KEY`',
      timestamp: new Date()
    }
  ])
  const [logs, setLogs] = useState<AgentLog[]>([
    {
      id: 'initialized-log',
      text: 'OS.Agent terminal monitor operational. Awaiting command dispatch...',
      timestamp: new Date().toLocaleTimeString(),
      type: 'sys'
    }
  ])
  const [inputVal, setInputVal] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.onRateLimit === 'function') {
      window.electronAPI.onRateLimit(() => {
        setLogs((prev) => [
          ...prev,
          {
            id: `rate-limit-warn-${Date.now()}`,
            text: "System rate limit reached. Backing off and retrying operation automatically...",
            timestamp: new Date().toLocaleTimeString(),
            type: 'warn'
          }
        ])
      })
    }
  }, [])

  const sendPrompt = async (promptText: string) => {
    if (!promptText.trim() || isLoading) return

    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: promptText,
      timestamp: new Date()
    }
    setMessages((prev) => [...prev, userMsg])
    setInputVal('')
    setIsLoading(true)

    // Add initial system dispatch log
    const startLog: AgentLog = {
      id: `dispatch-log-${Date.now()}`,
      text: `Dispatching command to Electron main: "${promptText}"`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sys'
    }
    setLogs((prev) => [...prev, startLog])

    try {
      // Invoke IPC bridge exposed in preload.ts
      const resultStr = await window.electronAPI.askAgent(promptText)
      const data = JSON.parse(resultStr)

      // Add response message
      const agentMsg: Message = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        text: data.reply,
        timestamp: new Date()
      }
      setMessages((prev) => [...prev, agentMsg])

      // Push logs from the execution steps
      if (data.logs && Array.isArray(data.logs)) {
        const parsedLogs: AgentLog[] = data.logs.map((log: string, idx: number) => {
          let type: AgentLog['type'] = 'step'
          if (log.includes('[OS Success]')) type = 'success'
          else if (log.includes('[OS Error]') || log.includes('[Agent Error]')) type = 'error'
          else if (log.includes('[System Warning]') || log.includes('[Security Check]')) type = 'warn'
          else if (log.includes('[OS Exec]')) type = 'exec'
          else if (log.includes('[System]')) type = 'sys'

          return {
            id: `log-${Date.now()}-${idx}`,
            text: log,
            timestamp: new Date().toLocaleTimeString(),
            type
          }
        })
        setLogs((prev) => [...prev, ...parsedLogs])
      }
    } catch (e: any) {
      console.error(e)
      setMessages((prev) => [
        ...prev,
        {
          id: `error-msg-${Date.now()}`,
          role: 'agent',
          text: `Communications offline or error occurred: ${e.message}`,
          timestamp: new Date()
        }
      ])
      setLogs((prev) => [
        ...prev,
        {
          id: `error-log-${Date.now()}`,
          text: `[App Error] IPC dispatch channel threw exception: ${e.message}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'error'
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      sendPrompt(inputVal)
    }
  }

  const runQuickCommand = (prompt: string) => {
    if (isLoading) return
    if (prompt === '/key ') {
      setInputVal('/key ')
    } else {
      sendPrompt(prompt)
    }
  }

  const getLogClassAndTag = (type: AgentLog['type']) => {
    switch (type) {
      case 'success':
        return { cls: 'success-step', tag: 'OK', tagCls: 'success' }
      case 'error':
        return { cls: 'error-step', tag: 'ERR', tagCls: 'error' }
      case 'warn':
        return { cls: 'warn-step', tag: 'WRN', tagCls: 'warn' }
      case 'exec':
        return { cls: 'exec-step', tag: 'CMD', tagCls: 'exec' }
      case 'sys':
        return { cls: 'sys-step', tag: 'SYS', tagCls: 'sys' }
      default:
        return { cls: 'agent-step', tag: 'AGNT', tagCls: 'step' }
    }
  }

  const clearConsole = () => {
    setLogs([
      {
        id: `clear-${Date.now()}`,
        text: 'Console log cleared.',
        timestamp: new Date().toLocaleTimeString(),
        type: 'sys'
      }
    ])
  }

  return (
    <div className="app-container">
      {/* Left Chat Panel */}
      <div className="chat-section">
        <div className="app-header">
          <div className="brand">
            <Cpu className="brand-icon" />
            <div>
              <h1>OS.Agent</h1>
              <p style={{ fontSize: '10px', color: 'var(--cream-muted)', margin: 0 }}>Google GenAI Host Assistant</p>
            </div>
          </div>
          <div className="status-badge">
            <span className={`status-indicator ${isLoading ? 'loading' : ''}`} />
            <span>{isLoading ? 'Thinking' : 'Ready'}</span>
          </div>
        </div>

        <div className="messages-list">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-bubble ${msg.role}`}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              <div
                style={{
                  fontSize: '9px',
                  color: 'var(--cream-muted)',
                  marginTop: '6px',
                  textAlign: msg.role === 'user' ? 'right' : 'left'
                }}
              >
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="input-area">
          <div className="quick-actions">
            <button className="quick-btn" onClick={() => runQuickCommand('mute system volume')}>
              <VolumeX size={12} />
              Mute Toggle
            </button>
            <button className="quick-btn" onClick={() => runQuickCommand('open notepad')}>
              <AppWindow size={12} />
              Open Notepad
            </button>
            <button className="quick-btn" onClick={() => runQuickCommand('open calculator')}>
              <Play size={12} />
              Open Calculator
            </button>
            <button className="quick-btn" onClick={() => runQuickCommand('/key ')}>
              <Key size={12} />
              Set API Key
            </button>
          </div>

          <div className="input-row">
            <input
              type="text"
              className="prompt-input"
              placeholder={isLoading ? 'Agent is working...' : 'Ask agent to mute volume, run notepad, or enter API key...'}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isLoading}
            />
            <button
              className="send-btn"
              onClick={() => sendPrompt(inputVal)}
              disabled={isLoading || !inputVal.trim()}
            >
              {isLoading ? <Loader2 size={16} className="status-indicator loading" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Right Monitor Panel */}
      <div className="console-section">
        <div className="console-header">
          <Terminal size={14} style={{ color: 'var(--burgundy-accent)' }} />
          <span>System Execution Log</span>
          <div className="console-header-actions">
            <button className="clear-btn" onClick={clearConsole}>
              Clear
            </button>
          </div>
        </div>

        <div className="console-list">
          {logs.map((log) => {
            const { cls, tag, tagCls } = getLogClassAndTag(log.type)
            return (
              <div key={log.id} className={`console-line ${cls}`}>
                <span className="timestamp">[{log.timestamp}]</span>
                <span className={`tag ${tagCls}`}>{tag}</span>
                <span>{log.text}</span>
              </div>
            )
          })}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  )
}

export default App
