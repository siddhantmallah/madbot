import { breadcrumbs, pageMeta } from "../../../lib/seo";

export const metadata = pageMeta({
  title: "Data Processing Addendum",
  description: "The GDPR Article 28 terms for when MADBOT processes personal data for you: sub-processors, international transfers, and roles under India's DPDP Act.",
  path: "/legal/dpa",
});

// Home › Legal › Data Processing Addendum in a search result, instead of a bare URL. Every
// crumb is a real page.
const TRAIL = breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Legal", path: "/legal" },
  { name: "Data Processing Addendum", path: "/legal/dpa" },
]);

export default function Layout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(TRAIL) }} />
      {children}
    </>
  );
}
