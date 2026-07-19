import userConfig from '../../../forum.config';
import { applyRepoFallback, buildThemeCss, mergeConfig, type ForumConfig } from './schema';

const resolved = mergeConfig(userConfig);

// Auto-detect the repository from the GitHub Actions build environment
// (GITHUB_REPOSITORY="owner/name", injected at build time via vite `define`)
// so forks can deploy without editing forum.config.ts.
applyRepoFallback(resolved, __GF_REPOSITORY__);

/** True when no repository is configured or detectable — the UI shows setup help. */
export const configIncomplete = !resolved.repo.owner || !resolved.repo.name;

export const forumConfig: ForumConfig = resolved;

/** Precompiled CSS for theme overrides ('' if none) */
export const themeCss = buildThemeCss(resolved.theme);

export type { ForumConfig } from './schema';
