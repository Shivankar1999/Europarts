import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/admin/session";
import { prisma } from "@/lib/admin/db";
import { AdminAccountsTable } from "@/components/admin/AdminAccountsTable";
import { CreateAdminUserForm } from "@/components/admin/CreateAdminUserForm";
import { AuditLogFilter } from "@/components/admin/AuditLogFilter";

const PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

// A server-side role gate: direct URL access by a regular admin redirects before privileged data is read.
export default async function SuperAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "super_admin") redirect("/admin");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const adminFilter = typeof params.admin === "string" && params.admin !== "" ? params.admin : undefined;

  const [usersRaw, auditedUsernames, totalLogs, logs] = await Promise.all([
    prisma.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, role: true, rating: true, createdAt: true, _count: { select: { sessions: true } } },
    }),
    prisma.auditLog.findMany({ distinct: ["username"], select: { username: true }, orderBy: { username: "asc" } }),
    prisma.auditLog.count({ where: adminFilter ? { username: adminFilter } : undefined }),
    prisma.auditLog.findMany({
      where: adminFilter ? { username: adminFilter } : undefined,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const users = usersRaw.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    rating: u.rating,
    sessionCount: u._count.sessions,
    createdAt: u.createdAt.toLocaleDateString(),
  }));

  const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Super Admin</h1>
        <p className="text-sm text-slate-500">Every admin account, and everything any of them has changed.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
          Admin accounts ({users.length})
        </h2>
        <div className="border-b border-slate-100 px-5 py-3">
          <CreateAdminUserForm />
        </div>
        <AdminAccountsTable users={users} currentUserId={user.id} />
        <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
          New accounts start as a plain admin. Promoting someone to super_admin is still
          terminal-only — <code className="rounded bg-slate-100 px-1 py-0.5">scripts/manage-admin-users.mjs set-role</code>.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Activity log ({totalLogs} total{totalPages > 1 ? ` — page ${page} of ${totalPages}` : ""})
          </h2>
          <AuditLogFilter admins={auditedUsernames.map((u) => u.username)} />
        </div>
        {logs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">
            {adminFilter ? `No activity recorded for "${adminFilter}".` : "No activity recorded yet."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">When</th>
                <th className="px-5 py-2 font-medium">Who</th>
                <th className="px-5 py-2 font-medium">Action</th>
                <th className="px-5 py-2 font-medium">What happened</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-50 align-top last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{entry.createdAt.toLocaleString()}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-900">{entry.username}</td>
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {entry.action} · {entry.entityType}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-slate-700">{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
            <a
              href={`/admin/super?${new URLSearchParams({ ...(adminFilter ? { admin: adminFilter } : {}), page: String(page - 1) })}`}
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none text-slate-300" : "text-slate-600 hover:text-slate-900"}
            >
              ← Newer
            </a>
            <a
              href={`/admin/super?${new URLSearchParams({ ...(adminFilter ? { admin: adminFilter } : {}), page: String(page + 1) })}`}
              aria-disabled={page >= totalPages}
              className={page >= totalPages ? "pointer-events-none text-slate-300" : "text-slate-600 hover:text-slate-900"}
            >
              Older →
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
