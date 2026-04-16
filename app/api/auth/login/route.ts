import { NextResponse } from "next/server";
import { getSessionCookieName, getSessionTtlSeconds, signSession, verifyCredentials } from "@/lib/auth";
import { createPublicUrl } from "@/lib/request-origin";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return NextResponse.redirect(createPublicUrl(request, "/?error=invalid_credentials"));
  }

  const authenticatedUser = await verifyCredentials(username, password);

  if (!authenticatedUser) {
    return NextResponse.redirect(createPublicUrl(request, "/?error=invalid_credentials"));
  }

  let sessionToken: string;

  try {
    sessionToken = await signSession(authenticatedUser);
  } catch {
    return NextResponse.redirect(createPublicUrl(request, "/?error=auth_not_configured"));
  }

  const response = NextResponse.redirect(createPublicUrl(request, "/council"));

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
