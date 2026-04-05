export interface ChunkContent {
  document_name: string;
  content: string[];
}

export interface ChunkMetadata {
  title: string;
  synopsis: string;
  release_date: string;
  encrypted_regulation_id: string;
  reference_insight_id: string;
  attachment_name: string;
  ref_url: string[];
  countries: string[];
  brandNames: string[];
  chunks: ChunkContent[];
}

export interface RetrievedChunk {
  id: string;
  module_name: string;
  metadata: ChunkMetadata;
}

export type BugStatus = 'open' | 'resolved' | 'invalid';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type RootCauseType =
  | 'RETRIEVAL_FAILURE'
  | 'RANKING_ISSUE'
  | 'GENERATION_FAILURE'
  | 'HALLUCINATION'
  | 'IRRELEVANT_ANSWER'
  | 'ACCEPTABLE';

export interface BugUpdate {
  user_question?: string;
  expected_answer?: string;
  actual_answer?: string;
  ins_ids?: string[];
  expected_ins_ids?: string[];
  module_name?: string;
  priority?: Priority;
  retrieved_chunks_raw?: string;
}

export interface BugCreate {
  user_question: string;
  expected_answer: string;
  actual_answer: string;
  ins_ids: string[];
  expected_ins_ids: string[];
  module_name: string;
  priority: Priority;
  retrieved_chunks: RetrievedChunk[];
  retrieved_chunks_raw: string;
}

export interface EvalUsageEstimate {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
  estimated_cost_usd: number;
}

export interface EvalJobStatus {
  bug_id: string;
  status: 'running' | 'completed' | 'failed' | 'none';
  started_at: string | null;
  finished_at: string | null;
  result: EvaluationResult | null;
  error: string | null;
  estimate?: EvalUsageEstimate | null;
  usage_actual?: EvalUsageEstimate | null;
}

export interface BugReport {
  id: string;
  user_question: string;
  expected_answer: string;
  actual_answer: string;
  ins_ids: string[];
  expected_ins_ids: string[];
  module_name: string;
  priority: Priority;
  status: BugStatus;
  retrieved_chunks: RetrievedChunk[];
  retrieved_chunks_raw: string;
  created_at: string;
  has_evaluation: boolean;
  evaluation_count: number;
  latest_evaluation: EvaluationResult | null;
}

export interface MetricScore {
  name: string;
  score: number;
  threshold: number;
  passed: boolean;
  reason: string;
}

export interface EvaluationResult {
  id?: string;
  bug_id: string;
  run_number: number;
  scores: MetricScore[];
  root_cause: RootCauseType;
  root_cause_explanation: string;
  fix_suggestions: string[];
  evaluated_at: string;
}

export interface EvaluationHistoryItem {
  id: string;
  bug_id: string;
  run_number: number;
  scores: MetricScore[];
  root_cause: RootCauseType;
  root_cause_explanation: string;
  fix_suggestions: string[];
  evaluated_at: string;
}

export interface ChunkRelevancy {
  chunk_index: number;
  ins_id: string;
  document_title: string;
  relevancy_score: number;
  content_preview: string;
}

export interface ChunkAnalysisResponse {
  question: string;
  chunk_scores: ChunkRelevancy[];
  expected_ins_ids_found: string[];
  expected_ins_ids_missing: string[];
}

export interface RephraseResponse {
  original: string;
  rephrased: string[];
}

export interface BatchItemResult {
  index: number;
  user_question: string;
  evaluation: EvaluationResult | null;
  error: string | null;
}

export interface BatchEvalResponse {
  batch_id: string;
  total: number;
  completed: number;
  failed: number;
  results: BatchItemResult[];
}

export interface AnalyticsOverview {
  total_bugs: number;
  open_bugs: number;
  resolved_bugs: number;
  invalid_bugs: number;
  avg_faithfulness: number | null;
  avg_answer_relevancy: number | null;
  avg_contextual_relevancy: number | null;
  most_common_root_cause: string | null;
}

export interface RootCauseCount {
  root_cause: string;
  count: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface TestSuiteBug {
  bug_id: string;
  user_question: string;
  status?: string;
  priority?: string;
  evaluation_count?: number;
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  bug_count: number;
  run_count: number;
  created_at: string;
  bugs: TestSuiteBug[];
  latest_run: TestSuiteRun | null;
}

export interface TestSuiteRunResult {
  bug_id: string;
  user_question?: string;
  before?: Record<string, number>;
  after?: Record<string, number>;
  before_root_cause?: string | null;
  after_root_cause?: string | null;
  error?: string;
}

export interface TestSuiteRun {
  id: string;
  suite_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total: number;
  completed: number;
  failed: number;
  improved: number;
  regressed: number;
  results: TestSuiteRunResult[];
  started_at: string;
  finished_at: string | null;
}
