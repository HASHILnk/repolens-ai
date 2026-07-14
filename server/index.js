import express from 'express'
import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import JSZip from 'jszip'
import multer from 'multer'

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })
const port = process.env.PORT ?? 8787
let mcp

app.use(express.json({ limit: '2mb' }))

app.post('/api/analyze', upload.single('archive'), async (req, res) => {
  try {
    const sourceType = req.body.sourceType
    const sourceValue = req.body.sourceValue ?? ''
    const source =
      sourceType === 'github'
        ? await inspectGitHub(sourceValue)
        : sourceType === 'website'
          ? await inspectWebsite(sourceValue)
          : await inspectZip(req.file)

    const heuristicAnalysis = buildAnalysis(source)
    const analysis = await enhanceAnalysisWithLlm(source, heuristicAnalysis)
    res.json(analysis)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to analyze source.' })
  }
})

app.post('/api/chat', async (req, res) => {
  const question = String(req.body.question ?? '')
  const analysis = req.body.analysis
  res.json({ answer: await answerQuestion(question, analysis) })
})

app.get('/api/status', (req, res) => {
  const llmConfig = getLlmConfig()
  res.json({
    llm: llmConfig ? {
      configured: true,
      provider: llmConfig.provider,
      model: llmConfig.model
    } : {
      configured: false
    }
  })
})

app.listen(port, () => {
  console.log(`RepoLens analyzer listening on http://localhost:${port}`)
})

class McpManager {
  constructor() {
    this.config = null
    this.clients = new Map()
    this.toolCache = new Map()
  }

  async loadConfig() {
    if (this.config) {
      return this.config
    }
    const configPath = process.env.MCP_CONFIG_PATH ?? 'mcp.config.json'
    if (!existsSync(configPath)) {
      this.config = { servers: {}, tools: {} }
      return this.config
    }
    const raw = await readFile(configPath, 'utf8')
    this.config = JSON.parse(raw)
    return this.config
  }

  async connect(serverName) {
    const config = await this.loadConfig()
    const server = config.servers?.[serverName]
    if (!server) {
      return null
    }
    if (this.clients.has(serverName)) {
      return this.clients.get(serverName)
    }
    const client = new Client({ name: 'repolens', version: '1.0.0' }, { capabilities: {} })
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args ?? [],
      cwd: server.cwd,
      env: this.resolveEnv(server.env),
      stderr: server.stderr ?? 'pipe',
    })
    await client.connect(transport)
    this.clients.set(serverName, client)
    return client
  }

  resolveEnv(env = {}) {
    const resolved = { ...process.env }
    for (const [key, value] of Object.entries(env)) {
      resolved[key] = String(value).replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? '')
    }
    return resolved
  }

  async listTools(serverName) {
    if (this.toolCache.has(serverName)) {
      return this.toolCache.get(serverName)
    }
    const client = await this.connect(serverName)
    if (!client) {
      return []
    }
    const result = await client.listTools()
    const tools = result.tools ?? []
    this.toolCache.set(serverName, tools)
    return tools
  }

  async callTool(serverName, candidateNames, args) {
    const client = await this.connect(serverName)
    if (!client) {
      return null
    }
    const tools = await this.listTools(serverName)
    const configured = (await this.loadConfig()).tools?.[serverName] ?? {}
    const names = [
      ...candidateNames.flatMap((name) => configured[name] ?? []),
      ...candidateNames,
    ]
    const tool = tools.find((item) => names.includes(item.name))
    if (!tool) {
      return null
    }
    const result = await client.callTool({ name: tool.name, arguments: args })
    return { tool: tool.name, result, text: mcpResultToText(result) }
  }
}

mcp = new McpManager()

function mcpResultToText(result) {
  if (!result) {
    return ''
  }
  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent, null, 2)
  }
  if (result.toolResult) {
    return typeof result.toolResult === 'string' ? result.toolResult : JSON.stringify(result.toolResult, null, 2)
  }
  return (result.content ?? [])
    .map((item) => {
      if (item.type === 'text') return item.text
      if (item.type === 'resource' && item.resource?.text) return item.resource.text
      if (item.uri) return `${item.name ?? 'resource'}: ${item.uri}`
      return JSON.stringify(item)
    })
    .join('\n')
}

async function inspectGitHub(url) {
  const match = String(url).match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i)
  if (!match) {
    throw new Error('Enter a valid GitHub repository URL.')
  }
  const owner = match[1]
  const repo = match[2].replace(/\.git$/, '')
  const mcpInfo = await inspectGitHubWithMcp(owner, repo)
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'RepoLens',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
  if (!repoResponse.ok) {
    throw new Error('GitHub repository could not be read. Public repos work without a token.')
  }
  const metadata = await repoResponse.json()
  const branch = metadata.default_branch ?? 'main'
  const treeResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers },
  )
  const treeBody = await treeResponse.json()
  const files = Array.isArray(treeBody.tree)
    ? treeBody.tree
        .filter((entry) => entry.type === 'blob')
        .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }))
        .slice(0, 900)
    : []

  const keyFiles = { ...(mcpInfo?.keyFiles ?? {}), ...(await readGitHubKeyFiles(owner, repo, branch, files, headers)) }
  return {
    kind: 'github',
    name: metadata.name,
    label: `${owner}/${repo}`,
    description: metadata.description ?? mcpInfo?.description ?? '',
    files,
    keyFiles,
    packageData: parsePackageFiles(keyFiles),
    mcp: mcpInfo?.mcp,
  }
}

