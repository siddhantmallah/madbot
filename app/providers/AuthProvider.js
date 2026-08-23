"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  linkWithPopup,
  reauthenticateWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider, githubProvider } from "../../lib/firebase";

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  async function signUp(email, password, name) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc({ ...cred.user, displayName: name || cred.user.displayName });
    return cred.user;
  }

  async function logIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserDoc(cred.user);
    return cred.user;
  }

  async function logInWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(cred.user);
    return cred.user;
  }

  async function logInWithGithub() {
    const cred = await signInWithPopup(auth, githubProvider);
    await ensureUserDoc(cred.user);
    return cred.user;
  }

  function logOut() {
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
      value={{ user, loading: user === undefined, signUp, logIn, logInWithGoogle, logInWithGithub, logOut, connectSearchConsole }}
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
