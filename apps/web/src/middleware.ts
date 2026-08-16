import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = ["/captures", "/settings", "/team", "/search", "/origins"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = protectedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const session = req.cookies.get("better-auth.session_token") || req.cookies.get("__Secure-better-auth.session_token");
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/captures/:path*", "/settings", "/team", "/search", "/origins/:path*"],
};
