#  OS.Agent

An autonomous desktop control assistant built with **Electron**, **React**, and **TypeScript**. Powered by the **Google Gen AI SDK (`gemini-2.5-flash`)**, OS.Agent bridges the gap between natural language and local operating system automation, allowing you to control your computer through a clean, modern desktop interface.

Built with a **custom red-wine and cream glassmorphism design system** for a premium desktop experience.

---

##  Features

###  AI-Powered OS Automation
- Converts natural language into executable operating system commands.
- Supports PowerShell (Windows) and Bash (Linux/macOS).
- Open applications, control settings, and automate everyday tasks.

### 📂 Advanced File Management
- Create, read, update, delete, and organize files.
- Search directories instantly.
- Perform local filesystem operations securely.

### 📊 System Diagnostics
Monitor your computer in real time:

- CPU Usage
- Memory Statistics
- Battery Percentage
- Disk Capacity
- Operating System Information

### ⚡ Graceful API Quota Handling
- Detects Gemini API quota/rate limits.
- Displays friendly warnings instead of crashing.
- Prevents UI freezing during API failures.

### 🔐 Secure API Key Storage
- Loads your Gemini API key automatically from a local `.env` file.
- Eliminates repeated API key entry.
- Keeps credentials outside source control.

### 🎨 Modern Desktop UI
- Electron desktop application
- Glassmorphism interface
- Red-wine & cream custom theme
- Responsive layouts
- Smooth animations

---

# 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | React.js |
| Build Tool | Vite |
| Language | TypeScript |
| Desktop Framework | Electron |
| Styling | Tailwind CSS |
| AI SDK | Google Gen AI (`@google/genai`) |
| System Automation | Node.js (`child_process`, `fs`, `os`) |
| Desktop Automation | `@nut-tree/nut-js` |

---

# 📦 Installation

## Prerequisites

Make sure you have installed:

- Node.js (v18+ recommended)
- npm

---

## 1. Clone the Repository

```bash
git clone https://github.com/sivamohana008/OS_Agent.git
cd OS_Agent
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Environment Variables

Create a `.env` file in the project root.

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

> **Security Note**
>
> The `.env` file is ignored by Git using `.gitignore`, ensuring your API key is never committed to version control.

---

## 4. Run the Development Server

```bash
npm run dev
```

The application will automatically:

- Build Electron
- Start the Vite development server
- Enable Hot Module Replacement (HMR)
- Launch the desktop application

---

# 📁 Project Structure

```text
OS_Agent/
│
├── electron/
│   ├── main.ts
│   │      Electron Main Process
│   │      AI orchestration
│   │      System command execution
│   │
│   └── preload.ts
│          Secure Context Bridge
│          Exposes window.electronAPI
│
├── src/
│   ├── App.tsx
│   │      Main UI
│   │      Chat Interface
│   │      Glassmorphism Components
│   │
│   ├── main.tsx
│   │      React Entry Point
│   │
│   └── electron.d.ts
│          TypeScript typings
│
├── .env
│      Gemini API Key
│
├── vite.config.ts
│      Vite + Electron Configuration
│
├── package.json
│
└── README.md
```

---

# How It Works

1. User enters a natural language command.

2. The prompt is sent to **Gemini 2.5 Flash**.

3. Gemini converts the request into structured tool calls.

4. Electron securely invokes Node.js modules.

5. The requested OS action is executed.

6. Results are returned to the interface.

---

#  Example Commands

```
Open Chrome

Create a folder called Projects

Search for resume.pdf

Show CPU usage

Check battery percentage

Open VS Code

List files inside Downloads

Delete temp.txt

Create notes.txt on Desktop

Open Settings
```

---

#  Safety & Security

Since OS.Agent performs local system operations, several safety mechanisms are built in.

### ✅ Command Whitelisting

Only predefined safe commands are executed.

---

### ✅ Injection Protection

User input is validated before reaching terminal execution.

---

### ✅ Confirmation Layer

Potentially destructive actions require manual confirmation.

Examples include:

- Recursive directory deletion
- Removing multiple files
- System-level modifications

---

### ✅ Local Processing

- Files never leave your computer.
- API communication only occurs with Gemini for AI reasoning.
- Local operations remain entirely on your machine.

---

# 📄 License

This project is licensed under the MIT License.

---

# 👨‍💻 Author

**Siva Mohana Narra**

GitHub: https://github.com/sivamohana008

---

## ⭐ Support

If you found this project useful, consider giving it a **⭐ Star** on GitHub. It helps others discover the project and motivates future development.

