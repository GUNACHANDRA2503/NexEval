import {
  Zap,
  Shield,
  TrendingUp,
  Search,
  FlaskConical,
  BarChart3,
  MessageSquare,
  Layers,
  Database,
  Cpu,
  GitCompare,
  Copy,
  Pencil,
  RefreshCw,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Brain,
  FileText,
} from 'lucide-react';

const HERO_FEATURES = [
  {
    icon: Shield,
    title: '6-Metric Evaluation',
    desc: 'Faithfulness, Answer Relevancy, Contextual Relevancy, Contextual Precision, Contextual Recall, and Hallucination detection — powered by DeepEval and an LLM judge.',
    color: 'from-indigo-500 to-blue-600',
  },
  {
    icon: Brain,
    title: 'Root Cause Analysis',
    desc: 'AI automatically classifies every evaluation into one of 6 root causes — Retrieval Failure, Ranking Issue, Generation Failure, Hallucination, Irrelevant Answer, or Acceptable — with tailored fix suggestions.',
    color: 'from-violet-500 to-purple-600',
  },
  {
    icon: FlaskConical,
    title: 'Regression Testing',
    desc: 'Group bugs into test suites. After changing your pipeline, one click re-evaluates everything and shows a before/after comparison — which bugs improved, regressed, or stayed the same.',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    icon: GitCompare,
    title: 'Evaluation Diff',
    desc: 'Pick any two evaluation runs for the same bug and see a side-by-side comparison with green/red delta percentages, pass/fail changes, and root cause transitions.',
    color: 'from-amber-500 to-orange-600',
  },
];

const FEATURE_SECTIONS = [
  {
    title: 'Bug Management',
    icon: Target,
    gradient: 'from-indigo-500/20 to-transparent',
    features: [
      { icon: FileText, name: 'Smart Intake Form', desc: 'Submit bugs with questions, expected/actual answers, retrieved chunks in any format (JSON, partial JSON, raw text, escaped strings), expected INS IDs, module name, and priority.' },
      { icon: Search, name: 'Lenient Chunk Parser', desc: 'Paste anything — malformed JSON, escaped quotes, wrapped API responses, log output. NexEval extracts INS IDs and builds structured chunks automatically.' },
      { icon: Pencil, name: 'Inline Editing', desc: 'Edit any user-input field directly from the bug detail view. Changes to raw chunks auto-extract INS IDs and rebuild structured data.' },
      { icon: Copy, name: 'Copy & Duplicate', desc: 'Copy bug data as JSON for batch eval, or duplicate into a new bug with all fields pre-filled for quick variations.' },
    ],
  },
  {
    title: 'Evaluation Engine',
    icon: Zap,
    gradient: 'from-violet-500/20 to-transparent',
    features: [
      { icon: Cpu, name: 'Async Evaluation', desc: 'Evaluations run in background threads. A floating tracker follows you across pages with real-time progress and automatic completion notifications.' },
      { icon: RefreshCw, name: 'Auto-Evaluate', desc: 'Toggle automatic evaluation after bug creation — configurable globally in config.json and overridable per submission.' },
      { icon: TrendingUp, name: 'Full History', desc: 'Every evaluation run is stored permanently. Browse, compare, and analyze any historical run with complete metric scores and root cause data.' },
      { icon: GitCompare, name: 'Run Comparison', desc: 'Side-by-side diff view for any two runs: score deltas with green/red color coding, pass/fail status changes, and root cause transitions.' },
    ],
  },
  {
    title: 'Retrieved Chunks',
    icon: FileText,
    gradient: 'from-emerald-500/20 to-transparent',
    features: [
      { icon: Search, name: 'Document Viewer', desc: 'View actual content of every retrieved chunk, grouped by INS ID. Expected documents highlighted green, missing ones flagged red.' },
      { icon: Layers, name: 'Formatted JSON', desc: 'Chunk content rendered as collapsible JSON trees with syntax-highlighted keys, strings, and numbers — or as structured passages with metadata.' },
      { icon: MessageSquare, name: 'AI Rephraser', desc: 'Generate alternative question phrasings optimized for better retrieval. Results cached in database, one-click copy, regenerate on demand.' },
    ],
  },
  {
    title: 'Analytics & Insights',
    icon: BarChart3,
    gradient: 'from-amber-500/20 to-transparent',
    features: [
      { icon: TrendingUp, name: 'Faithfulness Trend', desc: 'Time-series chart tracking faithfulness scores over the last N evaluations to spot systemic improvements or regressions.' },
      { icon: AlertTriangle, name: 'Problematic Documents', desc: 'Horizontal bar chart of top 10 INS IDs appearing in the most bugs — find which documents cause the most issues.' },
      { icon: BarChart3, name: 'Scores by Module', desc: 'Grouped bar chart comparing average metric scores across different modules to identify weak spots in your pipeline.' },
      { icon: Database, name: 'Full Persistence', desc: 'PostgreSQL database stores everything: bugs, evaluations, metrics, rephrasings, suites, and runs — with auto schema migration.' },
    ],
  },
];

