const STEPS = ['Vehicle', 'Service', 'Estimate', 'Calendar', 'Payment', 'Confirmed'];

export default function ProgressIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <div className="flex flex-col gap-2 w-full">
            <div
              className={`h-[3px] w-full rounded-full transition-colors duration-400 ${
                i <= current ? 'bg-apex' : 'bg-white/12'
              }`}
            />
            <span
              className={`hidden font-mono text-[10px] uppercase tracking-widest2 sm:block ${
                i <= current ? 'text-white/80' : 'text-white/30'
              }`}
            >
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
