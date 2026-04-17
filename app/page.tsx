import Image from "next/image";

const heroImageUrl =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663027693392/UBEB3LPMmJcfp2PN3Y3yS5/metis_26e2831c.webp";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error;
  const invalidCredentials = errorCode === "invalid_credentials";
  const authNotConfigured = errorCode === "auth_not_configured";

  return (
    <main className="min-h-screen bg-black text-[#f3d6a0]">
      <section className="flex min-h-screen items-center justify-center px-4 py-4">
        <div className="flex w-full max-w-[360px] flex-col items-center justify-center gap-5">
          <div className="relative w-full max-w-[300px]">
            <Image
              src={heroImageUrl}
              alt="METIS login artwork"
              width={900}
              height={1536}
              priority
              className="h-auto w-full object-contain"
            />
          </div>

          <form action="/api/auth/login" method="post" className="w-full max-w-[275px] space-y-5">
            <div>
              <label htmlFor="username" className="sr-only">
                User
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="User"
                required
                className="h-[46px] w-full border border-[#d4a14b] bg-black px-4 text-center text-[16px] text-[#e2c18a] placeholder:text-[#d9b170] outline-none transition focus:border-[#f0c06a] focus:ring-2 focus:ring-[#d4a14b]/40"
              />
            </div>

            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                required
                className="h-[46px] w-full border border-[#d4a14b] bg-black px-4 text-center text-[16px] text-[#e2c18a] placeholder:text-[#d9b170] outline-none transition focus:border-[#f0c06a] focus:ring-2 focus:ring-[#d4a14b]/40"
              />
            </div>

            <button
              type="submit"
              className="h-[46px] w-full bg-[#d4a14b] text-[16px] font-semibold uppercase tracking-[0.08em] text-black transition hover:bg-[#ddb060] focus:outline-none focus:ring-2 focus:ring-[#f0c06a] focus:ring-offset-2 focus:ring-offset-black"
            >
              Enter
            </button>

            {invalidCredentials ? (
              <p className="border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-center text-sm text-rose-200">
                The supplied credentials were not accepted.
              </p>
            ) : null}

            {authNotConfigured ? (
              <p className="border border-amber-400/40 bg-amber-950/30 px-3 py-2 text-center text-sm text-amber-100">
                Authentication is not configured yet.
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </main>
  );
}
