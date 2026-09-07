import { pageMeta } from "../../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Terms of Service",
  description: "The contract between you and Mallah Software Services Private Limited: what MADBOT does, what it will never do without you, and where you stand if something goes wrong.",
  path: "/legal/terms",
});

export default function Layout({ children }) {
  return children;
}
