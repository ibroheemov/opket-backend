export interface FareConfig {
    baseFare: number;
    perKm: number;
    firstKm: number;
    outsidePerKm: number;
    outsideFirstKm: number;
    perMinute: number;
    luggageEnabled: boolean;
    luggageCharge: number;
    services: Service[];
    enabledServices: string[];
    premium?: FareConfig
}

export interface Service {
    description: string;
    id: string
    charge: number;
}