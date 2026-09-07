import { pageMeta } from "../../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Acceptable Use Policy",
  description: "What you may and may not do with MADBOT: which sites you can connect, the rules on outreach and lead data, and what happens if the policy is breached.",
  path: "/legal/acceptable-use",
});

export default function Layout({ children }) {
  return children;
}
