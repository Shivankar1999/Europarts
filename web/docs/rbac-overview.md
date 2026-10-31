# Admin RBAC: browser to database

This showcase follows the existing access-control path in the Europarts `web/` application. It has two roles with an intentionally small permission boundary:

| Capability | `admin` | `super_admin` |
|---|---:|---:|
| Manage the product catalogue | Yes | Yes |
| View admin accounts and activity | No | Yes |
| Create, update, or remove admin accounts | No | Yes |

`super_admin` is an oversight role, not a second catalogue-permission tier.

## Request and authorization flow

1. **Browser/UI:** the dashboard layout resolves the signed-in user and displays the Super Admin link only for `super_admin`. This is presentation logic only; hiding a link is not an access boundary.
2. **Protected page:** `/admin/super` checks the current user's role on the server and redirects regular admins away.
3. **Mutation boundary:** every server action for admin-account management calls `requireSuperAdmin()` before invoking service code. This protects direct action calls that bypass navigation and page rendering.
4. **HTTP routes:** each API handler independently resolves the session and returns `401` when absent; the dashboard layout does not protect route handlers. Catalogue operations use the same session for both roles.
5. **Service/data layer:** account CRUD receives the authenticated actor, validates inputs, writes through Prisma, and records audit events. The database enum stores `admin` or `super_admin`; new accounts default to the lower-privilege `admin` role.
6. **Session integrity:** the browser cookie contains a signed opaque session id, not a client-controlled role. Each request looks up the session and user in the database, so role changes are read from current persisted state.

## Code map

- `web/src/app/admin/(dashboard)/layout.tsx` — authenticated dashboard and role-aware navigation.
- `web/src/app/admin/(dashboard)/super/page.tsx` — server-side page-level role gate.
- `web/src/app/admin/(dashboard)/super/actions.ts` — server-action authorization boundary.
- `web/src/app/api/admin/products/route.ts` — per-handler session checks and catalogue API.
- `web/src/lib/admin/session.ts` — signed cookie, database-backed sessions, reusable role guards.
- `web/src/lib/admin/admin-user-crud.ts` — validated account writes and audit logging.
- `web/prisma/schema.prisma` — persisted role and session relations.

## Validation

The source app's production build was verified with `npm run build`. The showcase is a selected source excerpt, not a standalone application: it intentionally excludes storefront/catalogue data, environment files, local databases, dependency output, and generated build artifacts.