async function inspectGitHubWithMcp(owner, repo) {
  try {
    const repoCall = await mcp.callTool('github', ['search_repositories'], {
      query: `repo:${owner}/${repo}`,
      perPage: 1,
    })
    const readmeCall = await mcp.callTool('github', ['get_file_contents', 'file_contents', 'read_file'], {
      owner,
      repo,
      path: 'README.md',
    })
    if (!repoCall && !readmeCall) {
      return null
    }

    let description = ''
    if (repoCall?.text) {
      try {
        const parsed = JSON.parse(repoCall.text)
        const items = parsed.items || parsed.repositories || (Array.isArray(parsed) ? parsed : null)
        if (items && items[0] && items[0].description) {
          description = items[0].description
        } else if (parsed.description) {
          description = parsed.description
        }
      } catch {
        if (repoCall.text && !repoCall.text.trim().startsWith('{')) {
          description = repoCall.text.slice(0, 1000)
        }
      }
    }

    return {
      description,
      keyFiles: readmeCall?.text ? { 'README.md': readmeCall.text.slice(0, 24000) } : {},
      mcp: {
        github: {
          used: true,
          tools: [repoCall?.tool, readmeCall?.tool].filter(Boolean),
        },
      },
    }
  } catch (error) {
    return {
      keyFiles: {},
      mcp: {
        github: {
          used: false,
          error: error instanceof Error ? error.message : 'GitHub MCP failed',
        },
      },
    }
  }
}

async function readGitHubKeyFiles(owner, repo, branch, files, headers) {
  const wanted = files
    .map((file) => file.path)
    .filter((path) => isKeyFile(path))
    .slice(0, 24)
  const contents = {}
  await Promise.all(
    wanted.map(async (path) => {
      const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
      const response = await fetch(raw, { headers })
      if (response.ok) {
        contents[path] = (await response.text()).slice(0, 24000)
      }
    }),
  )
  return contents
}

function cleanHtmlToText(html) {
  return html
    // Remove head, script, style, svg tags and their content
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    // Replace list items and headers with basic text spacing
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/div>/gi, '\n')
    // Strip all other HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim()
}

async function inspectWebsite(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Enter a valid website URL.')
  }
  const mcpInfo = await inspectWebsiteWithMcp(parsed.toString())
  const html = mcpInfo?.html ?? (await fetchWebsiteHtml(parsed.toString()))
  const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.trim() || parsed.hostname
  const headings = [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gis)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean)
    .slice(0, 18)
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gis)]
    .map((match) => match[1])
    .slice(0, 20)
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)]
    .map((match) => `${stripHtml(match[2]) || 'Link'} -> ${match[1]}`)
    .slice(0, 24)

  return {
    kind: 'website',
    name: title,
    label: parsed.hostname,
    description: `Fetched ${parsed.toString()}`,
    files: scripts.map((path) => ({ path, size: 0 })),
    keyFiles: {
      'page.html': html,
      'headings.txt': headings.join('\n'),
      'links.txt': links.join('\n'),
      'content.txt': cleanHtmlToText(html)
    },
    packageData: inferWebsitePackages(html),
    mcp: mcpInfo?.mcp,
  }
}

async function fetchWebsiteHtml(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'RepoLens/1.0' },
  })
  if (!response.ok) {
    throw new Error('Website content could not be fetched.')
  }
  return (await response.text()).slice(0, 500000)
}

async function inspectWebsiteWithMcp(url) {
  try {
    const fetchCall = await mcp.callTool('fetch', ['fetch', 'get', 'read_url'], { url })
    if (!fetchCall?.text) {
      return null
    }
    return {
      html: fetchCall.text.slice(0, 500000),
      mcp: {
        fetch: {
          used: true,
          tools: [fetchCall.tool],
        },
      },
    }
  } catch (error) {
    return {
      mcp: {
        fetch: {
          used: false,
          error: error instanceof Error ? error.message : 'Fetch MCP failed',
        },
      },
    }
  }
}

async function inspectZip(file) {
  if (!file) {
    throw new Error('Upload a ZIP archive to inspect.')
  }
  const zip = await JSZip.loadAsync(file.buffer)
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  const mcpInfo = await inspectZipWithFilesystemMcp(file.originalname, entries)
  const files = entries.map((entry) => ({ path: entry.name, size: entry._data?.uncompressedSize ?? 0 }))
  const keyFiles = {}
  for (const entry of entries.filter((item) => isKeyFile(item.name)).slice(0, 36)) {
    keyFiles[entry.name] = (await entry.async('string')).slice(0, 24000)
  }
  const mergedKeyFiles = { ...(mcpInfo?.keyFiles ?? {}), ...keyFiles }
  return {
    kind: 'zip',
    name: file.originalname.replace(/\.zip$/i, ''),
    label: file.originalname,
    description: `${entries.length} files inspected from uploaded archive`,
    files: files.slice(0, 1400),
    keyFiles: mergedKeyFiles,
    packageData: parsePackageFiles(mergedKeyFiles),
    mcp: mcpInfo?.mcp,
  }
}

