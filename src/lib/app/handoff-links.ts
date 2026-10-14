// OAuth states and aidoraa:// links for app handoffs. No server imports:
// the app's Drive picker page uses these in the browser.

/**
 * The OAuth `state` of an app-started connection. Web states are plain
 * base64url and never contain a dot, so the two cannot be confused.
 */
export const appOAuthState = (token: string) => `app.${token}`;

export function parseAppOAuthState(state: string | null | undefined): string | null {
  return state?.startsWith('app.') ? state.slice(4) : null;
}

export type ConnectorService = 'notion' | 'google';
export type ConnectorResult = 'connected' | 'cancelled' | 'failed';

export function appConnectorLink(service: ConnectorService, result: ConnectorResult) {
  return `aidoraa://connectors/${service}?result=${result}`;
}

export function appImportsLink(input: { result: 'imported' | 'cancelled' | 'failed'; count?: number; personId?: string | null; importId?: string | null }) {
  const params = new URLSearchParams({ result: input.result, count: String(input.count ?? 0) });
  if (input.personId) params.set('personId', input.personId);
  if (input.importId) params.set('importId', input.importId);
  return `aidoraa://imports?${params}`;
}
