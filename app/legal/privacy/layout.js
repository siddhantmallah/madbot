import { pageMeta } from "../../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Privacy Policy",
  description: "What MADBOT collects, why, the lawful basis for each, how long it is kept, and how to exercise your rights under the GDPR, India's DPDP Act, the CPRA and elsewhere.",
  path: "/legal/privacy",
});

export default function Layout({ children }) {
  return children;
}