async function inspectZipWithFilesystemMcp(fileName, entries) {
  try {
    const uploadRoot = path.resolve('.repolens-uploads', `${Date.now()}-${fileName.replace(/[^a-z0-9_.-]/gi, '-')}`)
    await mkdir(uploadRoot, { recursive: true })
    const keyEntries = entries.filter((entry) => isKeyFile(entry.name)).slice(0, 36)
    for (const entry of keyEntries) {
      const targetPath = path.resolve(uploadRoot, entry.name)
      if (!targetPath.startsWith(uploadRoot)) {
        continue
      }
      await mkdir(path.dirname(targetPath), { recursive: true })
      await writeFile(targetPath, await entry.async('nodebuffer'))
    }
    const listCall = await mcp.callTool('filesystem', ['list_directory', 'directory_tree', 'list'], {
      path: uploadRoot,
    })
    const keyFiles = {}
    for (const entry of keyEntries.slice(0, 12)) {
      const targetPath = path.resolve(uploadRoot, entry.name)
      const readCall = await mcp.callTool('filesystem', ['read_file', 'read_text_file', 'read'], { path: targetPath })
      if (readCall?.text) {
        keyFiles[entry.name] = readCall.text.slice(0, 24000)
      }
    }
    if (!listCall && !Object.keys(keyFiles).length) {
      return null
    }
    return {
      keyFiles,
      mcp: {
        filesystem: {
          used: true,
          tools: [listCall?.tool, Object.keys(keyFiles).length ? 'read_file' : null].filter(Boolean),
        },
      },
    }
  } catch (error) {
    return {
      keyFiles: {},
      mcp: {
        filesystem: {
          used: false,
          error: error instanceof Error ? error.message : 'Filesystem MCP failed',
        },
      },
    }
  }
}

function buildAnalysis(source) {
  const paths = source.files.map((file) => file.path)
  const textCorpus = Object.values(source.keyFiles).join('\n').toLowerCase()
  const techStack = detectTechStack(source.packageData, paths, textCorpus)
  const components = detectComponents(paths)
  const apis = detectApis(paths, source.keyFiles)
  const database = detectDatabase(paths, textCorpus)
  const auth = detectAuth(paths, textCorpus)
  const deploy = detectDeployment(paths, source.packageData)
  const folders = buildFolderStructure(paths)
  const architectureItems = inferArchitecture(paths, techStack, apis, database)
  const improvements = buildImprovements(source, techStack, apis, auth, deploy)

  return {
    projectName: source.name,
    sourceLabel: source.label,
    generatedAt: new Date().toISOString(),
    confidence: Math.min(95, 42 + Math.min(24, Object.keys(source.keyFiles).length * 3) + Math.min(29, paths.length / 18)),
    overview:
      source.description ||
      `${source.name} appears to be a ${techStack.slice(0, 4).join(', ') || 'software'} project with ${paths.length} inspected files.`,
    architecture: {
      title: 'Architecture',
      summary: `RepoLens found ${architectureItems.length} architectural signals across source files, manifests, and documentation.`,
      items: architectureItems,
    },
    techStack,
    folderStructure: folders,
    components,
    databaseSchema: database,
    apis,
    authenticationFlow: auth,
    deploymentProcess: deploy,
    improvementSuggestions: improvements,
    flowchart: buildFlowchart(source, techStack, apis, database, auth, deploy),
    evidence: buildEvidence(source, paths),
    mcpPipeline: [
      {
        name: 'GitHub MCP',
        status: source.mcp?.github?.used ? 'Used' : source.kind === 'github' ? 'REST fallback' : 'Available',
        detail: source.mcp?.github?.used
          ? `Called tools: ${source.mcp.github.tools.join(', ')}`
          : source.mcp?.github?.error ?? (source.kind === 'github' ? `Read ${source.label} with GitHub REST fallback` : 'Ready for repository URLs'),
      },
      {
        name: 'Fetch MCP',
        status: source.mcp?.fetch?.used ? 'Used' : source.kind === 'website' ? 'Fetch fallback' : 'Available',
        detail: source.mcp?.fetch?.used
          ? `Called tools: ${source.mcp.fetch.tools.join(', ')}`
          : source.mcp?.fetch?.error ?? (source.kind === 'website' ? 'Fetched website HTML with native fetch fallback' : 'Ready for documentation and website retrieval'),
      },
      {
        name: 'Filesystem MCP',
        status: source.mcp?.filesystem?.used ? 'Used' : source.kind === 'zip' ? 'ZIP parser fallback' : 'Available',
        detail: source.mcp?.filesystem?.used
          ? `Called tools: ${source.mcp.filesystem.tools.join(', ')}`
          : source.kind === 'zip' ? `Inspected ${paths.length} archived files with local ZIP parser` : 'Ready for uploaded project archives',
      },
      {
        name: 'Context7 MCP',
        status: source.mcp?.context7?.used ? 'Used' : techStack.length ? 'Docs pending' : 'Ready',
        detail: `Latest-doc lookup candidates: ${techStack.slice(0, 5).join(', ') || 'frameworks detected after analysis'}`,
      },
      {
        name: 'LLM',
        status: 'Pending',
        detail: 'Set OPENROUTER_API_KEY, XAI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, OLLAMA_BASE_URL, or LLM_BASE_URL for AI analysis',
      },
    ],
  }
}

