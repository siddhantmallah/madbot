import { useEffect, useId, useRef, useState } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What every dashboard modal needs and most of them lacked: a name screen
 * readers announce, Escape to close, Tab kept inside the dialog, and focus put
 * back on whatever opened it once it closes.
 *
 * Spread `dialogProps` on the element that covers the screen and give the
 * dialog's heading `id={titleId}`. The element gets tabIndex -1 so a click on
 * its blank space keeps focus inside, where Escape and Tab still work.
 *
 * `canClose` is false while closing would abandon work half done (a save in
 * flight). Escape does nothing then, the same as the disabled Cancel button.
 */
export function useModalDialog({ onClose, canClose = true }) {
  const ref = useRef(null);
  const titleId = useId();
  // Read on the first render, before an autoFocus field inside the dialog
  // takes focus, so this is the control that opened it.
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));

  useEffect(() => {
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) {
      (box.querySelector(FOCUSABLE) || box).focus();
    }
    return () => {
      // The opener can be gone by now (a "Connect" button that disappears once
      // connected), and focusing a detached node does nothing useful.
      if (opener?.isConnected && typeof opener.focus === "function") opener.focus();
    };
  }, [opener]);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (canClose) onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll(FOCUSABLE)];
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !ref.current.contains(active);
    // Focus can also sit on something Tab skips, like a heading moved to with
    // tabIndex -1 or the dialog itself. Anything before the first control
    // wraps backwards, anything after the last wraps forwards.
    const precedes = (a, b) => !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING);
    if (e.shiftKey && (outside || active === first || precedes(active, first))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (outside || active === last || precedes(last, active))) {
      e.preventDefault();
      first.focus();
    }
  }

  return {
    titleId,
    dialogProps: { ref, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabIndex: -1, onKeyDown },
  };
}
