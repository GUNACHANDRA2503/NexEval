import type { ChunkRelevancy } from '../types';
import { scoreBg } from '../lib/utils';

export default function ChunkCard({
  chunk,
  selected,
  onClick,
}: {
  chunk: ChunkRelevancy;
  selected: boolean;
  onClick: () => void;
}) {
  const pct = Math.round(chunk.relevancy_score * 100);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'bg-indigo-500/10 border-indigo-500/40'
          : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-800/80'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-indigo-300">#{chunk.chunk_index}</span>
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${scoreBg(chunk.relevancy_score)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-mono text-zinc-400">{pct}%</span>
        </div>
      </div>
      <p className="text-xs font-medium text-zinc-300 truncate">{chunk.ins_id}</p>
      <p className="text-xs text-zinc-500 truncate mt-0.5">{chunk.document_title}</p>
    </button>
  );
}
