import { breadcrumbs, pageMeta } from "../../../lib/seo";

export const metadata = pageMeta({
  title: "Sub-processors",
  description: "Every third party that processes data for MADBOT: what each does, where, and whether it applies to every customer or only if you connect it.",
  path: "/legal/subprocessors",
});

// Home › Legal › Sub-processors in a search result, instead of a bare URL. Every
// crumb is a real page.
const TRAIL = breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Legal", path: "/legal" },
  { name: "Sub-processors", path: "/legal/subprocessors" },
]);

export default function Layout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(TRAIL) }} />
      {children}
    </>
  );
}
