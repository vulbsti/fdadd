import { describe, expect, it } from 'vitest';
import { HomeLayoutRequestSchema, readHomeLayout } from './home-layout';

describe('home layout', () => {
  it('accepts known panels in any order and size', () => {
    const layout = [{ id: 'question', size: 'full' }, { id: 'knows', size: 'half' }, { id: 'people', size: 'half' }];
    expect(HomeLayoutRequestSchema.parse({ layout })).toEqual({ layout });
    expect(HomeLayoutRequestSchema.parse({ layout: null })).toEqual({ layout: null });
  });

  it('rejects unknown panels, sizes, extra fields and long layouts', () => {
    expect(HomeLayoutRequestSchema.safeParse({ layout: [{ id: 'horoscope', size: 'full' }] }).success).toBe(false);
    expect(HomeLayoutRequestSchema.safeParse({ layout: [{ id: 'arc', size: 'third' }] }).success).toBe(false);
    expect(HomeLayoutRequestSchema.safeParse({ layout: [{ id: 'arc', size: 'full', color: 'red' }] }).success).toBe(false);
    expect(HomeLayoutRequestSchema.safeParse({ layout: Array.from({ length: 21 }, () => ({ id: 'arc', size: 'half' })) }).success).toBe(false);
  });

  it('drops a stored layout that no longer fits', () => {
    expect(readHomeLayout(null)).toBeNull();
    expect(readHomeLayout([{ id: 'retired', size: 'full' }])).toBeNull();
    expect(readHomeLayout([{ id: 'recent', size: 'full' }])).toEqual([{ id: 'recent', size: 'full' }]);
  });
});
