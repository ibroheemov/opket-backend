export const calculateFare = (distanceKm: number): number => {
    const baseFare = 3; // $
    const perKm = 1.5;
    return parseFloat((baseFare + perKm * distanceKm).toFixed(2));
};
