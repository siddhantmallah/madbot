import { breadcrumbs, pageMeta } from "../../../lib/seo";

export const metadata = pageMeta({
  title: "Cookie Policy",
  description: "Exactly what MADBOT stores in your browser, why, and how the consent notice changes by country. No analytics and no advertising cookies.",
  path: "/legal/cookies",
});

// Home › Legal › Cookie Policy in a search result, instead of a bare URL. Every
// crumb is a real page.
const TRAIL = breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Legal", path: "/legal" },
  { name: "Cookie Policy", path: "/legal/cookies" },
]);

export default function Layout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(TRAIL) }} />
      {children}
    </>
  );
}
