import { pageMeta } from "../../lib/seo";

export const metadata = pageMeta({
  title: "Contact — support, privacy and security",
  description: "One route per kind of question: support, privacy and data requests, security reports, legal, and the grievance officer for India.",
  path: "/contact",
});

export default function Layout({ children }) {
  return children;
}
