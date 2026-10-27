import { describe, it, expect } from '@jest/globals';
import { nextDigestAt } from '../../src/server/service/internal/digest';
import { EMAIL } from '../../src/server/settings';

// Pure unit tests for the digest schedule — no database. Days are Date#getUTCDay numbers
// (0 = Sunday), and every time is explicit, so nothing here depends on when the tests run.

const HOUR = 3600 * 1000;
const SUN = 0, MON = 1, WED = 3, THU = 4, FRI = 5, SAT = 6;
const at = (iso: string) => new Date(iso);

describe('nextDigestAt', () => {
    const WEDNESDAY_AFTERNOON = at('2026-10-28T15:30:00Z');

    it('is the next 12AM UTC on the chosen day', () => {
        expect(nextDigestAt(FRI, WEDNESDAY_AFTERNOON)).toEqual(at('2026-10-30T00:00:00Z'));
        expect(nextDigestAt(MON, WEDNESDAY_AFTERNOON)).toEqual(at('2026-11-02T00:00:00Z'));
    });

    it("is a week out when the chosen day is today, whether today's midnight has passed or is now", () => {
        expect(nextDigestAt(WED, WEDNESDAY_AFTERNOON)).toEqual(at('2026-11-04T00:00:00Z'));
        expect(nextDigestAt(WED, at('2026-10-28T00:00:00Z'))).toEqual(at('2026-11-04T00:00:00Z'));
    });

    it('crosses month and year ends in UTC', () => {
        expect(nextDigestAt(SAT, at('2026-12-31T22:00:00Z'))).toEqual(at('2027-01-02T00:00:00Z'));
    });

    it('skips a week when the next slot would come within 6 days of the last digest', () => {
        // Last digest Monday; moving to Thursday on Tuesday would mean two digests 3 days apart.
        const lastSentAt = at('2026-10-26T00:00:00Z');
        expect(nextDigestAt(THU, at('2026-10-27T09:00:00Z'), lastSentAt)).toEqual(at('2026-11-05T00:00:00Z'));
    });

    it('keeps a slot exactly 6 days or more after the last digest', () => {
        const lastSentAt = at('2026-10-26T00:00:00Z'); // a Monday
        expect(nextDigestAt(SUN, at('2026-10-27T09:00:00Z'), lastSentAt)).toEqual(at('2026-11-01T00:00:00Z'));
        expect(nextDigestAt(MON, at('2026-10-27T09:00:00Z'), lastSentAt)).toEqual(at('2026-11-02T00:00:00Z'));
    });

    it('after a send, picks the same day next week, even when the send ran late', () => {
        const sentAt = at('2026-10-28T03:15:00Z'); // Wednesday's digest, three hours late
        expect(nextDigestAt(WED, sentAt, sentAt)).toEqual(at('2026-11-04T00:00:00Z'));
    });

    it('always lands on midnight UTC of the chosen day, in the future, never within the gap, within two weeks', () => {
        const lastSentAt = at('2026-10-28T00:00:00Z');
        for (let day = 0; day < 7; day++) {
            for (let hours = 0; hours < 24 * 8; hours += 5) {
                const after = new Date(lastSentAt.getTime() + hours * HOUR);
                const next = nextDigestAt(day, after, lastSentAt);
                expect(next.getUTCDay()).toBe(day);
                expect(next.toISOString()).toMatch(/T00:00:00\.000Z$/);
                expect(next.getTime()).toBeGreaterThan(after.getTime());
                expect(next.getTime() - lastSentAt.getTime()).toBeGreaterThanOrEqual(EMAIL.DIGEST.MIN_GAP_HOURS * HOUR);
                expect(next.getTime() - after.getTime()).toBeLessThanOrEqual(14 * 24 * HOUR);
            }
        }
    });
});
