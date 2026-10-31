// A single-resource route (id in the path), alongside the collection route at
// /api/admin/products (GET all / POST create / PATCH bulk-update) — same auth pattern as that
// file (session-cookie, re-checked here since a route handler sits outside the (dashboard)
// layout's own auth redirect).
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/admin/session";
import { archiveProduct } from "@/lib/admin/product-crud";

// DELETE /api/admin/products/[id] — products are archived, never hard-deleted. A real delete
// changes status to archived and redirects the product URL rather than removing the row.
// Idempotent: deleting an already-archived product succeeds again rather than erroring.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const product = await archiveProduct(id, actor);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  return NextResponse.json({ product: { id: product.id, slug: product.slug, status: product.status } });
}
