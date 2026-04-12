import { NextRequest, NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age':       '86400',
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    // Handle OPTIONS preflight — return immediately with CORS headers
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    // For all other requests: pass through to the route handler,
    // and stamp CORS headers onto the response.
    // NOTE: NextResponse.next() headers set here ARE forwarded to the
    // client response in Next.js 13+ App Router when using this pattern.
    const response = NextResponse.next({
      request: { headers: request.headers },
    });

    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
