import {
  Bot,
  Boxes,
  Braces,
  CircleDot,
  Cloud,
  Code2,
  Database,
  FileArchive,
  FolderTree,
  GitBranch,
  Globe2,
  KeyRound,
  Layers3,
  Loader2,
  MessageSquareText,
  Network,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react'
import mermaid from 'mermaid'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type SourceType = 'github' | 'zip' | 'website'

type AnalysisSection = {
  title: string
  summary: string
  items: string[]
}

type ComponentInfo = {
  name: string
  path: string
  role: string
}

type ApiInfo = {
  method: string
  path: string
  description: string
}

type AnalysisResult = {
  projectName: string
  sourceLabel: string
  generatedAt: string
  confidence: number
  overview: string
  architecture: AnalysisSection
  techStack: string[]
  folderStructure: string[]
  components: ComponentInfo[]
  databaseSchema: AnalysisSection
  apis: ApiInfo[]
  authenticationFlow: AnalysisSection
  deploymentProcess: AnalysisSection
  improvementSuggestions: string[]
  flowchart: string
  evidence: string[]
  mcpPipeline: Array<{
    name: string
    status: string
    detail: string
  }>
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const emptyAnalysis: AnalysisResult = {
  projectName: 'Awaiting project',
  sourceLabel: 'No source selected',
  generatedAt: new Date().toISOString(),
  confidence: 0,
  overview:
    'Provide a GitHub repository, upload a ZIP, or enter a website URL to generate a reverse-engineered project map.',
  architecture: {
    title: 'Architecture',
    summary: 'The analyzer will infer runtime boundaries, app layers, and data flow.',
    items: ['Client entrypoints', 'Server surfaces', 'Shared modules', 'Integration points'],
  },
  techStack: ['React', 'TypeScript', 'Express analyzer', 'Mermaid diagrams'],
  folderStructure: ['src/', 'server/', 'package.json'],
  components: [],
  databaseSchema: {
    title: 'Database schema',
    summary: 'Schema files, ORM models, migrations, and persistence hints will appear here.',
    items: ['No database evidence loaded yet.'],
  },
  apis: [],
  authenticationFlow: {
    title: 'Authentication flow',
    summary: 'Auth providers, middleware, token storage, and protected routes will be identified.',
    items: ['No authentication evidence loaded yet.'],
  },
  deploymentProcess: {
    title: 'Deployment process',
    summary: 'Build scripts, container files, hosting config, and environment variables will be summarized.',
    items: ['No deployment evidence loaded yet.'],
  },
  improvementSuggestions: [
    'Run an analysis to receive prioritized maintainability, security, and delivery suggestions.',
  ],
  flowchart:
    'flowchart LR\n  A[Project source] --> B[Analyzer]\n  B --> C[Architecture]\n  B --> D[Tech stack]\n  B --> E[AI chat]',
  evidence: [],
  mcpPipeline: [
    {
      name: 'GitHub MCP',
      status: 'Ready',
      detail: 'Repository metadata, file tree, README, and package manifests',
    },
    {
      name: 'Fetch MCP',
      status: 'Ready',
      detail: 'Documentation pages, website copy, links, and script hints',
    },
    {
      name: 'Filesystem MCP',
      status: 'Ready',
      detail: 'Uploaded ZIP inspection, source files, config, and project assets',
    },
    {
      name: 'Context7 MCP',
      status: 'Ready',
      detail: 'Framework documentation context inferred from detected dependencies',
    },
    {
      name: 'LLM',
      status: 'Ready',
      detail: 'Set OPENROUTER_API_KEY, XAI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, OLLAMA_BASE_URL, or LLM_BASE_URL for AI analysis',
    },
  ],
}

const tabs = [
  'Overview',
  'Architecture',
  'Flowchart',
  'Tech stack',
  'Folders',
  'Components',
  'Data',
  'APIs',
  'Auth',
  'Deploy',
  'Improve',
] as const

type TabName = (typeof tabs)[number]

const sourceOptions: Array<{
  type: SourceType
  label: string
  icon: typeof GitBranch
  placeholder: string
}> = [
  {
    type: 'github',
    label: 'GitHub repository',
    icon: GitBranch,
    placeholder: 'https://github.com/openai/openai-node',
  },
  {
    type: 'zip',
    label: 'ZIP upload',
    icon: FileArchive,
    placeholder: 'Drop or choose a project ZIP',
  },
  {
    type: 'website',
    label: 'Website URL',
    icon: Globe2,
    placeholder: 'https://docs.example.com',
  },
]

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#e8faf6',
    primaryTextColor: '#10231f',
    primaryBorderColor: '#21a989',
    lineColor: '#52706a',
    secondaryColor: '#fff4dc',
    tertiaryColor: '#f7f9fb',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
})

