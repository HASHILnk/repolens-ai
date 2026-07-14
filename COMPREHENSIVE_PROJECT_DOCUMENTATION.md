# RepoLens Comprehensive Project Documentation

## 1. Project Identity

**Project name:** RepoLens  
**Full title:** RepoLens: AI-Powered Project Analysis Platform  
**Project type:** Full-stack web application  
**Primary purpose:** Reverse engineer and explain software projects, websites, and uploaded source archives through automated inspection, optional AI enhancement, and an interactive dashboard.

RepoLens is an AI-assisted project analysis platform. It accepts a GitHub repository URL, uploaded ZIP archive, or website URL, extracts structural and technical signals, builds a structured engineering report, renders a Mermaid flowchart, and provides a project-aware chat interface for follow-up questions.

The project is built as a Vite React frontend with a Node.js Express analyzer API. It optionally integrates with Model Context Protocol servers and OpenAI-compatible LLM providers.

## 2. Problem Statement

Developers, students, reviewers, and technical teams often need to understand unfamiliar projects quickly. Manually reading repository folders, package manifests, README files, route files, configuration files, and deployment setup takes time. RepoLens reduces this effort by automatically collecting important project evidence and presenting it as a structured, navigable engineering map.

## 3. Main Objectives

- Analyze unfamiliar software projects quickly.
- Support multiple source types: GitHub repositories, ZIP archives, and websites.
- Detect technologies, architecture patterns, API routes, components, database signals, authentication hints, deployment setup, and improvement opportunities.
- Work even when AI or MCP tools are unavailable by using deterministic fallback analysis.
- Use optional LLMs to improve generated summaries and explanations.
- Provide a chat interface that answers questions from the generated analysis.
- Present technical findings in a clean dashboard rather than as raw text only.

## 4. Core Features

- GitHub repository analysis from public repository URLs.
- ZIP archive upload and analysis with a 25 MB upload limit.
- Website URL analysis through HTML fetching and text extraction.
- MCP integration for GitHub, Fetch, Filesystem, and Context7 servers.
- Fallback analysis when MCP servers are missing or fail.
- Optional LLM enhancement through OpenAI-compatible chat completion APIs.
- Tech stack detection from dependencies, file extensions, source text, and config files.
- Component detection for React, Vue, and Svelte-style frontend projects.
- API route detection from file paths and Express/router method patterns.
- Database signal detection for Prisma, migrations, Mongoose, Sequelize, Drizzle, PostgreSQL, and related references.
- Authentication signal detection for NextAuth/Auth.js, JWT, OAuth, Passport, middleware, guards, and protected-route naming.
- Deployment signal detection from package scripts, Docker files, Compose files, GitHub Actions, and hosting config files.
- Mermaid flowchart generation.
- Pipeline status display for MCP and LLM steps.
- Project-aware chat panel.
- Markdown-style chat rendering for paragraphs, bullet lists, inline code, bold text, and fenced code blocks.

## 5. Technology Stack

| Area | Technology |
| --- | --- |
| Frontend framework | React 19 |
| Frontend language | TypeScript |
| Build tool | Vite |
| UI icons | lucide-react |
| Diagrams | Mermaid |
| Backend runtime | Node.js |
| Backend framework | Express 5 |
| Upload handling | multer |
| ZIP reading | JSZip |
| Environment config | dotenv |
| MCP integration | `@modelcontextprotocol/sdk` |
| Development process | concurrently |
| Linting | oxlint |
| Package manager | npm |

## 6. Repository Structure

