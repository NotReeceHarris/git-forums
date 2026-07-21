# Contributing to Discussion Kit

Thanks for your interest in contributing! Bug reports, feature ideas, and pull requests are all welcome. This document explains how to get set up and what a pull request needs to be accepted.

## Getting started

```sh
git clone https://github.com/NotReeceHarris/discussion-kit.git
cd discussion-kit
npm install
npm run dev
```

The app is a fully client-side SvelteKit SPA over the GitHub Discussions GraphQL API — there is no backend or database. See the [README](README.md) for how everything fits together and how to point your dev instance at a repository with Discussions enabled.

### Useful commands

```sh
npm run dev            # dev server
npm run check          # type-check (svelte-check)
npm run test           # unit tests (vitest)
npm run test:coverage  # unit tests + coverage report
npm run build          # static production build
npm run preview        # preview the production build
```

## Branch naming

All new branches **must** follow this naming schema:

| Prefix | Use for |
| --- | --- |
| `feature/*` | New features and enhancements (e.g. `feature/profiles`) |
| `develop/*` | Ongoing development work such as refactors and optimisations (e.g. `develop/optimisation`) |
| `bug/*` | Bug fixes (e.g. `bug/profile-comment-leak`) |

Branches that don't match one of these prefixes will be asked to rename before review.

## Pull requests

1. **Fork** the repository and create your branch from `main`, named per the [branch naming schema](#branch-naming) above.
2. Make your changes, keeping the style of the surrounding code (tabs, Svelte 5 runes, Tailwind utility classes).
3. Add or update **unit tests** for any logic you touch (see below).
4. Make sure everything passes locally before opening the PR:
   ```sh
   npm run check
   npm run test:coverage
   ```
5. Open the pull request with a clear description of what it changes and why.

## ⚠️ 100% test coverage is required

**Pull requests will not be accepted unless test coverage is 100%.**

All logic modules (`src/lib/**/*.ts` and `oauth-proxy/worker.js`) must sit at **100% statement, branch, function, and line coverage**. The thresholds are enforced in [`vitest.config.ts`](vitest.config.ts), so `npm run test:coverage` **fails** if any metric drops below 100% — and CI runs it on every pull request ([`test.yml`](.github/workflows/test.yml)), so a PR that lowers coverage cannot go green.

In practice this means:

- New functions, branches, and error paths in `src/lib` need tests in [`tests/`](tests/) covering **every** branch — including failure cases (bad responses, missing data, signed-out users).
- If you change existing behaviour, update the affected tests rather than deleting them.
- `.svelte` components are exempt from the unit-coverage gate (they're verified via the production build), but the logic behind them should live in `src/lib` where it *is* covered.

Run the coverage report locally to see exactly which lines are uncovered:

```sh
npm run test:coverage   # prints a summary; full HTML report in coverage/index.html
```

## Reporting bugs & suggesting features

Open an [issue](https://github.com/NotReeceHarris/discussion-kit/issues) with:

- What you did, what you expected, and what actually happened
- Browser and OS if it's a UI issue
- Screenshots or console/network output where relevant

## Code style

- **TypeScript** everywhere; keep types accurate rather than reaching for `any`.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`) — runes mode is forced for the project.
- **Tailwind CSS v4** utilities with the `fd-` design tokens (`bg-fd-card`, `text-fd-muted-foreground`, …) so custom themes keep working.
- Comments explain *constraints and why*, not what the next line does.

## License

By contributing, you agree that your contributions will be licensed under the same [license](LICENSE) as the project.
