// A Google access token for one API scope, from whichever Google account the
// person picks. Browser-only.
//
// Search Console used to go through the Firebase sign-in: link Google to the
// MADBOT account, or re-authenticate with it, and take the token Firebase
// handed back. That ties the Search Console property to the login. It broke
// for a password account whose Google account was already a MADBOT account
// of its own (auth/user-mismatch, after the account chooser twice), and it
// can't work for a teammate connecting the owner's property. This asks Google
// directly (Google Identity Services, token model): no Firebase account is
// touched or created, and the token is only ever for this scope.

// The project's OAuth web client, the same one Firebase's Google sign-in uses
// (read from Firebase's Google provider settings). A client id is public by
// design: it is sent to every browser that signs in. The environment
// variable wins, for another project or a different client.
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "340416135340-hrcaa9q3eebr56pd8n4akhveitlqp4ir.apps.googleusercontent.com";

const GIS_SRC = "https://accounts.google.com/gsi/client";
let loading = null;

/**
 * Loads Google's script once, on the click that needs it rather than with the
 * page, so nobody's browser talks to Google until they ask to connect. Allowed
 * by the CSP: a script inserted by a trusted one ('strict-dynamic').
 */
function loadGis() {
  if (typeof window === "undefined") return Promise.reject(new Error("Not in a browser."));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error("Couldn't load Google's sign-in window. Check your connection, or whether an ad blocker is stopping accounts.google.com."));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const POPUP_ERRORS = {
  popup_closed: "The Google window was closed before you finished.",
  popup_failed_to_open: "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
};

/**
 * Opens Google's consent window for `scope` and resolves with the access
 * token. Rejects with a message a person can act on: closed, blocked,
 * declined, or the scope's box left unticked.
 */
export async function requestGoogleToken(scope) {
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error === "access_denied" ? "Google access wasn't granted." : `Google refused: ${response.error_description || response.error}.`));
          return;
        }
        // Google lets people untick individual scopes on the consent screen.
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, scope)) {
          reject(new Error("Search Console access wasn't granted. Connect again and leave its box ticked."));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (err) => reject(new Error(POPUP_ERRORS[err?.type] || "Google's sign-in window didn't finish. Try again.")),
    });
    // Always show the account chooser: the Google account that owns the
    // Search Console property is often not the one already signed in.
    client.requestAccessToken({ prompt: "select_account" });
  });
}