function MermaidDiagram({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let mounted = true
    const id = `diagram-${Math.random().toString(36).slice(2)}`
    mermaid.render(id, chart).then(({ svg: rendered }) => {
      if (mounted) {
        setSvg(rendered)
      }
    })
    return () => {
      mounted = false
    }
  }, [chart])

  return <div className="diagram" dangerouslySetInnerHTML={{ __html: svg }} />
}

function App() {
  const [sourceType, setSourceType] = useState<SourceType>('github')
  const [sourceValue, setSourceValue] = useState('')
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult>(emptyAnalysis)
  const [activeTab, setActiveTab] = useState<TabName>('Overview')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Ask me about routing, dependencies, auth, database models, deployment, or the riskiest parts of the project.',
    },
  ])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.llm?.configured) {
          setAnalysis((prev) => ({
            ...prev,
            mcpPipeline: prev.mcpPipeline.map((step) =>
              step.name === 'LLM'
                ? {
                    ...step,
                    status: 'Ready',
                    detail: `Configured with ${data.llm.provider} (${data.llm.model})`,
                  }
                : step
            ),
          }))
        }
      })
      .catch(() => {})
  }, [])

  const currentSource = sourceOptions.find((option) => option.type === sourceType) ?? sourceOptions[0]
  const readiness = useMemo(() => {
    if (sourceType === 'zip') {
      return Boolean(zipFile)
    }
    return sourceValue.trim().length > 0
  }, [sourceType, sourceValue, zipFile])

  async function analyzeProject(event: FormEvent) {
    event.preventDefault()
    if (!readiness) {
      setError('Choose a source before starting the analysis.')
      return
    }

    const formData = new FormData()
    formData.append('sourceType', sourceType)
    formData.append('sourceValue', sourceValue.trim())
    if (zipFile) {
      formData.append('archive', zipFile)
    }

    setIsAnalyzing(true)
    setError('')
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? 'Analyzer failed.')
      }
      const result = (await response.json()) as AnalysisResult
      setAnalysis(result)
      setActiveTab('Overview')
      setChatMessages([
        {
          role: 'assistant',
          content: `I mapped ${result.projectName}. Ask about architecture, APIs, auth, deployment, or where to improve first.`,
        },
      ])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Analyzer failed.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault()
    const question = chatInput.trim()
    if (!question) {
      return
    }
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: question }]
    setChatMessages(nextMessages)
    setChatInput('')

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, analysis }),
    })
    const body = (await response.json()) as { answer: string }
    setChatMessages([...nextMessages, { role: 'assistant', content: body.answer }])
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">
            <Sparkles size={16} />
            AI Project Reverse Engineer
          </p>
          <h1>Turn any project source into an explorable engineering map.</h1>
        </div>
        <div className="status-pill">
          <CircleDot size={14} />
          {analysis.confidence}% confidence
        </div>
      </section>

      <section className="intake-band">
        <form className="source-panel" onSubmit={analyzeProject}>
          <div className="source-switcher" role="tablist" aria-label="Source type">
            {sourceOptions.map((option) => {
              const Icon = option.icon
              return (
                <button
                  type="button"
                  key={option.type}
                  className={sourceType === option.type ? 'source-option active' : 'source-option'}
                  onClick={() => {
                    setSourceType(option.type)
                    setError('')
                  }}
                >
                  <Icon size={18} />
                  {option.label}
                </button>
              )
            })}
          </div>

          <div className="source-entry">
            {sourceType === 'zip' ? (
              <button
                type="button"
                className="upload-zone"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={24} />
                <span>{zipFile ? zipFile.name : currentSource.placeholder}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => setZipFile(event.target.files?.[0] ?? null)}
                />
              </button>
            ) : (
              <label className="url-field">
                <Search size={20} />
                <input
                  value={sourceValue}
                  onChange={(event) => setSourceValue(event.target.value)}
                  placeholder={currentSource.placeholder}
                />
              </label>
            )}
            <button className="analyze-button" type="submit" disabled={isAnalyzing || !readiness}>
              {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Network size={18} />}
              Analyze
            </button>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </form>

        <div className="pipeline">
          {analysis.mcpPipeline.map((step) => (
            <div className="pipeline-step" key={step.name}>
              <ShieldCheck size={18} />
              <div>
                <strong>{step.name}</strong>
                <span className={statusClass(step.status)}>{step.status}</span>
                <p>{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="summary-grid">
        <Metric icon={Layers3} label="Architecture signals" value={analysis.architecture.items.length} />
        <Metric icon={Braces} label="Technologies" value={analysis.techStack.length} />
        <Metric icon={Boxes} label="Components" value={analysis.components.length} />
        <Metric icon={Cloud} label="Deployment hints" value={analysis.deploymentProcess.items.length} />
      </section>

      <section className="workspace">
        <div className="dashboard">
          <header className="project-header">
            <div>
              <p className="muted">{analysis.sourceLabel}</p>
              <h2>{analysis.projectName}</h2>
            </div>
            <time>{new Date(analysis.generatedAt).toLocaleString()}</time>
          </header>

          <nav className="tabs" aria-label="Analysis tabs">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab}
                className={activeTab === tab ? 'active' : ''}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>

          <AnalysisTab tab={activeTab} analysis={analysis} />
        </div>

        <aside className="chat-panel">
          <div className="chat-title">
            <Bot size={20} />
            <h2>Project chat</h2>
          </div>
          <div className="messages">
            {chatMessages.map((message, index) => (
              <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <FormattedMessage content={message.content} />
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about the analyzed project"
            />
            <button type="submit" aria-label="Send question">
              <Send size={18} />
            </button>
          </form>
        </aside>
      </section>
    </main>
  )
}

function statusClass(status: string) {
  const lower = status.toLowerCase()
  if (lower.includes('used')) return 'status-badge used'
  if (lower.includes('failed') || lower.includes('error')) return 'status-badge failed'
  if (lower.includes('fallback') || lower.includes('pending')) return 'status-badge warning'
  return 'status-badge ready'
}

function FormattedMessage({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g)
  
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const match = part.match(/```(\w*)\n([\s\S]*?)```/)
          const lang = match ? match[1] : ''
          const code = match ? match[2].trim() : part.slice(3, -3).trim()
          return (
            <div key={`code-block-${index}`} className="chat-code-block">
              {lang && <div className="code-lang">{lang}</div>}
              <pre>
                <code>{code}</code>
              </pre>
            </div>
          )
        }
        
        return part.split(/\n{2,}/).map((block, blockIndex) => {
          const trimmed = block.trim()
          if (!trimmed) {
            return null
          }
          if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            return (
              <ul key={`list-${index}-${blockIndex}`}>
                {trimmed.split('\n').map((line, lineIndex) => (
                  <li key={lineIndex}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>
                ))}
              </ul>
            )
          }
          return <p key={`p-${index}-${blockIndex}`}>{renderInlineMarkdown(trimmed)}</p>
        })
      })}
    </>
  )
}

