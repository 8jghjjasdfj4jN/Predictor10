/*
Predictor10 — auth router.

Endpoints:
  POST /api/auth/signup     — create user, set session cookie, return user
  POST /api/auth/login      — verify credentials, set session cookie
  POST /api/auth/logout     — destroy session, clear cookie
  GET  /api/auth/me         — return current user (401 if no session)

Deferred (pre-launch, when Resend is wired):
  POST /api/auth/verify-email
  POST /api/auth/resend-verification
  POST /api/auth/request-password-reset
  POST /api/auth/reset-password
*/

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema/users";
import {
  createSession,
  destroySession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from "../lib/sessions";
import { writeAudit } from "../lib/audit";
import { requireAuth, getSessionTokenFromRequest } from "../lib/auth-middleware";

const router = Router();

// OWASP argon2id recommendation: 19 MiB memory, 2 iterations, parallelism 1.
const ARGON2_OPTS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// Reserved nicknames — case-insensitive. Block impersonation of staff
// roles and the brand. Easy to extend without a migration.
const RESERVED_NICKNAMES = new Set([
  "admin",
  "administrator",
  "moderator",
  "mod",
  "predictor10",
  "predictor",
  "support",
  "system",
  "staff",
  "official",
  "help",
  "you",
]);

// Letters, digits, underscore. 3–15 chars. No spaces, no punctuation, no
// emoji — keeps the league-table column rendering clean and predictable.
const NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,15}$/;

const signupSchema = z.object({
  email: z.string().email("That email doesn't look right.").max(320).trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  firstName: z.string().min(1, "First name is required.").max(40).trim(),
  lastName: z.string().min(1, "Last name is required.").max(40).trim(),
  nickname: z
    .string()
    .trim()
    .regex(
      NICKNAME_PATTERN,
      "Nickname must be 3–15 characters, letters/digits/underscore only.",
    )
    .refine(
      (v) => !RESERVED_NICKNAMES.has(v.toLowerCase()),
      "That nickname is reserved. Please choose another.",
    ),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD."),
  country: z.string().length(2, "Country must be a 2-letter code.").toUpperCase(),
  marketingConsent: z.boolean(),
});

const loginSchema = z.object({
  email: z.string().email().max(320).trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

function ageInYears(dob: string): number {
  const d = new Date(dob + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return -1;
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) years--;
  return years;
}

type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  avatarInitials: string | null;
  emailVerified: boolean;
  countryCode: string;
  marketingConsent: boolean;
  isAdmin: boolean;
  isPaid: boolean;
};

function publicUser(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    firstName: u.firstName,
    lastName: u.lastName,
    nickname: u.nickname,
    avatarInitials: u.avatarInitials,
    emailVerified: u.emailVerifiedAt != null,
    countryCode: u.countryCode,
    marketingConsent: u.marketingConsent,
    isAdmin: u.isAdmin,
    isPaid: u.isPaid,
  };
}

// Precomputed dummy hash for constant-time-ish login: when the email isn't
// found we still verify against this so the response time doesn't leak
// whether an email is registered. Computed lazily on first miss.
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await hash("not-a-real-password", ARGON2_OPTS);
  return dummyHash;
}

router.post("/signup", async (req: Request, res: Response): Promise<void> => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid signup payload." });
    return;
  }
  const { email, password, firstName, lastName, nickname, dateOfBirth, country, marketingConsent } =
    parsed.data;

  if (ageInYears(dateOfBirth) < 18) {
    res.status(400).json({ error: "You must be 18 or over to create an account." });
    return;
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  // Case-insensitive nickname uniqueness. Belt-and-braces — the partial
  // unique index on lower(nickname) will also reject collisions if a race
  // slips through, but the explicit pre-check gives a clean error message.
  const [nicknameClash] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.nickname}) = ${nickname.toLowerCase()}`);
  if (nicknameClash) {
    res.status(409).json({ error: "That nickname is already taken. Please choose another." });
    return;
  }

  const passwordHash = await hash(password, ARGON2_OPTS);
  // display_name kept populated during the migration window — falls back to
  // the chosen nickname so anything still reading it sees a sensible value.
  const displayName = nickname;
  const avatarInitials = nickname.slice(0, 2).toUpperCase();
  const now = new Date();

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      displayName,
      firstName,
      lastName,
      nickname,
      avatarInitials,
      dateOfBirth,
      countryCode: country,
      marketingConsent,
      marketingConsentAt: marketingConsent ? now : null,
    })
    .returning();

  const { token } = await createSession({
    userId: user.id,
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  setSessionCookie(res, token);

  await writeAudit({
    req,
    userId: user.id,
    action: "user.signup",
    entityType: "user",
    entityId: user.id,
  });

  // TODO: dispatch verification email when Resend is wired (pre-launch).
  res.status(201).json({ user: publicUser(user) });
});

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid login payload." });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    // Burn approximately equivalent argon2 time to mask whether the email exists.
    await verify(await getDummyHash(), password).catch(() => false);
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const ok = await verify(user.passwordHash, password).catch(() => false);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (user.accountStatus !== "active") {
    res.status(403).json({ error: "This account is not active." });
    return;
  }

  const { token } = await createSession({
    userId: user.id,
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  setSessionCookie(res, token);

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), lastLoginIp: req.ip ?? null })
    .where(eq(users.id, user.id));

  await writeAudit({
    req,
    userId: user.id,
    action: "user.login",
    entityType: "user",
    entityId: user.id,
  });

  res.json({ user: publicUser(user) });
});

router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  const token = getSessionTokenFromRequest(req);
  if (token) {
    await destroySession(token).catch((err) => console.error("[auth] logout destroy failed:", err));
  }
  clearSessionCookie(res);

  if (req.user) {
    await writeAudit({
      req,
      userId: req.user.id,
      action: "user.logout",
      entityType: "user",
      entityId: req.user.id,
    });
  }

  res.json({ ok: true });
});

router.get("/me", requireAuth, (req: Request, res: Response): void => {
  res.json({ user: publicUser(req.user!) });
});

export default router;
