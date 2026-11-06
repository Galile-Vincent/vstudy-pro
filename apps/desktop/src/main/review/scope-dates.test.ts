import { expect, it } from 'vitest';
import { dateRange, resolveScope } from './scope';
it.each([
 ['Asia/Taipei','2026-09-06','2026-09-07','2026-09-05T16:00:00.000Z',24],
 ['America/New_York','2026-03-08','2026-03-09','2026-03-08T05:00:00.000Z',23],
 ['America/New_York','2026-11-01','2026-11-02','2026-11-01T04:00:00.000Z',25],
 ['America/Santiago','2026-09-06','2026-09-07','2026-09-06T04:00:00.000Z',23],
 ['Etc/GMT+8','2026-11-01','2026-11-02','2026-11-01T08:00:00.000Z',24],
])('resolves calendar-day starts in %s', (zone,from,to,start,hours)=>{
 const range=dateRange(from,to,zone);expect(range.from).toBe(start);expect(Date.parse(range.to)-Date.parse(range.from)).toBe(Number(hours)*3600000);
});
it('keeps observation comparisons half-open in UTC',()=>{
 const input={units:[{id:'u',startsAt:null,endsAt:null,documentIds:['d']}],documents:['d'],concepts:[],observations:[{unitId:'u',occurredAt:'2026-09-07T03:00:00.000Z'}]};
 const scope={kind:'dates' as const,fromDate:'2026-09-06',toDate:'2026-09-07',timeZone:'America/Santiago'};
 expect(resolveScope(scope,input).snapshot.unitIds).toEqual([]);
 input.observations[0]!.occurredAt='2026-09-06T04:00:00.000Z';
 expect(resolveScope(scope,input).snapshot.unitIds).toEqual(['u']);
});
