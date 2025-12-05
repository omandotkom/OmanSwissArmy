import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4 font-sans text-zinc-100">
      <main className="flex w-full max-w-md flex-col gap-6">
        <h1 className="text-center text-3xl font-light tracking-wide text-zinc-200 mb-8">
          Oman Swiss Army Tool
        </h1>

        <Link href="/json-formatter" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            JSON Formatter
          </button>
        </Link>

        <Link href="/sql-formatter" className="block w-full">
          <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
            SQL Formatter
          </button>
        </Link>

        <button className="group w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-lg font-medium text-zinc-300 shadow-sm transition-all duration-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 hover:shadow-md active:scale-[0.98]">
          API Test
        </button>
      </main>
    </div>
  );
}
