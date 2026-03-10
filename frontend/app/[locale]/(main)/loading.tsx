export default function MainLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-pulse text-sm font-light tracking-[0.2em] text-zinc-400 select-none">
          AXIOM
        </div>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full w-1/2 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-[var(--color-accent)]" />
        </div>
      </div>
    </div>
  );
}