Important project files and folders:

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Main React application, dashboard UI, analysis tabs, chat panel, client-side API calls, Mermaid rendering. |
| `src/App.css` | Main application styling, responsive layout, dashboard, cards, tabs, chat, diagrams, and mobile rules. |
| `src/main.tsx` | React entry point that mounts `App` into `#root` under `StrictMode`. |
| `src/index.css` | Global CSS reset and base font/background styles. |
| `server/index.js` | Express API server, source inspectors, MCP manager, deterministic analyzer, LLM integration, chat logic. |
| `package.json` | npm scripts and dependency list. |
| `vite.config.ts` | Vite React config and `/api` proxy to backend port `8787`. |
| `index.html` | HTML shell for Vite app. |
| `.env.example` | Example backend, GitHub, MCP, and LLM environment variables. |
| `mcp.config.example.json` | Example MCP server and tool mapping configuration. |
| `PROJECT_DOCUMENTATION.md` | Existing shorter project documentation. |
| `RepoLens_Project_Documentation.docx` | Existing Word document version of project documentation. |
| `public/favicon.svg` | Browser favicon. |
| `public/icons.svg` | Public SVG icon asset. |
| `dist/` | Generated production build output. |
| `node_modules/` | Installed dependencies. |
| `.repolens-uploads/` | Runtime folder used for materialized uploaded ZIP key files. |

Generated folders such as `node_modules/`, `dist/`, and runtime upload folders are not part of the authored source logic.

## 7. Runtime Architecture

RepoLens follows a client-server architecture.

The frontend runs through Vite on `http://localhost:5173`. It provides the user interface for selecting a source, starting analysis, viewing results, checking pipeline status, and chatting with the analysis.

The backend runs through Express on `http://localhost:8787`. It receives analysis requests, inspects the selected source, optionally uses MCP tools, generates deterministic findings, optionally enhances results through an LLM, and returns a structured JSON analysis object to the frontend.

Vite proxies frontend `/api` requests to the backend:

```ts
server: {
  proxy: {
    '/api': 'http://localhost:8787',
  },
}
```

## 8. High-Level Data Flow

1. User selects one of three source types: GitHub repository, ZIP upload, or website URL.
2. Frontend submits a `FormData` request to `POST /api/analyze`.
3. Backend chooses the matching inspector:
   - `inspectGitHub`
   - `inspectZip`
   - `inspectWebsite`
4. Inspector gathers file paths, key files, metadata, package data, and MCP usage information.
5. Backend runs `buildAnalysis` to create a deterministic project map.
6. Backend attempts Context7 documentation lookup for detected technologies.
7. If an LLM provider is configured, backend calls the selected provider to enhance the structured analysis.
8. Backend returns the final analysis object.
9. Frontend updates dashboard metrics, tabs, flowchart, evidence, and chat context.
10. User can ask follow-up questions through `POST /api/chat`.

## 9. Frontend Details

### Main File

The frontend is mainly implemented in `src/App.tsx`.

### Source Types

The frontend supports three `SourceType` values:

```ts
type SourceType = 'github' | 'zip' | 'website'
```

### Main Analysis Result Shape

The frontend expects an `AnalysisResult` object with:

- `projectName`
- `sourceLabel`
- `generatedAt`
- `confidence`
- `overview`
- `architecture`
- `techStack`
- `folderStructure`
- `components`
- `databaseSchema`
- `apis`
- `authenticationFlow`
- `deploymentProcess`
- `improvementSuggestions`
- `flowchart`
- `evidence`
- `mcpPipeline`

### UI Sections

The UI contains:

- Topbar with product label and confidence pill.
- Source intake panel.
- Source type switcher.
- GitHub/website URL input.
- ZIP upload button.
- Analyze button with loading state.
- Pipeline status cards.
- Summary metric cards.
- Main dashboard.
- Analysis tabs.
- Chat sidebar.

### Dashboard Tabs

The dashboard supports these tabs:

- Overview
- Architecture
- Flowchart
- Tech stack
- Folders
- Components
- Data
- APIs
- Auth
- Deploy
- Improve

### Frontend State

Main React state values:

| State | Purpose |
| --- | --- |
| `sourceType` | Current input mode: GitHub, ZIP, or website. |
| `sourceValue` | URL value for GitHub or website analysis. |
| `zipFile` | Selected ZIP file object. |
| `analysis` | Current analysis result shown in dashboard. |
| `activeTab` | Current dashboard tab. |
| `isAnalyzing` | Loading state while analysis request is running. |
| `error` | User-facing analysis error text. |
| `chatInput` | Current chat input text. |
| `chatMessages` | Chat conversation shown in sidebar. |
| `fileInputRef` | Hidden file input reference for ZIP selection. |

### Frontend Functions and Components

