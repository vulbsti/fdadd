import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { lookup as systemLookup } from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !secret || !publishable) {
    throw new Error('P2 visual proof requires an explicit disposable Supabase target.');
  }
  const host = new URL(url).hostname;
  const isLocal = ['localhost', '127.0.0.1'].includes(host);
  const expectedStagingRef = process.env.P2_STAGING_SUPABASE_REF;
  const isGuardedStaging = process.env.P2_STAGING_E2E === '1'
    && Boolean(expectedStagingRef)
    && expectedStagingRef === 'wtloawiwntyjiidjbmuk'
    && host === `${expectedStagingRef}.supabase.co`;
  if (!isLocal && !isGuardedStaging) {
    throw new Error('P2 visual proof refuses an unexpected or production Supabase target.');
  }
  const stagingIp = process.env.P2_STAGING_SUPABASE_IP;
  if (isGuardedStaging) {
    if (!stagingIp || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(stagingIp)) {
      throw new Error('P2 staging visual proof requires an explicit staging DNS override.');
    }
    setGlobalDispatcher(new Agent({
      connect: {
        lookup(hostname, options, callback) {
          if (hostname === host) {
            callback(null, [{ address: stagingIp, family: 4 }]);
            return;
          }
          systemLookup(hostname, options, callback);
        },
      },
    }));
  }
  return { url, secret, publishable };
}

