import { plainText } from '../../shared/plain-text';
import type { DocumentCitation } from '../../shared/domain';
import { LibraryService } from './library';
import { ActivityService, localDate, shiftDay } from './activity';
import { dashboardSchema, libraryQuerySchema } from '../../shared/library';
export function getDashboard(library: LibraryService, activity: ActivityService, now = new Date()) {
    const db = library.store.db, today = localDate(now, activity.zone), month = today.slice(0, 7) + '-01';
    const totals = "coalesce(sum(inputTokens),0) inputTokens,coalesce(sum(outputTokens),0) outputTokens,coalesce(sum(costUsd),0) costUsd,coalesce(sum(calls),0) calls";
    const series = db.prepare(`SELECT date,${totals} FROM usage_daily WHERE date>=? AND date<=? GROUP BY date ORDER BY date`).all(shiftDay(today, -13), today);
    const recent = library.list(libraryQuerySchema.parse({ view: 'recent', sort: 'lastOpenedAt', direction: 'desc', limit: 3 })).items.map(item => {
        const chat = db.prepare('SELECT m.parts FROM conversations c JOIN messages m ON m.conversationId=c.id WHERE c.documentId=? ORDER BY m.createdAt DESC LIMIT 1').get(item.document.id);
        return { ...item, lastChat: chat ? plainText(String((JSON.parse(String(chat.parts)) as {
                text?: string;
            }[])[0]?.text ?? ''), (JSON.parse(String(chat.parts)) as {citations?:DocumentCitation[]}[])[0]?.citations).slice(0, 240) : null };
    });
    return dashboardSchema.parse({ pinnedFolders: library.folders().filter(f => f.pinned).sort((a, b) => (b.pinnedAt ?? '').localeCompare(a.pinnedAt ?? '')), pinnedDocuments: db.prepare('SELECT * FROM documents WHERE deletedAt IS NULL AND pinned=1 ORDER BY pinnedAt DESC,id LIMIT 100').all().map(r => library.item(r)), recentDocuments: recent, month: db.prepare(`SELECT ${totals} FROM usage_daily WHERE date>=? AND date<=?`).get(month, today), series: Array.from({ length: 14 }, (_, i) => { const date = shiftDay(today, i - 13); return series.find(r => r.date === date) ?? { date, inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 }; }), streak: activity.streak(), recentActivity: db.prepare('SELECT * FROM activity_events ORDER BY createdAt DESC,id LIMIT 30').all() });
}
