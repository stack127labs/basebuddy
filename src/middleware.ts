import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getDemoDomainRedirect } from "@/lib/domain-migration";
import { buildContentSecurityPolicy } from "@/lib/security/headers";
import { getRobotsTagHeaderValue } from "@/lib/site-indexing";

export async function middleware(request: NextRequest) {
  const redirectUrl = getDemoDomainRedirect(
    new URL(request.nextUrl.toString()),
    request.headers?.get?.("host") ?? null,
  );

  if (redirectUrl) {
    return NextResponse.redirect(redirectUrl, 308);
  }

  const nonce = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  const contentSecurityPolicy = buildContentSecurityPolicy({
    isProduction: process.env.NODE_ENV === "production",
    scriptNonce: nonce,
    supabaseUrl: null,
  });

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  // Set per request (not in next.config headers) so runtime env controls page indexing.
  const robotsTag = getRobotsTagHeaderValue();
  if (robotsTag) {
    response.headers.set("X-Robots-Tag", robotsTag);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on page routes only (not API routes or static assets).
    // API routes handle their own auth; adding middleware there doubles auth calls.
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
