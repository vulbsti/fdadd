import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

export interface AgentPersonObject {
  objectId: string;
  versionId: string;
  kind: string;
  epistemicClass: string;
  lifecycle: string;
  payload: Record<string, unknown>;
  support: Array<{
    relation: string;
    sourceId: string | null;
    observationId: string | null;
  }>;
}

export interface AgentPersonRelation {
  relationId: string;
  versionId: string;
  kind: string;
  fromObjectId: string;
  toObjectId: string;
  epistemicClass: string;
  lifecycle: string;
  payload: Record<string, unknown>;
}

export interface AgentPersonContextBundle {
  personId: string;
  revision: number;
  sourceWatermark: number;
  modeEpoch: number;
  privacyEpoch: number;
  objects: AgentPersonObject[];
  relations: AgentPersonRelation[];
}

function rows(result: { data: unknown; error: { message?: string } | null }, label: string): Row[] {
  if (result.error) throw new Error(`${label} could not be loaded: ${result.error.message ?? 'database error'}`);
  return Array.isArray(result.data) ? result.data as Row[] : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Build the read-only, revision-fenced person workspace supplied to the answer
 * agent. This deliberately reads the same immutable revision membership that
 * backs the website instead of the older astro_person_facts tables.
 */
export async function loadAgentPersonContext(
  client: SupabaseClient,
  input: {
    userId: string;
    personId: string;
    revision: number;
    sourceWatermark: number;
    modeEpoch: number;
    privacyEpoch: number;
  },
): Promise<AgentPersonContextBundle> {
  const [revisionObjectsResult, revisionRelationsResult] = await Promise.all([
    client.from('person_revision_objects')
      .select('object_id,object_version_id')
      .eq('user_id', input.userId)
      .eq('profile_id', input.personId)
      .eq('revision_no', input.revision),
    client.from('person_revision_relations')
      .select('relation_id,relation_version_id')
      .eq('user_id', input.userId)
      .eq('profile_id', input.personId)
      .eq('revision_no', input.revision),
  ]);
  const revisionObjects = rows(revisionObjectsResult, 'Person revision objects');
  const revisionRelations = rows(revisionRelationsResult, 'Person revision relations');
  const objectIds = revisionObjects.map((item) => String(item.object_id));
  const objectVersionIds = revisionObjects.map((item) => String(item.object_version_id));
  const relationIds = revisionRelations.map((item) => String(item.relation_id));
  const relationVersionIds = revisionRelations.map((item) => String(item.relation_version_id));

  const empty = Promise.resolve({ data: [], error: null });
  const [objectsResult, versionsResult, supportResult, relationsResult, relationVersionsResult] = await Promise.all([
    objectIds.length
      ? client.from('person_objects').select('id,kind,lifecycle').eq('user_id', input.userId).eq('profile_id', input.personId).in('id', objectIds)
      : empty,
    objectVersionIds.length
      ? client.from('person_object_versions').select('id,object_id,epistemic_class,lifecycle,typed_payload').eq('user_id', input.userId).eq('profile_id', input.personId).in('id', objectVersionIds)
      : empty,
    objectVersionIds.length
      ? client.from('person_object_version_support').select('object_version_id,source_item_id,observation_id,relation').eq('user_id', input.userId).eq('profile_id', input.personId).in('object_version_id', objectVersionIds)
      : empty,
    relationIds.length
      ? client.from('person_relations').select('id,relation_kind,from_object_id,to_object_id,lifecycle').eq('user_id', input.userId).eq('profile_id', input.personId).in('id', relationIds)
      : empty,
    relationVersionIds.length
      ? client.from('person_relation_versions').select('id,relation_id,epistemic_class,lifecycle,typed_payload').eq('user_id', input.userId).eq('profile_id', input.personId).in('id', relationVersionIds)
      : empty,
  ]);

  const objectById = new Map(rows(objectsResult, 'Person objects').map((item) => [String(item.id), item]));
  const versionById = new Map(rows(versionsResult, 'Person object versions').map((item) => [String(item.id), item]));
  const supportByVersion = new Map<string, AgentPersonObject['support']>();
  for (const item of rows(supportResult, 'Person object support')) {
    const versionId = String(item.object_version_id);
    const list = supportByVersion.get(versionId) ?? [];
    list.push({
      relation: String(item.relation),
      sourceId: typeof item.source_item_id === 'string' ? item.source_item_id : null,
      observationId: typeof item.observation_id === 'string' ? item.observation_id : null,
    });
    supportByVersion.set(versionId, list);
  }
  const relationById = new Map(rows(relationsResult, 'Person relations').map((item) => [String(item.id), item]));
  const relationVersionById = new Map(rows(relationVersionsResult, 'Person relation versions').map((item) => [String(item.id), item]));

  const objects = revisionObjects.flatMap((member): AgentPersonObject[] => {
    const objectId = String(member.object_id);
    const versionId = String(member.object_version_id);
    const object = objectById.get(objectId);
    const version = versionById.get(versionId);
    if (!object || !version) return [];
    return [{
      objectId,
      versionId,
      kind: String(object.kind),
      epistemicClass: String(version.epistemic_class),
      lifecycle: String(version.lifecycle),
      payload: record(version.typed_payload),
      support: supportByVersion.get(versionId) ?? [],
    }];
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.objectId.localeCompare(b.objectId));

  const relations = revisionRelations.flatMap((member): AgentPersonRelation[] => {
    const relationId = String(member.relation_id);
    const versionId = String(member.relation_version_id);
    const relation = relationById.get(relationId);
    const version = relationVersionById.get(versionId);
    if (!relation || !version) return [];
    return [{
      relationId,
      versionId,
      kind: String(relation.relation_kind),
      fromObjectId: String(relation.from_object_id),
      toObjectId: String(relation.to_object_id),
      epistemicClass: String(version.epistemic_class),
      lifecycle: String(version.lifecycle),
      payload: record(version.typed_payload),
    }];
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.relationId.localeCompare(b.relationId));

  return {
    personId: input.personId,
    revision: input.revision,
    sourceWatermark: input.sourceWatermark,
    modeEpoch: input.modeEpoch,
    privacyEpoch: input.privacyEpoch,
    objects,
    relations,
  };
}

/**
 * Present the revision as a file-shaped, read-only context pack. It is not
 * copied into the shared Atros calculation sandbox; that avoids cross-person
 * filesystem state while giving every answer step the same durable snapshot.
 */
export function personAgentContextBlock(bundle: AgentPersonContextBundle, maxChars = 24_000): string {
  const metadata = {
    personId: bundle.personId,
    revision: bundle.revision,
    sourceWatermark: bundle.sourceWatermark,
    modeEpoch: bundle.modeEpoch,
    privacyEpoch: bundle.privacyEpoch,
  };
  const header = `Read-only person workspace (revision-fenced)\n/person/current.json ${JSON.stringify(metadata)}`;
  const sections = [header];
  let used = header.length;
  let includedObjects = 0;
  let includedRelations = 0;
  for (const object of bundle.objects) {
    const line = `/person/theory-of-mind/${object.objectId}.json ${JSON.stringify(object)}`;
    if (used + line.length + 1 > maxChars) break;
    sections.push(line);
    used += line.length + 1;
    includedObjects++;
  }
  for (const relation of bundle.relations) {
    const line = `/person/mappings/${relation.relationId}.json ${JSON.stringify(relation)}`;
    if (used + line.length + 1 > maxChars) break;
    sections.push(line);
    used += line.length + 1;
    includedRelations++;
  }
  const omittedObjects = bundle.objects.length - includedObjects;
  const omittedRelations = bundle.relations.length - includedRelations;
  if (omittedObjects || omittedRelations) {
    sections.push(`[context budget omitted ${omittedObjects} objects and ${omittedRelations} relations]`);
  }
  return sections.join('\n');
}
