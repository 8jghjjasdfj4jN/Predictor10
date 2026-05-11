/*
Predictor10 — auth middleware.

`authMiddleware` runs on every request. If a valid session cookie is present
it populates `req.user` and `req.sessionId`. Anonymous requests pass through
untouched — protection is opt-in via `requireAuth`.

A non-blocking middleware here means public marketing endpoints and 401s on
/me both work without conditional wiring elsewhere.
*/

import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema/users";
import { loadSession, SESSION_COOKIE_NAME } from "./sessions";

export type AuthedUser = typeof users.$inferSelect;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      sessionId?: string;
    }
  }
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx < 0) continue;
    const k = part.slice(0, eqIdx).trim();
    if (k === name) return decodeURIComponent(part.slice(eqIdx + 1).trim());
  }
  return null;
}

export function getSessionTokenFromRequest(req: Request): string | null {
  return readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    next();
    return;
  }

  try {
    const session = await loadSession(token);
    if (session) {
      const [user] = await db.select().from(users).where(eq(users.id, session.userId));
      if (user && user.accountStatus === "active") {
        req.user = user;
        req.sessionId = session.id;
      }
    }
  } catch (err) {
    // Never fail a request because session lookup failed. Treat as anonymous.
    console.error("[auth] session load failed:", err);
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}
