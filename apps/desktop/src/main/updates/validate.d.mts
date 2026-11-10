import type {UpdateInfo} from 'electron-updater';
export function validateFeed(info: UpdateInfo, suffix: string): UpdateInfo;
export function parseFeed(raw: string, suffix: string): UpdateInfo;
