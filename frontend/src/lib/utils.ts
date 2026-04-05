import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function scoreColor(score: number): string {
  if (score >= 0.7) return 'text-emerald-400';
  if (score >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

export function scoreBg(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.5) return 'bg-amber-500';
  return 'bg-red-500';
}

export function rootCauseColor(rc: string): string {
  const map: Record<string, string> = {
    RETRIEVAL_FAILURE: 'bg-red-500/20 text-red-300 border-red-500/30',
    RANKING_ISSUE: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    GENERATION_FAILURE: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    HALLUCINATION: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    IRRELEVANT_ANSWER: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    ACCEPTABLE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  };
  return map[rc] || 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function priorityColor(p: string): string {
  const map: Record<string, string> = {
    low: 'bg-zinc-500/20 text-zinc-300',
    medium: 'bg-blue-500/20 text-blue-300',
    high: 'bg-orange-500/20 text-orange-300',
    critical: 'bg-red-500/20 text-red-300',
  };
  return map[p] || '';
}
