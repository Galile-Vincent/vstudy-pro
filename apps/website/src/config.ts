/** Build-time links and release metadata shared by every page. */
import desktop from '../../desktop/package.json';

export const REPO_URL = 'https://github.com/ava-apple/vstudy-pro';
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const VERSION = desktop.version;
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const path = (route: string) => `${base}/${route}`;

/** Owner-confirm values for the legal pages. A value starting with TODO: renders as a visible marker until replaced. See docs/LEGAL_TODO.md. */
export const CONTACT_EMAIL = 'vincent@vcstudio.app';
export const GOVERNING_LAW = 'TODO: governing law and venue';
export const FOUNDER_URL = 'https://vcstudio.app/founder';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/hung-yeh-chiang/';
export const THREADS_URL = 'https://www.threads.com/@vincent._0523';
export const LEGAL_UPDATED = '2026-11-06';
export const ownerValue = (value: string) => value.startsWith('TODO:') ? null : value;
