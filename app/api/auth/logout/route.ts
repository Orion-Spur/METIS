import { NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/auth";
import { createPublicUrl } from "@/lib/request-origin";

export async function POST(request: Request) {
  const response = NextResponse.redirect(createPublicUrl(request, "/"));

  response.cookies.set({
    name: getSessionCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });

  return response;
}
