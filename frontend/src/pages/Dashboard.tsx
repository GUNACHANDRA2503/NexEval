import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PlusCircle, AlertCircle, CheckCircle2, TrendingUp, ArrowRight, Zap, List, FlaskConical, Layers, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { AnalyticsOverview, BugReport, RootCauseCount } from '../types';
import { formatDate, priorityColor } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';
import { useEvalContext } from '../contexts/EvalContext';

const PIE_COLORS = ['#ef4444', '#f97316', '#a855f7', '#f43f5e', '#f59e0b', '#10b981', '#6b7280'];

export default function Dashboard() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { isRunning } = useEvalContext();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [rootCauses, setRootCauses] = useState<RootCauseCount[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.allSettled([api.analyticsOverview(), api.listBugs(), api.rootCauseDistribution()]).then(
      (results) => {
        const [o, b, r] = results;
        if (o.status === 'fulfilled') setOverview(o.value);
        if (b.status === 'fulfilled') setBugs(b.value);
        if (r.status === 'fulfilled') setRootCauses(r.value);
      },
    ).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const dark = theme === 'dark';
  const tooltipStyle = {
    contentStyle: {
      backgroundColor: dark ? '#18181b' : '#ffffff',
      border: `1px solid ${dark ? '#3f3f46' : '#b4bad2'}`,
      borderRadius: '8px',
      color: dark ? '#e4e4e7' : '#0a0d20',
    },
    labelStyle: { color: dark ? '#a1a1aa' : '#343a58' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const openCount = bugs.filter((b) => b.status === 'open').length;
  const resolvedCount = bugs.filter((b) => b.status === 'resolved').length;
  const stats = [
    { label: 'Total Bugs', value: overview?.total_bugs ?? bugs.length, icon: Zap, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { label: 'Open', value: overview?.open_bugs ?? openCount, icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Resolved', value: overview?.resolved_bugs ?? resolvedCount, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    {
      label: 'Avg Faithfulness',
      value: overview?.avg_faithfulness != null ? `${Math.round(overview.avg_faithfulness * 100)}%` : '—',
      icon: TrendingUp,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Overview of your RAG evaluation pipeline</p>
        </div>
        <Link
          to="/bugs/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          New Bug
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${s.bg}`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <span className="text-sm text-zinc-400">{s.label}</span>
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quick nav cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to="/bugs"
          className="group bg-zinc-900 border border-zinc-700 hover:border-indigo-500/30 rounded-xl p-5 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <List className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">All Bugs</h3>
                <p className="text-xs text-zinc-500">{overview?.total_bugs ?? bugs.length} bugs with filters & search</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
          </div>
        </Link>
        <Link
          to="/test-suites"
          className="group bg-zinc-900 border border-zinc-700 hover:border-violet-500/30 rounded-xl p-5 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FlaskConical className="w-5 h-5 text-violet-400" />
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Test Suites</h3>
                <p className="text-xs text-zinc-500">Regression testing & comparisons</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors" />
          </div>
        </Link>
        <Link
          to="/batch"
          className="group bg-zinc-900 border border-zinc-700 hover:border-amber-500/30 rounded-xl p-5 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Layers className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Batch Eval</h3>
                <p className="text-xs text-zinc-500">Evaluate multiple bugs at once</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition-colors" />
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Root cause pie */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Root Cause Distribution</h2>
          {rootCauses.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={rootCauses}
                  dataKey="count"
                  nameKey="root_cause"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                >
                  {rootCauses.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No evaluations yet</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {rootCauses.map((rc, i) => (
              <div key={rc.root_cause} className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                {rc.root_cause.replace(/_/g, ' ')} ({rc.count})
              </div>
            ))}
          </div>
        </div>

        {/* Recent bugs preview */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300">Recent Bugs</h2>
            <Link to="/bugs" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              View all →
            </Link>
          </div>
          {bugs.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <p className="text-sm">No bugs reported yet.</p>
              <Link to="/bugs/new" className="text-indigo-400 text-sm hover:underline mt-1 inline-block">
                Submit your first bug
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {bugs.slice(0, 5).map((bug) => {
                const running = isRunning(bug.id);
                return (
                  <div
                    key={bug.id}
                    onClick={() => navigate(`/bugs/${bug.id}`)}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 cursor-pointer transition-all"
                  >
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                      bug.status === 'open' ? 'bg-amber-500' : bug.status === 'resolved' ? 'bg-emerald-500' : 'bg-zinc-600'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 group-hover:text-indigo-300 transition-colors truncate">
                        {bug.user_question}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityColor(bug.priority)}`}>
                          {bug.priority}
                        </span>
                        {running && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            Evaluating
                          </span>
                        )}
                        {!running && bug.evaluation_count > 0 && (
                          <span className="text-[10px] text-indigo-400">{bug.evaluation_count} eval{bug.evaluation_count !== 1 ? 's' : ''}</span>
                        )}
                        <span className="text-[10px] text-zinc-500">{formatDate(bug.created_at)}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
