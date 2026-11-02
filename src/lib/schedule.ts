const TIME_ZONE = 'Europe/Oslo';
const DAY_MS = 24 * 60 * 60 * 1000;

const SUNDAY_SLOTS = [
    { hour: 3, minute: 15 },
    { hour: 4, minute: 15 },
    { hour: 5, minute: 15 },
];
const WEEKDAY_SLOTS = [{ hour: 3, minute: 15 }];

const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
});

interface Civil {
    year: number;
    month: number;
    day: number;
}

/** The Oslo wall clock at an instant, read back as if it were UTC. */
function osloWallClockMs(instant: number): number {
    const parts: Record<string, number> = {};
    for (const part of formatter.formatToParts(new Date(instant))) {
        if (part.type !== 'literal') parts[part.type] = Number(part.value);
    }
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function osloOffsetMs(instant: number): number {
    return osloWallClockMs(instant) - Math.floor(instant / 1000) * 1000;
}

function osloDate(instant: number): Civil {
    const wall = new Date(osloWallClockMs(instant));
    return { year: wall.getUTCFullYear(), month: wall.getUTCMonth() + 1, day: wall.getUTCDate() };
}

function addDays(date: Civil, days: number): Civil {
    const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS);
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function isSunday(date: Civil): boolean {
    return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() === 0;
}

/** The instant at which the Oslo wall clock shows the given date and time. */
function osloToInstant(date: Civil, hour: number, minute: number): number {
    const wall = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
    const guess = wall - osloOffsetMs(wall);
    return wall - osloOffsetMs(guess);
}

function slotsOn(date: Civil): number[] {
    const slots = isSunday(date) ? SUNDAY_SLOTS : WEEKDAY_SLOTS;
    return slots.map((slot) => osloToInstant(date, slot.hour, slot.minute));
}

export function cooldownEnd(releaseTimestamp: string, minimumReleaseAgeDays = 7): Date {
    return new Date(new Date(releaseTimestamp).getTime() + minimumReleaseAgeDays * DAY_MS);
}

/** The first Sunday 03:15, 04:15 or 05:15 Oslo slot at or after the given time. */
export function nextSundayRun(after: Date): Date {
    const start = after.getTime();
    const today = osloDate(start);
    for (let offset = 0; offset <= 7; offset++) {
        const date = addDays(today, offset);
        if (!isSunday(date)) continue;
        const slot = slotsOn(date).find((instant) => instant >= start);
        if (slot !== undefined) return new Date(slot);
    }
    throw new Error('No Sunday slot found');
}

/** The latest planned slot at or before the given time. */
export function plannedSlotBefore(start: Date): Date {
    const time = start.getTime();
    const today = osloDate(time);
    for (let offset = 0; offset <= 7; offset++) {
        const slot = slotsOn(addDays(today, -offset))
            .filter((instant) => instant <= time)
            .pop();
        if (slot !== undefined) return new Date(slot);
    }
    throw new Error('No planned slot found');
}

/** Milliseconds between the planned slot and the actual start. */
export function lateness(start: Date): number {
    return start.getTime() - plannedSlotBefore(start).getTime();
}

/** The most recent Oslo Sunday that has fully ended, from Oslo midnight to Oslo midnight. */
export function lastEndedSunday(now: Date): { start: Date; end: Date } {
    const today = osloDate(now.getTime());
    for (let offset = 1; offset <= 7; offset++) {
        const day = addDays(today, -offset);
        if (!isSunday(day)) continue;
        return {
            start: new Date(osloToInstant(day, 0, 0)),
            end: new Date(osloToInstant(addDays(day, 1), 0, 0)),
        };
    }
    throw new Error('No Sunday found');
}
