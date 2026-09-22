import {
  PersonDependencySchema,
  type PersonDependency,
} from './contracts';

export type DependencyKind = PersonDependency['kind'];

export interface DependencyValidationContext {
  /** IDs that exist in the same person scope at validation time. */
  available: Partial<Record<DependencyKind, ReadonlySet<string>>>;
  /** Version numbers for versioned records and epoch tokens. */
  currentVersions?: Partial<Record<DependencyKind, ReadonlyMap<string, number>>>;
  /** Excluded sources remain historically visible but cannot support new output. */
  excludedSourceIds?: ReadonlySet<string>;
  currentModeEpoch?: number;
  currentPrivacyEpoch?: number;
}

export interface DependencyIssue {
  code: 'invalid_dependency' | 'duplicate_dependency' | 'missing_dependency' | 'stale_dependency' | 'excluded_source';
  dependency?: PersonDependency;
  index?: number;
  message: string;
}

export interface DependencyValidationResult {
  valid: boolean;
  issues: DependencyIssue[];
  dependencies: PersonDependency[];
}

/**
 * Validates publication dependencies against one coherent snapshot. A caller
 * must supply data loaded inside the same publication transaction or pass it
 * to an RPC that repeats these checks under lock; this helper is not itself a
 * concurrency boundary.
 */
export function validatePersonDependencies(
  rawDependencies: readonly unknown[],
  context: DependencyValidationContext,
): DependencyValidationResult {
  const dependencies: PersonDependency[] = [];
  const issues: DependencyIssue[] = [];
  const seen = new Set<string>();

  rawDependencies.forEach((raw, index) => {
    const parsed = PersonDependencySchema.safeParse(raw);
    if (!parsed.success) {
      issues.push({ code: 'invalid_dependency', index, message: parsed.error.issues[0]?.message ?? 'Invalid dependency.' });
      return;
    }

    const dependency = parsed.data;
    dependencies.push(dependency);
    const key = `${dependency.kind}:${dependency.id}`;
    if (seen.has(key)) {
      issues.push({ code: 'duplicate_dependency', dependency, index, message: `Dependency ${key} is repeated.` });
      return;
    }
    seen.add(key);

    if (dependency.kind === 'source' && context.excludedSourceIds?.has(dependency.id)) {
      issues.push({ code: 'excluded_source', dependency, index, message: `Source ${dependency.id} is excluded.` });
      return;
    }

    if (dependency.kind === 'mode_epoch') {
      if (dependency.version === null || dependency.version !== context.currentModeEpoch) {
        issues.push({ code: 'stale_dependency', dependency, index, message: 'Reasoning mode changed after this output was prepared.' });
      }
      return;
    }

    if (dependency.kind === 'privacy_epoch') {
      if (dependency.version === null || dependency.version !== context.currentPrivacyEpoch) {
        issues.push({ code: 'stale_dependency', dependency, index, message: 'Privacy eligibility changed after this output was prepared.' });
      }
      return;
    }

    if (!context.available[dependency.kind]?.has(dependency.id)) {
      issues.push({ code: 'missing_dependency', dependency, index, message: `${dependency.kind} ${dependency.id} is unavailable in this person scope.` });
      return;
    }

    const currentVersion = context.currentVersions?.[dependency.kind]?.get(dependency.id);
    if (dependency.version !== null && currentVersion === undefined) {
      issues.push({ code: 'stale_dependency', dependency, index, message: `Current version for ${dependency.kind} ${dependency.id} could not be verified.` });
    } else if (dependency.version !== null && dependency.version !== currentVersion) {
      issues.push({ code: 'stale_dependency', dependency, index, message: `${dependency.kind} ${dependency.id} changed version.` });
    }
  });

  return { valid: issues.length === 0, issues, dependencies };
}
