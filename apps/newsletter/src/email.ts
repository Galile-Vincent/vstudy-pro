import type { z } from 'zod';
import type { localeSchema } from './contract';

export const consentText = {
  en: 'I want to receive optional VStudy Pro product-update emails. I can unsubscribe at any time.',
  ja: 'VStudy Pro の製品アップデートメールの受信を希望します。いつでも配信停止できます。',
  'zh-Hant': '我願意接收 VStudy Pro 的產品更新郵件，並可隨時取消訂閱。',
};
const copy = {
  en: ['Confirm VStudy Pro updates', 'Confirm your subscription:', 'Ignore this email if you did not request it. This link expires in 48 hours.', 'Unsubscribe:', 'Delete your newsletter data:'],
  ja: ['VStudy Pro のメール配信を確認', '配信登録を確認してください：', '心当たりがなければ無視してください。リンクは48時間で失効します。', '配信停止：', '登録データの削除用トークン：'],
  'zh-Hant': ['確認訂閱 VStudy Pro 更新', '請確認訂閱：', '若非您本人申請，請忽略此信。連結將於48小時後失效。', '取消訂閱：', '刪除訂閱資料的權杖：'],
};
export function confirmationEmail(locale: z.infer<typeof localeSchema>, confirm: string, unsubscribe: string, deletionToken: string) {
  const c = copy[locale];
  return {
    subject: c[0],
    text: `${c[1]}\n${confirm}\n\n${c[2]}\n\n${c[3]} ${unsubscribe}\n\n${c[4]}\n${deletionToken}\nPOST /v1/delete {"token":"…"}`,
    headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