| Function/component | Purpose |
| --- | --- |
| `MermaidDiagram` | Renders Mermaid chart text into SVG. |
| `App` | Main application shell and state owner. |
| `analyzeProject` | Sends selected source to backend `/api/analyze`. |
| `sendChat` | Sends a user question and current analysis to `/api/chat`. |
| `statusClass` | Maps pipeline status text to CSS badge classes. |
| `FormattedMessage` | Renders simple Markdown-like chat responses. |
| `renderInlineMarkdown` | Handles bold and inline code formatting in chat text. |
| `Metric` | Summary metric card. |
| `AnalysisTab` | Renders the selected analysis tab. |
| `SectionView` | Shared section layout for architecture/data/auth/deploy. |
| `ListPanel` | Generic list view for folders and improvements. |
| `EvidenceList` | Shows evidence collected during analysis. |
| `EmptyState` | Placeholder for empty tab results. |

### Mermaid Setup

Mermaid is initialized in `src/App.tsx` with a base theme and custom colors:

- Primary color: pale green.
- Primary border: teal.
- Line color: muted green-gray.
- Secondary color: warm cream.
- Font family: Inter/system UI stack.

### Frontend Styling

The UI is styled in `src/App.css`. Important styling choices:

- Full-page `app-shell` with light neutral background and subtle gradients.
- Responsive topbar.
- Intake area with grid layout.
- Source panel, dashboard, and chat panel as bordered white surfaces.
- Pipeline cards in a compact grid.
- Summary metrics in four columns on desktop.
- Dashboard and chat in two-column layout on wide screens.
- Mobile breakpoint at `1160px` collapses intake and workspace to one column.
- Mobile breakpoint at `760px` collapses source controls, pipeline, metrics, and overview columns.
- Chat panel supports user/assistant message styling.
- Mermaid diagram container has horizontal scrolling and minimum SVG width.

## 10. Backend Details

### Main File

The backend is implemented in `server/index.js`.

The file contains about 1115 lines and includes:

- Express server setup.
- Upload middleware.
- MCP manager class.
- Source inspectors.
- Deterministic analysis logic.
- Context7 documentation lookup.
- LLM configuration and calling logic.
- Chat answering logic.
- Utility and normalization helpers.

### Backend Dependencies

Important imports:

- `express`
- `dotenv/config`
- `node:fs/promises`
- `node:fs`
- `node:path`
- `@modelcontextprotocol/sdk/client/index.js`
- `@modelcontextprotocol/sdk/client/stdio.js`
- `jszip`
- `multer`

### Backend Middleware

- JSON request body limit: `2mb`.
- File upload handled by multer memory storage.
- ZIP upload limit: `25 * 1024 * 1024` bytes, meaning 25 MB.

### Backend Port

The backend uses:

```js
const port = process.env.PORT ?? 8787
```

If `PORT` is not set, it listens on port `8787`.

## 11. API Endpoints

### `POST /api/analyze`

Accepts a source request and returns a structured project analysis.

Input:

- `sourceType`: `github`, `zip`, or `website`
- `sourceValue`: GitHub URL or website URL
- `archive`: uploaded ZIP file when `sourceType` is `zip`

Processing:

- GitHub source calls `inspectGitHub`.
- Website source calls `inspectWebsite`.
- ZIP source calls `inspectZip`.
- All paths eventually call `buildAnalysis`.
- Analysis may be enhanced with `enhanceAnalysisWithLlm`.

Error behavior:

- Returns HTTP `400` with an `error` message if inspection fails.

### `POST /api/chat`

Accepts a user question and the current analysis object.

Input:

- `question`
- `analysis`

Output:

- `{ "answer": "..." }`

If an LLM is configured, the backend attempts model-based chat. If that fails or no LLM exists, it uses deterministic keyword-based answers.

### `GET /api/status`

Returns whether an LLM provider is configured.

When configured:

```json
{
  "llm": {
    "configured": true,
    "provider": "Provider name",
    "model": "Model name"
  }
}
```

When not configured:

```json
{
  "llm": {
    "configured": false
  }
}
```

## 12. Source Inspection Methods

### GitHub Inspection

Function: `inspectGitHub(url)`

