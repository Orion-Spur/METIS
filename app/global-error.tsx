"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#060606] px-6 text-[#f3e7c0]">
        <main className="w-full max-w-xl rounded-[2rem] border border-[rgba(214,162,79,0.25)] bg-[rgba(10,8,6,0.9)] p-8 shadow-[0_0_60px_rgba(214,162,79,0.14)]">
          <p className="text-xs uppercase tracking-[0.45em] text-[rgba(214,162,79,0.78)]">METIS system notice</p>
          <h1 className="mt-4 font-serif text-4xl text-[#f7e8bf]">A council error occurred.</h1>
          <p className="mt-4 text-sm leading-7 text-[rgba(243,231,192,0.74)]">
            {error.message || "The session encountered an unexpected error."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 rounded-full bg-[#d6a24f] px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#140d05] transition hover:bg-[#e0b163]"
          >
            Retry
          </button>
        </main>
      </body>
    </html>
  );
}
