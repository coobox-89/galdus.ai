# Security overview

The current scaffold is for local development only. Do not expose it to the public internet as-is.

Production readiness requires, at minimum: authentication, authorization and tenant isolation; server-side secret management; rate and request limits; audit logging; safe tool execution and sandboxing; dependency and image scanning; secure session and CORS configuration; backups and recovery tests; and a documented vulnerability response process.

Never commit API keys, access tokens, private keys, production data, or `.env` files. Treat model output and retrieved documents as untrusted input. Require explicit authorization and human approval for consequential external actions.
