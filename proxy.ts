import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "metis_session";

async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !process.env.JWT_SECRET) {
    return false;
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const session = await hasValidSession(request);
  const isProtectedPath =
    request.nextUrl.pathname.startsWith("/council") ||
    request.nextUrl.pathname.startsWith("/api/council");

  if (!isProtectedPath || session) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/council/:path*", "/api/council/:path*"],
};
