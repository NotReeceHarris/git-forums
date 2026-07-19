// The forum is a fully client-side SPA: all data comes from the GitHub API
// at runtime, so nothing can be prerendered except the app shell.
export const ssr = false;
export const prerender = false;
