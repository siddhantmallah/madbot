import Link from "next/link";
import { platformSettings } from "../../lib/platform";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Down for maintenance · MADBOT",
  robots: { index: false, follow: false },
};

/**
 * What the dashboard shows while maintenance mode is on (set in /admin). The
 * proxy rewrites /dashboard here; nothing in the product runs meanwhile, and
 * the API refuses work with the same message, so nothing is charged.
 */
export default async function MaintenancePage() {
  const { maintenance } = await platformSettings();
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="card" style={{ maxWidth: 480, padding: 28, gap: 12 }}>
        <span className="card-kicker">Maintenance</span>
        <h1 style={{ margin: 0, fontSize: 26 }}>MADBOT is down for maintenance</h1>
        <p style={{ margin: 0, lineHeight: 1.6, color: "var(--fg-80)" }}>
          {maintenance?.message || "We're doing some work behind the scenes. Nothing is running and nothing is being charged. Try again shortly."}
        </p>
        <Link href="/" style={{ fontSize: 14 }}>
          Back to the homepage
        </Link>
      </div>
    </main>
  );
}