async function enhanceAnalysisWithLlm(source, fallback) {
  const context7 = await fetchContext7Docs(fallback.techStack)
  const analysisWithDocs = {
    ...fallback,
    mcpPipeline: fallback.mcpPipeline.map((step) =>
      step.name === 'Context7 MCP'
        ? {
            ...step,
            status: context7.used ? 'Used' : step.status,
            detail: context7.used
              ? `Fetched latest docs with tools: ${context7.tools.join(', ')}`
              : context7.error ?? step.detail,
          }
        : step,
    ),
  }

  const llmConfig = getLlmConfig()
  if (!llmConfig) {
    return analysisWithDocs
  }

  try {
    const prompt = buildAnalysisPrompt(source, analysisWithDocs, context7)
    const content = await callLlm([
      {
        role: 'system',
        content:
          'You are a senior software architect. Return only valid JSON. The JSON must match the exact schema of the "draft" object, containing the keys: "projectName" (string), "overview" (string), "architecture" (object with "title", "summary", "items"), "techStack" (array), "databaseSchema" (object), "apis" (array), "authenticationFlow" (object), "deploymentProcess" (object), "improvementSuggestions" (array), and "flowchart" (string). Update the values of these keys based on the source evidence, but do not change the keys or add new ones. Do not include markdown packaging like ```json.',
      },
      { role: 'user', content: prompt },
    ], true, llmConfig)
    const parsed = parseJsonFromText(content)
    const enhanced = normalizeAnalysis(parsed, analysisWithDocs)
    enhanced.mcpPipeline = enhanced.mcpPipeline.map((step) =>
      step.name === 'LLM'
        ? {
            ...step,
            status: 'Used',
            detail: `${llmConfig.provider} ${llmConfig.actualModelUsed ?? llmConfig.model}`,
          }
        : step,
    )
    return enhanced
  } catch (error) {
    return {
      ...analysisWithDocs,
      mcpPipeline: analysisWithDocs.mcpPipeline.map((step) =>
        step.name === 'LLM'
          ? {
              ...step,
              status: 'Failed',
              detail: error instanceof Error ? error.message : 'LLM analysis failed',
            }
          : step,
      ),
    }
  }
}

async function fetchContext7Docs(techStack) {
  const docs = []
  const tools = []
  try {
    for (const libraryName of techStack.filter((item) => !item.includes('Static')).slice(0, 2)) {
      const resolved = await mcp.callTool('context7', ['resolve-library-id', 'resolve', 'library'], {
        libraryName,
      })
      const libraryId = extractLibraryId(resolved?.text) ?? libraryName
      const docCall = await mcp.callTool('context7', ['get-library-docs', 'docs', 'documentation'], {
        context7CompatibleLibraryID: libraryId,
        libraryId,
        topic: 'architecture routing deployment auth database API best practices',
        tokens: 1200,
      })
      if (resolved?.tool) tools.push(resolved.tool)
      if (docCall?.tool) tools.push(docCall.tool)
      if (docCall?.text) {
        docs.push(`## ${libraryName}\n${docCall.text.slice(0, 1400)}`)
      }
    }
  } catch (error) {
    return {
      used: docs.length > 0,
      docs,
      tools,
      error: error instanceof Error ? error.message : 'Context7 MCP failed',
    }
  }
  return { used: docs.length > 0, docs, tools }
}

function extractLibraryId(text = '') {
  const exact = text.match(/\/[a-z0-9_.-]+\/[a-z0-9_.-]+/i)
  return exact?.[0]
}

function buildAnalysisPrompt(source, fallback, context7) {
  const evidencePack = buildCompactEvidencePack(source)
  return JSON.stringify(
    {
      task:
        'Update the draft JSON object based on the provided source evidence. Your response must be a single JSON object with the exact same keys as the "draft" object. Update the values of "projectName", "overview", "techStack", "architecture", "databaseSchema", "apis", "authenticationFlow", "deploymentProcess", "improvementSuggestions", and "flowchart" with specific details about the product and engineering based on the website content / source files. Do not invent files or APIs that are not implied by evidence.',
      outputRules: [
        'Return only JSON.',
        'Keep overview under 90 words and explain what the product does plus how it is built.',
        'Each architecture item must name a concrete layer, flow, or responsibility.',
        'Improvement suggestions must be product/build ideas, not generic README advice unless docs are the main risk.',
        'Flowchart must be valid Mermaid flowchart LR with 5-8 nodes.',
      ],
      source: {
        kind: source.kind,
        name: source.name,
        label: source.label,
        description: source.description,
        files: evidencePack.files,
        keyFileExcerpts: evidencePack.keyFileExcerpts,
        detectedRoutes: fallback.apis,
        detectedComponents: fallback.components.slice(0, 12),
      },
      context7Docs: context7.docs ?? [],
      draft: {
        projectName: fallback.projectName,
        sourceLabel: fallback.sourceLabel,
        generatedAt: fallback.generatedAt,
        confidence: fallback.confidence,
        overview: fallback.overview,
        architecture: fallback.architecture,
        techStack: fallback.techStack,
        folderStructure: fallback.folderStructure.slice(0, 14),
        components: fallback.components.slice(0, 12),
        databaseSchema: fallback.databaseSchema,
        apis: fallback.apis.slice(0, 12),
        authenticationFlow: fallback.authenticationFlow,
        deploymentProcess: fallback.deploymentProcess,
        improvementSuggestions: fallback.improvementSuggestions,
        flowchart: fallback.flowchart,
        evidence: fallback.evidence,
        mcpPipeline: fallback.mcpPipeline,
      },
    },
    null,
    2,
  )
}

