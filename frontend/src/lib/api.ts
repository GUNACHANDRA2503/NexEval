import type {
  AnalyticsOverview,
  BatchEvalResponse,
  BugCreate,
  BugReport,
  BugUpdate,
  ChunkAnalysisResponse,
  EvalJobStatus,
  EvaluationHistoryItem,
  EvaluationResult,
  RephraseResponse,
  RetrievedChunk,
  RootCauseCount,
  TestSuite,
  TestSuiteRun,
  TrendPoint,
} from '../types';

import { formatHttpError } from './apiErrors';

const rawApiBase = import.meta.env.VITE_API_BASE?.trim();
const BASE =
  rawApiBase && rawApiBase.length > 0 ? rawApiBase.replace(/\/$/, '') : '/api';
export const AUTH_TOKEN_KEY = 'nexeval_token';

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem(AUTH_TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const isAuthRoute = url.startsWith('/auth/login') || url.startsWith('/auth/register');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (!isAuthRoute) {
    Object.assign(headers, authHeaders());
  }
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers,
  });
  if (res.status === 401 && !isAuthRoute) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
      window.location.href = '/login';
    }
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(formatHttpError(res.status, body));
  }
  return res.json();
}

export interface UserMe {
  id: string;
  email: string;
  preferred_model: string | null;
  saved_models: string[];
  freya_enabled: boolean;
}

export interface OpenAIKeyStatus {
  configured: boolean;
  key_last_four: string;
}

export interface UsageSummary {
  disclaimer?: string;
  total_estimated_cost_usd: number;
  period_estimated_cost_usd: number;
  total_tokens: number;
  recent: Array<{
    id: string;
    operation: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    estimated_cost_usd: number;
    created_at: string;
  }>;
}

export const api = {
  register: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<UserMe>('/auth/me'),

  getOpenAIKeyStatus: () => request<OpenAIKeyStatus>('/account/openai-key'),

  saveOpenAIKey: (api_key: string) =>
    request<OpenAIKeyStatus>('/account/openai-key', {
      method: 'POST',
      body: JSON.stringify({ api_key }),
    }),

  deleteOpenAIKey: () =>
    request<{ deleted: boolean }>('/account/openai-key', { method: 'DELETE' }),

  listOpenAIModels: () => request<{ models: string[] }>('/account/openai/models'),

  patchAccountSettings: (body: {
    preferred_model?: string | null;
    saved_models?: string[];
    freya_enabled?: boolean;
  }) =>
    request<UserMe>('/account/preferences', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  getAccountUsage: (days = 30) =>
    request<UsageSummary>(`/account/usage?days=${days}`),

  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>('/account/password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  createBug: (data: BugCreate) =>
    request<BugReport>('/bugs', { method: 'POST', body: JSON.stringify(data) }),

  listBugs: (status?: string) =>
    request<BugReport[]>(`/bugs${status ? `?status=${status}` : ''}`),

  getBug: (id: string) => request<BugReport>(`/bugs/${id}`),

  updateBug: (id: string, data: BugUpdate) =>
    request<BugReport>(`/bugs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateBugStatus: (id: string, status: string) =>
    request<BugReport>(`/bugs/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  deleteBug: (id: string) =>
    request<{ deleted: boolean }>(`/bugs/${id}`, { method: 'DELETE' }),

  startEvaluation: (bugId: string, opts?: { model?: string }) =>
    request<EvalJobStatus>(`/evaluate/${bugId}`, {
      method: 'POST',
      body: JSON.stringify({ model: opts?.model ?? null }),
    }),

  getEvalStatus: (bugId: string) =>
    request<EvalJobStatus>(`/evaluate/${bugId}/status`),

  getEvaluation: (bugId: string) =>
    request<EvaluationResult>(`/evaluate/${bugId}`),

  getEvaluationHistory: (bugId: string) =>
    request<EvaluationHistoryItem[]>(`/evaluate/${bugId}/history`),

  getRunningEvals: () =>
    request<EvalJobStatus[]>('/evaluate/running'),

  runBatch: (bugs: BugCreate[], model?: string | null) =>
    request<BatchEvalResponse>('/evaluate/batch', {
      method: 'POST',
      body: JSON.stringify({ bugs, model: model ?? null }),
    }),

  analyzeChunks: (question: string, chunks: RetrievedChunk[]) =>
    request<ChunkAnalysisResponse>('/chunks/analyze', {
      method: 'POST',
      body: JSON.stringify({ question, chunks }),
    }),

  rephrase: (question: string, context?: string) =>
    request<RephraseResponse>('/rephrase', {
      method: 'POST',
      body: JSON.stringify({ question, context: context || '' }),
    }),

  getRephrased: (bugId: string) =>
    request<RephraseResponse>(`/rephrase/${bugId}`),

  generateRephrased: (bugId: string) =>
    request<RephraseResponse>(`/rephrase/${bugId}`, { method: 'POST' }),

  getSettings: () => request<{ auto_evaluate: boolean }>('/settings'),

  analyticsOverview: () => request<AnalyticsOverview>('/stats/overview'),

  rootCauseDistribution: () =>
    request<RootCauseCount[]>('/stats/root-causes'),

  trends: () =>
    request<{ points: TrendPoint[] }>('/stats/trends'),

  faithfulnessTrend: (limit = 50) =>
    request<{ score: number; date: string; bug_id: string }[]>(`/stats/faithfulness-trend?limit=${limit}`),

  topInsIds: (limit = 10) =>
    request<{ ins_id: string; bug_count: number }[]>(`/stats/top-ins-ids?limit=${limit}`),

  scoresByModule: () =>
    request<Record<string, string | number>[]>('/stats/scores-by-module'),

  listTestSuites: () => request<TestSuite[]>('/test-suites'),

  getTestSuite: (id: string) => request<TestSuite>(`/test-suites/${id}`),

  createTestSuite: (data: { name: string; description?: string; bug_ids?: string[] }) =>
    request<TestSuite>('/test-suites', { method: 'POST', body: JSON.stringify(data) }),

  deleteTestSuite: (id: string) =>
    request<{ deleted: boolean }>(`/test-suites/${id}`, { method: 'DELETE' }),

  addBugsToSuite: (suiteId: string, bugIds: string[]) =>
    request<{ added: number; suite: TestSuite }>(`/test-suites/${suiteId}/bugs`, {
      method: 'POST',
      body: JSON.stringify({ bug_ids: bugIds }),
    }),

  triggerSuiteRun: (suiteId: string) =>
    request<TestSuiteRun>(`/test-suites/${suiteId}/run`, { method: 'POST' }),

  listSuiteRuns: (suiteId: string) =>
    request<TestSuiteRun[]>(`/test-suites/${suiteId}/runs`),

  getSuiteRun: (suiteId: string, runId: string) =>
    request<TestSuiteRun>(`/test-suites/${suiteId}/runs/${runId}`),
};