Responsibilities:

- Validate and parse GitHub repository URL.
- Extract owner and repository name.
- Try GitHub MCP inspection.
- Use GitHub REST API as fallback/main metadata source.
- Read repository metadata.
- Detect default branch.
- Fetch recursive file tree.
- Limit collected files to 900 entries.
- Read key files from raw GitHub URLs.
- Parse package manifests.
- Return source evidence.

GitHub REST headers include:

- `Accept: application/vnd.github+json`
- `User-Agent: RepoLens`
- Optional `Authorization: Bearer ${GITHUB_TOKEN}`

### GitHub MCP Inspection

Function: `inspectGitHubWithMcp(owner, repo)`

Tries MCP tools such as:

- `search_repositories`
- `get_file_contents`
- `file_contents`
- `read_file`

It attempts to read repository metadata and `README.md`. If MCP fails, the error is recorded in the MCP pipeline instead of stopping the whole analysis.

### GitHub Key File Reading

Function: `readGitHubKeyFiles(owner, repo, branch, files, headers)`

Responsibilities:

- Filter paths with `isKeyFile`.
- Read up to 24 key files.
- Fetch files from `raw.githubusercontent.com`.
- Limit each file content to 24,000 characters.

### ZIP Inspection

Function: `inspectZip(file)`

Responsibilities:

- Require an uploaded ZIP.
- Load ZIP from memory using JSZip.
- Filter out directory entries.
- Optionally inspect selected files with Filesystem MCP.
- Collect archive file paths and sizes.
- Read up to 36 key files.
- Limit key file content to 24,000 characters each.
- Limit returned file list to 1400 paths.
- Parse package manifests.

### ZIP Filesystem MCP Inspection

Function: `inspectZipWithFilesystemMcp(fileName, entries)`

Responsibilities:

- Create a runtime upload folder under `.repolens-uploads/`.
- Materialize selected key files.
- Avoid path traversal by resolving and checking target paths.
- Call filesystem MCP directory listing tools.
- Read up to 12 key files through filesystem MCP.
- Record MCP usage or failure.

### Website Inspection

Function: `inspectWebsite(url)`

Responsibilities:

- Validate URL.
- Try Fetch MCP.
- Fall back to native `fetch`.
- Extract page title.
- Extract up to 18 headings.
- Extract up to 20 script source URLs.
- Extract up to 24 links.
- Clean HTML into readable text.
- Infer possible frontend packages from HTML.

### Website Fetch Fallback

Function: `fetchWebsiteHtml(url)`

Responsibilities:

- Fetch page using `User-Agent: RepoLens/1.0`.
- Throw an error if response is not successful.
- Limit HTML content to 500,000 characters.

### HTML Cleaning

Function: `cleanHtmlToText(html)`

Behavior:

- Removes `head`, `script`, `style`, and `svg` content.
- Adds spacing around headings, paragraphs, list items, and divs.
- Removes remaining HTML tags.
- Decodes common HTML entities.
- Normalizes whitespace.

## 13. Deterministic Analysis Engine

The deterministic analyzer is centered around `buildAnalysis(source)`.

It produces:

- Project name.
- Source label.
- Generation timestamp.
- Confidence score.
- Overview.
- Architecture section.
- Tech stack.
- Folder structure.
- Components.
- Database section.
- API list.
- Authentication section.
- Deployment section.
- Improvement suggestions.
- Mermaid flowchart.
- Evidence list.
- MCP pipeline status.

The confidence score is calculated from a base value plus the number of sampled key files and inspected paths, capped at 95.

## 14. Analysis Helper Functions

| Function | Purpose |
| --- | --- |
| `parsePackageFiles` | Parses `package.json` files from sampled key files. |
| `inferWebsitePackages` | Detects React, Next.js, Vue, and Astro hints in website HTML. |
| `detectTechStack` | Detects major languages/frameworks/tools from dependencies, paths, and text. |
| `detectComponents` | Finds frontend components from `.tsx`, `.jsx`, `.vue`, and `.svelte` paths. |
| `inferComponentRole` | Assigns a simple role to component paths. |
| `detectApis` | Finds route files or Express/router endpoint definitions. |
| `detectDatabase` | Detects ORM, migration, and database references. |
| `detectAuth` | Detects authentication and authorization hints. |
| `detectDeployment` | Detects scripts and deployment config files. |
| `inferArchitecture` | Builds architecture observations from project signals. |
| `buildFolderStructure` | Counts top-level folders/files. |
| `buildImprovements` | Creates improvement suggestions from missing or detected signals. |
| `buildFlowchart` | Builds Mermaid architecture flowchart. |
| `buildEvidence` | Summarizes inspected source evidence. |

