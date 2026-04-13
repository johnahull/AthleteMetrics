import { useUnitSystem } from '@/contexts/UnitSystemContext';
import { cn } from '@/lib/utils';

export function UnitSystemToggle() {
  const { system, setSystem } = useUnitSystem();

  return (
    <div className="inline-flex items-center rounded-lg border bg-muted p-0.5 text-sm">
      <button
        className={cn(
          'rounded-md px-3 py-1 transition-colors',
          system === 'metric'
            ? 'bg-background text-foreground shadow-sm font-medium'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => setSystem('metric')}
      >
        Metric
      </button>
      <button
        className={cn(
          'rounded-md px-3 py-1 transition-colors',
          system === 'imperial'
            ? 'bg-background text-foreground shadow-sm font-medium'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => setSystem('imperial')}
      >
        Imperial
      </button>
    </div>
  );
}
