import { pageMeta } from "../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Pricing — pay for the work, not the seats",
  description: "Every MADBOT plan includes the whole engine; what changes is how much of it runs each month. Priced in rupees, dollars, euros, pounds, dirhams and Singapore dollars.",
  path: "/pricing",
});

export default function Layout({ children }) {
  return children;
}
