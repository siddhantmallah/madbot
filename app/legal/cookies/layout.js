import { pageMeta } from "../../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Cookie Policy",
  description: "Exactly what MADBOT stores in your browser, why, and how the consent notice changes depending on which country you are in. No analytics and no advertising cookies.",
  path: "/legal/cookies",
});

export default function Layout({ children }) {
  return children;
}
