import { NextResponse } from "next/server";

import { getClientIp, rateLimit } from "@/lib/rateLimit";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const getExpectedOrigin = (request: Request) => {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (!host) {
    return requestUrl.origin;
  }
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
};

const hasTrustedOrigin = (request: Request) => {
  const expectedOrigin = getExpectedOrigin(request);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  const matches = (value: string) => {
    try {
      return new URL(value).origin === expectedOrigin;
    } catch {
      return false;
    }
  };

  if (origin) {
    return matches(origin);
  }
  if (referer) {
    return matches(referer);
  }
  // Browsers always send Origin (or at least Referer) on cross-origin and
  // same-origin mutating requests. A request with neither header is not a
  // normal browser request, so it isn't trusted.
  return false;
};

export function proxy(request: Request) {
  const ip = getClientIp(request);
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/");
  const isAuth = url.pathname.startsWith("/api/auth/");
  const isTwoFactor = url.pathname.startsWith("/api/2fa/");
  const isAlerts = url.pathname.startsWith("/api/alerts/");
  const isMutation = MUTATING_METHODS.has(request.method);

  if (isApi && isMutation && !hasTrustedOrigin(request)) {
    return NextResponse.json(
      { status: "error", message: "Cross-site request blocked." },
      { status: 403 }
    );
  }

  if (isAuth || isTwoFactor) {
    const key = `auth:${ip}`;
    const limit = rateLimit(key, 60, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { status: "error", message: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfterSec),
          },
        }
      );
    }
  }

  if (isAlerts && isMutation) {
    const key = `alerts:${ip}`;
    const limit = rateLimit(key, 20, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { status: "error", message: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfterSec),
          },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
