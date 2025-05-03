import { NextRequest, NextResponse } from 'next/server';

// Simple route handler for testing in Next.js 15
export async function GET(request: NextRequest) {
  return NextResponse.json({ success: true, message: 'Test route working' });
}