import { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { api } from '../lib/api';
import type { AnalyticsOverview, RootCauseCount, TrendPoint } from '../types';
import { useTheme } from '../contexts/ThemeContext';

const PIE_COLORS = ['#ef4444', '#f97316', '#a855f7', '#f43f5e', '#f59e0b', '#10b981', '#6b7280'];
const MODULE_COLORS = ['#818cf8', '#34d399', '#f97316', '#f43f5e', '#a855f7', '#f59e0b'];

function useChartStyle() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return {
    tooltip: {
      contentStyle: {
        backgroundColor: dark ? '#18181b' : '#ffffff',
        border: `1px solid ${dark ? '#3f3f46' : '#b4bad2'}`,
        borderRadius: '8px',
        color: dark ? '#e4e4e7' : '#0a0d20',
      },
      labelStyle: { color: dark ? '#a1a1aa' : '#343a58' },
    },
    grid: dark ? '#27272a' : '#b4bad2',
    axis: dark ? '#71717a' : '#5f6584',
    legend: dark ? '#a1a1aa' : '#343a58',
  };
}

interface FaithPoint { score: number; date: string; bug_id: string }
interface InsIdCount { ins_id: string; bug_count: number }

export default function Analytics() {
  const cs = useChartStyle();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [rootCauses, setRootCauses] = useState<RootCauseCount[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [faithTrend, setFaithTrend] = useState<FaithPoint[]>([]);
  const [topIns, setTopIns] = useState<InsIdCount[]>([]);
  const [moduleScores, setModuleScores] = useState<Record<string, string | number>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      api.analyticsOverview(),
      api.rootCauseDistribution(),
      api.trends(),
      api.faithfulnessTrend(),
      api.topInsIds(),
      api.scoresByModule(),
    ]).then((results) => {
      const [o, r, t, ft, ti, ms] = results;
      if (o.status === 'fulfilled') setOverview(o.value);
      if (r.status === 'fulfilled') setRootCauses(r.value);
      if (t.status === 'fulfilled') setTrends(t.value.points);
      if (ft.status === 'fulfilled') setFaithTrend(ft.value);
      else setFaithTrend([]);
      if (ti.status === 'fulfilled') setTopIns(ti.value);
      else setTopIns([]);
      if (ms.status === 'fulfilled') setModuleScores(ms.value);
      else setModuleScores([]);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const avgScores = [
    { name: 'Faithfulness', value: overview?.avg_faithfulness ?? 0 },
    { name: 'Answer Rel.', value: overview?.avg_answer_relevancy ?? 0 },
    { name: 'Context Rel.', value: overview?.avg_contextual_relevancy ?? 0 },
  ].map((s) => ({ ...s, pct: Math.round((s.value ?? 0) * 100) }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* No data */}
      {!overview || overview.total_bugs === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-700 rounded-xl">
          <p className="text-zinc-500">No data yet. Submit and evaluate bugs to see analytics.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bug Trends */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Bug Trends</h2>
            {trends.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cs.grid} />
                  <XAxis dataKey="date" stroke={cs.axis} fontSize={11} />
                  <YAxis stroke={cs.axis} fontSize={11} />
                  <Tooltip {...cs.tooltip} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#818cf8"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#818cf8' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">Not enough data for trends.</p>
            )}
          </div>

          {/* Root Cause Distribution */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Root Cause Distribution</h2>
            {rootCauses.length > 0 ? (
              <>
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
                    <Tooltip {...cs.tooltip} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-3">
                  {rootCauses.map((rc, i) => (
                    <div key={rc.root_cause} className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      {rc.root_cause.replace(/_/g, ' ')} ({rc.count})
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">No evaluations yet.</p>
            )}
          </div>

          {/* Average Scores */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Average Evaluation Scores</h2>
            {avgScores.some((s) => s.value) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={avgScores}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cs.grid} />
                  <XAxis dataKey="name" stroke={cs.axis} fontSize={11} />
                  <YAxis stroke={cs.axis} fontSize={11} domain={[0, 100]} />
                  <Tooltip {...cs.tooltip} />
                  <Bar dataKey="pct" fill="#818cf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">No scores available yet.</p>
            )}
          </div>

          {/* Faithfulness Trend */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Faithfulness Trend</h2>
            {faithTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={faithTrend.map((p) => ({ ...p, pct: Math.round(p.score * 100) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cs.grid} />
                  <XAxis
                    dataKey="date"
                    stroke={cs.axis}
                    fontSize={10}
                    tickFormatter={(v: string) => v ? new Date(v).toLocaleDateString() : ''}
                  />
                  <YAxis stroke={cs.axis} fontSize={11} domain={[0, 100]} />
                  <Tooltip
                    {...cs.tooltip}
                    labelFormatter={(v: unknown) =>
                      typeof v === 'string' && v ? new Date(v).toLocaleString() : ''
                    }
                    formatter={(val: unknown) => [`${Number(val)}%`, 'Faithfulness']}
                  />
                  <Line type="monotone" dataKey="pct" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">No faithfulness data yet.</p>
            )}
          </div>

          {/* Problematic Documents (Top INS IDs) */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Problematic Documents</h2>
            {topIns.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, topIns.length * 32)}>
                <BarChart data={topIns} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={cs.grid} />
                  <XAxis type="number" stroke={cs.axis} fontSize={11} />
                  <YAxis type="category" dataKey="ins_id" stroke={cs.axis} fontSize={10} width={90} />
                  <Tooltip {...cs.tooltip} />
                  <Bar dataKey="bug_count" fill="#f97316" radius={[0, 4, 4, 0]} name="Bug count" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">No INS ID data yet.</p>
            )}
          </div>

          {/* Scores by Module */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Scores by Module</h2>
            {moduleScores.length > 0 ? (() => {
              const metricKeys = [...new Set(moduleScores.flatMap((m) => Object.keys(m).filter((k) => k !== 'module')))];
              return (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={moduleScores}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cs.grid} />
                    <XAxis dataKey="module" stroke={cs.axis} fontSize={10} />
                    <YAxis stroke={cs.axis} fontSize={11} domain={[0, 100]} />
                    <Tooltip {...cs.tooltip} />
                    <Legend wrapperStyle={{ fontSize: '11px', color: cs.legend }} />
                    {metricKeys.map((key, i) => (
                      <Bar key={key} dataKey={key} fill={MODULE_COLORS[i % MODULE_COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              );
            })() : (
              <p className="text-zinc-500 text-sm text-center py-8">No module data yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
