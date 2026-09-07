import { pageMeta } from "../../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Sub-processors",
  description: "Every third party that processes data for MADBOT, what each one does, where it processes, and whether it applies to every customer or only if you connect it.",
  path: "/legal/subprocessors",
});

export default function Layout({ children }) {
  return children;
}
