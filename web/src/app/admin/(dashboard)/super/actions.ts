"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/admin/session";
import { createAdminUser, deleteAdminUser, changeAdminPassword, setAdminRating, type AdminRatingValue } from "@/lib/admin/admin-user-crud";

export type SuperAdminActionResult = { ok: true } | { ok: false; error: string };

export async function createAdminUserAction(username: string, password: string): Promise<SuperAdminActionResult> {
  const actor = await requireSuperAdmin();
  try {
    await createAdminUser(username, password, actor);
    revalidatePath("/admin/super");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteAdminUserAction(targetUserId: string): Promise<SuperAdminActionResult> {
  const actor = await requireSuperAdmin();
  try {
    await deleteAdminUser(targetUserId, actor);
    revalidatePath("/admin/super");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function changeAdminPasswordAction(targetUserId: string, newPassword: string): Promise<SuperAdminActionResult> {
  const actor = await requireSuperAdmin();
  try {
    await changeAdminPassword(targetUserId, newPassword, actor);
    revalidatePath("/admin/super");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function setAdminRatingAction(targetUserId: string, rating: AdminRatingValue | ""): Promise<SuperAdminActionResult> {
  const actor = await requireSuperAdmin();
  try {
    await setAdminRating(targetUserId, rating === "" ? null : rating, actor);
    revalidatePath("/admin/super");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
