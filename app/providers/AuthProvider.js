"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider, githubProvider } from "../../lib/firebase";
import { MIN_LENGTH, isAcceptable } from "../../lib/password";
import { requestGoogleToken } from "../../lib/googleToken";

const AuthContext = createContext(null);

// Remembers, per browser, that an account's trial question is answered for
// good (started, or already on a subscription), so opening the app doesn't
// ask the server again on every load. Storage can be missing or blocked; then
// it just asks.
const settledKey = (uid) => `madbot:trial-settled:${uid}`;
function trialSettled(uid) {
  try {
    return localStorage.getItem(settledKey(uid)) === "1";
  } catch {
    return false;
  }
}
function markTrialSettled(uid) {
  try {
    localStorage.setItem(settledKey(uid), "1");
  } catch {
    // Not remembered; the next load asks again, which is harmless.
  }
}

async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);

  // createdAt was being rewritten with a fresh server timestamp on every
  // sign-in, so the field said "created" and meant "last seen". One read to
  // find out whether the document is new is cheap, and it costs a sign-in
  // nothing anyone would notice.
  let isNew = true;
  try {
    isNew = !(await getDoc(ref)).exists();
  } catch {
    // If the read fails, fall back to writing it: a slightly wrong createdAt
    // is better than a profile that never gets saved.
  }

  // These four are the only fields the browser is allowed to write. The rules
  // enforce that as an allowlist, so adding one here means adding it there.
  await setDoc(
    ref,
    {
      email: user.email || null,
      displayName: user.displayName || null,
      updatedAt: serverTimestamp(),
      ...(isNew ? { createdAt: serverTimestamp() } : {}),
    },
    { merge: true }
  );
}

/**
 * A password the client refuses before Firebase ever sees it.
 *
 * Firebase's own floor is six characters, which is not a password policy. The
 * real rules live in lib/password.js so the checklist the person sees while
 * typing and the check that blocks submission are the same code.
 *
 * This is a usability guard, not a security boundary: anyone can call the
 * Firebase SDK directly. The boundary is Firebase's own hashing and rate
 * limiting. Worth being clear about which is which.
 */
