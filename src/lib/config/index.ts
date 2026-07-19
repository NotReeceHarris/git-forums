import userConfig from '../../../forum.config';
import { buildThemeCss, mergeConfig, type ForumConfig } from './schema';

const resolved = mergeConfig(userConfig);

// Auto-detect the repository from the GitHub Actions build environment
// (GITHUB_REPOSITORY="owner/name", injected at build time via vite `define`)
// so forks can deploy without editing forum.config.ts.
if (!resolved.repo.owner || !resolved.repo.name) {
	const [owner, name] = (__GF_REPOSITORY__ ?? '').split('/');
	if (owner && name) {
		resolved.repo.owner ||= owner;
		resolved.repo.name ||= name;
	}
}

/** True when no repository is configured or detectable — the UI shows setup help. */
export const configIncomplete = !resolved.repo.owner || !resolved.repo.name;

export const forumConfig: ForumConfig = resolved;

/** Precompiled CSS for theme overrides ('' if none) */
export const themeCss = buildThemeCss(resolved.theme);

export type { ForumConfig } from './schema';
