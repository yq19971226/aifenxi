export default function AdminLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
        <p className="text-sm text-zinc-500">加载中...</p>
      </div>
    </div>
  );
}
