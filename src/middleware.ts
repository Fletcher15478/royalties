import { NextResponse, type NextRequest } from "next/server";

const DASHBOARD_PREFIX = "/dashboard";

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith(DASHBOARD_PREFIX)) {
    return NextResponse.next();
  }

  // Lightweight cookie check (JWT is verified server-side in app routes; middleware just enforces presence).
  const token = request.cookies.get("royalties_session")?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};

