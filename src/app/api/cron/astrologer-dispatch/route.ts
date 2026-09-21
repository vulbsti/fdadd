/**
 * Protected recovery sweep for question runs whose request process died after
 * committing the transactional outbox row. Configure a scheduler to call this
 * endpoint; request and EventSource paths also perform opportunistic recovery.
 */

import { NextResponse } from 'next/server';
import { sweepAstrologerDispatches } from '@/lib/astro/run-dispatch';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { code: 'unconfigured', message: 'Dispatch sweeper is not configured.' },
      { status: 503 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(
      { code: 'forbidden', message: 'Invalid dispatch credential.' },
      { status: 401 },
    );
  }

  const result = await sweepAstrologerDispatches({ max: 10 });
  return NextResponse.json(result);
}
