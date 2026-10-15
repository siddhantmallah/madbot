import { breadcrumbs, pageMeta } from "../../../lib/seo";

export const metadata = pageMeta({
  title: "Security — what is in place, and what is not",
  description: "The security controls MADBOT actually has, and a plain list of the ones it does not have yet. Plus how to report a vulnerability.",
  path: "/legal/security",
});

// Home › Legal › Security — what is in place, and what is not in a search result, instead of a bare URL. Every
// crumb is a real page.
const TRAIL = breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Legal", path: "/legal" },
  { name: "Security — what is in place, and what is not", path: "/legal/security" },
]);

export default function Layout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(TRAIL) }} />
      {children}
    </>
  );
}
