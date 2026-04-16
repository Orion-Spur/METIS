import { NextResponse } from "next/server";
import { getSessionCookieName, getSessionTtlSeconds, signSession, verifyCredentials } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password || !verifyCredentials(username, password)) {
    return NextResponse.redirect(new URL("/?error=invalid_credentials", request.url));
  }

  const sessionToken = await signSession(username);
  const response = NextResponse.redirect(new URL("/council", request.url));

  response.cookies.set({
    name: getSessionCookieName(),
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: getSessionTtlSeconds(),
  });

  return response;
}
