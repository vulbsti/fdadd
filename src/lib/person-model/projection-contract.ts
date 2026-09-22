import { z } from 'zod';

const payloadSchema = z.record(z.string(), z.unknown());

export const PersonProjectionObjectRowSchema = z.object({
  object_id: z.string().uuid(),
  kind: z.string().min(1),
  version_id: z.string().uuid(),
  version_no: z.number().int().positive(),
  epistemic_class: z.string().min(1),
  lifecycle: z.string().min(1),
  typed_payload: payloadSchema,
  effective_from: z.string().nullable().optional(),
  effective_to: z.string().nullable().optional(),
}).passthrough();

export const PersonProjectionRelationRowSchema = z.object({
  relation_id: z.string().uuid(),
  relation_kind: z.string().min(1),
  from_object_id: z.string().uuid(),
  to_object_id: z.string().uuid(),
  version_id: z.string().uuid(),
  version_no: z.number().int().positive(),
  epistemic_class: z.string().min(1),
  lifecycle: z.string().min(1),
  typed_payload: payloadSchema,
}).passthrough();

export const PersonReadProjectionSchema = z.object({
  personId: z.string().uuid(),
  personRevision: z.number().int().positive(),
  sourceWatermark: z.number().int().nonnegative(),
  mode: z.enum(['personal', 'astrology']),
  modeEpoch: z.number().int().nonnegative(),
  privacyEpoch: z.number().int().nonnegative(),
  generatedAt: z.string().min(1),
  updateState: z.enum(['current', 'updating', 'failed']),
  objects: z.array(PersonProjectionObjectRowSchema),
  relations: z.array(PersonProjectionRelationRowSchema),
  supportCount: z.number().int().nonnegative(),
}).strict();

export type PersonReadProjection = z.infer<typeof PersonReadProjectionSchema>;

export function parsePersonReadProjection(value: unknown): PersonReadProjection {
  return PersonReadProjectionSchema.parse(value);
}
