import { useId, type ReactNode } from 'react';

export function Field({
  label, hint, error, counter, children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null | undefined;
  counter?: { value: number; max: number };
  children: (props: { id: string; 'aria-describedby': string; 'aria-invalid': boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = `${id}-desc`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {counter && (
          <span className={`text-xs ${counter.value > counter.max ? 'text-danger' : 'text-muted'}`}>
            {counter.value}/{counter.max}
          </span>
        )}
      </div>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': !!error })}
      <div id={describedBy} className="text-xs">
        {error ? <p className="text-danger">{error}</p> : hint && <p className="text-muted">{hint}</p>}
      </div>
    </div>
  );
}
