// The AdSense publisher id.
//
// A plain module with no "use client", because both sides need the value: the
// client component that loads the script, and the server-rendered <head> that
// carries the verification meta tag. Exporting it from the client component
// made the whole module a client boundary, so the layout received a function
// reference instead of a string and the build failed on a DataCloneError.
//
// Public identifier, not a secret. It appears in the script URL on every page
// that serves an ad, and in /ads.txt.
export const ADSENSE_CLIENT = "ca-pub-2309671102557521";