function assertUsablePassword(password, context) {
  if (!isAcceptable(password, context)) {
    const err = new Error(
      `That password is too easy to guess. Use at least ${MIN_LENGTH} characters, avoid common words, and don't reuse your name or email.`
    );
    err.code = "madbot/weak-password";
    throw err;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  // What the server said about this account's trial, so the dashboard can
  // explain being on the free tier rather than leaving it a mystery.
  const [trialStatus, setTrialStatus] = useState(null);
  const lastTrialCheck = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  /**
   * Starts the free trial if this person hasn't had one.
   *
   * Runs after every sign-in, not just signup: the server refuses a second
   * trial, so calling it repeatedly is harmless, and it also repairs accounts
   * created before trials existed and picks up a freshly verified address.
   *
   * A failure here must never block sign-in. The worst case is landing on the
   * free tier, which the dashboard states plainly.
   */
  const ensureTrial = useCallback(async (u, intendedPlan) => {
    try {
      const idToken = await u.getIdToken();
      const res = await fetch("/api/billing/start-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, intendedPlan: intendedPlan || null }),
      });
      const data = await res.json().catch(() => null);
      if (data) setTrialStatus(data);
      if (data?.started || data?.reason === "already-subscribed") markTrialSettled(u.uid);
      return data;
    } catch {
      return null;
    }
  }, []);

  /** Sends (or resends) the confirm-your-address email. */
  const sendVerification = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) throw new Error("Sign in first.");
    const idToken = await current.getIdToken();
    const res = await fetch("/api/auth/send-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "The email could not be sent.");
    return data;
  }, []);

  /**
   * Re-reads the account from Firebase. Verification happens in a different
   * tab or on a phone, so the only way this tab finds out is by asking.
   * Returns the fresh emailVerified value.
   */
  const refreshUser = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return false;
    const wasVerified = current.emailVerified;
    await current.reload();
    // reload() mutates the same object, so React needs a new reference to
    // notice anything changed. Only when something did: a new user object
    // re-renders the whole dashboard and tears down and re-opens every
    // Firestore listener keyed on it, and this runs on a timer while an
    // address is unconfirmed.
    if (current.emailVerified !== wasVerified) {
      setUser(Object.assign(Object.create(Object.getPrototypeOf(current)), current));
    }
    if (current.emailVerified && lastTrialCheck.current !== current.uid + ":verified") {
      lastTrialCheck.current = current.uid + ":verified";
      await ensureTrial(current, null);
    }
    return current.emailVerified;
  }, [ensureTrial]);

  // Confirmed somewhere this tab never saw, then the app opened fresh: Firebase
  // reloads the account on start-up, so it arrives already confirmed and
  // nothing above ever runs, and the trial never started. Ask once per load
  // until the answer is settled. Password accounts only: Google and GitHub
  // start their trial at sign-in carrying the plan the person picked, and a
  // second call racing that one without a plan could win and drop it.
  useEffect(() => {
    if (!user?.emailVerified) return;
    if (!user.providerData?.some((p) => p.providerId === "password")) return;
    const key = user.uid + ":verified";
    if (lastTrialCheck.current === key || trialSettled(user.uid)) return;
    lastTrialCheck.current = key;
    ensureTrial(user, null);
  }, [user, ensureTrial]);

  // Someone who confirms on their phone, or in the tab the email link opened,
  // comes back to this tab afterwards. Checking when they do is what makes the
  // trial start then, rather than whenever a timer next fires. Focus and
  // visibilitychange both fire on the same return, hence the short gap.
  const awaitingVerification = !!user && !user.emailVerified && !!user.email;
  const lastReturnCheck = useRef(0);
  useEffect(() => {
    if (!awaitingVerification) return undefined;
    function onReturn() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastReturnCheck.current < 3000) return;
      lastReturnCheck.current = Date.now();
      refreshUser().catch(() => {});
    }
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [awaitingVerification, refreshUser]);

  async function signUp(email, password, name, intendedPlan) {
    assertUsablePassword(password, { email, name });
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc({ ...cred.user, displayName: name || cred.user.displayName });
    // Sent before the trial call, because the trial is what verification
    // unlocks — asking first and explaining why reads better than a refusal.
    try {
      await sendVerification();
    } catch {
      // The sign-in still worked. The dashboard offers a resend button.
    }
    await ensureTrial(cred.user, intendedPlan);
    return cred.user;
  }

  async function logIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserDoc(cred.user);
    await ensureTrial(cred.user, null);
    return cred.user;
  }

  async function logInWithGoogle(intendedPlan) {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(cred.user);
    await ensureTrial(cred.user, intendedPlan);
    return cred.user;
  }

  async function logInWithGithub(intendedPlan) {
    const cred = await signInWithPopup(auth, githubProvider);
    await ensureUserDoc(cred.user);
    await ensureTrial(cred.user, intendedPlan);
    return cred.user;
  }

  /**
   * Password reset. Deliberately reports success whether or not the address
   * has an account: telling a stranger which addresses are registered turns
   * the form into an account-enumeration tool.
   */
  async function resetPassword(email) {
    try {
      try {
        // Firebase's reset page then offers a "Continue" button back to sign
        // in, instead of leaving them on a firebaseapp.com page with nowhere
        // to go.
        await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/login`, handleCodeInApp: false });
      } catch (err) {
        // The continue URL has to be on an authorized domain. On one that
        // isn't (a preview deployment, say), the email is still worth more
        // than the button, so send it without one.
        if (err?.code !== "auth/unauthorized-continue-uri" && err?.code !== "auth/invalid-continue-uri") throw err;
        await sendPasswordResetEmail(auth, email);
      }
    } catch (err) {
      // A genuinely broken configuration should still surface.
      if (err?.code === "auth/invalid-email" || err?.code === "auth/missing-email") throw err;
    }
    return true;
  }

  function logOut() {
    setTrialStatus(null);
    return signOut(auth);
  }

  // The read-only Search Console scope, from whichever Google account owns the
  // property: not necessarily the one this person signs in to MADBOT with,
  // and never by linking or re-authenticating the MADBOT login (that failed
  // with auth/user-mismatch). See lib/googleToken.js.
  async function connectSearchConsole() {
    if (!auth.currentUser) throw new Error("Sign in first.");
    return requestGoogleToken("https://www.googleapis.com/auth/webmasters.readonly");
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: user === undefined,
        // Only meaningful for email/password accounts. Google and GitHub hand
        // back an already-verified address.
        emailVerified: user ? !!user.emailVerified : false,
        trialStatus,
        signUp,
        logIn,
        logInWithGoogle,
        logInWithGithub,
        logOut,
        resetPassword,
        sendVerification,
        refreshUser,
        connectSearchConsole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
