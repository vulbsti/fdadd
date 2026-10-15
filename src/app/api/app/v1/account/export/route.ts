import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appFailure, appJson, requireAppUser } from '@/lib/app/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingSchema } from '@/lib/payments/subscriptions';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PAGE = 1000;

/** Every row of a query, a page at a time. */
async function allRows(read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }>) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await read(from, from + PAGE - 1);
    if (page.error) throw page.error;
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < PAGE) return rows;
  }
}

async function optionalRow(client: SupabaseClient, table: string, columns: string, userId: string) {
  const result = await client.from(table).select(columns).eq('user_id', userId).maybeSingle();
  if (result.error && !isMissingSchema(result.error)) throw result.error;
  return result.data ?? null;
}

/**
 * A download of the person's own data. Everything is read with their own
 * client (row level security), except imports: those tables are server-only,
 * so their metadata is read with the admin client, filtered to this person.
 * Imported message bodies and workspace files are not included.
 */
export async function GET(request: Request) {
  const context = await requireAppUser(request);
  if (context instanceof NextResponse) return context;
  const { client, user, userId } = context;
  try {
    const admin = createAdminClient();
    const [profile, people, sessions, messages, imports, importItems, subscription, preferences, payments] = await Promise.all([
      client.from('profiles').select('display_name,avatar_url,created_at,updated_at').eq('id', userId).maybeSingle()
        .then((result) => { if (result.error) throw result.error; return result.data; }),
      allRows((from, to) => client.from('astro_profiles').select('*').eq('user_id', userId).order('created_at').range(from, to)),
      allRows((from, to) => client.from('astro_sessions').select('*').eq('user_id', userId).order('created_at').range(from, to)),
      allRows((from, to) => client.from('astro_messages').select('id,session_id,role,content,created_at')
        .eq('user_id', userId).order('created_at').order('id').range(from, to)),
      allRows((from, to) => admin.from('person_imports').select('id,profile_id,provider,status,file_name,created_at,imported_at')
        .eq('user_id', userId).order('created_at').range(from, to)),
      allRows((from, to) => admin.from('person_import_items')
        .select('id,import_id,profile_id,provider,kind,title,started_at,ended_at,message_count,status,created_at')
        .eq('user_id', userId).order('created_at').order('id').range(from, to)),
      optionalRow(client, 'subscriptions', 'plan_id,status,source,current_period_end,auto_renewing,created_at,updated_at', userId),
      optionalRow(client, 'app_preferences', 'home_layout,created_at,updated_at', userId),
      allRows((from, to) => client.from('payment_orders').select('id,plan_id,amount,currency,status,created_at,updated_at')
        .eq('user_id', userId).order('created_at').range(from, to)),
    ]);
    const exportedAt = new Date().toISOString();
    return appJson({
      exportedAt,
      account: { id: userId, email: user.email ?? null, createdAt: user.created_at, profile },
      people,
      conversations: { sessions, messages },
      imports: { imports, items: importItems },
      membership: subscription,
      appPreferences: preferences,
      payments,
    }, 200, { 'content-disposition': `attachment; filename="aidoraa-export-${exportedAt.slice(0, 10)}.json"` });
  } catch (error) {
    return appFailure('account export', error, 'Your data could not be gathered right now. Please try again.');
  }
}
