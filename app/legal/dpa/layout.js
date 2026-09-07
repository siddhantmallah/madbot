import { pageMeta } from "../../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Data Processing Addendum",
  description: "The GDPR Article 28 terms that apply when MADBOT processes personal data for you: sub-processors, international transfers, and how roles map under India's DPDP Act.",
  path: "/legal/dpa",
});

export default function Layout({ children }) {
  return children;
}
