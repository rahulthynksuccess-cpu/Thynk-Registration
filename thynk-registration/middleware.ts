import { NextRequest, NextResponse } from 'next/server';

// Public API routes that must be accessible from any origin (registration HTML)
const PUBLIC_API = [
  '/api/school/list',
  '/api/grades',
  '/api/school/register',
  '/api/register',
  '/api/discount',
  '/api/payment/verify',
  '/api/payment/webhook',
];

function isPublicApi(pathname: string) {
  // exact match or starts-with for dynamic segments e.g. /api/school/abc
  if (PUBLIC_API.some(p => pathname === p || pathname.startsWith(p + '/'))) return true;
  // /api/school/[code]  — any path like /api/school/<something> that isn't /list or /register
  if (/^\/api\/school\/[^/]+$/.test(pathname)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS for public API routes
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') || '*';
    const isPublic = isPublicApi(pathname);
    const allowOrigin = isPublic ? '*' : 'https://www.thynksuccess.com';

    // Respond to OPTIONS preflight immediately — before the route handler runs
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  allowOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age':       '86400',
        },
      });
    }

    // For actual requests, let the route handler run but inject CORS headers into the response
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin',  allowOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
