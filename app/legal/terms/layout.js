import { breadcrumbs, pageMeta } from "../../../lib/seo";

export const metadata = pageMeta({
  title: "Terms of Service",
  description: "The contract between you and Mallah Software Services Private Limited: what MADBOT does, what it never does without you, and where you stand.",
  path: "/legal/terms",
});

// Home › Legal › Terms of Service in a search result, instead of a bare URL. Every
// crumb is a real page.
const TRAIL = breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Legal", path: "/legal" },
  { name: "Terms of Service", path: "/legal/terms" },
]);

export default function Layout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(TRAIL) }} />
      {children}
    </>
  );
}
