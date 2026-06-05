/*
Predictor10 — one-shot backfill for the firstName / lastName / nickname
migration (step 3a.12).

Run once after `pnpm db:push` adds the three new columns:

  pnpm tsx server/scripts/backfill-names.ts

What it does (idempotent — safe to re-run):
  • Selects all users where first_name IS NULL (i.e. pre-migration rows).
  • Splits display_name on whitespace:
      "James Woodhouse" → first="James", last="Woodhouse"
      "Jason"           → first="Jason", last=NULL
  • Sets nickname = display_name. If display_name collides with another
    user's already-assigned nickname (case-insensitive), appends a numeric
    suffix until unique ("Jason" → "Jason1", "Jason2", …).
  • Leaves users with first_name already set untouched.

The script logs each backfill to stdout. After it runs, all existing users
have non-NULL nickname + first_name; only last_name may remain NULL for
single-word display names (you + Jason). Those can be filled in later via
SQL or a settings editor.
*/

import { sql, isNull, eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema/users";

function log(line: string) {
  // eslint-disable-next-line no-console
  console.log(`[backfill] ${line}`);
}

function splitDisplayName(display: string): { firstName: string; lastName: string | null } {
  const trimmed = display.trim();
  if (!trimmed) return { firstName: "User", lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

// Generate a nickname guaranteed not to collide with any existing
// non-NULL nickname (case-insensitive). Tries the candidate as-is first,
// then candidate + "1", "2", … up to candidate + "99" before giving up.
async function uniqueNickname(candidate: string, excludeUserId: string): Promise<string> {
  // Strip anything outside the allowed character set so legacy display
  // names with spaces or punctuation produce a valid nickname.
  const base = candidate.replace(/[^A-Za-z0-9_]/g, "").slice(0, 15) || "Player";

  for (let suffix = 0; suffix < 100; suffix++) {
    const trial = suffix === 0 ? base : `${base}${suffix}`.slice(0, 15);
    const [clash] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        sql`lower(${users.nickname}) = ${trial.toLowerCase()} AND ${users.id} <> ${excludeUserId}`,
      );
    if (!clash) return trial;
  }
  // Fallback — extremely unlikely with three users on a small platform.
  throw new Error(`could not find a unique nickname for candidate '${candidate}'`);
}

async function main() {
  log("starting…");

  const targets = await db.select().from(users).where(isNull(users.firstName));
  if (targets.length === 0) {
    log("nothing to backfill (no users with NULL first_name)");
    return;
  }

  log(`found ${targets.length} user(s) to backfill`);

  for (const u of targets) {
    const { firstName, lastName } = splitDisplayName(u.displayName);
    const nickname = await uniqueNickname(u.displayName, u.id);

    await db
      .update(users)
      .set({
        firstName,
        lastName,
        nickname,
        avatarInitials: nickname.slice(0, 2).toUpperCase(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, u.id));

    log(
      `  ${u.email}: first='${firstName}', last=${lastName === null ? "NULL" : `'${lastName}'`}, nickname='${nickname}'`,
    );
  }

  log(`done — ${targets.length} user(s) updated ✓`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[backfill] failed:", err);
    process.exit(1);
  });
