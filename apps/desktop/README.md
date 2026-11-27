# Galdus.ai Desktop

Cross-platform desktop shell powered by Tauri 2 and the shared React/Vite interface.

## Prerequisites

Install Node.js 20+, Rust stable, and the platform-specific Tauri prerequisites: https://v2.tauri.app/start/prerequisites/ .

## Development

```bash
cd apps/web
npm install
npm run tauri dev
```

## Build installers

```bash
cd apps/web
npm run tauri build
```

Tauri produces platform-specific bundles for the operating system on which the build runs. Build and sign Windows, macOS, and Linux releases on their respective supported CI runners. Configure a production API endpoint at build time with `VITE_API_BASE_URL` (for example `https://app.galdus.ai/api`). Do not embed provider secrets in the desktop app; all model credentials stay on the backend.

This is an early desktop wrapper, not yet signed, auto-updating, or production hardened.
