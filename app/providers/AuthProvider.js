"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
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

  return (
    <AuthContext.Provider
      value={{ user, loading: user === undefined, signUp, logIn, logInWithGoogle, logInWithGithub, logOut }}
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
