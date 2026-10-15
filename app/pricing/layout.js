import { pageMeta } from "../../lib/seo";

// A layout, not the page: the page is a client component and a client
// component cannot export metadata. See lib/seo.js.
export const metadata = pageMeta({
  title: "Pricing — pay for the work, not the seats",
  description: "Every MADBOT plan includes the whole engine; plans differ in how much of it runs each month. Priced in INR, USD, EUR, GBP, AED and SGD.",
  path: "/pricing",
});

export default function Layout({ children }) {
  return children;
}