function buildCompactEvidencePack(source) {
  const priorityFiles = Object.entries(source.keyFiles)
    .filter(([filePath]) => scoreKeyFile(filePath) >= 10)
    .sort(([a], [b]) => scoreKeyFile(b) - scoreKeyFile(a))
    .slice(0, 8)
    .map(([filePath, content]) => {
      let limit = 1400
      if (filePath.toLowerCase().includes('package.json')) {
        limit = 2600
      } else if (source.kind === 'website') {
        limit = 12000
      }
      return {
        path: filePath,
        excerpt: compactText(content, limit),
      }
    })
  return {
    files: source.files.slice(0, 120),
    keyFileExcerpts: priorityFiles,
  }
}

function scoreKeyFile(filePath) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('package.json')) return 100
  if (lower.endsWith('readme.md')) return 90
  if (lower.includes('schema.prisma')) return 80
  if (lower.includes('route') || lower.includes('controller')) return 70
  if (lower.includes('middleware') || lower.includes('auth')) return 65
  if (lower.includes('docker') || lower.includes('workflow')) return 50
  if (lower.endsWith('content.txt')) return 40
  if (lower.endsWith('headings.txt')) return 30
  if (lower.endsWith('links.txt')) return 20
  if (lower.endsWith('page.html')) return 5
  return 10
}

function compactText(value, limit) {
  return String(value)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, limit)
}

function getLlmConfig() {
  const provider = process.env.LLM_PROVIDER?.toLowerCase()
  if (process.env.LLM_BASE_URL) {
    return {
      provider: provider ?? 'custom',
      baseUrl: process.env.LLM_BASE_URL.replace(/\/$/, ''),
      apiKey: process.env.LLM_API_KEY ?? 'not-needed',
      model: process.env.LLM_MODEL ?? 'llama-3.1-8b-instruct',
    }
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.LLM_MODEL ?? 'meta-llama/llama-3.3-70b-instruct',
    }
  }
  if (process.env.XAI_API_KEY) {
    return {
      provider: 'xAI Grok',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: process.env.XAI_API_KEY,
      model: process.env.LLM_MODEL ?? 'grok-4-latest',
    }
  }
  if (process.env.GROQ_API_KEY) {
    return {
      provider: 'Groq Llama',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.LLM_MODEL ?? 'llama-3.3-70b-versatile',
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.LLM_MODEL ?? 'gpt-4.1-mini',
    }
  }
  if (process.env.OLLAMA_BASE_URL) {
    return {
      provider: 'Ollama Llama',
      baseUrl: process.env.OLLAMA_BASE_URL.replace(/\/$/, ''),
      apiKey: process.env.LLM_API_KEY ?? 'ollama',
      model: process.env.LLM_MODEL ?? 'llama3.1',
    }
  }
  return null
}