function renderInlineMarkdown(text: string) {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g)
  
  return boldParts.map((boldPart, i) => {
    if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
      const boldText = boldPart.slice(2, -2)
      const codeParts = boldText.split(/(`[^`]+`)/g)
      return (
        <strong key={`bold-${i}`}>
          {codeParts.map((codePart, j) =>
            codePart.startsWith('`') && codePart.endsWith('`') ? (
              <code key={`code-${i}-${j}`}>{codePart.slice(1, -1)}</code>
            ) : (
              codePart
            )
          )}
        </strong>
      )
    } else {
      const codeParts = boldPart.split(/(`[^`]+`)/g)
      return codeParts.map((codePart, j) =>
        codePart.startsWith('`') && codePart.endsWith('`') ? (
          <code key={`code-${i}-${j}`}>{codePart.slice(1, -1)}</code>
        ) : (
          codePart
        )
      )
    }
  })
}

function Metric({ icon: Icon, label, value }: { icon: typeof GitBranch; label: string; value: number }) {
  return (
    <div className="metric">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function AnalysisTab({ tab, analysis }: { tab: TabName; analysis: AnalysisResult }) {
  if (tab === 'Overview') {
    return (
      <div className="tab-content two-column">
        <article className="narrative">
          <h3>Project overview</h3>
          <p>{analysis.overview}</p>
        </article>
        <EvidenceList evidence={analysis.evidence} />
      </div>
    )
  }

  if (tab === 'Architecture') {
    return (
      <SectionView
        icon={GitBranch}
        title={analysis.architecture.title}
        summary={analysis.architecture.summary}
        items={analysis.architecture.items}
      />
    )
  }

  if (tab === 'Flowchart') {
    return (
      <div className="tab-content">
        <MermaidDiagram chart={analysis.flowchart} />
      </div>
    )
  }

  if (tab === 'Tech stack') {
    return (
      <div className="tab-content chip-grid">
        {analysis.techStack.map((tech) => (
          <span className="tech-chip" key={tech}>
            <Code2 size={16} />
            {tech}
          </span>
        ))}
      </div>
    )
  }

  if (tab === 'Folders') {
    return <ListPanel icon={FolderTree} items={analysis.folderStructure} />
  }

  if (tab === 'Components') {
    return (
      <div className="tab-content component-grid">
        {analysis.components.length ? (
          analysis.components.map((component) => (
            <article className="component-card" key={`${component.name}-${component.path}`}>
              <h3>{component.name}</h3>
              <code>{component.path}</code>
              <p>{component.role}</p>
            </article>
          ))
        ) : (
          <EmptyState text="No component files were identified yet." />
        )}
      </div>
    )
  }

  if (tab === 'Data') {
    return (
      <SectionView
        icon={Database}
        title={analysis.databaseSchema.title}
        summary={analysis.databaseSchema.summary}
        items={analysis.databaseSchema.items}
      />
    )
  }

  if (tab === 'APIs') {
    return (
      <div className="tab-content api-list">
        {analysis.apis.length ? (
          analysis.apis.map((api) => (
            <div className="api-row" key={`${api.method}-${api.path}`}>
              <span>{api.method}</span>
              <code>{api.path}</code>
              <p>{api.description}</p>
            </div>
          ))
        ) : (
          <EmptyState text="No API routes were detected yet." />
        )}
      </div>
    )
  }

  if (tab === 'Auth') {
    return (
      <SectionView
        icon={KeyRound}
        title={analysis.authenticationFlow.title}
        summary={analysis.authenticationFlow.summary}
        items={analysis.authenticationFlow.items}
      />
    )
  }

  if (tab === 'Deploy') {
    return (
      <SectionView
        icon={Rocket}
        title={analysis.deploymentProcess.title}
        summary={analysis.deploymentProcess.summary}
        items={analysis.deploymentProcess.items}
      />
    )
  }

  return <ListPanel icon={Wrench} items={analysis.improvementSuggestions} />
}

function SectionView({
  icon: Icon,
  title,
  summary,
  items,
}: {
  icon: typeof GitBranch
  title: string
  summary: string
  items: string[]
}) {
  return (
    <div className="tab-content section-view">
      <div className="section-heading">
        <Icon size={24} />
        <div>
          <h3>{title}</h3>
          <p>{summary}</p>
        </div>
      </div>
      <ul className="detail-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function ListPanel({ icon: Icon, items }: { icon: typeof GitBranch; items: string[] }) {
  return (
    <div className="tab-content section-view">
      <div className="section-heading">
        <Icon size={24} />
        <h3>Detected details</h3>
      </div>
      <ul className="detail-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function EvidenceList({ evidence }: { evidence: string[] }) {
  return (
    <article className="evidence">
      <h3>Evidence</h3>
      {evidence.length ? (
        <ul>
          {evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">Evidence will appear after the first analysis.</p>
      )}
    </article>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <MessageSquareText size={22} />
      <p>{text}</p>
    </div>
  )
}

export default App
