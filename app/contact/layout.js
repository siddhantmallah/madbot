import { pageMeta } from "../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Contact — support, privacy and security",
  description: "One route per kind of question: support, privacy and data requests, security reports, legal, and the grievance officer for India.",
  path: "/contact",
});

export default function Layout({ children }) {
  return children;
}
