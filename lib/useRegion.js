"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULT_REGION, REGIONS } from "./plans";

const KEY = "madbot-region";

// The stored choice, or null when there is none (or storage is blocked).
function readStored() {
  try {
    const stored = localStorage.getItem(KEY);
    return stored && REGIONS[stored] ? stored : null;
  } catch {
    // Private window; detection still applies for this visit.
    return null;
  }
}

// Nothing outside this hook writes the key during a page view, so there is
// nothing to subscribe to; the store is read on each render.
const subscribe = () => () => {};
// undefined on the server and during hydration: "not read yet", which keeps
// the price hidden rather than rendering one currency and swapping it.
const serverStored = () => undefined;

/**
 * Which price list to show.
 *
 * A stored choice always wins: geolocation is a guess, and someone travelling,
 * on a VPN, or paying from a different country than they sit in should be able
 * to say so once and be believed.
 *
 * Returns `pending` until detection resolves so the page can avoid flashing the
 * wrong currency — showing $79 and then swapping it to ₹3,999 reads as a
 * pricing trick even when it isn't.
 */
export function useRegion() {
  const stored = useSyncExternalStore(subscribe, readStored, serverStored);
  // What /api/region said, once it has answered.
  const [fetched, setFetched] = useState(null);
  // A choice made on this page view. Kept in state as well as storage so it
  // still applies when storage is blocked, and stamped with the `detected`
  // value from before the choice, which a manual pick doesn't change.
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    // Only ask the network when the browser has been read and holds nothing.
    if (stored !== null) return undefined;
    let alive = true;
    fetch("/api/region")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const r = REGIONS[d.region] ? d.region : DEFAULT_REGION;
        setFetched({ region: r, detected: d.detected ? r : null });
      })
      .catch(() => {
        if (alive) setFetched({ region: DEFAULT_REGION, detected: null });
      });
    return () => {
      alive = false;
    };
  }, [stored]);

  const region = picked?.region || stored || fetched?.region || null;
  const detected = picked ? picked.detected : stored || fetched?.detected || null;

  function choose(next) {
    if (!REGIONS[next]) return;
    setPicked({ region: next, detected });
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Choice applies to this page view only.
    }
  }

  return { region: region || DEFAULT_REGION, pending: region === null, detected, choose };
}
