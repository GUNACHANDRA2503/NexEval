import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  Layers,
  BarChart3,
  List,
  FlaskConical,
  Info,
  Sun,
  Moon,
  Monitor,
  KeyRound,
  LogOut,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/bugs', label: 'Bugs', icon: List },
  { to: '/bugs/new', label: 'New Bug', icon: PlusCircle },
  { to: '/batch', label: 'Batch Eval', icon: Layers },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/test-suites', label: 'Test Suites', icon: FlaskConical },
  { to: '/account', label: 'Account', icon: KeyRound },
  { to: '/about', label: 'About', icon: Info },
];

const themeOptions = [
  { key: 'light' as const, icon: Sun, title: 'Light' },
  { key: 'dark' as const, icon: Moon, title: 'Dark' },
  { key: 'system' as const, icon: Monitor, title: 'System' },
];

export default function Sidebar() {
  const { mode, setMode } = useTheme();
  const { user, preferredModel, setPreferredModel, logout } = useAuth();
  const savedModels = user?.saved_models ?? [];

  async function onModelChange(model: string) {
    await setPreferredModel(model || null);
  }

  return (
    <aside className="w-60 h-screen flex-shrink-0 bg-zinc-900 border-r border-zinc-700 flex flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-zinc-700">
        <NavLink
          to="/account"
          className="group block rounded-lg -mx-1 px-1 py-1.5 transition-colors hover:bg-zinc-800/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
          aria-label="Open account"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-900/30 ring-1 ring-white/10 group-hover:ring-white/20 transition-[box-shadow,ring-color]">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <span className="text-lg font-bold text-zinc-100 tracking-tight block leading-tight group-hover:text-white transition-colors">
                NexEval
              </span>
              {user ? (
                <p
                  className="mt-1 text-[11px] leading-snug text-zinc-500 truncate group-hover:text-zinc-400 transition-colors"
                  title={user.email}
                >
                  {user.email}
                </p>
              ) : null}
            </div>
          </div>
        </NavLink>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-3">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/' || l.to === '/bugs'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-500'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`
            }
          >
            <l.icon className="w-4 h-4" />
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-zinc-700 space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0 space-y-1.5">
            <label
              htmlFor="sidebar-model"
              className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
            >
              Active model
            </label>
            {savedModels.length === 0 ? (
              <NavLink
                to="/account"
                className="flex items-center justify-center rounded-lg border border-dashed border-amber-600/40 bg-amber-950/25 px-2 py-2.5 text-center text-[11px] font-medium text-amber-200/90 transition-colors hover:border-amber-500/50 hover:bg-amber-950/40"
              >
                Add models in Account
              </NavLink>
            ) : (
              <div className="relative group">
                <select
                  id="sidebar-model"
                  value={savedModels.includes(preferredModel) ? preferredModel : savedModels[0]}
                  onChange={(e) => onModelChange(e.target.value)}
                  title="Model for DeepEval + OpenAI calls"
                  className="sidebar-model-select w-full cursor-pointer appearance-none rounded-lg border border-zinc-600/90 bg-zinc-800/90 py-2 pl-3 pr-9 text-xs font-medium text-zinc-100 shadow-sm transition-[border-color,box-shadow] hover:border-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/35"
                >
                  {savedModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 group-hover:text-zinc-300"
                  aria-hidden
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="mb-0.5 shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/80 p-2 text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[10px] text-zinc-600">v0.3.0</span>
          <div className="flex items-center rounded-lg bg-zinc-800 p-0.5">
            {themeOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key)}
                title={opt.title}
                className={`rounded-md p-1.5 transition-all ${
                  mode === opt.key
                    ? 'bg-indigo-500/20 text-indigo-500 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <opt.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
