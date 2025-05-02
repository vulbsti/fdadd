import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  // In Next.js 15, params is a Promise that needs to be awaited
  { params }: { params: Promise<{ id: string }> }
) {
  // Need to await the params Promise
  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  return NextResponse.json({ 
    success: true, 
    message: `Test dynamic route working for ID: ${id}` 
  });
}