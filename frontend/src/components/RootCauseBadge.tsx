import { rootCauseColor } from '../lib/utils';

const LABELS: Record<string, string> = {
  RETRIEVAL_FAILURE: 'Retrieval Failure',
  RANKING_ISSUE: 'Ranking Issue',
  GENERATION_FAILURE: 'Generation Failure',
  HALLUCINATION: 'Hallucination',
  IRRELEVANT_ANSWER: 'Irrelevant Answer',
  ACCEPTABLE: 'Acceptable',
};

export default function RootCauseBadge({ rootCause }: { rootCause: string }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${rootCauseColor(rootCause)}`}
    >
      {LABELS[rootCause] || rootCause}
    </span>
  );
}
