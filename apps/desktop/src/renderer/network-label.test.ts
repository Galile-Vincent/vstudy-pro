import { expect, it } from 'vitest';
import { i18n } from '../shared/i18n';
it.each(['en','zh-Hant','ja'])('localizes recorded event kinds in %s', async lang => {
  await i18n.changeLanguage(lang);
  for (const kind of ['claude_quota','ai_cli_download','ai_cli_login','ai_cli_status','moodle_request']) {
    expect(i18n.exists(`settings:event_${kind}`)).toBe(true);
  }
});
