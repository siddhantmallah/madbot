import { pageMeta } from "../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Sign in or create an account",
  description: "Sign in to MADBOT, or create an account and connect your first website.",
  path: "/login",
  noindex: true,
});

export default function Layout({ children }) {
  return children;
}
