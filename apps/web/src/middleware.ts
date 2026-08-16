import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = ["/captures", "/settings", "/team", "/search", "/origins", "/extension"];

function hasSession(req: NextRequest) {
  return Boolean(
    req.cookies.get("better-auth.session_token") || req.cookies.get("__Secure-better-auth.session_token"),
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = hasSession(req);

  if (pathname === "/") {
    if (!session) return NextResponse.next();
    const next = req.nextUrl.searchParams.get("next");
    const url = req.nextUrl.clone();
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      url.pathname = next;
      url.search = "";
      return NextResponse.redirect(url);
    }
    url.pathname = "/captures";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isProtected = protectedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/captures/:path*", "/settings", "/team", "/search", "/origins/:path*", "/extension"],
};
