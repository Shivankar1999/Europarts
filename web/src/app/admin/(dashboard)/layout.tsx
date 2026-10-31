import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/admin/session";
import { getPendingChangeCount } from "@/lib/admin/publish";
import { logout } from "@/app/admin/(dashboard)/actions";
import { ToastViewport } from "@/components/ui/ToastViewport";

// The only auth gate for dashboard pages. Server-side redirect prevents protected content from
// rendering before the session check; /admin/login sits outside this layout so it stays reachable.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");

  const pendingChanges = await getPendingChangeCount();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-semibold text-slate-900">
              Catalogue dashboard
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/admin" className="hover:text-slate-900">Products</Link>
              <Link href="/admin/categories" className="hover:text-slate-900">Categories</Link>
              <Link href="/admin/brands" className="hover:text-slate-900">Brands</Link>
              <Link href="/admin/quality" className="hover:text-slate-900">Quality</Link>
              {user.role === "super_admin" && (
                <Link href="/admin/super" className="hover:text-slate-900">
                  Super Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/publish"
              className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              {pendingChanges > 0 ? `Pending changes (${pendingChanges})` : "Up to date"}
            </Link>
            <div className="group relative">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:border-slate-300 hover:text-slate-900"
              >
                <UserRound className="h-4 w-4" />
                {user.username}
              </button>
              <div className="invisible absolute right-0 top-full z-10 w-36 pt-1 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <form action={logout}>
                    <button
                      type="submit"
                      className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      <ToastViewport />
    </div>
  );
}
