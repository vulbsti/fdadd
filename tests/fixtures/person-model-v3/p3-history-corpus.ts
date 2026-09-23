/**
 * Sanitized, wholly synthetic P3 acceptance corpus. These are evaluation
 * prompts, not app copy, customer transcripts, or expected biography text.
 * Keep each history independently runnable so a test cannot pass by leaking
 * another person's state into it.
 */

export interface P3InputTurn {
  id: string;
  speaker: 'user' | 'assistant';
  subject: 'self' | 'third_party' | 'hypothetical' | 'assistant_claim';
  text: string;
}

export interface P3UnknownExpectation {
  kind: string;
  statusPath: string;
  statusValue: string;
  contentPath: string;
  contentValue: null;
}

export interface P3HistoryCase {
  id: string;
  domains: string[];
  tags: string[];
  turns: P3InputTurn[];
  requiredKinds: string[];
  preserve: string[];
  remainUnknown: P3UnknownExpectation[];
  forbiddenConclusions: string[];
}

export const p3HistoryCorpus: P3HistoryCase[] = [
  {
    id: 'p3-h01-meaning-change', domains: ['identity', 'learning'], tags: ['C02', 'C04', 'C05', 'unknown-meaning'],
    turns: [
      { id: 'h01-u1', speaker: 'user', subject: 'self', text: 'At 15, a question I kept returning to started shaping what I wanted to do.' },
      { id: 'h01-u2', speaker: 'user', subject: 'self', text: 'Later, new questions challenged the goal. I have not worked out what it means to me now.' },
    ], requiredKinds: ['episode', 'meaning_change', 'chapter'],
    preserve: ['age-15 event', 'later challenge', 'open meaning'],
    remainUnknown: [{ kind: 'meaning_change', statusPath: 'laterMeaningStatus', statusValue: 'unknown', contentPath: 'laterMeaning', contentValue: null }],
    forbiddenConclusions: ['invented current meaning', 'exact calendar date derived from age alone'],
  },
  {
    id: 'p3-h02-productive-solitude', domains: ['work', 'wellbeing'], tags: ['C06', 'condition'],
    turns: [{ id: 'h02-u1', speaker: 'user', subject: 'self', text: 'A quiet block helps when I have one clear problem and can give it sustained attention.' }],
    requiredKinds: ['pattern'], preserve: ['clear problem condition', 'sustained attention', 'reported helpful outcome'], remainUnknown: [],
    forbiddenConclusions: ['solitude is always helpful'],
  },
  {
    id: 'p3-h03-isolation-counterexample', domains: ['work', 'wellbeing'], tags: ['C06', 'counterexample', 'exception'],
    turns: [{ id: 'h03-u1', speaker: 'user', subject: 'self', text: 'When a quiet stretch becomes prolonged isolation, my energy and momentum can drop.' }],
    requiredKinds: ['pattern'], preserve: ['duration changes the effect', 'reported negative outcome'], remainUnknown: [],
    forbiddenConclusions: ['incapable of discipline', 'solitude has one invariant effect'],
  },
  {
    id: 'p3-h04-alone-and-productive', domains: ['work', 'wellbeing'], tags: ['C07', 'counterexample'],
    turns: [{ id: 'h04-u1', speaker: 'user', subject: 'self', text: 'Yesterday I worked alone for a few hours, made progress, and still had the social contact I wanted.' }],
    requiredKinds: ['episode', 'pattern'], preserve: ['bounded duration', 'progress', 'social contact'], remainUnknown: [],
    forbiddenConclusions: ['social contact is unnecessary', 'any time alone causes isolation'],
  },
  {
    id: 'p3-h05-date-correction', domains: ['work', 'time'], tags: ['C08', 'correction', 'history'],
    turns: [
      { id: 'h05-u1', speaker: 'user', subject: 'self', text: 'I started that role in 2024.' },
      { id: 'h05-u2', speaker: 'user', subject: 'self', text: 'Correction: I checked the record; the start year was 2025, not 2024.' },
    ], requiredKinds: ['episode'], preserve: ['corrected active date', 'historical correction trace'], remainUnknown: [],
    forbiddenConclusions: ['2024 remains active', 'correction erases source history'],
  },
  {
    id: 'p3-h06-reject-explanation', domains: ['work', 'identity'], tags: ['C20', 'rejection'],
    turns: [
      { id: 'h06-u1', speaker: 'user', subject: 'self', text: 'You suggested that I avoid the task because I fear failure.' },
      { id: 'h06-u2', speaker: 'user', subject: 'self', text: 'That explanation does not fit. Please do not use it.' },
    ], requiredKinds: ['gap'], preserve: ['rejected premise', 'optional clarification only'], remainUnknown: [],
    forbiddenConclusions: ['fear of failure as reported fact', 'advice dependent on rejected premise'],
  },
  {
    id: 'p3-h07-parent-subject', domains: ['family', 'health'], tags: ['C11', 'third-party'],
    turns: [{ id: 'h07-u1', speaker: 'user', subject: 'third_party', text: 'My parent moved to a smaller home after their health needs changed; that was their experience, not mine.' }],
    requiredKinds: ['episode', 'influence'], preserve: ['parent is the subject', 'user is reporting another person'], remainUnknown: [],
    forbiddenConclusions: ['user experienced the move', 'unreported diagnosis'],
  },
  {
    id: 'p3-h08-hypothetical', domains: ['relationships', 'work'], tags: ['C11', 'hypothetical'],
    turns: [{ id: 'h08-u1', speaker: 'user', subject: 'hypothetical', text: 'If someone changed careers after caring for a relative, what might make that transition hard?' }],
    requiredKinds: ['gap'], preserve: ['question is hypothetical'], remainUnknown: [],
    forbiddenConclusions: ['user changed careers', 'user is a caregiver'],
  },
  {
    id: 'p3-h09-sparse-family', domains: ['family'], tags: ['C01', 'C13', 'sparse', 'unknown-domain'],
    turns: [{ id: 'h09-u1', speaker: 'user', subject: 'self', text: 'I have not shared anything about my family.' }],
    requiredKinds: ['gap'], preserve: ['family details not supplied'], remainUnknown: [],
    forbiddenConclusions: ['family member roles', 'family events'],
  },
  {
    id: 'p3-h10-caregiving-domain', domains: ['family', 'caregiving'], tags: ['C14', 'alternate-domain'],
    turns: [{ id: 'h10-u1', speaker: 'user', subject: 'self', text: 'For several months I coordinated rides and meals for a relative while keeping my own appointments.' }],
    requiredKinds: ['episode', 'current_state'], preserve: ['caregiving responsibilities', 'own appointments also matter'], remainUnknown: [],
    forbiddenConclusions: ['automatic productivity framing', 'relative’s private thoughts'],
  },
  {
    id: 'p3-h11-paused-goal', domains: ['work', 'goals'], tags: ['goal-status', 'uncertainty'],
    turns: [{ id: 'h11-u1', speaker: 'user', subject: 'self', text: 'I paused the course this term; I have not decided whether to return.' }],
    requiredKinds: ['goal', 'gap'], preserve: ['paused is not abandoned', 'return decision unresolved'], remainUnknown: [],
    forbiddenConclusions: ['goal completed', 'goal abandoned'],
  },
  {
    id: 'p3-h12-outcome-did-not-help', domains: ['work', 'wellbeing'], tags: ['outcome', 'counterexample'],
    turns: [{ id: 'h12-u1', speaker: 'user', subject: 'self', text: 'I tried working in short timed blocks for a week, but it did not help me start.' }],
    requiredKinds: ['episode', 'pattern'], preserve: ['trial and duration', 'negative reported outcome'], remainUnknown: [],
    forbiddenConclusions: ['experiment succeeded', 'user accepted a permanent routine'],
  },
  {
    id: 'p3-h13-assistant-repetition', domains: ['work', 'evidence'], tags: ['C09', 'assistant-laundering', 'negative-control'],
    turns: [
      { id: 'h13-a1', speaker: 'assistant', subject: 'assistant_claim', text: 'You always lose focus because you need external pressure.' },
      { id: 'h13-a2', speaker: 'assistant', subject: 'assistant_claim', text: 'As noted, you need external pressure to work.' },
      { id: 'h13-u1', speaker: 'user', subject: 'self', text: 'I have not confirmed that explanation.' },
    ], requiredKinds: ['gap'], preserve: ['assistant repetition is not independent evidence'], remainUnknown: [],
    forbiddenConclusions: ['needs external pressure to work'],
  },
  {
    id: 'p3-h14-unrelated-quote', domains: ['work', 'evidence'], tags: ['C10', 'semantic-support', 'negative-control'],
    turns: [
      { id: 'h14-u1', speaker: 'user', subject: 'self', text: '“I need a slower morning.” This was about my schedule, not my career choice.' },
      { id: 'h14-u2', speaker: 'user', subject: 'self', text: 'Do not use that sentence as proof that I want to leave my job.' },
    ], requiredKinds: ['gap'], preserve: ['quote topic is schedule', 'explicitly unrelated to job choice'], remainUnknown: [],
    forbiddenConclusions: ['user wants to leave job', 'quote relevance from substring alone'],
  },
  {
    id: 'p3-h15-unknown-event-date', domains: ['time', 'education'], tags: ['unknown-date', 'epistemic'],
    turns: [{ id: 'h15-u1', speaker: 'user', subject: 'self', text: 'I attended a short course years ago, but I do not remember when.' }],
    requiredKinds: ['episode'], preserve: ['course attendance', 'date not remembered'],
    remainUnknown: [{ kind: 'episode', statusPath: 'occurred.precision', statusValue: 'unknown', contentPath: 'occurred.age', contentValue: null }],
    forbiddenConclusions: ['guessed age or year'],
  },
  {
    id: 'p3-h16-stale-current-state', domains: ['work', 'time'], tags: ['C12', 'staleness'],
    turns: [{ id: 'h16-u1', speaker: 'user', subject: 'self', text: 'Last winter I was waiting to hear about a contract; I do not know whether that is still pending.' }],
    requiredKinds: ['current_state', 'gap'], preserve: ['snapshot is historical', 'present status needs checking'], remainUnknown: [],
    forbiddenConclusions: ['contract is currently pending', 'contract was awarded'],
  },
  {
    id: 'p3-h17-conflicting-dates', domains: ['work', 'time'], tags: ['D05', 'conflict', 'concurrency'],
    turns: [
      { id: 'h17-u1', speaker: 'user', subject: 'self', text: 'I remember the move happening in 2022.' },
      { id: 'h17-u2', speaker: 'user', subject: 'self', text: 'A document suggests 2023, but I am not sure which memory is right.' },
    ], requiredKinds: ['episode', 'gap'], preserve: ['both date accounts', 'date unresolved pending evidence'], remainUnknown: [],
    forbiddenConclusions: ['last-writer-wins date guess'],
  },
  {
    id: 'p3-h18-multiple-domains', domains: ['work', 'health', 'relationships'], tags: ['cross-domain', 'coverage'],
    turns: [{ id: 'h18-u1', speaker: 'user', subject: 'self', text: 'During a demanding month, I reduced work hours, kept a weekly walk, and asked a friend for help.' }],
    requiredKinds: ['episode', 'current_state'], preserve: ['work adjustment', 'health routine', 'social support'], remainUnknown: [],
    forbiddenConclusions: ['single-domain explanation'],
  },
  {
    id: 'p3-h19-long-history', domains: ['education', 'work', 'family', 'goals'], tags: ['long-history', 'incremental'],
    turns: [
      { id: 'h19-u1', speaker: 'user', subject: 'self', text: 'I finished training before I took my first full-time role.' },
      { id: 'h19-u2', speaker: 'user', subject: 'self', text: 'Years later, family responsibilities changed how much time I could give to work.' },
      { id: 'h19-u3', speaker: 'user', subject: 'self', text: 'That older work limit is no longer current, though the family relationship remains important.' },
    ], requiredKinds: ['episode', 'chapter', 'current_state', 'influence'], preserve: ['ordered distinct episodes', 'old state not current', 'ongoing influence'], remainUnknown: [],
    forbiddenConclusions: ['collapse whole history into one summary', 'old work limit presented as current'],
  },
  {
    id: 'p3-h20-excluded-source', domains: ['privacy', 'work'], tags: ['D07', 'privacy-fence', 'exclusion'],
    turns: [
      { id: 'h20-u1', speaker: 'user', subject: 'self', text: 'I used to describe the project as the only thing that mattered.' },
      { id: 'h20-u2', speaker: 'user', subject: 'self', text: 'Please exclude that old message from future profile understanding; it no longer represents what I want stored.' },
    ], requiredKinds: [], preserve: ['source exclusion intent', 'no republishing by retry'], remainUnknown: [],
    forbiddenConclusions: ['excluded source remains eligible support'],
  },
];
