"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  linkWithPopup,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider, githubProvider } from "../../lib/firebase";
import { MIN_LENGTH, isAcceptable } from "../../lib/password";

const AuthContext = createContext(null);

async function ensureUserDoc(user) {
  await setDoc(
    doc(db, "users", user.uid),
    {
      email: user.email || null,
      displayName: user.displayName || null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
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
    await current.reload();
    // reload() mutates the same object, so React needs a new reference to
    // notice anything changed.
    setUser(Object.assign(Object.create(Object.getPrototypeOf(current)), current));
    if (current.emailVerified && lastTrialCheck.current !== current.uid + ":verified") {
      lastTrialCheck.current = current.uid + ":verified";
      await ensureTrial(current, null);
    }
    return current.emailVerified;
  }, [ensureTrial]);

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
      await sendPasswordResetEmail(auth, email);
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

  // Asks Google for the read-only Search Console scope and hands back the
  // OAuth access token. Deliberately uses link/reauthenticate rather than a
  // plain popup sign-in: a plain sign-in would swap an email/password user
  // onto a different uid and orphan all their data.
  async function connectSearchConsole() {
    const current = auth.currentUser;
    if (!current) throw new Error("Sign in first.");

    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/webmasters.readonly");
    provider.setCustomParameters({ prompt: "consent" });

    const alreadyGoogle = current.providerData.some((p) => p.providerId === "google.com");
    let result;
    if (alreadyGoogle) {
      result = await reauthenticateWithPopup(current, provider);
    } else {
      try {
        result = await linkWithPopup(current, provider);
      } catch (err) {
        // Already linked on another pass — reauthenticating gets us the token.
        if (err?.code === "auth/provider-already-linked" || err?.code === "auth/credential-already-in-use") {
          result = await reauthenticateWithPopup(current, provider);
        } else {
          throw err;
        }
      }
    }

    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.accessToken) throw new Error("Google didn't return an access token.");
    return cred.accessToken;
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
