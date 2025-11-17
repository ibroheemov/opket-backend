export function calculateApproxTime(distanceKm: number, averageSpeedKmH = 40) {
    // 40 km/h is a typical city speed including traffic
    const hours = distanceKm / averageSpeedKmH;
    const minutes = Math.round(hours * 60);
    return minutes;
}
