import { useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  Trash2,
  Loader2,
  AlertTriangle,
  Cpu,
  Sparkles,
  Plus,
  Save,
  ChevronDown,
  User,
  BarChart3,
} from 'lucide-react';
import { api, type OpenAIKeyStatus, type UsageSummary } from '../lib/api';
import { getUserFacingError } from '../lib/apiErrors';
import { useAuth } from '../contexts/AuthContext';
import InlineAlert from '../components/InlineAlert';

function draftKey(models: string[]) {
  return models.join('\u0001');
}

const sectionCard =
  'rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4 shadow-sm shadow-black/20';

export default function Account() {
  const { user, freyaEnabled, setFreyaEnabled, patchUserSettings } = useAuth();
  const [keyStatus, setKeyStatus] = useState<OpenAIKeyStatus | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [newKey, setNewKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [freyaBusy, setFreyaBusy] = useState(false);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalogModels, setCatalogModels] = useState<string[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [customId, setCustomId] = useState('');
  const [draftModels, setDraftModels] = useState<string[]>([]);
  const [defaultPick, setDefaultPick] = useState('');

  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);

  const savedKey = draftKey(user?.saved_models ?? []);
  const serverPreferred = useMemo(() => {
    const sm = user?.saved_models ?? [];
    if (!sm.length) return '';
    const p = user?.preferred_model?.trim();
    if (p && sm.includes(p)) return p;
    return sm[0];
  }, [user?.saved_models, user?.preferred_model]);

  const listDirty = draftKey(draftModels) !== savedKey;
  const defaultDirty = draftModels.length > 0 && defaultPick !== serverPreferred;
  const modelsFormDirty = listDirty || defaultDirty;

  useEffect(() => {
    if (!user) return;
    setDraftModels([...user.saved_models]);
  }, [user?.id, savedKey]);

  useEffect(() => {
    if (!draftModels.length) {
      setDefaultPick('');
      return;
    }
    setDefaultPick((prev) => (prev && draftModels.includes(prev) ? prev : draftModels[0]));
  }, [draftModels]);

  async function load() {
    setLoading(true);
    try {
      const [ks, u] = await Promise.all([api.getOpenAIKeyStatus(), api.getAccountUsage(30)]);
      setKeyStatus(ks);
      setUsage(u);
    } catch (e: unknown) {
      setError(getUserFacingError(e, 'Could not load account data.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!keyStatus?.configured) {
      setCatalogModels([]);
      setCatalogError('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { models } = await api.listOpenAIModels();
        if (!cancelled) {
          setCatalogModels(models);
          setCatalogError('');
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setCatalogModels([]);
          setCatalogError(e instanceof Error ? e.message : 'Could not load model list');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [keyStatus?.configured, user?.id]);

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const ks = await api.saveOpenAIKey(newKey);
      setKeyStatus(ks);
      setNewKey('');
    } catch (e: unknown) {
      setError(getUserFacingError(e, 'Could not save your API key.'));
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    if (!confirm('Remove stored API key?')) return;
    setSaving(true);
    try {
      await api.deleteOpenAIKey();
      setKeyStatus({ configured: false, key_last_four: '' });
    } catch (e: unknown) {
      setError(getUserFacingError(e, 'Could not remove the API key.'));
    } finally {
      setSaving(false);
    }
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwdErr('');
    setPwdMsg('');
    if (pwdNew !== pwdConfirm) {
      setPwdErr('New password and confirmation do not match.');
      return;
    }
    setPwdBusy(true);
    try {
      await api.changePassword(pwdCurrent, pwdNew);
      setPwdMsg('Password updated.');
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
      setShowChangePassword(false);
    } catch (err: unknown) {
      setPwdErr(getUserFacingError(err, 'Could not update your password.'));
    } finally {
      setPwdBusy(false);
    }
  }

  function toggleCatalogModel(id: string) {
    setDraftModels((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  function addCustomModel() {
    const s = customId.trim();
    if (!s || draftModels.includes(s)) return;
    setDraftModels((d) => [...d, s]);
    setCustomId('');
  }

  function removeDraft(id: string) {
    setDraftModels((d) => d.filter((x) => x !== id));
  }

  async function saveModelList() {
    if (!modelsFormDirty) return;
    setModelsBusy(true);
    setError('');
    try {
      const body: {
        saved_models?: string[];
        preferred_model?: string | null;
      } = {};
      if (listDirty) body.saved_models = draftModels;
      if (listDirty || defaultDirty) body.preferred_model = defaultPick || null;
      await patchUserSettings(body);
    } catch (e: unknown) {
      setError(getUserFacingError(e, 'Could not save your model list.'));
    } finally {
      setModelsBusy(false);
    }
  }

  async function onFreyaToggle() {
    setFreyaBusy(true);
    try {
      await setFreyaEnabled(!freyaEnabled);
    } finally {
      setFreyaBusy(false);
    }
  }

  const catalogSorted = useMemo(() => [...catalogModels].sort((a, b) => a.localeCompare(b)), [catalogModels]);

  const inputCls =
    'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading…
      </div>
    );
  }

  function cancelPasswordForm() {
    setShowChangePassword(false);
    setPwdCurrent('');
    setPwdNew('');
    setPwdConfirm('');
    setPwdErr('');
    setPwdMsg('');
  }

  return (
    <div className="w-full space-y-8">
      <header className="space-y-1 max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <KeyRound className="w-7 h-7 text-indigo-400" />
          Account
        </h1>
        <p className="text-sm text-zinc-500">
          Profile, OpenAI key, Freya (left); models and usage (right) — two columns on large screens, one column on mobile.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-8 min-w-0">
      {/* 1. Profile & security */}
      <section className={sectionCard} aria-labelledby="account-profile-heading">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 -mt-1">
          <User className="w-5 h-5 text-indigo-400 shrink-0" />
          <h2 id="account-profile-heading" className="text-sm font-semibold text-zinc-200">
            Profile & security
          </h2>
        </div>
        <p className="text-xs text-zinc-500 -mt-1">
          Sign-in email is fixed. Use at least 8 characters for a new password.
        </p>
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/30 px-4 py-3">
          <p className="text-xs font-medium text-zinc-500 mb-1">Email</p>
          <p className="text-sm font-mono text-zinc-100 break-all">{user?.email ?? '—'}</p>
        </div>

        {!showChangePassword ? (
          <div className="space-y-3 pt-1">
            {pwdMsg ? <InlineAlert variant="success">{pwdMsg}</InlineAlert> : null}
            <button
              type="button"
              onClick={() => {
                setPwdErr('');
                setPwdMsg('');
                setShowChangePassword(true);
              }}
              className="text-sm font-medium text-indigo-400 hover:text-indigo-300 border border-indigo-500/40 rounded-lg px-4 py-2.5 hover:bg-indigo-500/10 transition-colors w-full sm:w-auto text-left sm:text-center"
            >
              Change password
            </button>
          </div>
        ) : (
          <form onSubmit={onPasswordSubmit} className="space-y-3 pt-2 border-t border-zinc-800/80">
            <p className="text-xs font-semibold text-zinc-400">Set a new password</p>
            <input
              type="password"
              autoComplete="current-password"
              className={inputCls}
              placeholder="Current password"
              value={pwdCurrent}
              onChange={(e) => setPwdCurrent(e.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              placeholder="New password (at least 8 characters)"
              value={pwdNew}
              onChange={(e) => setPwdNew(e.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              placeholder="Confirm new password"
              value={pwdConfirm}
              onChange={(e) => setPwdConfirm(e.target.value)}
            />
            {pwdErr ? <InlineAlert variant="error">{pwdErr}</InlineAlert> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pwdBusy || !pwdCurrent || !pwdNew || !pwdConfirm}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-40"
              >
                {pwdBusy ? 'Updating…' : 'Update password'}
              </button>
              <button
                type="button"
                onClick={cancelPasswordForm}
                className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-300 text-sm font-medium hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 2. OpenAI connection */}
      <section className={sectionCard} aria-labelledby="account-openai-heading">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 -mt-1">
          <KeyRound className="w-5 h-5 text-amber-500/90 shrink-0" />
          <h2 id="account-openai-heading" className="text-sm font-semibold text-zinc-200">
            OpenAI connection
          </h2>
        </div>
        <p className="text-xs text-zinc-500 -mt-1 leading-relaxed">
          Your key is encrypted on the server and used only for your requests. Listing models and running evals require
          a key here — there is no shared server API key.
        </p>
        {keyStatus?.configured ? (
          <p className="text-sm text-zinc-400">
            Key saved (ends with <span className="font-mono text-zinc-200">{keyStatus.key_last_four}</span>)
          </p>
        ) : (
          <p className="text-sm text-amber-400/90 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            No key saved yet. Add your OpenAI API key below to list models and run evaluations.
          </p>
        )}

        {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}

        <form onSubmit={saveKey} className="space-y-3">
          <input
            type="password"
            autoComplete="off"
            className={inputCls}
            placeholder="sk-… paste API key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving || !newKey.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save key'}
            </button>
            {keyStatus?.configured ? (
              <button
                type="button"
                onClick={removeKey}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-red-900/50 text-red-400 hover:bg-red-950/30 text-sm flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove key
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {/* 4. Freya */}
      <section className={sectionCard} aria-labelledby="account-freya-heading">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="account-freya-heading" className="text-sm font-semibold text-zinc-200">
                Freya
              </h2>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                When on, New Bug and bug detail show INS and module-style fields. Stored on your account.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={freyaEnabled}
            disabled={freyaBusy}
            onClick={onFreyaToggle}
            className={`relative h-8 w-[3.25rem] shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:opacity-50 ${
              freyaEnabled ? 'bg-indigo-600' : 'bg-zinc-600'
            }`}
          >
            <span
              className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                freyaEnabled ? 'translate-x-[1.35rem]' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>
        </div>

        <div className="space-y-8 min-w-0">
      {/* 3. Models → sidebar dropdown */}
      <section className={sectionCard} aria-labelledby="account-models-heading">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 -mt-1">
          <Cpu className="w-5 h-5 text-indigo-400 shrink-0" />
          <h2 id="account-models-heading" className="text-sm font-semibold text-zinc-200">
            Models for sidebar & evals
          </h2>
        </div>
        <p className="text-xs text-zinc-500 -mt-1 leading-relaxed">
          Only the model IDs you enable here appear in the sidebar &quot;Active model&quot; dropdown and are available
          for evaluations. Load the catalog from your key, add custom IDs if needed, then save.
        </p>

        {draftModels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {draftModels.map((m) => (
              <span
                key={m}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800/80 px-2.5 py-1 text-xs font-mono text-zinc-200"
              >
                {m}
                <button
                  type="button"
                  onClick={() => removeDraft(m)}
                  className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
                  aria-label={`Remove ${m}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No models selected — pick from the catalog or add a custom ID.</p>
        )}

        {draftModels.length > 0 ? (
          <div className="space-y-1.5">
            <label htmlFor="default-model" className="text-xs font-medium text-zinc-400">
              Default (sidebar &quot;Active model&quot; and evals)
            </label>
            <div className="relative group w-full max-w-full">
              <select
                id="default-model"
                value={defaultPick}
                onChange={(e) => setDefaultPick(e.target.value)}
                className="account-model-select w-full cursor-pointer rounded-lg border border-zinc-600 bg-zinc-800/90 py-2.5 pl-3 pr-9 text-sm text-zinc-100 shadow-sm transition-[border-color,box-shadow] hover:border-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/35"
              >
                {draftModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 group-hover:text-zinc-300"
                aria-hidden
              />
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">From your OpenAI account</p>
          {!keyStatus?.configured ? (
            <p className="text-xs text-zinc-500">Save an API key under OpenAI connection to load the catalog.</p>
          ) : catalogError ? (
            <p className="text-xs text-amber-400/90">{catalogError}</p>
          ) : catalogSorted.length === 0 ? (
            <p className="text-xs text-zinc-500">No chat models returned yet.</p>
          ) : (
            <div className="max-h-44 overflow-y-auto scrollbar-thin rounded-lg border border-zinc-700/80 bg-zinc-950/40 p-2 space-y-1">
              {catalogSorted.map((id) => {
                const on = draftModels.includes(id);
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-mono transition-colors ${
                      on ? 'bg-indigo-500/15 text-indigo-200' : 'text-zinc-400 hover:bg-zinc-800/80'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleCatalogModel(id)}
                      className="rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500/30"
                    />
                    {id}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="custom-model" className="text-xs font-medium text-zinc-400">
              Custom model ID
            </label>
            <input
              id="custom-model"
              className={inputCls}
              placeholder="e.g. gpt-4o-mini"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomModel())}
            />
          </div>
          <button
            type="button"
            onClick={addCustomModel}
            disabled={!customId.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-700 disabled:opacity-40 sm:shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        <button
          type="button"
          onClick={saveModelList}
          disabled={modelsBusy || !modelsFormDirty}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {modelsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save model list
        </button>
      </section>

      {/* 5. Usage */}
      <section className={sectionCard} aria-labelledby="account-usage-heading">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 -mt-1">
          <BarChart3 className="w-5 h-5 text-indigo-400 shrink-0" />
          <h2 id="account-usage-heading" className="text-sm font-semibold text-zinc-200">
            Estimated usage (30 days)
          </h2>
        </div>
        {usage?.disclaimer ? <p className="text-xs text-zinc-500">{usage.disclaimer}</p> : null}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-zinc-500 text-xs">Period cost (est.)</p>
            <p className="text-lg font-mono text-zinc-100">${usage?.period_estimated_cost_usd.toFixed(4) ?? '0'}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs">All-time cost (est.)</p>
            <p className="text-lg font-mono text-zinc-100">${usage?.total_estimated_cost_usd.toFixed(4) ?? '0'}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs">Total tokens (est.)</p>
            <p className="text-lg font-mono text-zinc-100">{usage?.total_tokens?.toLocaleString() ?? '0'}</p>
          </div>
        </div>
        {usage && usage.recent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-2">When</th>
                  <th className="py-2 pr-2">Op</th>
                  <th className="py-2 pr-2">Model</th>
                  <th className="py-2 pr-2">Tokens</th>
                  <th className="py-2">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.recent.slice(0, 25).map((r) => (
                  <tr key={r.id} className="border-b border-zinc-800/80 text-zinc-300">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-1.5 pr-2">{r.operation}</td>
                    <td className="py-1.5 pr-2 font-mono truncate max-w-[120px]">{r.model}</td>
                    <td className="py-1.5 pr-2">{r.prompt_tokens + r.completion_tokens}</td>
                    <td className="py-1.5">${r.estimated_cost_usd.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No usage recorded yet.</p>
        )}
      </section>
        </div>
      </div>
    </div>
  );
}
