// The dashboard is the product behind sign-in: no search value, and it used to
// serve the homepage's title and a self-canonical, so a search engine that
// found the URL could index it as a copy of the homepage. A layout, because
// the page is a client component and can't export metadata.
export const metadata = {
  title: "Dashboard · MADBOT",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function DashboardLayout({ children }) {
  return children;
}