async function callLlm(messages, jsonMode = false, config = getLlmConfig()) {
  if (!config) {
    throw new Error('No LLM provider configured')
  }

  const modelsToTry = []
  if (config.provider === 'OpenRouter') {
    if (process.env.LLM_MODEL) {
      modelsToTry.push(process.env.LLM_MODEL)
    }
    const fallbacks = [
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'google/gemini-2.5-flash:free',
      'meta-llama/llama-3.2-3b-instruct:free'
    ]
    for (const fb of fallbacks) {
      if (!modelsToTry.includes(fb)) {
        modelsToTry.push(fb)
      }
    }
  } else {
    modelsToTry.push(config.model)
  }

  let lastError = null
  for (const model of modelsToTry) {
    try {
      console.log(`Calling LLM (Model: ${model})...`)
      const headers = {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      }
      if (config.provider === 'OpenRouter') {
        headers['HTTP-Referer'] = 'https://repolens.dev'
        headers['X-Title'] = 'RepoLens'
      }

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          messages,
          temperature: 0.2,
          max_completion_tokens: jsonMode ? 2200 : 900,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Status ${response.status}: ${detail.slice(0, 240)}`)
      }

      const body = await response.json()
      const content = body.choices?.[0]?.message?.content ?? ''
      config.actualModelUsed = model
      return content
    } catch (error) {
      console.error(`LLM call failed for model ${model}:`, error.message)
      lastError = error
      if (config.provider !== 'OpenRouter') {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
  }

  throw lastError ?? new Error('LLM call failed')
}

function parseJsonFromText(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('LLM did not return JSON')
    return JSON.parse(match[0])
  }
}

function normalizeAnalysis(candidate, fallback) {
  return {
    projectName: String(candidate.projectName ?? fallback.projectName),
    sourceLabel: String(candidate.sourceLabel ?? fallback.sourceLabel),
    generatedAt: String(candidate.generatedAt ?? fallback.generatedAt),
    confidence: Number(candidate.confidence ?? fallback.confidence),
    overview: String(candidate.overview ?? fallback.overview),
    architecture: normalizeSection(candidate.architecture, fallback.architecture),
    techStack: normalizeStringArray(candidate.techStack, fallback.techStack),
    folderStructure: normalizeStringArray(candidate.folderStructure, fallback.folderStructure),
    components: Array.isArray(candidate.components) ? candidate.components.slice(0, 30) : fallback.components,
    databaseSchema: normalizeSection(candidate.databaseSchema, fallback.databaseSchema),
    apis: Array.isArray(candidate.apis) ? candidate.apis.slice(0, 30) : fallback.apis,
    authenticationFlow: normalizeSection(candidate.authenticationFlow, fallback.authenticationFlow),
    deploymentProcess: normalizeSection(candidate.deploymentProcess, fallback.deploymentProcess),
    improvementSuggestions: normalizeStringArray(candidate.improvementSuggestions, fallback.improvementSuggestions),
    flowchart: String(candidate.flowchart ?? fallback.flowchart),
    evidence: normalizeStringArray(candidate.evidence, fallback.evidence),
    mcpPipeline: Array.isArray(candidate.mcpPipeline) ? candidate.mcpPipeline : fallback.mcpPipeline,
  }
}

function normalizeSection(candidate, fallback) {
  return {
    title: String(candidate?.title ?? fallback.title),
    summary: String(candidate?.summary ?? fallback.summary),
    items: normalizeStringArray(candidate?.items, fallback.items),
  }
}

function normalizeStringArray(candidate, fallback) {
  return Array.isArray(candidate) ? candidate.map((item) => String(item)).filter(Boolean) : fallback
}

function parsePackageFiles(keyFiles) {
  const packages = []
  for (const [path, content] of Object.entries(keyFiles)) {
    if (path.endsWith('package.json')) {
      try {
        const parsed = JSON.parse(content)
        packages.push(parsed)
      } catch {
        packages.push({})
      }
    }
  }
  return packages
}

function inferWebsitePackages(html) {
  const lower = html.toLowerCase()
  const dependencies = {}
  if (lower.includes('react')) dependencies.react = 'detected'
  if (lower.includes('__next')) dependencies.next = 'detected'
  if (lower.includes('vue')) dependencies.vue = 'detected'
  if (lower.includes('astro')) dependencies.astro = 'detected'
  return [{ dependencies }]
}

function detectTechStack(packages, paths, corpus) {
  const deps = new Set()
  for (const pkg of packages) {
    for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
      Object.keys(pkg[group] ?? {}).forEach((name) => deps.add(name))
    }
  }
  const tech = new Set()
  const addIf = (condition, name) => {
    if (condition) tech.add(name)
  }
  addIf(deps.has('react') || paths.some((path) => path.endsWith('.tsx') || path.endsWith('.jsx')), 'React')
  addIf(deps.has('next'), 'Next.js')
  addIf(deps.has('vue'), 'Vue')
  addIf(deps.has('svelte'), 'Svelte')
  addIf(deps.has('express') || corpus.includes('express()'), 'Express')
  addIf(deps.has('fastify'), 'Fastify')
  addIf(deps.has('@nestjs/core'), 'NestJS')
  addIf(deps.has('vite') || paths.includes('vite.config.ts'), 'Vite')
  addIf(deps.has('typescript') || paths.some((path) => path.endsWith('.ts') || path.endsWith('.tsx')), 'TypeScript')
  addIf(deps.has('tailwindcss') || paths.some((path) => path.includes('tailwind.config')), 'Tailwind CSS')
  addIf(deps.has('prisma') || paths.some((path) => path.includes('prisma/schema.prisma')), 'Prisma')
  addIf(deps.has('mongoose') || corpus.includes('mongoose'), 'MongoDB/Mongoose')
  addIf(deps.has('pg') || corpus.includes('postgres'), 'PostgreSQL')
  addIf(paths.some((path) => path.endsWith('Dockerfile')), 'Docker')
  addIf(paths.some((path) => path.includes('.github/workflows')), 'GitHub Actions')
  addIf(paths.some((path) => path.endsWith('.py')), 'Python')
  addIf(paths.some((path) => path.endsWith('.go')), 'Go')
  addIf(paths.some((path) => path.endsWith('.rs')), 'Rust')
  return Array.from(tech).length ? Array.from(tech) : ['Static site or documentation source']
}

function detectComponents(paths) {
  return paths
    .filter((path) => /\.(tsx|jsx|vue|svelte)$/.test(path) && /component|components|pages|app|routes|views|src\//i.test(path))
    .slice(0, 18)
    .map((path) => ({
      name: path.split('/').pop()?.replace(/\.(tsx|jsx|vue|svelte)$/i, '') ?? path,
      path,
      role: inferComponentRole(path),
    }))
}

function inferComponentRole(path) {
  const lower = path.toLowerCase()
  if (lower.includes('layout')) return 'Shared layout or route wrapper.'
  if (lower.includes('page') || lower.includes('routes')) return 'Routed screen or page-level module.'
  if (lower.includes('form')) return 'Input and submission workflow.'
  if (lower.includes('table') || lower.includes('list')) return 'Collection display and scanning surface.'
  return 'Reusable UI or feature component.'
}

function detectApis(paths, keyFiles) {
  const routeFiles = paths.filter((path) => /api|routes|controllers|server|app\/.*route\./i.test(path)).slice(0, 30)
  const discovered = []
  for (const [path, content] of Object.entries(keyFiles)) {
    const matches = [...content.matchAll(/\b(app|router)\.(get|post|put|patch|delete)\(["'`]([^"'`]+)["'`]/gi)]
    for (const match of matches) {
      discovered.push({
        method: match[2].toUpperCase(),
        path: match[3],
        description: `Defined in ${path}`,
      })
    }
  }
  if (discovered.length) {
    return discovered.slice(0, 20)
  }
  return routeFiles.slice(0, 12).map((path) => ({
    method: path.toLowerCase().includes('post') ? 'POST' : 'GET',
    path: `/${path.replace(/\.(ts|js|tsx|jsx)$/i, '').replace(/(^|\/)(index|route|handler)$/gi, '')}`,
    description: `API surface inferred from ${path}`,
  }))
}

function detectDatabase(paths, corpus) {
  const items = []
  if (paths.some((path) => path.includes('schema.prisma'))) items.push('Prisma schema detected; inspect models and relations in prisma/schema.prisma.')
  if (paths.some((path) => /migration|migrations/i.test(path))) items.push('Migration files indicate versioned database changes.')
  if (corpus.includes('mongoose')) items.push('Mongoose usage suggests document models and MongoDB persistence.')
  if (corpus.includes('sequelize')) items.push('Sequelize usage suggests SQL models and migrations.')
  if (corpus.includes('drizzle')) items.push('Drizzle usage suggests typed SQL schema definitions.')
  if (corpus.includes('postgres') || corpus.includes('postgresql')) items.push('PostgreSQL references found in config or docs.')
  return {
    title: 'Database schema',
    summary: items.length ? 'Persistence evidence was found in code and configuration.' : 'No direct database layer was detected from sampled files.',
    items: items.length ? items : ['No ORM, migration, schema, or database-specific references were found in the inspected sample.'],
  }
}

function detectAuth(paths, corpus) {
  const items = []
  if (corpus.includes('nextauth') || corpus.includes('auth.js')) items.push('NextAuth/Auth.js style provider flow appears to be present.')
  if (corpus.includes('jwt') || corpus.includes('jsonwebtoken')) items.push('JWT token creation or validation appears in source/config.')
  if (corpus.includes('oauth')) items.push('OAuth provider terminology appears in documentation or source.')
  if (corpus.includes('passport')) items.push('Passport middleware may handle authentication strategies.')
  if (paths.some((path) => /middleware|guard|protected/i.test(path))) items.push('Middleware or guard files suggest protected route enforcement.')
  return {
    title: 'Authentication flow',
    summary: items.length ? 'Authentication signals were identified.' : 'No clear authentication flow was found in the inspected files.',
    items: items.length ? items : ['Treat routes as unauthenticated until auth middleware, guards, or provider configuration are confirmed.'],
  }
}

function detectDeployment(paths, packages) {
  const scripts = packages.flatMap((pkg) => Object.entries(pkg.scripts ?? {}).map(([name, command]) => `${name}: ${command}`))
  const items = []
  if (scripts.length) items.push(`Package scripts: ${scripts.slice(0, 8).join('; ')}`)
  if (paths.some((path) => path.endsWith('Dockerfile'))) items.push('Dockerfile detected for container deployment.')
  if (paths.some((path) => path.includes('docker-compose'))) items.push('Docker Compose configuration detected.')
  if (paths.some((path) => path.includes('.github/workflows'))) items.push('GitHub Actions workflows detected for CI/CD.')
  if (paths.some((path) => /vercel\.json|netlify\.toml|render\.yaml|fly\.toml/i.test(path))) {
    items.push('Hosting platform configuration detected.')
  }
  return {
    title: 'Deployment process',
    summary: items.length ? 'Build and deployment signals were detected.' : 'Deployment process is not explicit in sampled files.',
    items: items.length ? items : ['Add build, preview, environment, and deployment documentation for clearer operations.'],
  }
}

function inferArchitecture(paths, techStack, apis, database) {
  const items = []
  if (paths.some((path) => /^src\//.test(path))) items.push('Source is organized around a src directory for application code.')
  if (paths.some((path) => /app\/|pages\/|routes\//.test(path))) items.push('Route or page directories indicate file-based screen composition.')
  if (paths.some((path) => /server|api|controllers/i.test(path))) items.push('Server/API layer exists alongside client or feature code.')
  if (paths.some((path) => /components/i.test(path))) items.push('Reusable component layer detected for interface composition.')
  if (database.items.length && !database.items[0].startsWith('No ORM')) items.push('Persistence layer is present and should be traced through schema and service modules.')
  if (apis.length) items.push(`${apis.length} API endpoint signals connect clients to backend handlers.`)
  if (techStack.includes('React') || techStack.includes('Vue') || techStack.includes('Svelte')) {
    items.push('Frontend runtime composes views from component files and shared state/helpers.')
  }
  return items.length ? items : ['Architecture could not be deeply inferred from the available sample. Add more source files for higher confidence.']
}

function buildFolderStructure(paths) {
  const top = new Map()
  for (const path of paths) {
    const parts = path.split('/').filter(Boolean)
    const key = parts.length > 1 ? `${parts[0]}/` : parts[0]
    top.set(key, (top.get(key) ?? 0) + 1)
  }
  return Array.from(top.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([folder, count]) => `${folder} - ${count} file${count === 1 ? '' : 's'}`)
}

function buildImprovements(source, techStack, apis, auth, deploy) {
  const suggestions = [
    'Add or refresh an architecture decision record that names the main runtime boundaries and ownership model.',
    'Document critical setup steps, required environment variables, and local data dependencies in the README.',
  ]
  if (!apis.length) suggestions.push('Expose API contracts through route comments, OpenAPI, or typed client definitions.')
  if (auth.items[0]?.startsWith('Treat routes')) suggestions.push('Clarify authentication and authorization expectations for protected actions.')
  if (deploy.items[0]?.startsWith('Add build')) suggestions.push('Add reproducible build and deployment instructions with preview verification.')
  if (!techStack.includes('TypeScript')) suggestions.push('Consider stronger typing around public interfaces and integration boundaries.')
  if (source.files.length > 500) suggestions.push('Create feature-level ownership notes to keep a large codebase navigable.')
  return suggestions.slice(0, 8)
}

function buildFlowchart(source, techStack, apis, database, auth, deploy) {
  const hasApi = apis.length > 0
  const hasDb = !database.items[0]?.startsWith('No ORM')
  const authLabel = auth.items[0]?.startsWith('Treat routes') ? 'Public routes' : 'Auth guard'
  const deployLabel = deploy.items[0]?.startsWith('Add build') ? 'Manual deploy' : 'Deploy pipeline'
  return [
    'flowchart LR',
    `  Source[${escapeMermaid(source.label)}] --> Analyzer[RepoLens analyzer]`,
    `  Analyzer --> Stack[${escapeMermaid(techStack.slice(0, 3).join(' + ') || 'Tech stack')}]`,
    '  Stack --> UI[Client screens and components]',
    hasApi ? '  UI --> API[API routes and handlers]' : '  UI --> Static[Static content or local logic]',
    hasApi && hasDb ? '  API --> Data[Database or ORM layer]' : '',
    `  UI --> Auth[${authLabel}]`,
    `  Stack --> Deploy[${deployLabel}]`,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildEvidence(source, paths) {
  const kindLabel = source.kind === 'github' ? 'GitHub repository' : source.kind === 'zip' ? 'ZIP archive' : 'Website URL'
  return [
    `${paths.length} file path${paths.length === 1 ? '' : 's'} inspected.`,
    `${Object.keys(source.keyFiles).length} key file${Object.keys(source.keyFiles).length === 1 ? '' : 's'} sampled.`,
    `${kindLabel}: ${source.label}`,
  ]
}

async function answerQuestion(question, analysis) {
  const lower = question.toLowerCase()
  if (!analysis?.projectName) {
    return 'Run an analysis first, then I can answer from the generated project map.'
  }
  if (getLlmConfig()) {
    try {
      return await callLlm([
        {
          role: 'system',
          content:
            'You are an expert software engineering assistant answering questions about a reverse-engineered project. Ground all project-specific facts strictly in the provided analysis, but feel free to explain technical concepts, acronyms, or the general domain (like what cleanroom engineering is) in a clear, friendly way to help the user understand.',
        },
        {
          role: 'user',
          content: JSON.stringify({ question, analysis: compactAnalysisForChat(analysis) }, null, 2),
        },
      ])
    } catch {
      // Fall through to deterministic local answers if the provider is temporarily unavailable.
    }
  }
  if (lower.includes('api') || lower.includes('endpoint')) {
    return analysis.apis?.length
      ? `I found ${analysis.apis.length} API signals: ${analysis.apis
          .slice(0, 5)
          .map((api) => `${api.method} ${api.path}`)
          .join(', ')}.`
      : 'I did not find explicit API routes in the inspected sample.'
  }
  if (lower.includes('auth') || lower.includes('login')) {
    return `${analysis.authenticationFlow.summary} ${analysis.authenticationFlow.items.join(' ')}`
  }
  if (lower.includes('database') || lower.includes('schema') || lower.includes('data')) {
    return `${analysis.databaseSchema.summary} ${analysis.databaseSchema.items.join(' ')}`
  }
  if (lower.includes('deploy') || lower.includes('build')) {
    return `${analysis.deploymentProcess.summary} ${analysis.deploymentProcess.items.join(' ')}`
  }
  if (lower.includes('improve') || lower.includes('risk')) {
    return `I would start with: ${analysis.improvementSuggestions.slice(0, 3).join(' ')}`
  }
  return `${analysis.projectName} overview: ${analysis.overview} Architecture signals: ${analysis.architecture.items
    .slice(0, 4)
    .join(' ')}`
}

function compactAnalysisForChat(analysis) {
  return {
    projectName: analysis.projectName,
    overview: analysis.overview,
    techStack: analysis.techStack,
    architecture: analysis.architecture,
    databaseSchema: analysis.databaseSchema,
    apis: analysis.apis?.slice(0, 10),
    authenticationFlow: analysis.authenticationFlow,
    deploymentProcess: analysis.deploymentProcess,
    improvementSuggestions: analysis.improvementSuggestions,
    components: analysis.components?.slice(0, 10),
  }
}

function isKeyFile(path) {
  return (
    /(^|\/)(package\.json|README\.md|Dockerfile|docker-compose\.ya?ml|vite\.config\.[jt]s|next\.config\.[jt]s|tailwind\.config\.[jt]s|tsconfig\.json|\.env\.example|vercel\.json|netlify\.toml|render\.yaml|fly\.toml)$/i.test(
      path,
    ) ||
    /(^|\/)(schema\.prisma|requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml)$/i.test(path) ||
    /\.(routes|controller|service|model|schema|middleware|guard)\.[jt]sx?$/i.test(path)
  )
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function escapeMermaid(value) {
  return String(value).replace(/[[\]{}"]/g, '')
}
