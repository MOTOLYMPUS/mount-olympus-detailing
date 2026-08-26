export default function ProgressIndicator({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <div
              className={`h-[3px] w-full rounded-full transition-colors duration-300 ${
                done || active ? 'bg-apex' : 'bg-white/20'
              }`}
            />
            {/* The label is hidden below `sm` for space, so the step count in
                the modal body is what mobile users rely on — that text is
                always rendered, never hidden. */}
            <span
              aria-current={active ? 'step' : undefined}
              className={`hidden font-mono text-[10px] uppercase tracking-widest2 sm:block ${
                active ? 'text-white' : done ? 'text-muted' : 'text-subtle'
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
