// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

// Base path the app is served from: "/" locally and in Docker, "/galdus.ai/" on GitHub Pages.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const href = (path) => `${BASE}${path}`;
export const currentRoute = () => {
  const path = window.location.pathname;
  const route = path.startsWith(BASE) ? path.slice(BASE.length) : path;
  return route.replace(/\/$/, '') || '/';
};
