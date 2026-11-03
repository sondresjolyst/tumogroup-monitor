import type { CSSProperties } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Each bar is an update waiting out its cooldown. It starts on a different day and ends in a dot on Sunday.
// The values are abstract. They stand for no package and no repo.
const BARS = [
    { start: 0.5, thickness: 10 },
    { start: 1.5, thickness: 16 },
    { start: 0.2, thickness: 8 },
    { start: 2.5, thickness: 18 },
    { start: 1, thickness: 12 },
    { start: 3.5, thickness: 10 },
    { start: 0.8, thickness: 14 },
    { start: 4.5, thickness: 8 },
];

/** The week, drawn. Updates wait through a 7 day cooldown and the PRs open on Sunday. */
export function WeekDrawing() {
    return (
        <div aria-hidden="true" className="week h-[200px] w-full shrink-0 md:h-auto md:w-[60%]">
            <div className="week-sunday" />
            {DAYS.slice(1).map((day, index) => (
                <div key={day} className="week-line" style={{ left: `${((index + 1) / 7) * 100}%` }} />
            ))}
            <div className="week-days">
                {DAYS.map((day) => (
                    <span key={day} className={day === 'Sun' ? 'week-day-sun' : undefined}>
                        {day}
                    </span>
                ))}
            </div>
            <div className="week-rows">
                {BARS.map((bar, index) => (
                    <div
                        key={index}
                        className="week-bar"
                        style={{ '--s': bar.start, '--t': bar.thickness, '--i': index, '--y': `${(index / (BARS.length - 1)) * 100}%` } as CSSProperties}
                    >
                        <span className="week-bar-line" />
                        <span className="week-dot" />
                    </div>
                ))}
            </div>
        </div>
    );
}
