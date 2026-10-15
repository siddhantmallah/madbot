// Account action links (email confirmation). One-time codes in the URL, no
// search value.
export const metadata = {
  title: "Your account · MADBOT",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function AuthLayout({ children }) {
  return children;
}
