import { breadcrumbs, pageMeta } from "../../../lib/seo";

export const metadata = pageMeta({
  title: "Refunds and Cancellation",
  description: "How to cancel, what is refundable and what is not, the timelines we commit to, and the statutory rights consumers keep in India, the EU and the UK.",
  path: "/legal/refunds",
});

// Home › Legal › Refunds and Cancellation in a search result, instead of a bare URL. Every
// crumb is a real page.
const TRAIL = breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Legal", path: "/legal" },
  { name: "Refunds and Cancellation", path: "/legal/refunds" },
]);

export default function Layout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(TRAIL) }} />
      {children}
    </>
  );
}
