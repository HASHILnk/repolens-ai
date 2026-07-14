# RepoLens: AI-Powered Project Analysis Platform

RepoLens is a full-stack, AI-assisted project analysis and reverse-engineering platform. It accepts a GitHub repository URL, uploaded ZIP archive, or website URL, extracts structural and technical signals, builds a structured engineering report, renders a Mermaid flowchart, and provides a project-aware chat interface for follow-up questions.

The system is designed with a client-server architecture using a React + TypeScript frontend built with Vite, and a Node.js + Express backend. It optionally integrates with Model Context Protocol (MCP) servers and OpenAI-compatible LLM providers. When AI keys or MCP servers are unavailable, RepoLens seamlessly falls back to deterministic heuristic-based analysis.

---

## Table of Contents
1. [Key Features](#key-features)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Main Application & Data Flow](#main-application--data-flow)
5. [API Endpoints](#api-endpoints)
6. [Source Analysis Inspectors](#source-analysis-inspectors)
7. [MCP Integration](#mcp-integration)
8. [Configuration & Environment Variables](#configuration--environment-variables)
9. [How to Run the Project](#how-to-run-the-project)
10. [Build and Verification](#build-and-verification)
11. [Project Strengths, Limitations, & Future Roadmap](#project-strengths-limitations--future-roadmap)

---

## Key Features

- **Multi-Source Ingestion**: Analyze code directly from a public GitHub URL, an uploaded ZIP archive (up to 25 MB), or a website URL.
- **Automated Technology Detection**: Scans dependencies, configuration files, file extensions, and code heuristics to detect frontend frameworks, backend runtimes, database ORMs, state managers, and utilities.
- **Component & API Mapping**: Scans directory structures and files to identify React/Vue/Svelte-style UI components, Express/Next.js-style API route definitions, database signals (Prisma, SQL schemas, migrations), and authentication flows (OAuth, JWT, Passport, NextAuth).
- **Mermaid Flowchart Generation**: Generates architectural and page flow diagrams on the fly to help developers visualize layout hierarchies.
- **Pipeline Progress Board**: Displays the status of MCP servers (GitHub, Fetch, Filesystem, Context7) and the LLM analysis enhancement step.
- **Project-Aware Chat Panel**: Engage in an interactive conversation with an AI assistant that understands the compiled repository analysis and answers detailed questions.
- **Robust Deterministic Fallback**: Even without LLM keys or local MCP server instances, the system provides standard, heuristic-based structured reports.

---

## Technology Stack

| Component | Technology / Library |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript |
| **Build Tooling** | Vite |
| **Icons & Visualization** | Lucide React, Mermaid |
| **Backend Runtime** | Node.js, Express (v5) |
| **Multipart Uploads** | Multer |
| **ZIP Extraction** | JSZip (Memory-only) |
| **Configuration** | Dotenv (`.env`), `mcp.config.json` |
| **MCP Integration** | `@modelcontextprotocol/sdk` |
| **Code Linting** | oxlint |

---

## System Architecture

RepoLens uses a classic client-server model:

```mermaid
flowchart TD
    Input[GitHub URL / ZIP File / Website URL] --> Client[React Frontend (App.tsx)]
    Client -->|POST /api/analyze| Server[Express Backend (server/index.js)]
    
    Server --> Heuristics[Deterministic Analysis Engine]
    Server -.->|Optional SDK| MCP[Model Context Protocol Servers]
    Server -.->|Optional AI Key| LLM[LLM Provider API]
    
    Heuristics & MCP & LLM --> Server
    Server -->|Structured JSON Output| Client
    Client --> Output[Interactive Dashboard & Project Chat]
```

### Key Directory Layout
- `src/App.tsx`: The main dashboard containing source selection panels, tabs for the analysis results, Mermaid diagram rendering, and the chat interface.
- `src/App.css`: Visual styling, responsive layouts, tab controls, pipeline badges, and responsive CSS rules.
- `server/index.js`: Full backend Express server containing routing logic, file parsers, zip extraction, heuristic scanning, MCP client bindings, and LLM completions.
- `vite.config.ts`: Vite compilation settings, proxy rules routing `/api` traffic to backend port `8787`.
- `.env.example` / `mcp.config.example.json`: Templates for local environment and MCP tool server declarations.

---

## Main Application & Data Flow

1. **Intake**: The user supplies a repository URL, uploads a ZIP project, or enters a website URL in the React client.
2. **Request Submission**: The frontend submits a `FormData` request to `POST /api/analyze`.
3. **Inspector Resolution**: The backend resolves the matching handler:
   - `inspectGitHub`: Extracts owner/repo, attempts GitHub MCP for file listing and reads, falls back to raw GitHub API endpoints.
   - `inspectZip`: Extracts content into RAM using `jszip`, parses file trees, and reads configurations. Key files are written to `.repolens-uploads/` for Filesystem MCP access if configured.
   - `inspectWebsite`: Retrieves page metadata, DOM structures, and scripts using Fetch MCP or native fetch fallback.
4. **Heuristics Evaluation**: The backend runs the deterministic parser to generate a draft report (structure, components, API paths, databases, and deployment configuration).
5. **Context7 Lookup**: Checks if the Context7 MCP server is online to fetch latest library and framework documentation to supplement analysis.
6. **AI Enrichment**: If an LLM provider is configured, the backend sends the gathered codebase evidence to the model to produce detailed summaries, improvements, and structured responses.
7. **Response & Visualization**: The backend returns the structured JSON report. The frontend populates the dashboard, rendering Mermaid graphs and updating the Chat context.
8. **Follow-up Chat**: Subsequent user prompts go to `POST /api/chat` with current analysis context.

---

## API Endpoints

| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/api/analyze` | Accepts files (ZIP upload) or JSON (GitHub/website URL) and compiles the structural analysis report. |
| `POST` | `/api/chat` | Accepts the user prompt and current analysis context, returning a structured chat response. |
| `GET` | `/api/status` | Returns backend LLM status, including configured provider and model metadata. |

---

## Source Analysis Inspectors

### GitHub Repository Inspector
Parses the URL to extract `owner` and `repo` details. If a `GITHUB_TOKEN` is present in `.env`, it attaches auth headers. It attempts to call GitHub MCP tools (e.g., listing trees, reading contents). If missing, it makes direct calls to standard GitHub REST APIs.

### ZIP Archive Inspector
Ingests the ZIP file using `multer`. It parses files asynchronously in memory with JSZip. It searches for configuration files (`package.json`, `tsconfig.json`, `composer.json`, `requirements.txt`) and reads codebase entry points to feed the heuristic parser. Selected files are written to `.repolens-uploads/` to let local Filesystem MCP servers inspect them.

### Website Inspector
Fetches raw HTML pages using Fetch MCP or Axios/native fetch. It parses headers, `meta` tags, script sources, and main content blocks to identify client-side libraries, layout architectures, and page purposes.

---

## MCP Integration

RepoLens links with Model Context Protocol (MCP) servers via `mcp.config.json`. The following integrations are configured:

- **GitHub MCP**: Utilized to read repository structures and files.
- **Fetch MCP**: Fetches documentation, external articles, and website HTML.
- **Filesystem MCP**: Inspects local paths and file trees inside the `.repolens-uploads/` folder.
- **Context7 MCP**: Accesses up-to-date SDKs and developer documentation for libraries detected in the codebase.

---

## Configuration & Environment Variables

Create a `.env` file in the root directory. Below are the key environment configurations:

```env
# Backend Server Configuration
PORT=8787

# GitHub Configuration
GITHUB_TOKEN=your_github_personal_access_token_here

# MCP Settings
MCP_CONFIG_PATH=mcp.config.json

# --- LLM Provider Selection (Configure ONE) ---

# 1. xAI Grok
XAI_API_KEY=your_xai_key
LLM_MODEL=grok-4-latest

# 2. Groq-hosted Llama
GROQ_API_KEY=your_groq_key
LLM_MODEL=llama-3.3-70b-versatile

# 3. Ollama (Local LLM)
OLLAMA_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1

# 4. OpenAI
OPENAI_API_KEY=your_openai_key
LLM_MODEL=gpt-4o

# 5. Custom OpenAI-Compatible Provider
LLM_BASE_URL=https://api.yourprovider.com/v1
LLM_API_KEY=your_custom_provider_key
LLM_MODEL=your-preferred-model
```

---

## How to Run the Project

### Prerequisites
- Node.js (v18 or higher recommended)
- npm (v9 or higher)

### Setup & Run
1. **Clone the project & install dependencies**:
   ```bash
   npm install
   ```

2. **Prepare configuration files**:
   ```bash
   # Copy environment settings
   cp .env.example .env

   # Copy Model Context Protocol config
   cp mcp.config.example.json mcp.config.json
   ```

3. **Configure environment credentials**:
   Open `.env` and fill in your LLM API keys and optional GitHub token.

4. **Start the development server**:
   ```bash
   npm run dev
   ```
   This command starts the backend Express server on port `8787` and the Vite React server on port `5173` concurrently.

5. **Access the application**:
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Build and Verification

### Project Build
To compile the TypeScript project and generate static frontend assets:
```bash
npm run build
```
The compiled frontend bundle will be located inside the `dist/` folder, ready for production hosting.

### Linter Check
To verify codebase format and catch potential issues using the `oxlint` linter:
```bash
npm run lint
```

---

## Project Strengths, Limitations, & Future Roadmap

### Strengths
- **Fully Modular**: Works perfectly as a static analyzer when AI configurations are absent.
- **Integrative**: Uses Model Context Protocol to seamlessly communicate with Git repositories and local filesystem trees.
- **Clean UI**: Dashboard includes detailed tabs, Mermaid flowchart rendering, and a side-docked chat window.

### Limitations
- **File Parsing Limits**: Larger projects undergo file sampling to prevent context window overflows.
- **Archive Size**: Limit on ZIP uploads is configured at 25 MB to prevent server memory bloat.
- **Inference Speed**: Depends on the speed of the selected third-party LLM provider.

### Future Roadmap
1. **Export Formats**: Allow downloading generated reports as PDF, Markdown, or DOCX documents.
2. **Deep Dependency Graphs**: Graphing connections between files to construct visual import maps.
3. **Scan Job Queues**: Transition scanner to background workers to handle repositories larger than 1 GB.
4. **Persistent History**: Allow users to log in, save analyzed repositories, and view historical project audits.
