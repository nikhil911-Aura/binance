export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <div className="h-8 w-72 animate-pulse rounded bg-neutral-800" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-neutral-800/60" />
      </div>
      <div className="mb-8 h-10 w-full animate-pulse rounded bg-neutral-800" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded bg-neutral-800/70" />
        ))}
      </div>
    </main>
  );
}
