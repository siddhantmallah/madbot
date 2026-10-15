import { breadcrumbs, pageMeta } from "../../../lib/seo";

export const metadata = pageMeta({
  title: "Acceptable Use Policy",
  description: "What you may and may not do with MADBOT: which sites you can connect, the rules on outreach and lead data, and what happens if the policy is breached.",
  path: "/legal/acceptable-use",
});

// Home › Legal › Acceptable Use Policy in a search result, instead of a bare URL. Every
// crumb is a real page.
const TRAIL = breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Legal", path: "/legal" },
  { name: "Acceptable Use Policy", path: "/legal/acceptable-use" },
]);

export default function Layout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(TRAIL) }} />
      {children}
    </>
  );
}
