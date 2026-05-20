export default function ArticleLoading() {
  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#efefec] px-5 py-10 text-[#1c1917]">
      <div className="mx-auto max-w-[920px] animate-pulse">
        <div className="mb-8 h-10 w-32 rounded-lg bg-[#d6d3d1]" />
        <div className="mb-5 h-5 w-40 rounded bg-[#d6d3d1]" />
        <div className="mb-4 h-12 w-full max-w-[780px] rounded bg-[#d6d3d1]" />
        <div className="mb-10 h-12 w-2/3 rounded bg-[#d6d3d1]" />
        <div className="mb-10 h-[320px] rounded-2xl bg-[#d6d3d1]" />
        <div className="space-y-4">
          <div className="h-5 rounded bg-[#d6d3d1]" />
          <div className="h-5 rounded bg-[#d6d3d1]" />
          <div className="h-5 w-4/5 rounded bg-[#d6d3d1]" />
        </div>
      </div>
    </main>
  );
}
