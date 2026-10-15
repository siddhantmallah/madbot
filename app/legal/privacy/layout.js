import { breadcrumbs, pageMeta } from "../../../lib/seo";

export const metadata = pageMeta({
  title: "Privacy Policy",
  description: "What MADBOT collects, why, the lawful basis, how long it is kept, and your rights under the GDPR, India's DPDP Act, the CPRA and elsewhere.",
  path: "/legal/privacy",
});

// Home › Legal › Privacy Policy in a search result, instead of a bare URL. Every
// crumb is a real page.
const TRAIL = breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Legal", path: "/legal" },
  { name: "Privacy Policy", path: "/legal/privacy" },
]);

export default function Layout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(TRAIL) }} />
      {children}
    </>
  );
}
