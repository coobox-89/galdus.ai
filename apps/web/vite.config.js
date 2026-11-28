// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Content Security Policy for the built console. GitHub Pages cannot send response headers, so the
// policy ships as a <meta> tag (frame-ancestors is header-only: nginx.conf sets it for Docker installs).
// The API origin comes from VITE_API_BASE_URL; everything else is served from the same origin.
function csp(mode) {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let api = "'self'";
  try { api = new URL(env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || '').origin; } catch { /* relative /api */ }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // motion writes inline style attributes for animations.
    "style-src 'self' 'unsafe-inline'",
    // data: for profile photos and chat image previews; no remote images (no tracking pixels in model output).
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${api === "'self'" ? '' : api}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'galdus-csp',
    apply: 'build',
    transformIndexHtml: html => html.replace('<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n  <meta http-equiv="Content-Security-Policy" content="${policy}" />\n  <meta name="referrer" content="strict-origin-when-cross-origin" />`),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), csp(mode)],
  server: { host: '0.0.0.0', port: 5173 },
  define: { __APP_VERSION__: JSON.stringify(version) },
}));
