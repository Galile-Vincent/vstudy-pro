/** Build-time links and release metadata shared by every page. */
import desktop from '../../desktop/package.json';

export const REPO_URL = 'https://github.com/ava-apple/vstudy-pro';
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const VERSION = desktop.version;
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const path = (route: string) => `${base}/${route}`;
