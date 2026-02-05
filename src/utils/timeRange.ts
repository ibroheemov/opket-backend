// utils/timeRange.ts
import {
    startOfDay, endOfDay,
    startOfWeek, endOfWeek,
    startOfMonth, endOfMonth,
    startOfYear, endOfYear,
} from "date-fns";
import { fromZonedTime } from "date-fns-tz";

export type Period = "day" | "week" | "month" | "year";

export function getUtcRange(params: {
    period: Period;
    date: string;
    tz?: string;
}) {
    const { period, date, tz = "UTC" } = params;

    // Interpret YYYY-MM-DD in tz
    const localDate = new Date(`${date}T00:00:00`);
    const utcAnchor = fromZonedTime(localDate, tz);

    let startUtc: Date;
    let endUtc: Date;

    switch (period) {
        case "day":
            startUtc = startOfDay(utcAnchor);
            endUtc = endOfDay(utcAnchor);
            break;

        case "week":
            startUtc = startOfWeek(utcAnchor, { weekStartsOn: 1 });
            endUtc = endOfWeek(utcAnchor, { weekStartsOn: 1 });
            break;

        case "month":
            startUtc = startOfMonth(utcAnchor);
            endUtc = endOfMonth(utcAnchor);
            break;

        case "year":
            startUtc = startOfYear(utcAnchor);
            endUtc = endOfYear(utcAnchor);
            break;
    }

    return { startUtc, endUtc };
}