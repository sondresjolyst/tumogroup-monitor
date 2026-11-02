const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const osloParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Oslo time such as "Sun 8 Nov 03:15". Names come from fixed lists, so the server and the browser
 * always render the same text, whatever their language data holds.
 */
export function formatOslo(value: string | Date): string {
    const parts: Record<string, string> = {};
    for (const part of osloParts.formatToParts(new Date(value))) parts[part.type] = part.value;
    const weekday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))).getUTCDay();
    return `${WEEKDAYS[weekday]} ${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.hour}:${parts.minute}`;
}

/** An age in the largest unit that reads well: minutes, then hours up to 2 days, then days. */
export function formatAge(ms: number): string {
    const age = Math.max(0, ms);
    if (age < HOUR_MS) return plural(Math.floor(age / MINUTE_MS), 'minute');
    if (age < 2 * DAY_MS) return plural(Math.floor(age / HOUR_MS), 'hour');
    return plural(Math.floor(age / DAY_MS), 'day');
}

/** A run length such as "5 min 30 s". */
export function formatDuration(ms: number): string {
    const totalSeconds = Math.round(Math.max(0, ms) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
    if (minutes > 0) return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
    return `${seconds} s`;
}

/** Time left of a cooldown, rounded up, so it never reads as over too soon. */
export function formatTimeLeft(ms: number): string {
    if (ms <= 0) return 'Cooldown ended';
    if (ms < HOUR_MS) return 'Under 1 hour left';
    if (ms < DAY_MS) return `${plural(Math.ceil(ms / HOUR_MS), 'hour')} left`;
    return `${plural(Math.ceil(ms / DAY_MS), 'day')} left`;
}
