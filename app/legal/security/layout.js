import { pageMeta } from "../../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Security — what is in place, and what is not",
  description: "The security controls MADBOT actually has, and a plain list of the ones it does not have yet. Plus how to report a vulnerability.",
  path: "/legal/security",
});

export default function Layout({ children }) {
  return children;
}
