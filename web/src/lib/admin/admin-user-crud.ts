// Admin-account management actions available from /admin/super itself, not just the terminal
// script (manage-admin-users.mjs) — split out the same way every other entity's CRUD is (plain
// functions here, "use server" wrappers in the page's own actions.ts). Every function here
// assumes its caller has already verified the actor is a super_admin (requireSuperAdmin(),
// session.ts) — these don't re-check on their own, same trust boundary as saveProduct() etc.
// trusting their own callers' auth checks.
import { prisma } from "@/lib/admin/db";
import { hashPassword } from "@/lib/admin/password";
import { logAudit, type AuditActor } from "@/lib/admin/audit-log";

export type AdminRatingValue = "low" | "average" | "good" | "outstanding";

// 2026-09-28: account *creation* moves into the portal too — previously terminal-only
// (manage-admin-users.mjs add), on the reasoning that a password shouldn't have to pass through
// the browser to get created. That line was already crossed by changeAdminPassword() above in
// the very same round of work (a super_admin resetting someone else's password *is* a password
// flowing through this form) — creating one here is no different in kind, so keeping creation
// CLI-only after that stopped being a meaningfully separate security boundary, just an
// inconsistent one. Always creates a plain `admin` (never `super_admin` — promoting to
// super_admin is still deliberately terminal-only, via set-role, a separate and more
// consequential action than "add a normal account").
export async function createAdminUser(username: string, password: string, actor: AuditActor) {
  const trimmed = username.trim();
  if (!trimmed) throw new Error("Username is required");
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) throw new Error("Username can only contain letters, numbers, and . _ -");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const existing = await prisma.adminUser.findUnique({ where: { username: trimmed }, select: { id: true } });
  if (existing) throw new Error(`"${trimmed}" already exists`);

  const user = await prisma.adminUser.create({ data: { username: trimmed, passwordHash: hashPassword(password) } });
  await logAudit(actor, "create", "AdminUser", user.id, `Created admin account "${user.username}"`);
  return user;
}

// Deleting yourself isn't blocked at the database level (nothing stops it structurally), but is
// blocked here deliberately: it's a real footgun (an accidental self-click immediately signs you
// out, and if you're the only super_admin, strands the account with nobody able to reach
// /admin/super to fix it). The terminal script remains available for the rare case someone
// genuinely needs to remove their own account.
export async function deleteAdminUser(targetUserId: string, actor: AuditActor) {
  if (targetUserId === actor.id) {
    throw new Error("You can't delete your own account from here — use the terminal script if you really need to.");
  }
  const target = await prisma.adminUser.findUnique({ where: { id: targetUserId }, select: { username: true } });
  if (!target) throw new Error("Admin account not found");

  await prisma.adminUser.delete({ where: { id: targetUserId } }); // cascades their sessions (onDelete: Cascade)
  await logAudit(actor, "delete", "AdminUser", targetUserId, `Deleted admin account "${target.username}"`);
}

// Deliberately no "confirm current password" step — this is a super_admin resetting *someone
// else's* password (or their own, nothing stops that), the same trust level the terminal script's
// own set-password command already has. The summary logged never includes the password itself,
// only that a change happened.
export async function changeAdminPassword(targetUserId: string, newPassword: string, actor: AuditActor) {
  const target = await prisma.adminUser.findUnique({ where: { id: targetUserId }, select: { username: true } });
  if (!target) throw new Error("Admin account not found");
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters");

  await prisma.adminUser.update({ where: { id: targetUserId }, data: { passwordHash: hashPassword(newPassword) } });
  await logAudit(actor, "update", "AdminUser", targetUserId, `Changed password for admin account "${target.username}"`);
}

// The rated admin never sees this — see AdminRating's own schema comment. `rating: null` clears
// it back to "not yet rated" rather than being a fifth real value.
export async function setAdminRating(targetUserId: string, rating: AdminRatingValue | null, actor: AuditActor) {
  const target = await prisma.adminUser.update({ where: { id: targetUserId }, data: { rating }, select: { username: true } });
  await logAudit(actor, "update", "AdminUser", targetUserId, `Rated "${target.username}"'s work: ${rating ?? "(cleared)"}`);
}