## 15. Tech Stack Detection Rules

RepoLens detects:

- React from `react` dependency or `.tsx`/`.jsx` files.
- Next.js from `next` dependency.
- Vue from `vue` dependency.
- Svelte from `svelte` dependency.
- Express from `express` dependency or `express()` text.
- Fastify from `fastify` dependency.
- NestJS from `@nestjs/core` dependency.
- Vite from `vite` dependency or `vite.config.ts`.
- TypeScript from `typescript` dependency or `.ts`/`.tsx` files.
- Tailwind CSS from `tailwindcss` dependency or Tailwind config paths.
- Prisma from `prisma` dependency or `prisma/schema.prisma`.
- MongoDB/Mongoose from `mongoose` dependency or text.
- PostgreSQL from `pg` dependency or PostgreSQL text.
- Docker from `Dockerfile`.
- GitHub Actions from `.github/workflows`.
- Python from `.py` files.
- Go from `.go` files.
- Rust from `.rs` files.

If nothing is detected, it returns `Static site or documentation source`.

## 16. API Detection Rules

RepoLens detects APIs in two ways:

1. Searches key file content for Express/router method calls:
   - `app.get(...)`
   - `app.post(...)`
   - `app.put(...)`
   - `app.patch(...)`
   - `app.delete(...)`
   - `router.get(...)`
   - `router.post(...)`
   - `router.put(...)`
   - `router.patch(...)`
   - `router.delete(...)`

2. If explicit route definitions are not found, it infers API surfaces from paths containing:
   - `api`
   - `routes`
   - `controllers`
   - `server`
   - `app/.../route.*`

## 17. Database Detection Rules

RepoLens flags database evidence when it sees:

- `schema.prisma`
- paths containing `migration` or `migrations`
- `mongoose`
- `sequelize`
- `drizzle`
- `postgres`
- `postgresql`

If nothing is found, it reports that no direct database layer was detected from sampled files.

## 18. Authentication Detection Rules

RepoLens flags authentication evidence when it sees:

- `nextauth`
- `auth.js`
- `jwt`
- `jsonwebtoken`
- `oauth`
- `passport`
- paths containing `middleware`, `guard`, or `protected`

If nothing is found, it warns that routes should be treated as unauthenticated until auth middleware, guards, or provider configuration are confirmed.

## 19. Deployment Detection Rules

RepoLens detects:

- npm package scripts.
- `Dockerfile`.
- Docker Compose config.
- GitHub Actions workflows.
- Hosting files such as:
  - `vercel.json`
  - `netlify.toml`
  - `render.yaml`
  - `fly.toml`

If deployment information is not clear, it suggests adding build, preview, environment, and deployment documentation.

## 20. MCP Integration

RepoLens uses a custom `McpManager` class in `server/index.js`.

### MCP Manager Responsibilities

- Load MCP config from `MCP_CONFIG_PATH` or `mcp.config.json`.
- Connect to configured MCP servers using `StdioClientTransport`.
- Resolve environment variables inside server config.
- Cache MCP clients.
- Cache tool lists.
- Call configured or candidate tool names.
- Normalize MCP results into text.

### Configured MCP Servers

From `mcp.config.example.json`:

| Server | Purpose |
| --- | --- |
| `github` | Repository metadata and file content. |
| `fetch` | Website and documentation retrieval. |
| `filesystem` | Uploaded ZIP/key-file inspection. |
| `context7` | Latest framework/library documentation context. |

### MCP Tool Mapping

The config maps logical names to possible server tool names. This lets RepoLens work with slightly different MCP server tool naming conventions.

Examples:

