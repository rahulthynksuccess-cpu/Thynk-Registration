import { NextRequest, NextResponse } from 'next/server';

// Middleware kept minimal — auth is handled client-side in admin pages
// to avoid cookie/session issues with cross-domain setup
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through everything except redirect loops
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
