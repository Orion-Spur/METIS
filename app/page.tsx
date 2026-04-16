import Image from "next/image";

const heroImageUrl =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663027693392/UBEB3LPMmJcfp2PN3Y3yS5/metis_26e2831c.webp";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const showError = params.error === "invalid_credentials";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-6 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(214,162,79,0.14),transparent_28%),linear-gradient(180deg,rgba(6,6,6,0.58),rgba(6,6,6,0.94))]" />
      <div
        className="absolute inset-0 opacity-30 blur-[2px]"
        style={{
          backgroundImage: `url(${heroImageUrl})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />

      <section className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
        <div className="relative w-full overflow-hidden rounded-[2rem] border border-[rgba(214,162,79,0.18)] bg-black/75 shadow-[0_0_80px_rgba(214,162,79,0.16)]">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,214,148,0.08),transparent_28%,rgba(0,0,0,0.16))]" />
          <Image
            src={heroImageUrl}
            alt="METIS hero artwork"
            width={900}
            height={1350}
            priority
            className="h-auto w-full object-cover"
          />
        </div>

        <form
          action="/api/auth/login"
          method="post"
          className="w-full rounded-[2rem] border border-[rgba(214,162,79,0.35)] bg-[rgba(5,5,5,0.88)] p-6 shadow-[0_0_60px_rgba(214,162,79,0.1)] backdrop-blur-xl"
        >
          <div className="mb-5 flex items-center justify-between text-[0.78rem] uppercase tracking-[0.38em] text-[rgba(243,231,192,0.84)]">
            <span>Council Access</span>
            <span className="text-[rgba(214,162,79,0.78)]">Secure Session</span>
          </div>

          <div className="space-y-4">
            <input
              name="username"
              type="text"
              autoComplete="username"
              placeholder="User"
              required
              className="h-14 w-full rounded-[1rem] border border-[rgba(214,162,79,0.42)] bg-black/55 px-5 text-center text-base tracking-[0.16em] text-[#f7e9ca] placeholder:text-[rgba(214,162,79,0.68)]"
            />
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              required
              className="h-14 w-full rounded-[1rem] border border-[rgba(214,162,79,0.42)] bg-black/55 px-5 text-center text-base tracking-[0.16em] text-[#f7e9ca] placeholder:text-[rgba(214,162,79,0.68)]"
            />
            <button
              type="submit"
              className="h-14 w-full rounded-[1rem] bg-[#d6a24f] text-base font-semibold uppercase tracking-[0.26em] text-[#120c05] transition hover:bg-[#e0b163]"
            >
              Enter
            </button>
            {showError ? (
              <p className="text-center text-sm text-rose-300">
                The supplied credentials were not accepted.
              </p>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  );
}
