# Imports and connectors

Date: 2026-09-29. A person can bring conversations from other assistants,
pages from Notion, files from Google Drive and notes from Google Keep into Aidoraa from **Import conversations** in the sidebar.

## Which path each source takes

| Source | Path | What is read |
|---|---|---|
| Notion | OAuth connection (public integration) | Pages the person shares on Notion's consent screen, fetched as Markdown |
| Google Drive | OAuth (`drive.file`) + Google Picker | Only files the person picks: Docs as Markdown, Sheets as CSV, Slides as text, text/JSON files as is |
| Google Keep | Google Takeout (Keep) | one JSON per note: text, checklists, labels; trashed notes skipped |
| ChatGPT | Official export (.zip) | `conversations.json`: the kept branch of each conversation, visible user and assistant turns |
| Claude | Official export (.zip) | `conversations.json`: text parts and attachment text |
| Grok | accounts.x.ai data download | `prod-grok-backend.json` |
| Gemini | Google Takeout, My Activity > Gemini Apps (JSON) | prompts and replies, grouped by day |
| DeepSeek | Settings > Data export | `conversations.json` request/response fragments |
| Meta AI | WhatsApp "Export chat", Meta "Download your information" (JSON), or paste | chat lines; the person says which speaker is them |
| Anything else | JSON, .txt or .md upload, or paste | known shapes, "You said:"/"User:" transcripts, otherwise a note |

Google Keep's API only works for Workspace domains through domain-wide
delegation, not for personal accounts, so Keep uses Takeout. Drive uses the
non-sensitive `drive.file` scope with the Picker rather than the restricted
`drive.readonly`, which would need Google's paid security assessment.

None of the chatbots offer an API or OAuth scope for a user's chat history,
so their exports are the only official route. Unknown JSON is searched for
lists of role/text messages; nothing is attributed to the person without
either a structured role field or the person choosing their speaker name.

## Flow

1. The browser keeps only the text entries of the export (images never leave
   the device), re-zips them and uploads straight to the private
   `person-imports` bucket with a one-time signed URL.
2. `POST .../imports/{id}/parse` reads the upload into `person_import_items`
   (pending) and deletes the raw upload. Items already imported for this
   person are marked unchanged (unselected by default) or updated.
3. The person reviews, picks what to keep and, for named speakers, which name
   is them. `confirm_person_import` keeps the selection, replaces earlier
   copies of the same conversations, and discards the rest.
4. Every Pi run renders imported items into `imports/<source>/*.md` plus
   `imports/index.md`, read-only. The folder is rewritten only when the set of
   imported items changes (signature in `state/imports-signature`).

Removing an import deletes its rows; the next run's workspace no longer has
its files. A chat whose Pi session already read an imported file can still
recall it within that chat's saved session.

## Setup

Create a public integration at https://www.notion.so/profile/integrations
with read content capability, set its redirect URI to
`https://<domain>/api/connectors/notion/callback`, and set `NOTION_CLIENT_ID`
and `NOTION_CLIENT_SECRET` on the deployment. Tokens are AES-GCM encrypted
with `CONNECTOR_TOKEN_KEY` (default: derived from `SUPABASE_SECRET_KEY`).

For Google, create an OAuth client (Web) in a Google Cloud project with the
Drive API and Picker API enabled, add
`https://<domain>/api/connectors/google/callback` as a redirect URI, and create
a browser API key restricted to the Picker API and the site's referrers. Set
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY` and
`GOOGLE_CLOUD_PROJECT_NUMBER`. The consent screen needs publishing (and
Google's standard verification for the `drive.file` scope) before people
outside the test-user list can connect.
