import { describe, expect, it } from 'vitest';
import { cooldownEnd, lateness, nextSundayRun, plannedSlotBefore } from './schedule';

describe('cooldownEnd', () => {
    it('adds seven days by default', () => {
        expect(cooldownEnd('2026-10-29T13:13:22.526Z').toISOString()).toBe('2026-11-05T13:13:22.526Z');
    });

    it('uses the given number of days', () => {
        expect(cooldownEnd('2026-10-29T13:13:22.526Z', 3).toISOString()).toBe('2026-11-01T13:13:22.526Z');
    });
});

describe('nextSundayRun', () => {
    const next = (iso: string) => nextSundayRun(new Date(iso)).toISOString();

    it('finds the first slot on the coming Sunday', () => {
        expect(next('2026-11-05T13:13:22.526Z')).toBe('2026-11-08T02:15:00.000Z');
    });

    it('finds the first slot when the time is before it', () => {
        expect(next('2026-11-08T02:00:00Z')).toBe('2026-11-08T02:15:00.000Z');
    });

    it('returns the last slot when the time is exactly on it', () => {
        expect(next('2026-11-08T04:15:00Z')).toBe('2026-11-08T04:15:00.000Z');
    });

    it('moves to the next Sunday when the last slot has passed', () => {
        expect(next('2026-11-08T04:20:00Z')).toBe('2026-11-15T02:15:00.000Z');
    });

    it('handles the day the clocks change to summer time', () => {
        expect(next('2027-03-27T12:00:00Z')).toBe('2027-03-28T01:15:00.000Z');
    });

    it('uses summer time offsets after the change', () => {
        expect(next('2027-03-29T12:00:00Z')).toBe('2027-04-04T01:15:00.000Z');
    });
});

describe('plannedSlotBefore', () => {
    it('picks the 03:15 slot on a weekday', () => {
        expect(plannedSlotBefore(new Date('2026-11-02T09:32:55Z')).toISOString()).toBe('2026-11-02T02:15:00.000Z');
    });

    it('picks the latest Sunday slot', () => {
        expect(plannedSlotBefore(new Date('2026-11-08T03:30:00Z')).toISOString()).toBe('2026-11-08T03:15:00.000Z');
    });

    it('falls back to the previous day before the first slot', () => {
        expect(plannedSlotBefore(new Date('2026-11-03T01:00:00Z')).toISOString()).toBe('2026-11-02T02:15:00.000Z');
    });
});

describe('lateness', () => {
    it('measures the delay after the planned slot', () => {
        const ms = lateness(new Date('2026-11-02T09:32:55Z'));
        expect(ms).toBe((7 * 3600 + 17 * 60 + 55) * 1000);
    });
});
