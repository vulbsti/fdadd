/** Extract messages from native and Workflow-serialized errors. */
export function getErrorMessage(error: unknown, fallback = 'internal error'): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (record.error && typeof record.error === 'object') {
      const nested = (record.error as Record<string, unknown>).message;
      if (typeof nested === 'string' && nested.trim()) return nested;
    }
  }
  return fallback;
}

export function isMissingAtrosAssetError(error: unknown): boolean {
  return /(?:ENOENT|no such file or directory).*vendor[\\/]atros|vendor[\\/]atros.*(?:ENOENT|no such file or directory)/i.test(
    getErrorMessage(error),
  );
}
