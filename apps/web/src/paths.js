// Base path the app is served from: "/" on Netlify, "/galdus.ai/" on GitHub Pages.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const href = (path) => `${BASE}${path}`;
export const currentRoute = () => {
  const path = window.location.pathname;
  const route = path.startsWith(BASE) ? path.slice(BASE.length) : path;
  return route.replace(/\/$/, '') || '/';
};
