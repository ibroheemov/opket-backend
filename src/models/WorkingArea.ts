export interface WorkingArea {
    id: string;
    name: string;
    polygon: Array<{ lat: number; lng: number }>;
    fareMultiplierOutside?: number; // default 2
}