- GitHub `get_file_contents` may map to `get_file_contents` or `read_file`.
- Fetch `fetch` may map to `get_markdown`, `get_markdown_summary`, or `fetch`.
- Filesystem `list_directory` may map to `list_directory` or `directory_tree`.
- Context7 library resolution may map to hyphenated or underscored names.

## 21. Context7 Documentation Lookup

Function: `fetchContext7Docs(techStack)`

Responsibilities:

- Take the first three detected technologies.
- Resolve each library with Context7 MCP.
- Fetch documentation for resolved libraries.
- Keep small documentation snippets.
- Record tool names used.
- Return error information if lookup fails.

The result is used as additional context for LLM enhancement. If Context7 is unavailable, the normal deterministic analysis continues.

## 22. LLM Integration

RepoLens supports OpenAI-compatible chat completion providers.

### Supported Provider Configurations

Function: `getLlmConfig()`

Supported options:

- OpenRouter
- xAI
- Groq
- OpenAI
- Ollama-compatible local endpoint
- Custom OpenAI-compatible endpoint

### Provider Environment Variables

| Provider | Variables |
| --- | --- |
| OpenRouter | `OPENROUTER_API_KEY`, optional `LLM_MODEL` |
| xAI | `XAI_API_KEY`, optional `LLM_MODEL` |
| Groq | `GROQ_API_KEY`, optional `LLM_MODEL` |
| OpenAI | `OPENAI_API_KEY`, optional `LLM_MODEL` |
| Ollama | `OLLAMA_BASE_URL`, optional `LLM_API_KEY`, optional `LLM_MODEL` |
| Custom | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` |

### LLM Call Logic

Function: `callLlm(messages, jsonMode, config)`

Behavior:

- Calls `${baseUrl}/chat/completions`.
- Uses temperature `0.2`.
- Uses JSON response format when `jsonMode` is true.
- Uses up to 2200 completion tokens for JSON mode.
- Uses up to 900 completion tokens for normal chat.
- Adds OpenRouter headers when using OpenRouter.
- Tries fallback OpenRouter free models if OpenRouter fails.

### LLM Enhancement

Function: `enhanceAnalysisWithLlm(source, fallback)`

Behavior:

- Fetches Context7 docs.
- Builds an analysis prompt.
- Sends source evidence and draft analysis to the LLM.
- Requires valid JSON matching the draft structure.
- Parses and normalizes model output.
- Updates the LLM pipeline step to `Used` if successful.
- Falls back to deterministic analysis if the LLM call fails.

## 23. Project Chat

Function: `answerQuestion(question, analysis)`

Behavior:

- If no analysis is available, asks the user to run an analysis first.
- If an LLM is configured, asks the model to answer based on a compact analysis object.
- If the LLM fails or is unavailable, uses deterministic keyword responses.

Fallback keyword handling:

- API questions return detected endpoints.
- Auth/login questions return authentication summary.
- Database/schema/data questions return database summary.
- Deploy/build questions return deployment summary.
- Improve/risk questions return top improvement suggestions.
- Other questions return project overview and architecture signals.

## 24. Configuration Files

### `.env.example`

Important values:

- `PORT=8787`
- `GITHUB_TOKEN`
- `OPENROUTER_API_KEY`
- `XAI_API_KEY`
- `GROQ_API_KEY`
- `OPENAI_API_KEY`
- `OLLAMA_BASE_URL`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `MCP_CONFIG_PATH=mcp.config.json`

### `mcp.config.example.json`

Defines MCP servers for:

- GitHub
- Fetch
- Filesystem
- Context7

It also defines tool aliases for each server.

### `vite.config.ts`

Configures:

- React plugin.
- `/api` proxy to backend on port `8787`.

### `tsconfig.json`

Uses project references:

- `tsconfig.app.json`
- `tsconfig.node.json`

### `tsconfig.app.json`

Important settings:

- Target: `es2023`
- Libraries: `ES2023`, `DOM`
- Module: `esnext`
- JSX: `react-jsx`
- Module resolution: `bundler`
- No emit.
- Strict lint-oriented checks for unused locals, unused parameters, erasable syntax, and fallthrough cases.

### `tsconfig.node.json`

Important settings:

- Target: `es2023`
- Library: `ES2023`
- Types: `node`
- Module: `nodenext`
- No emit.
- Used for `vite.config.ts`.

## 25. npm Scripts

From `package.json`:

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `concurrently "npm:server" "npm:client"` | Runs backend and frontend together. |
| `client` | `vite` | Starts Vite dev server. |
| `server` | `node server/index.js` | Starts Express analyzer API. |
| `build` | `tsc -b && vite build` | Type-checks/builds TypeScript projects and produces Vite build. |
| `lint` | `oxlint` | Runs oxlint. |
| `preview` | `vite preview` | Serves production build locally. |

## 26. Setup and Run Instructions

Install dependencies:

```bash
npm install
```

Create local environment/config files:

```bash
cp .env.example .env
cp mcp.config.example.json mcp.config.json
```

Start development:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

Backend API runs at:

```text
http://localhost:8787
```

## 27. Build and Verification

Production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Preview production build:

```bash
npm run preview
```

## 28. Security and Safety Notes

- Uploaded ZIP files are read in memory and limited to 25 MB.
- ZIP key files may be written under `.repolens-uploads/` for filesystem MCP inspection.
- ZIP materialization checks resolved paths to reduce path traversal risk.
- GitHub token is optional and should be stored in `.env`, not hardcoded.
- LLM API keys should be stored in `.env`.
- `mcp.config.json` may include local command execution settings and should be handled carefully.
- The app analyzes sampled files and signals; findings should be verified before production decisions.
- Website analysis fetches external URLs and should be used with trusted or intended targets.

## 29. Current Limitations

- Large repositories are sampled rather than fully semantically analyzed.
- GitHub file list is capped at 900 entries.
- ZIP file list is capped at 1400 entries.
- GitHub key files are capped at 24 files.
- ZIP key files are capped at 36 files.
- Individual key file content is truncated to 24,000 characters.
- Website HTML is truncated to 500,000 characters.
- Database, authentication, deployment, and API detection are signal-based.
- LLM output quality depends on provider availability and model capability.
- MCP usage depends on local `mcp.config.json` and installed MCP server availability.
- There is no persistent user account or saved analysis history.
- There is no built-in export button in the current UI.

## 30. Existing Strengths

- Works with three practical source types.
- Provides fallback analysis without requiring an LLM.
- Uses MCP when available but avoids making MCP mandatory.
- Has a structured dashboard instead of a plain text dump.
- Includes project-aware chat.
- Uses Mermaid diagrams for visual explanation.
- Supports multiple LLM providers through a common OpenAI-compatible interface.
- Has clean separation between client UI and analyzer API.
- Uses TypeScript on the frontend for stronger UI data contracts.

## 31. Suggested Future Enhancements

- Add one-click export to Markdown, PDF, and DOCX.
- Add persistent analysis history.
- Add larger repository background jobs with progress streaming.
- Add deeper dependency graph and route graph visualization.
- Add OpenAPI generation for detected routes.
- Add code quality scoring.
- Add security scoring.
- Add deployment readiness scoring.
- Add private repository workflow documentation.
- Add authentication for saved projects.
- Add side-by-side project comparison.
- Add branch comparison.
- Add analysis caching.
- Add test suite for backend detection functions.
- Add frontend component tests.
- Add E2E tests for the main analysis flow.

## 32. Deliverable Summary

RepoLens is a complete full-stack project analysis application. It combines a React/Vite dashboard, an Express backend, deterministic static inspection, optional MCP tools, optional LLM enhancement, and an interactive chat interface. It is useful for onboarding, project review, software documentation, academic demonstrations, codebase discovery, and early architecture understanding.

The most important project files are:

- `server/index.js` for analyzer logic.
- `src/App.tsx` for UI and frontend behavior.
- `src/App.css` for dashboard styling.
- `package.json` for dependencies and scripts.
- `.env.example` and `mcp.config.example.json` for configuration.

This document intentionally focuses on authored project behavior and structure. It does not expand generated dependency code from `node_modules/` or build output from `dist/`, because those are reproducible artifacts rather than the project’s own implementation.
