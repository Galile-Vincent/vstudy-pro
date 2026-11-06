/** Shortcut and capability contracts do not depend on the test runner's operating system. */
import { expect, it } from 'vitest';
import { shortcutModifier, supportsIsolatedCodex, platformTranslationKey } from './platform';

it('uses Cmd on Mac and Ctrl on Windows', () => {
  expect(shortcutModifier('darwin')).toBe('Cmd');
  expect(shortcutModifier('win32')).toBe('Ctrl');
});

it('keeps Codex CLI closed without the audited macOS sandbox', () => {
  expect(supportsIsolatedCodex('darwin')).toBe(true);
  expect(supportsIsolatedCodex('win32')).toBe(false);
  expect(supportsIsolatedCodex('linux')).toBe(false);
});

it('uses Windows secure-storage copy without changing Mac translation keys', () => {
  expect(platformTranslationKey('settings:keychain_help', 'win32')).toBe('distribution:storage_help');
  expect(platformTranslationKey('moodle:keychain_hint', 'win32')).toBe('distribution:school_storage_help');
  expect(platformTranslationKey('settings:keychain_help', 'darwin')).toBe('settings:keychain_help');
  expect(platformTranslationKey('common:close', 'win32')).toBe('common:close');
});
