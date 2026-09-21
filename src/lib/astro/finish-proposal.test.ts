import { describe, expect, it } from 'vitest';
import { parseFinishProposal } from './finish-proposal';

describe('complete final-answer proposal', () => {
  it('preserves a long answer and question past the trace-summary limit', () => {
    const answer = 'A'.repeat(900);
    const proposal = parseFinishProposal(JSON.stringify({
      answer,
      terminalStatus: 'waiting_for_user',
      focusedQuestion: {
        prompt: 'What changed in that period?', responseKind: 'free_text', options: [], allowFreeText: true,
      },
      nextAction: 'Await the answer.',
    }));
    expect(proposal?.answer).toBe(answer);
    expect(proposal?.focusedQuestion?.prompt).toBe('What changed in that period?');
    expect(proposal?.nextAction).toBe('Await the answer.');
  });

  it('rejects malformed and invalid focused questions', () => {
    expect(parseFinishProposal('{bad json')).toBeNull();
    expect(parseFinishProposal(JSON.stringify({
      answer: 'Draft', terminalStatus: 'waiting_for_user',
      focusedQuestion: { prompt: 'Choose', responseKind: 'single_choice', options: [], allowFreeText: false },
    }))).toBeNull();
  });
});
