import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root redirect
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/student/login', request.url));
  }

  // Simple Redirect for root paths
  if (pathname === '/teacher') {
    const authCookie = request.cookies.get('teacher_auth');
    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.redirect(new URL('/teacher/login', request.url));
    }
  }

  if (pathname === '/student') {
    return NextResponse.redirect(new URL('/student/login', request.url));
  }

  // Protect /teacher routes (except login)
  if (pathname.startsWith('/teacher/') && !pathname.startsWith('/teacher/login')) {
    const authCookie = request.cookies.get('teacher_auth');
    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.redirect(new URL('/teacher/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/teacher/:path*', '/student'],
};
