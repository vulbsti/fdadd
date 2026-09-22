/**
 * Protected recovery sweep for question runs whose request process died after
 * committing the transactional outbox row. Configure a scheduler to call this
 * endpoint; request and EventSource paths also perform opportunistic recovery.
 */

import { NextResponse } from 'next/server';
import { sweepAstrologerDispatches } from '@/lib/astro/run-dispatch';
import { sweepPersonConsolidationOutbox } from '@/lib/person-model/consolidation-dispatch';

export const runtime = 'nodejs';
export const maxDuration = 300;

function isLoopbackDevelopment(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
    return ['localhost', '127.0.0.1', '::1'].includes(host);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const localDevelopment = isLoopbackDevelopment();
  if (!secret && !localDevelopment) {
    return NextResponse.json(
      { code: 'unconfigured', message: 'Dispatch sweeper is not configured.' },
      { status: 503 },
    );
  }
  if (!localDevelopment && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(
      { code: 'forbidden', message: 'Invalid dispatch credential.' },
      { status: 401 },
    );
  }

  const [answers, learning] = await Promise.all([
    sweepAstrologerDispatches({ max: 10 }),
    sweepPersonConsolidationOutbox({ max: 10 }),
  ]);
  return NextResponse.json({ answers, learning });
}
