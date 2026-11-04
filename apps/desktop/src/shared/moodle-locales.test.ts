import {expect,it} from 'vitest';
import {i18n} from './i18n';

it.each([
 ['en','1 attachment','2 attachments'],
 ['zh-Hant','1 個附件','2 個附件'],
 ['ja','添付ファイル 1 件','添付ファイル 2 件'],
])('formats attachment counts in %s',(language,one,many) => {
 const t = i18n.getFixedT(language,'moodle');
 expect(t('attachment_count',{count:1})).toBe(one);
 expect(t('attachment_count',{count:2})).toBe(many);
});
