"use client";

import { useEffect, useState } from "react";
import { DEFAULT_REGION, REGIONS } from "./plans";

const KEY = "madbot-region";

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
  const [region, setRegion] = useState(null);
  const [detected, setDetected] = useState(null);

  useEffect(() => {
    let stored = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      // Private window; detection still applies for this visit.
    }
    if (stored && REGIONS[stored]) {
      setRegion(stored);
      setDetected(stored);
      return;
    }

    let alive = true;
    fetch("/api/region")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const r = REGIONS[d.region] ? d.region : DEFAULT_REGION;
        setRegion(r);
        setDetected(d.detected ? r : null);
      })
      .catch(() => {
        if (alive) setRegion(DEFAULT_REGION);
      });
    return () => {
      alive = false;
    };
  }, []);

  function choose(next) {
    if (!REGIONS[next]) return;
    setRegion(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Choice applies to this page view only.
    }
  }

  return { region: region || DEFAULT_REGION, pending: region === null, detected, choose };
}
