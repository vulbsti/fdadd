import { z } from 'zod';

/** Panels the app's home screen can show, in any order, each half or full width. */
export const HOME_PANEL_IDS = ['knows', 'drives', 'effort', 'arc', 'patterns', 'people', 'question', 'recent'] as const;
export const MAX_HOME_PANELS = 20;

export const HomePanelSchema = z.object({
  id: z.enum(HOME_PANEL_IDS),
  size: z.enum(['half', 'full']),
}).strict();

export const HomeLayoutSchema = z.array(HomePanelSchema).max(MAX_HOME_PANELS);
export type HomeLayout = z.infer<typeof HomeLayoutSchema>;

/** `{ layout: [...] }` saves a layout; `{ layout: null }` goes back to the default. */
export const HomeLayoutRequestSchema = z.object({ layout: HomeLayoutSchema.nullable() }).strict();

/** A stored layout, or null when there is none or it no longer fits the known panels. */
export function readHomeLayout(value: unknown): HomeLayout | null {
  const parsed = HomeLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
