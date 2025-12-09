export function isoToTimestamp(isoString: string): number {
    const date = new Date(isoString);
    return date.getTime();
}