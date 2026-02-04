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
    premium?: FareConfig,
    comfort?: FareConfig
}

export interface FareConfigNew {
    baseFare: number;
    perKm: number;
    firstKm: number;
    outsidePerKm: number;
    outsideFirstKm: number;
    perMinute: number;
    minutesBeforeCharge: number;
    services: Service[];
    enabledServices: string[];
}

export interface FareByCarType {
    standard: FareConfigNew,
    comfort: FareConfigNew,
    premium: FareConfigNew,
}

export interface Service {
    description: string;
    id: string
    charge: number;
}