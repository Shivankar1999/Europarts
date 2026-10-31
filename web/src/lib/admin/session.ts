// Admin session management: one AdminSession row per login (see prisma/schema.prisma), a
// signed httpOnly cookie holding just its id. The session id itself is a random UUID (128 bits
// of entropy — not realistically guessable), so the HMAC signature here is defense-in-depth
// against a future change weakening that, not the primary protection; every session is also
// checked against the database and its expiry on every request, so a signed-but-revoked cookie
// (deleted row) is rejected regardless of signature validity.
//
// 2026-09-28: sessions now belong to a specific AdminUser (multiple admin accounts — see that
// model's own schema comment), not an anonymous "someone is logged in" flag. createSession()
// takes a userId; getCurrentUser() resolves who's actually signed in, for the header's account
// menu and anything future that needs to know which admin did something.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/admin/db";

const COOKIE_NAME = "emp_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET is missing or too short — set a real 64-hex-char value in .env");
  }
  return secret;
}

function sign(sessionId: string): string {
  const mac = createHmac("sha256", getSecret()).update(sessionId).digest("hex");
  return `${sessionId}.${mac}`;
}

function verify(cookieValue: string): string | null {
  const [sessionId, mac] = cookieValue.split(".");
  if (!sessionId || !mac) return null;
  const expectedMac = createHmac("sha256", getSecret()).update(sessionId).digest("hex");
  const macBuf = Buffer.from(mac, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");
  if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) return null;
  return sessionId;
}

export async function createSession(userId: string): Promise<void> {
  const session = await prisma.adminSession.create({
    data: { userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  const store = await cookies();
  store.set(COOKIE_NAME, sign(session.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

// Shared by hasValidSession()/getCurrentUser()/requireUser() below so the cookie-verify +
// DB-lookup + expiry dance lives in exactly one place. Also does the expired-session cleanup,
// same as before — this remains the one place session lifetime is actually enforced.
async function getCurrentSession(): Promise<{ id: string; userId: string; username: string; role: "admin" | "super_admin" } | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const sessionId = verify(raw);
  if (!sessionId) return null;

  const session = await prisma.adminSession.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.adminSession.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }
  return { id: session.id, userId: session.userId, username: session.user.username, role: session.user.role };
}

export async function hasValidSession(): Promise<boolean> {
  return (await getCurrentSession()) !== null;
}

// Who's actually signed in — used by the dashboard header's account menu and /admin/super's own
// role gate. Returns null rather than throwing when there's no valid session, same as
// hasValidSession(); callers that require a session should still gate on
// hasValidSession()/requireUser()/the layout's own redirect first.
export async function getCurrentUser(): Promise<{ id: string; username: string; role: "admin" | "super_admin" } | null> {
  const session = await getCurrentSession();
  return session ? { id: session.userId, username: session.username, role: session.role } : null;
}

// The one shared "am I logged in, and who am I" check every Server Action / route handler mutation
// uses now — added alongside the audit log (2026-09-28) specifically so every write site gets both
// its auth check and the actor to log against from a single call, rather than a separate
// hasValidSession() plus a second lookup for who to attribute the change to. Throws (callers were
// already written to expect a throw from their own local requireSession() helpers, before this
// replaced them) rather than returning null, so a caller can destructure the result directly
// without an extra null check on every single mutation.
export async function requireUser(): Promise<{ id: string; username: string; role: "admin" | "super_admin" }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

// Same as requireUser(), plus the role check — for the admin-account-management actions
// (delete/change-password/rate another admin) that only make sense for a super_admin. Throws a
// distinct message from "Not authenticated" so a regular admin somehow reaching one of these
// (the page itself already redirects them away, but Server Actions are callable directly — same
// reasoning as every other requireUser() call site) gets an accurate error, not a misleading
// "you're not logged in" when they actually are, just not privileged enough.
export async function requireSuperAdmin(): Promise<{ id: string; username: string; role: "super_admin" }> {
  const user = await requireUser();
  if (user.role !== "super_admin") throw new Error("Super admin access required");
  return { id: user.id, username: user.username, role: user.role };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const sessionId = raw ? verify(raw) : null;
  if (sessionId) {
    await prisma.adminSession.delete({ where: { id: sessionId } }).catch(() => {});
  }
  store.delete(COOKIE_NAME);
}

// Best-effort cleanup of expired sessions — called from the login route rather than a cron job,
// since this dashboard has no background-job infrastructure and login is frequent enough to
// keep the table from growing unbounded in practice.
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
