import { generateKeyPairSync, createVerify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { addTester, betaAuthorizeUrl, betaSignupConfig, serviceAccountAssertion, verifiedEmailFromCode } from './testers';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const saJson = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: pem });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const idToken = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

describe('betaSignupConfig', () => {
  it('is null until group, sign-in client and service account are all set', () => {
    expect(betaSignupConfig({})).toBeNull();
    expect(betaSignupConfig({ BETA_TESTERS_GROUP: 'testers@aidoraa.com', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })).toBeNull();
    expect(betaSignupConfig({ BETA_TESTERS_GROUP: 'nope', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', BETA_GROUPS_SERVICE_ACCOUNT_JSON: saJson })).toBeNull();
  });

  it('prefers the sign-in client and the dedicated service account, falling back to Drive and Play ones', () => {
    const fallback = betaSignupConfig({
      BETA_TESTERS_GROUP: ' Testers@Aidoraa.com ', GOOGLE_CLIENT_ID: 'drive', GOOGLE_CLIENT_SECRET: 's',
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: Buffer.from(saJson).toString('base64'),
    });
    expect(fallback?.group).toBe('testers@aidoraa.com');
    expect(fallback?.oauth.clientId).toBe('drive');
    expect(fallback?.serviceAccount.clientEmail).toBe('sa@x.iam.gserviceaccount.com');

    const preferred = betaSignupConfig({
      BETA_TESTERS_GROUP: 'testers@aidoraa.com', GOOGLE_CLIENT_ID: 'drive', GOOGLE_CLIENT_SECRET: 's',
      GOOGLE_SIGNIN_CLIENT_ID: 'signin', GOOGLE_SIGNIN_CLIENT_SECRET: 's2',
      BETA_GROUPS_SERVICE_ACCOUNT_JSON: saJson, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: 'not json',
    });
    expect(preferred?.oauth.clientId).toBe('signin');
  });
});

describe('sign-in', () => {
  const oauth = { clientId: 'cid', clientSecret: 'sec' };

  it('asks only for email and lets the visitor pick the account', () => {
    const url = new URL(betaAuthorizeUrl(oauth, 'https://www.aidoraa.com/beta/callback', 'st'));
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('returns the verified email for our client only', async () => {
    const respond = (claims: object) => vi.fn(async () => json(200, { id_token: idToken(claims) })) as unknown as typeof fetch;
    expect(await verifiedEmailFromCode(oauth, 'c', 'r', respond({ aud: 'cid', email: 'A@Gmail.com', email_verified: true }))).toBe('a@gmail.com');
    expect(await verifiedEmailFromCode(oauth, 'c', 'r', respond({ aud: 'other', email: 'a@gmail.com', email_verified: true }))).toBeNull();
    expect(await verifiedEmailFromCode(oauth, 'c', 'r', respond({ aud: 'cid', email: 'a@gmail.com', email_verified: false }))).toBeNull();
    const failed = vi.fn(async () => json(400, { error: 'invalid_grant' })) as unknown as typeof fetch;
    expect(await verifiedEmailFromCode(oauth, 'c', 'r', failed)).toBeNull();
  });
});

describe('addTester', () => {
  const config = betaSignupConfig({
    BETA_TESTERS_GROUP: 'testers@aidoraa.com', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', BETA_GROUPS_SERVICE_ACCOUNT_JSON: saJson,
  })!;

  it('signs a groups-scoped assertion with the service account key', () => {
    const [header, claims, signature] = serviceAccountAssertion(config.serviceAccount, 1000).split('.');
    const verified = createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(verified).toBe(true);
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({
      iss: 'sa@x.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/cloud-identity.groups', exp: 4600,
    });
  });

  function fakeGoogle(memberStatus: number) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('oauth2')) return json(200, { access_token: 'tok' });
      if (url.includes('groups:lookup')) return json(200, { name: 'groups/abc' });
      return json(memberStatus, memberStatus === 200 ? { done: true } : { error: { status: 'ALREADY_EXISTS' } });
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }

  it('looks up the group and adds the email as a member', async () => {
    const { calls, fetchImpl } = fakeGoogle(200);
    await expect(addTester(config, 'a@gmail.com', fetchImpl)).resolves.toBe('added');
    expect(calls[1].url).toContain('groupKey.id=testers%40aidoraa.com');
    expect(calls[2].url).toBe('https://cloudidentity.googleapis.com/v1/groups/abc/memberships');
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ preferredMemberKey: { id: 'a@gmail.com' }, roles: [{ name: 'MEMBER' }] });
    expect((calls[2].init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('treats an existing member as success and surfaces other failures', async () => {
    await expect(addTester(config, 'a@gmail.com', fakeGoogle(409).fetchImpl)).resolves.toBe('already');
    await expect(addTester(config, 'a@gmail.com', fakeGoogle(403).fetchImpl)).rejects.toThrow('add member failed (403)');
  });
});
