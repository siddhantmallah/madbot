import { pageMeta } from "../../lib/seo";

export const metadata = pageMeta({
  title: "Policies and legal documents",
  description: "Every policy that applies to MADBOT customers: terms, privacy, cookies, refunds, acceptable use, the data processing addendum, sub-processors and security.",
  path: "/legal",
});

export default function Layout({ children }) {
  return children;
}
