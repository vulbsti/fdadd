export type ProjectionMode = 'personal' | 'astrology';

export interface ProjectionMeta {
  personId: string;
  personRevision: number;
  sourceWatermark: number;
  mode: ProjectionMode;
  modeEpoch: number;
  privacyEpoch: number;
  generatedAt: string;
  updateState: 'current' | 'updating' | 'failed';
}

export interface ViewNode {
  id: string;
  kind: string;
  title: string;
  summary?: string | null;
  dateLabel?: string | null;
  payload: Record<string, unknown>;
  lifecycle?: string;
  epistemicClass?: 'reported' | 'working_hypothesis' | 'unknown' | 'calculated' | 'interpretation';
}

export interface SourceEvidence {
  supportId: string | null;
  observationId: string | null;
  sourceId: string;
  sourceSeq: number;
  sourceTime: string | null;
  speaker: 'user' | 'assistant' | 'tool' | 'system' | 'unknown';
  subjectKind: 'self' | 'other' | 'hypothetical' | 'unknown';
  relation: 'supports' | 'contradicts' | 'qualifies' | 'unclassified';
  assertionType: 'direct' | 'derived' | 'reported_interpretation' | 'assistant_hypothesis' | 'unknown';
  exactQuote: string | null;
}

export interface ViewEdge {
  id: string;
  kind: string;
  fromId: string;
  toId: string;
  label?: string | null;
}

export interface PersonProjection extends ProjectionMeta {
  view: 'life-map' | 'patterns' | 'people' | 'paths';
  title: string;
  subtitle?: string | null;
  nodes: ViewNode[];
  edges: ViewEdge[];
}

export interface ObjectProjection extends ProjectionMeta {
  view: 'object';
  object: ViewNode;
  related: ViewNode[];
  edges: ViewEdge[];
  supportCount: number;
  sources: SourceEvidence[];
}

export interface WorkspacePerson {
  id: string;
  name: string;
  mode: ProjectionMode;
  modeEpoch: number;
  hasBirthProfile: boolean;
}

export interface WorkspaceConversation {
  id: string;
  title: string;
  updatedAt: string;
}
