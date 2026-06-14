# WC chat — teardown runbook

**Trigger phrase:** "Read the WC chat teardown doc and remove the chat."

The per-pool chat (built step 3a.19) is a **temporary** feature for the informal
World Cup friends' run. It is designed to be torn out cleanly once the WC pool
is retired. This doc is the exact checklist.

Every shared-file edit is wrapped in sentinel comments so the blast radius is
known while it's live, and removal is mechanical:

```
// ── WC CHAT (temporary) ── start ...
...
// ── WC CHAT (temporary) ── end
```

> While the chat is live, **keep all fixes and tweaks inside these fences** (or
> inside the three delete-whole files below). That keeps teardown a pure
> delete-the-fences job with no archaeology.

---

## 1. Delete these files outright

| Folder / path | Action |
|---|---|
| `server/db/schema/messages.ts` | Delete |
| `server/lib/chat-data.ts` | Delete |
| `client/src/pages/portal/PoolChatPage.tsx` | Delete |

## 2. Remove the fenced blocks from these files

Search each for `WC CHAT (temporary)` and delete every `start … end` block
(including the import blocks):

| Folder / path | What's fenced |
|---|---|
| `server/db/schema/index.ts` | `export * from "./messages"` |
| `server/routes/portal.ts` | chat-data import + GET/POST `/pools/:id/messages` routes |
| `server/routes/admin-portal.ts` | `hideMessage` import + POST `/messages/:id/hide` route |
| `client/src/lib/portal-api.ts` | chat types + `fetchPoolMessages` / `postPoolMessage` / `hidePoolMessage` |
| `client/src/App.tsx` | `PoolChatPage` import + `/pools/:competitionSlug/:poolId/chat` route |
| `client/src/pages/portal/TablesPage.tsx` | `MessageCircle` import + the "Table chat" button |

## 3. Drop the table

The chat data lives in one table, `pool_messages`. Two clean ways — pick one:

**A — manual drop, then push (recommended; no prompts):**
1. Render Shell: `psql $DATABASE_URL -c "DROP TABLE IF EXISTS pool_messages;"`
2. After steps 1–2 are shipped, run `pnpm db:push` so the schema and DB agree.

**B — schema-driven:** after the schema file is deleted (step 1), run
`pnpm db:push` and confirm the drop when drizzle-kit prompts. (Manual drop is
preferred because it's non-interactive and predictable in CI.)

No `pnpm seed` — chat has no seed data.

## 4. Verify

```
# No stragglers anywhere except this doc:
grep -rin "WC CHAT" . --exclude=wc-chat-teardown.md
grep -rin "pool_messages\|poolMessages\|PoolChatPage\|chat-data\|fetchPoolMessages" client server

# Build clean, tsc baseline back to 15 (zero new errors):
pnpm install --frozen-lockfile && pnpm build
```

All three greps should return nothing (bar this file). No `package.json` /
`pnpm-lock.yaml` change was made when the chat was added, so none is needed on
removal. `vite.config.ts` and `client/index.html` were never touched.

---

## What this feature added (for reference)

- **Schema:** one table `pool_messages` (id, pool_id, user_id, body, soft-delete
  columns `hidden_at` / `hidden_by` / `hidden_reason`, created_at).
- **Server:** `chat-data.ts` (entrant-gated read/post, 5-msg/10s rate limit,
  self-exclusion posting gate, 500-char cap, admin soft-delete); two portal
  routes; one admin-portal hide route (audited as `admin.action`).
- **Client:** `PoolChatPage.tsx` (polling every 5s + focus refetch, optimistic
  send, admin Hide control); API wrappers; a "Table chat" button on Tables
  shown only to entrants.
- **Realtime:** polling, no websockets. **Moderation:** admin hide only; no
  report queue, no automated filtering (deferred to scale/licence). **Content:**
  plain text + emoji, no images, no link handling.
