export interface WorkingArea {
    _id: string;
    name: string;
    polygon: { lat: number; lng: number }[];
    fareMultiplierOutside: number;
}
