import { studyScopeSchema, type StudyResolvedScope } from '../../shared/review-artifacts';
import type { z } from 'zod';
export interface ScopeInputs {
    units: {
        id: string;
        startsAt: string | null;
        endsAt: string | null;
        documentIds: string[];
    }[];
    documents: string[];
    concepts: {
        key: string;
        unitId: string | null;
        weak?: boolean;
    }[];
    observations: {
        unitId: string | null;
        occurredAt: string;
    }[];
}
function midnight(date: string, zone: string): string {
    const target = Date.parse(date + 'T00:00:00Z');
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    let time = target;
    for (let i = 0; i < 6; i++) {
        const p = Object.fromEntries(fmt.formatToParts(time).map(p => [p.type, p.value]));
        const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
        const delta = target - local;
        if (!delta)
            return new Date(time).toISOString();
        time += delta;
    }
    throw new Error('review.invalid_date');
}
export function dateRange(fromDate: string, toDate: string, timeZone: string) {
    studyScopeSchema.parse({ kind: 'dates', fromDate, toDate, timeZone });
    if (!/^(?:UTC|[A-Za-z_]+\/[A-Za-z_+\-/]+)$/.test(timeZone))
        throw new Error('review.invalid_zone');
    const days = (Date.parse(toDate) - Date.parse(fromDate)) / 86400000;
    if (days <= 0 || days > 366)
        throw new Error('review.invalid_date');
    return { from: midnight(fromDate, timeZone), to: midnight(toDate, timeZone) };
}
export function resolveScope(raw: z.input<typeof studyScopeSchema>, data: ScopeInputs) {
    const scope = studyScopeSchema.parse(raw), range = scope.kind === 'dates' ? dateRange(scope.fromDate, scope.toDate, scope.timeZone) : null;
    const requestedConcepts = data.concepts.filter(c => scope.kind === 'weak' ? c.weak : scope.kind === 'concepts' ? scope.conceptKeys.includes(c.key) : true);
    const fallback: string[] = [];
    const units = data.units.filter(u => {
        if (scope.kind === 'units')
            return scope.unitIds.includes(u.id);
        if (scope.kind === 'documents')
            return u.documentIds.some(id => scope.documentIds.includes(id));
        if (scope.kind === 'weak' || scope.kind === 'concepts')
            return requestedConcepts.some(c => c.unitId === u.id);
        if (range) {
            if (u.startsAt && u.endsAt)
                return u.startsAt < range.to && u.endsAt > range.from;
            if (data.observations.some(o => o.unitId === u.id && o.occurredAt >= range.from && o.occurredAt < range.to)) {
                fallback.push(u.id);
                return true;
            }
            return false;
        }
        return false;
    });
    const documentIds = [...new Set(units.flatMap(u => u.documentIds).concat(scope.kind === 'documents' ? scope.documentIds : []))].filter(id => data.documents.includes(id));
    const snapshot: StudyResolvedScope = { unitIds: units.map(u => u.id), documentIds, conceptKeys: requestedConcepts.filter(c => c.unitId && units.some(u => u.id === c.unitId)).map(c => c.key), from: range?.from ?? null, to: range?.to ?? null, timeZone: scope.kind === 'dates' ? scope.timeZone : 'UTC', sources: [], assumptions: fallback.length ? ['Undated units based on when you asked: ' + fallback.join(', ')] : [] };
    return { status: documentIds.length ? 'resolved' as const : 'needs_source_selection' as const, snapshot };
}
