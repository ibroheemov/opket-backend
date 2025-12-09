export function formatGmtPlus5(date: Date) {
    const dt = new Date(date);

    // convert to GMT+5
    const gmt5 = new Date(dt.getTime() + 5 * 60 * 60 * 1000);

    return (
        gmt5.getUTCFullYear() +
        "-" +
        String(gmt5.getUTCMonth() + 1).padStart(2, "0") +
        "-" +
        String(gmt5.getUTCDate()).padStart(2, "0") +
        " " +
        String(gmt5.getUTCHours()).padStart(2, "0") +
        ":" +
        String(gmt5.getUTCMinutes()).padStart(2, "0") +
        ":" +
        String(gmt5.getUTCSeconds()).padStart(2, "0")
    );
}

