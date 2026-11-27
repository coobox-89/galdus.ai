<p align="center"><img src="docs/assets/header-security.jpg" alt="Galdus.ai security" width="100%"></p>

# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through **GitHub private vulnerability reporting**: open the repository's **Security** tab and choose **Report a vulnerability**. Include the affected version or commit, steps to reproduce and the impact you observed.

Do not open public issues, pull requests or discussions for security problems, and do not test against other people's workspaces on the public preview.

We aim to acknowledge reports within five working days and to agree a disclosure date once a fix is available.

If private reporting is not available, write to the contact address in the [privacy policy](https://coobox-89.github.io/galdus.ai/privacy) with the subject "Security", without details, and we will arrange a private channel.

## Supported versions

| Version | Security fixes |
|:--|:--|
| 1.0 (release candidates and 1.0.x) | Yes |
| 0.9.x and older | No: upgrade to the latest release |

## Scope

In scope: the code in this repository and the public preview (console at `coobox-89.github.io/galdus.ai`, API at `galdus-api.onrender.com`) used with your own test accounts. Out of scope: denial of service and volume testing, social engineering, third-party services (Render, Supabase, model providers), and findings that need a compromised device.

## More

The implemented controls are in [docs/security/overview.md](docs/security/overview.md); the latest review, with accepted residual risks, is [docs/security/review-2026-11-27.md](docs/security/review-2026-11-27.md).
