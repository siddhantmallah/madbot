import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminFromCookies } from "../../../lib/adminAuth";
import AdminShell from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform console · MADBOT",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Every console page renders through here, and here is where the session,
 * the second factor and the platform role are checked on the server, every
 * time. The proxy only checks that the cookies are present; hiding the
 * console's links from someone is never what keeps them out.
 */
export default async function ConsoleLayout({ children }) {
  const admin = await adminFromCookies(await cookies());
  if (!admin) redirect("/admin/login");
  return (
    <AdminShell admin={{ uid: admin.uid, email: admin.email, roleId: admin.roleId, permissions: admin.permissions }}>{children}</AdminShell>
  );
}
