export function Placeholder({ title, prdSection }: { title: string; prdSection: string }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-2 px-4 py-16">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm opacity-70">Belum diimplementasikan. Spesifikasi: docs/PRD_MomenKita.md {prdSection}.</p>
    </main>
  );
}
