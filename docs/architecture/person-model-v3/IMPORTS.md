# Imports and connectors

Date: 2026-09-29. A person can bring conversations from other assistants and
pages from Notion into Aidoraa from **Import conversations** in the sidebar.

## Which path each source takes

| Source | Path | What is read |
|---|---|---|
| Notion | OAuth connection (public integration) | Pages the person shares on Notion's consent screen, fetched as Markdown |
| ChatGPT | Official export (.zip) | `conversations.json`: the kept branch of each conversation, visible user and assistant turns |
| Claude | Official export (.zip) | `conversations.json`: text parts and attachment text |
| Grok | accounts.x.ai data download | `prod-grok-backend.json` |
| Gemini | Google Takeout, My Activity > Gemini Apps (JSON) | prompts and replies, grouped by day |
| DeepSeek | Settings > Data export | `conversations.json` request/response fragments |
| Meta AI | WhatsApp "Export chat", Meta "Download your information" (JSON), or paste | chat lines; the person says which speaker is them |
| Anything else | JSON, .txt or .md upload, or paste | known shapes, "You said:"/"User:" transcripts, otherwise a note |

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
