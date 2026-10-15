import { COMPANY } from "../lib/company";

/**
 * /manifest.webmanifest: what a browser shows when someone adds MADBOT to a
 * home screen or installs it, and the colour of the browser chrome around it.
 * It was a 404.
 *
 * Not an offline app: there is no service worker, so display is "browser",
 * not "standalone", rather than promising an app experience it doesn't have.
 * The icons are the white mark on the brand ground, with a margin wide enough
 * for Android's circular mask, so the same file serves "any" and "maskable".
 */
export default function manifest() {
  return {
    name: COMPANY.product,
    short_name: COMPANY.product,
    description: "Autonomous website marketing. You keep a dial and a veto.",
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: "#0A0810",
    theme_color: "#0A0810",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
