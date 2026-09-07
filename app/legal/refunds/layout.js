import { pageMeta } from "../../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Refunds and Cancellation",
  description: "How to cancel, what is refundable and what is not, the timelines we commit to, and the statutory rights consumers keep in India, the EU and the UK.",
  path: "/legal/refunds",
});

export default function Layout({ children }) {
  return children;
}
