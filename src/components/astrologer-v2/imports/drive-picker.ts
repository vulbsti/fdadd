// Google's own Drive picker, shared by the web imports page and the app's
// picker page (/connectors/google/pick).

declare global {
  interface Window {
    gapi?: { load: (name: string, callback: () => void) => void };
    google?: { picker: any };
  }
}

function loadPickerScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.picker) { resolve(); return; }
    const done = () => window.gapi!.load('picker', () => resolve());
    if (window.gapi) { done(); return; }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = done;
    script.onerror = () => reject(new Error('Could not load the Google file picker.'));
    document.head.appendChild(script);
  });
}

/** Google's own picker: whatever the person picks is shared with Aidoraa, and nothing else. */
export async function pickDriveFiles(config: { accessToken: string; apiKey: string; appId: string }) {
  await loadPickerScript();
  const picker = window.google!.picker;
  return new Promise<string[]>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false)
      .setMimeTypes(['application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.presentation',
        'text/plain', 'text/markdown', 'text/csv', 'application/json'].join(','));
    new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setTitle('Choose files for Aidoraa')
      .setCallback((data: { action: string; docs?: Array<{ id: string }> }) => {
        if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).map((doc) => doc.id));
        else if (data.action === picker.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
}
