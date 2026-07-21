# Security Policy

## Supported versions

Discussion Kit is deployed as a static site straight from `main`; there are no maintained release branches. Only the latest code on `main` receives security fixes — forks should pull regularly to stay patched.

| Version | Supported |
| --- | --- |
| `main` (latest) | ✅ |
| Older commits / forks | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, use one of these private channels:

1. **GitHub private vulnerability reporting** (preferred): [Report a vulnerability](https://github.com/NotReeceHarris/discussion-kit/security/advisories/new) on this repository.
2. **Email**: [me@reeceharris.net](mailto:me@reeceharris.net) with a subject starting with `[SECURITY]`.

Include as much of the following as you can:

- A description of the vulnerability and its impact
- Steps to reproduce or a proof of concept
- The affected component (forum app, OAuth proxy worker, CI workflows)
- Any suggested fix

You should receive an acknowledgement within a few days. Please allow a reasonable window for a fix to land and deploy before any public disclosure.

## Security model

Understanding what is and isn't in scope helps triage reports:

- **No backend, no database.** The forum is a static SPA talking directly to the GitHub GraphQL API. There is no server-side session, and GitHub enforces all permissions (posting, editing, deleting, moderation) server-side — the UI merely mirrors them.
- **Tokens stay in the browser.** GitHub tokens (PAT or OAuth) are stored in `localStorage` only and sent solely to `api.github.com`. They are never transmitted to any server operated by this project.
- **OAuth proxy** ([`oauth-proxy/worker.js`](oauth-proxy/worker.js)): a minimal Cloudflare Worker that exchanges an OAuth `code` for an access token. The client secret lives only in the Worker; it validates request `Origin` against an allowlist, and the app validates an OAuth `state` nonce client-side. Reports about secret exposure, origin-check bypasses, or token leakage here are very much in scope.
- **Content rendering.** Post and comment bodies are rendered by GitHub (`bodyHTML` / the Markdown API), which sanitises HTML. Bypasses that achieve script execution (XSS) through forum-rendered content are in scope.

### In scope

- XSS or HTML injection via discussions, comments, profiles, or config-driven content
- Leaking or exfiltrating a signed-in user's token
- OAuth flow weaknesses (state bypass, code interception, proxy origin bypass)
- Privilege issues purely client-side (e.g. the UI granting actions GitHub would reject is *cosmetic*, but anything that results in an unauthorised API action succeeding is in scope)
- Vulnerabilities in the CI/CD workflows that could compromise the deployed site

### Out of scope

- Vulnerabilities in GitHub itself (report to [GitHub's bug bounty](https://bounty.github.com/))
- Issues requiring a compromised browser, device, or GitHub account
- Rate limiting / denial of service against the GitHub API
- Social engineering of forum users or maintainers
- Reports from automated scanners without a demonstrated impact
