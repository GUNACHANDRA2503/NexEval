import { AlertCircle, CheckCircle2 } from 'lucide-react';

type Variant = 'error' | 'success' | 'warning';

const styles: Record<Variant, string> = {
  error: 'text-red-200 bg-red-950/55 border-red-800/50',
  success: 'text-emerald-200 bg-emerald-950/45 border-emerald-800/45',
  warning: 'text-amber-200 bg-amber-950/40 border-amber-800/45',
};

export default function InlineAlert({
  children,
  variant = 'error',
  className = '',
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  const Icon = variant === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div
      role="alert"
      className={`flex gap-2.5 text-sm rounded-xl border px-3.5 py-3 ${styles[variant]} ${className}`}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5 opacity-95" aria-hidden />
      <div className="leading-snug min-w-0">{children}</div>
    </div>
  );
}
