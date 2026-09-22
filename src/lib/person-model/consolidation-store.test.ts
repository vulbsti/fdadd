import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import {
  PersonConsolidationStore,
  type PersonJobClaim,
} from './consolidation-store';
import { PersonLeaseLostError, isPersonLeaseLostError } from './consolidation-errors';

const claim: PersonJobClaim = {
  jobId: '11111111-1111-4111-8111-111111111111',
  leaseToken: '22222222-2222-4222-8222-222222222222',
  fence: 3,
  profileId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
  baseRevision: 0,
  privacyEpoch: 0,
  modeEpoch: 0,
  sourceFromSeq: 1,
  sourceToSeq: 1,
};

describe('PersonConsolidationStore lease fencing', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requests the full bounded lease for long provider stages', async () => {
    const rpc = vi.fn(async () => ({ data: '2026-09-23T00:00:00Z', error: null }));
    mocks.createAdminClient.mockReturnValue({ rpc });

    await new PersonConsolidationStore().renew(claim);

    expect(rpc).toHaveBeenCalledWith('person_renew_job_lease', {
      p_job_id: claim.jobId,
      p_lease_token: claim.leaseToken,
      p_fence: claim.fence,
      p_lease_seconds: 600,
    });
  });

  it('classifies PJF01 as a typed lease-lost error', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: 'PJF01', message: 'job lease fence is stale' } }));
    mocks.createAdminClient.mockReturnValue({ rpc });

    const operation = new PersonConsolidationStore().recordStage(claim, {
      stageKey: 'compose',
      stage: 'compose',
      state: 'started',
    });

    await expect(operation).rejects.toBeInstanceOf(PersonLeaseLostError);
    await expect(operation).rejects.toSatisfy(isPersonLeaseLostError);
  });

  it('does not misclassify unrelated storage errors as lease loss', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: '22023', message: 'invalid receipt' } }));
    mocks.createAdminClient.mockReturnValue({ rpc });

    const operation = new PersonConsolidationStore().recordStage(claim, {
      stageKey: 'compose',
      stage: 'compose',
      state: 'started',
    });

    await expect(operation).rejects.not.toSatisfy(isPersonLeaseLostError);
  });
});
