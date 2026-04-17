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
    <main className="relative flex min-h-screen overflow-hidden bg-[#020202] text-[#f7e9ca]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(214,162,79,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(214,162,79,0.08),transparent_22%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.68),rgba(0,0,0,0.94))]" />

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid w-full items-stretch gap-4 lg:grid-cols-[1.2fr_0.9fr] lg:gap-6">
          <article className="relative flex min-h-[calc(100vh-2rem)] flex-col justify-between overflow-hidden rounded-[2rem] border border-[rgba(214,162,79,0.18)] bg-[rgba(10,8,6,0.68)] p-5 shadow-[0_0_80px_rgba(214,162,79,0.12)] sm:p-6 lg:min-h-[calc(100vh-3rem)] lg:p-8">
            <div className="absolute inset-0 opacity-30">
              <Image
                src={heroImageUrl}
                alt="METIS chamber artwork"
                fill
                priority
                className="object-cover object-center"
              />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.2),rgba(0,0,0,0.82)_55%,rgba(0,0,0,0.95))]" />

            <div className="relative flex h-full flex-col justify-between gap-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.5em] text-[rgba(214,162,79,0.82)]">
                  METIS Council
                </p>
                <h1 className="mt-4 max-w-3xl font-serif text-[2rem] leading-[1.02] text-[#f8ebc9] sm:text-[2.75rem] lg:text-[4rem]">
                  Intelligence. Strategy. Execution.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[rgba(243,231,192,0.82)] lg:text-lg">
                  A chaired council for high-stakes decisions. Orion briefs the room, Metis runs the
                  session, specialists challenge one another in sequence, and the full transcript is
                  captured as a live operating record.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.4rem] border border-[rgba(214,162,79,0.16)] bg-[rgba(0,0,0,0.46)] p-4 backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-[rgba(214,162,79,0.78)]">
                    Live session
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[rgba(243,231,192,0.76)]">
                    Watch each contribution arrive in sequence rather than waiting for a single final block.
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-[rgba(214,162,79,0.16)] bg-[rgba(0,0,0,0.46)] p-4 backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-[rgba(214,162,79,0.78)]">
                    Orion control
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[rgba(243,231,192,0.76)]">
                    Redirect the room mid-discussion, pressure-test a line of reasoning, or stop the run.
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-[rgba(214,162,79,0.16)] bg-[rgba(0,0,0,0.46)] p-4 backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-[rgba(214,162,79,0.78)]">
                    Session record
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[rgba(243,231,192,0.76)]">
                    Decisions, tensions, and synthesis remain available as a durable transcript.
                  </p>
                </div>
              </div>
            </div>
          </article>

          <aside className="flex min-h-[calc(100vh-2rem)] flex-col justify-center rounded-[2rem] border border-[rgba(214,162,79,0.3)] bg-[rgba(5,5,5,0.92)] p-5 shadow-[0_0_60px_rgba(214,162,79,0.12)] backdrop-blur-xl sm:p-6 lg:min-h-[calc(100vh-3rem)] lg:p-8">
            <div className="mb-6 flex items-center justify-between text-[11px] uppercase tracking-[0.36em] text-[rgba(243,231,192,0.82)]">
              <span>Council Access</span>
              <span className="text-[rgba(214,162,79,0.82)]">Secure Session</span>
            </div>

            <div className="mb-6 space-y-3">
              <h2 className="font-serif text-[1.9rem] leading-tight text-[#f8ebc9] sm:text-[2.2rem]">
                Enter the chamber.
              </h2>
              <p className="text-base leading-7 text-[rgba(243,231,192,0.72)]">
                Sign in to brief the council, run the debate, and review the live transcript.
              </p>
            </div>

            <form action="/api/auth/login" method="post" className="space-y-4">
              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-medium uppercase tracking-[0.22em] text-[rgba(214,162,79,0.8)]"
                >
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="User"
                  required
                  className="h-14 w-full rounded-[1rem] border border-[rgba(214,162,79,0.34)] bg-black/55 px-4 text-base text-[#f7e9ca] placeholder:text-[rgba(214,162,79,0.56)] outline-none transition focus:border-[rgba(214,162,79,0.72)] focus:ring-2 focus:ring-[rgba(214,162,79,0.28)]"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium uppercase tracking-[0.22em] text-[rgba(214,162,79,0.8)]"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  required
                  className="h-14 w-full rounded-[1rem] border border-[rgba(214,162,79,0.34)] bg-black/55 px-4 text-base text-[#f7e9ca] placeholder:text-[rgba(214,162,79,0.56)] outline-none transition focus:border-[rgba(214,162,79,0.72)] focus:ring-2 focus:ring-[rgba(214,162,79,0.28)]"
                />
              </div>

              <button
                type="submit"
                className="h-14 w-full rounded-[1rem] bg-[#d6a24f] text-base font-semibold uppercase tracking-[0.24em] text-[#120c05] transition hover:bg-[#e0b163] focus:outline-none focus:ring-2 focus:ring-[#f2c46e] focus:ring-offset-2 focus:ring-offset-black"
              >
                Enter METIS
              </button>

              {invalidCredentials ? (
                <p className="rounded-[1rem] border border-rose-400/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">
                  The supplied credentials were not accepted.
                </p>
              ) : null}

              {authNotConfigured ? (
                <p className="rounded-[1rem] border border-amber-300/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
                  Authentication is not configured yet. Set <span className="font-semibold text-[#f7e9ca]">JWT_SECRET</span>{" "}
                  in the deployment environment and try again.
                </p>
              ) : null}
            </form>
          </aside>
        </div>
      </section>
    </main>
  );
}