test('revision-backed life map, pattern, chapter, and guided chat match the approved composition', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const { url, secret, publishable } = config();
  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `p2-visual-${crypto.randomUUID()}@example.invalid`;
  const password = `P2-${crypto.randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('user creation failed');
  const userId = created.data.user.id;
  try {
    const userClient = createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } });
    const signed = await userClient.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    const commandId = crypto.randomUUID();
    const createdPerson = await userClient.rpc('person_create', { p_name: 'River', p_command_id: commandId });
    if (createdPerson.error) throw createdPerson.error;
    const personId = createdPerson.data.profileId as string;
    const sessionCreated = await userClient.rpc('create_astro_session', { p_profile_id: personId });
    if (sessionCreated.error) throw sessionCreated.error;
    const sessionId = sessionCreated.data.sessionId as string;
    const message = await admin.from('astro_messages').insert({ user_id: userId, session_id: sessionId, role: 'user', content: 'A formative question changed, and I am still working out what it means now.', client_message_id: crypto.randomUUID() }).select('id').single();
    if (message.error) throw message.error;
    const jobs = await admin.from('person_jobs').select('id').eq('profile_id', personId).eq('job_kind', 'source_consolidation').order('created_at', { ascending: false }).limit(1).single();
    if (jobs.error) throw jobs.error;
    const source = await admin.from('person_source_items').select('id').eq('profile_id', personId).eq('source_message_id', message.data.id).single();
    if (source.error) throw source.error;
    const claim = await admin.rpc('person_claim_job', { p_job_id: jobs.data.id, p_lease_seconds: 300 });
    if (claim.error) throw claim.error;

    const ids = {
      episode: crypto.randomUUID(), meaning: crypto.randomUUID(), chapter: crypto.randomUUID(),
      pattern: crypto.randomUUID(), current: crypto.randomUUID(), scenario: crypto.randomUUID(), influence: crypto.randomUUID(), gap: crypto.randomUUID(),
    };
    const payloads: Array<[string, string, Record<string, unknown>]> = [
      [ids.episode, 'episode', { kind: 'episode', title: 'A question became a direction', event: 'A formative question became important.', reportedExperience: 'It gave the work a direction.', occurred: { precision: 'age', start: null, end: null, age: 15, note: null } }],
      [ids.meaning, 'meaning_change', { kind: 'meaning_change', title: 'The goal changed meaning', priorMeaning: 'Find one answer.', challengingExperience: 'Later questions changed the frame.', laterMeaning: null, laterMeaningStatus: 'unknown', effectivePeriod: { precision: 'unknown', start: null, end: null, age: null, note: null } }],
      [ids.chapter, 'chapter', { kind: 'chapter', title: 'What changed in the goal you chose?', theme: 'The question stayed while the desired answer evolved.', memberObjectIds: [ids.episode, ids.meaning], unresolvedQuestions: ['What did the goal come to mean?'], candidateQuestion: 'What were you trying to preserve?' }],
      [ids.pattern, 'pattern', { kind: 'pattern', title: 'When does working alone help you?', triggerOrContext: 'A clear problem and a reason to return', response: 'Work alone with sustained attention', reportedConsequence: 'Progress when the task is clear', exceptions: ['Prolonged isolation can drain momentum.'], alternativeExplanations: ['Clarity may matter more than solitude.'], supportingEpisodeIds: [ids.episode], observedDuring: { precision: 'unknown', start: null, end: null, age: null, note: null }, workingExplanation: 'Conditions around solitude may matter more than being alone itself.', candidateQuestion: 'Think of a recent day you made progress alone. What helped you start?' }],
      [ids.current, 'current_state', { kind: 'current_state', title: 'A direction chosen', domain: 'work', summary: 'A first small release is still ahead.', asOf: new Date().toISOString(), freshness: 'current', openChecks: [] }],
      [ids.scenario, 'scenario', { kind: 'scenario', title: 'Share a small release', currentState: 'A direction is chosen.', goalIds: [], conditions: ['A bounded first step'], possibleDevelopment: 'Learn from real responses.', counterconditions: ['Preparation remains open-ended'], observableSigns: ['A small release is shared'], uncertainty: 'A conditional path, not a forecast.', horizon: { precision: 'relative', start: null, end: null, age: null, note: 'Next' } }],
      [ids.influence, 'influence', { kind: 'influence', title: 'People who helped shape the question', subjectPersonId: null, entityAsDescribed: 'Teachers and peers', relationshipLabelAsReported: null, experiencedInfluence: 'They widened what seemed possible.', connectedEpisodeIds: [ids.episode] }],
      [ids.gap, 'gap', { kind: 'gap', title: 'What makes action easier to begin?', distinction: 'Knowing versus beginning', whyItMatters: 'It changes which next step is useful.', blockedInterpretationOrDecision: null, candidateQuestion: 'What would make the first release easier to begin?', status: 'open' }],
    ];
    const objectRows = payloads.map(([id, kind]) => ({ id, user_id: userId, profile_id: personId, kind }));
    const insertedObjects = await admin.from('person_objects').insert(objectRows);
    if (insertedObjects.error) throw insertedObjects.error;
    const versions = payloads.map(([objectId, , typedPayload]) => ({ id: crypto.randomUUID(), user_id: userId, profile_id: personId, object_id: objectId, version_no: 1, epistemic_class: 'reported', lifecycle: 'active', typed_payload: typedPayload }));
    const insertedVersions = await admin.from('person_object_versions').insert(versions);
    if (insertedVersions.error) throw insertedVersions.error;
    const patternVersion = versions.find((version) => version.object_id === ids.pattern);
    if (!patternVersion) throw new Error('pattern version fixture missing');
    const insertedSupport = await admin.from('person_object_version_support').insert({
      user_id: userId,
      profile_id: personId,
      object_version_id: patternVersion.id,
      source_item_id: source.data.id,
      relation: 'supports',
    });
    if (insertedSupport.error) throw insertedSupport.error;
    const relations = [
      { id: crypto.randomUUID(), from: ids.episode, to: ids.meaning, kind: 'changed_meaning' },
      { id: crypto.randomUUID(), from: ids.episode, to: ids.chapter, kind: 'part_of' },
      { id: crypto.randomUUID(), from: ids.meaning, to: ids.chapter, kind: 'part_of' },
      { id: crypto.randomUUID(), from: ids.episode, to: ids.pattern, kind: 'supports' },
    ];
    const insertedRelations = await admin.from('person_relations').insert(relations.map((r) => ({ id: r.id, user_id: userId, profile_id: personId, from_object_id: r.from, to_object_id: r.to, relation_kind: r.kind })));
    if (insertedRelations.error) throw insertedRelations.error;
    const relationVersions = relations.map((r) => ({ id: crypto.randomUUID(), user_id: userId, profile_id: personId, relation_id: r.id, version_no: 1, epistemic_class: 'reported', lifecycle: 'active', typed_payload: {} }));
    const insertedRelationVersions = await admin.from('person_relation_versions').insert(relationVersions);
    if (insertedRelationVersions.error) throw insertedRelationVersions.error;
    const candidate = {
      processedSourceSeq: 1, brief: 'A sparse, revisable account.', changedIds: Object.values(ids), decisionSummary: 'Browser fixture publication.', verifierReceipt: { fixture: true },
      objectMembers: versions.map((v) => ({ objectId: v.object_id, versionId: v.id })),
      relationMembers: relationVersions.map((v, index) => ({ relationId: relations[index].id, versionId: v.id })),
    };
    const published = await admin.rpc('person_publish_revision', { p_job_id: jobs.data.id, p_lease_token: claim.data.leaseToken, p_fence: claim.data.fence, p_expected_base_revision: 1, p_expected_privacy_epoch: 0, p_commit_id: crypto.randomUUID(), p_candidate: candidate });
    if (published.error) throw published.error;

    await page.goto('/');
    await expect(page.locator('header .animate-pulse')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.intro-veil')).toHaveClass(/is-lifted/, { timeout: 10_000 });
    if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /toggle menu/i }).click();
    await page.getByRole('button', { name: /login/i }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    await page.goto(`/astrologer/p/${personId}/profile/life-map`);
    await expect(page.getByRole('heading', { name: 'The life behind your choices' })).toBeVisible();
    await expect(page.getByText('A question became a direction')).toBeVisible();
    await expect(page.getByText('Share a small release')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`p2-life-map-${testInfo.project.name}.png`), fullPage: true });

    await page.getByRole('link', { name: 'How you think' }).click();
    await page.getByRole('link', { name: 'When does working alone help you?' }).click();
    await expect(page.getByRole('heading', { name: 'When does working alone help you?' })).toBeVisible();
    await expect(page.getByText('The exception matters')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`p2-pattern-${testInfo.project.name}.png`), fullPage: true });

    await page.goto(`/astrologer/p/${personId}/profile/life-map/chapters/${ids.chapter}`);
    await expect(page.getByRole('heading', { name: 'What changed in the goal you chose?' })).toBeVisible();
    await expect(page.getByText('A meaning still to understand')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`p2-chapter-${testInfo.project.name}.png`), fullPage: true });

    await page.getByRole('button', { name: /explore in chat/i }).click();
    await expect(page).toHaveURL(new RegExp(`/astrologer/p/${personId}/chat/`));
    await expect(page.getByText('Exploring a connection in your life')).toBeVisible();
    await expect(page.getByText('What stays in the account')).toBeVisible();
    await expect(page.getByText('What may change')).toBeVisible();
    await expect(page.getByText('What did the goal come to mean?')).toBeVisible();
    await expect(page.getByPlaceholder('Tell me what you are exploring…')).toBeEnabled();
    const openedSessionId = page.url().split('/chat/')[1]?.split('?')[0];
    const explorationMessages = await admin.from('astro_messages').select('id', { count: 'exact', head: true }).eq('session_id', openedSessionId);
    if (explorationMessages.error) throw explorationMessages.error;
    expect(explorationMessages.count).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`p2-guided-chat-${testInfo.project.name}.png`), fullPage: true });
  } finally {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
});