const ROOT_CAUSES = [
  { name: 'Retrieval Failure', desc: 'Relevant documents were not retrieved by the search system', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  { name: 'Ranking Issue', desc: 'Right documents retrieved but ranked too low for the LLM to use', icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { name: 'Generation Failure', desc: 'Good context was available but the LLM generated a poor response', icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { name: 'Hallucination', desc: 'Response contains factual claims not supported by the retrieved context', icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  { name: 'Irrelevant Answer', desc: 'Response does not address the question that was actually asked', icon: XCircle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { name: 'Acceptable', desc: 'All metrics pass — the response meets quality thresholds', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
];

const METRICS = [
  { name: 'Faithfulness', desc: 'Is the answer grounded in the retrieved context?', good: '> 70%' },
  { name: 'Answer Relevancy', desc: 'Does the answer actually address the question?', good: '> 70%' },
  { name: 'Contextual Relevancy', desc: 'Are the retrieved chunks relevant to the query?', good: '> 60%' },
  { name: 'Contextual Precision', desc: 'Are the most relevant chunks ranked at the top?', good: '> 60%' },
  { name: 'Contextual Recall', desc: 'Does the context cover all the information needed?', good: '> 70%' },
  { name: 'Hallucination', desc: 'Claims in the response not present in context', good: '< 30%' },
];

export default function About() {
  return (
    <div className="space-y-16 pb-16">
      {/* Hero */}
      <div data-theme="dark" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950 via-zinc-900 to-violet-950 border border-indigo-500/20 p-8 md:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(139,92,246,0.1),transparent_50%)]" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">NexEval</h1>
              <p className="text-xs text-indigo-300/70 font-medium tracking-wider uppercase">RAG Evaluation Platform</p>
            </div>
          </div>
          <p className="text-lg text-zinc-300 max-w-2xl leading-relaxed mt-4">
            The complete evaluation and debugging platform for RAG systems. Automated quality assessment, root cause analysis, regression testing, and analytics — everything you need to systematically improve your retrieval-augmented generation pipeline.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">DeepEval Metrics</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">LLM-as-Judge</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Regression Testing</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">Analytics</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">PostgreSQL</span>
          </div>
        </div>
      </div>

      {/* Key capabilities */}
      <div>
        <h2 className="text-xl font-bold mb-6">Core Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HERO_FEATURES.map((f) => (
            <div key={f.title} className="group bg-zinc-900 border border-zinc-700 rounded-xl p-6 hover:border-indigo-500/40 hover:shadow-lg transition-all">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                <f.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-base font-semibold text-zinc-200 mb-2">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Evaluation Metrics */}
      <div>
        <h2 className="text-xl font-bold mb-2">Evaluation Metrics</h2>
        <p className="text-sm text-zinc-500 mb-6">Six industry-standard metrics powered by DeepEval, using an LLM-as-a-judge approach</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {METRICS.map((m) => (
            <div key={m.name} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 hover:border-indigo-500/30 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-zinc-200">{m.name}</h4>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{m.good}</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Root Cause Analysis */}
      <div>
        <h2 className="text-xl font-bold mb-2">Root Cause Classification</h2>
        <p className="text-sm text-zinc-500 mb-6">Every evaluation is automatically classified into one of six root causes with tailored fix suggestions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROOT_CAUSES.map((rc) => (
            <div key={rc.name} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex gap-3 hover:border-indigo-500/30 transition-colors">
              <div className={`p-2 rounded-lg ${rc.bg} flex-shrink-0 h-fit`}>
                <rc.icon className={`w-4 h-4 ${rc.color}`} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-200">{rc.name}</h4>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{rc.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature sections */}
      {FEATURE_SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="flex items-center gap-3 mb-6">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${section.gradient} border border-zinc-700`}>
              <section.icon className="w-5 h-5 text-zinc-300" />
            </div>
            <h2 className="text-xl font-bold">{section.title}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {section.features.map((f) => (
              <div key={f.name} className="flex gap-3 bg-zinc-900 border border-zinc-700 rounded-lg p-4 hover:border-indigo-500/30 transition-colors">
                <f.icon className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-zinc-200">{f.name}</h4>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Tech stack */}
      <div>
        <h2 className="text-xl font-bold mb-6">Tech Stack</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { name: 'React 18', detail: 'TypeScript + Vite', color: 'text-cyan-400' },
            { name: 'Tailwind CSS', detail: 'UI Styling', color: 'text-sky-400' },
            { name: 'Recharts', detail: 'Visualizations', color: 'text-indigo-400' },
            { name: 'FastAPI', detail: 'Python Backend', color: 'text-emerald-400' },
            { name: 'PostgreSQL', detail: 'Database', color: 'text-blue-400' },
            { name: 'DeepEval', detail: '6 Metrics', color: 'text-rose-400' },
          ].map((t) => (
            <div key={t.name} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-center hover:border-indigo-500/30 transition-colors">
              <p className={`text-sm font-semibold ${t.color}`}>{t.name}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{t.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div>
        <h2 className="text-xl font-bold mb-6">How It Works</h2>
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-indigo-500/50 via-violet-500/30 to-transparent" />
          <div className="space-y-6">
            {[
              { step: '1', title: 'Report a Bug', desc: 'Paste the user question, expected answer, actual chatbot response, and the retrieved chunks from your RAG pipeline.' },
              { step: '2', title: 'Automated Evaluation', desc: 'NexEval runs 6 DeepEval metrics using an LLM judge, scoring faithfulness, relevancy, precision, recall, and hallucination.' },
              { step: '3', title: 'Root Cause & Fix', desc: 'AI classifies the issue type and provides actionable fix suggestions specific to whether it\'s a retrieval, ranking, or generation problem.' },
              { step: '4', title: 'Iterate & Verify', desc: 'Make changes to your RAG pipeline, then re-evaluate. The evaluation diff shows exactly what improved and what regressed.' },
              { step: '5', title: 'Regression Test', desc: 'Group critical bugs into test suites. After any pipeline update, one click re-evaluates everything with a full before/after report.' },
            ].map((s) => (
              <div key={s.step} className="flex gap-4 pl-2">
                <div className="w-9 h-9 rounded-full bg-zinc-800 border-2 border-indigo-500/50 flex items-center justify-center flex-shrink-0 z-10">
                  <span className="text-xs font-bold text-indigo-300">{s.step}</span>
                </div>
                <div className="pt-1">
                  <h4 className="text-sm font-semibold text-zinc-200">{s.title}</h4>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-lg">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pt-8 border-t border-zinc-700">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Zap className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-bold text-zinc-300">NexEval</span>
          <span className="text-xs text-zinc-500">v0.3.0</span>
        </div>
        <p className="text-xs text-zinc-500">Built for developers who take RAG quality seriously.</p>
      </div>
    </div>
  );
}
