"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { CATEGORIES, allows } from "../../lib/consent";
import { ADSENSE_CLIENT } from "../../lib/adsense";

/**
 * Loads Google AdSense, but only once the visitor's advertising consent allows
 * it.
 *
 * The tag Google gives you is an unconditional `<script async>` in the head.
 * Dropped in as-is that is unlawful in the EEA and the UK, where the ePrivacy
 * Directive puts consent on the storage itself: the script sets Google's own
 * cookies the moment it runs, so by the time a banner appears the thing the
 * banner is asking about has already happened.
 *
 * So it runs through `allows()`, the same gate every non-essential script has
 * to pass. That has a real consequence worth being clear about: where the law
 * is opt-in, no ad loads until somebody says yes, and plenty of people will
 * not. That is the trade, and it is not one this component can dodge.
 *
 * Refusing means the file is never requested at all, rather than requested and
 * asked to behave. Nothing is loaded and then disabled.
 *
 * One thing this does NOT do, and cannot: Google's EU user consent policy
 * requires a Google-certified consent management platform to serve ads to
 * EEA and UK visitors. This gate is honest and enforced, but it is not on
 * Google's certified list, so Google may restrict or refuse EEA ad serving
 * regardless of what a visitor here agrees to. See DEPLOY.md.
 */
export default function AdSense() {
  const [permitted, setPermitted] = useState(false);

  useEffect(() => {
    const read = () => setPermitted(allows(CATEGORIES.MARKETING));
    read();
    // The banner fires this when an answer is saved, so allowing advertising
    // loads the script there and then rather than on the next navigation.
    window.addEventListener("madbot:consent", read);
    return () => window.removeEventListener("madbot:consent", read);
  }, []);

  if (!permitted) return null;

  return (
    <Script
      id="google-adsense"
      strategy="afterInteractive"
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
    />
  );
}
