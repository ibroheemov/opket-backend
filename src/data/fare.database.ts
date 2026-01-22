// src/data/fareDatabase.ts
import { FareConfig } from "../models/FareConfig";

export const fareConfigs: Record<string, FareConfig> = {
    default: {
        baseFare: 2000,
        perKm: 2200,
        firstKm: 5500,
        outsidePerKm: 2500,
        outsideFirstKm: 5000,
        perMinute: 500,
        luggageEnabled: false,
        luggageCharge: 3000,
        services: [
            { id: "nasos_xizmati", description: "⛽ Nasos xizmati", charge: 15000 },
            { id: "gaz_otkazish", description: "🔥 Gaz o‘tkazish", charge: 30000 },
            { id: "buksir", description: "🛻 Buksir", charge: 50000 },
            { id: "peregruz_1_kishi", description: "👤 Peregruz 1 kishi", charge: 3000 },
            { id: "peregon", description: "🚗 Peregon", charge: 50000 },
            { id: "uzoq_zakazga", description: "🕒 Uzoq zakazga", charge: 1000 },
            { id: "peremichka", description: "🔧 Peremichka", charge: 15000 },
            { id: "platnye_stoyanki", description: "🅿️ Platnye stoyanki", charge: 1000 },
            { id: "dostavka", description: "📦 Dostavka", charge: 5000 },
            { id: "peregruz_2_kishi", description: "👥 Peregruz 2 kishi", charge: 5000 },
            { id: "tomida_bagaj", description: "🧳 Tomida bagaj", charge: 20000 },
            { id: "zapaska_balon", description: "🛠️ Zapaska balon", charge: 15000 },
            { id: "bagaj", description: "🎒 Bagaj", charge: 3000 },
        ],
        enabledServices: [],
        premium: {
            baseFare: 4000,
            perKm: 3500,
            firstKm: 5000,
            outsidePerKm: 3500,
            outsideFirstKm: 10000,
            perMinute: 1500,
            luggageEnabled: true,
            luggageCharge: 8000,
            enabledServices: [],
            services: [
                { id: "dostavka", description: "📦 Dostavka", charge: 8000 },
                { id: "uzoq_zakazga", description: "🕒 Uzoq zakazga", charge: 1000 },
                { id: "peregruz_1_kishi", description: "👤 Peregruz 1 kishi", charge: 4000 },
                { id: "peregruz_2_kishi", description: "👥 Peregruz 2 kishi", charge: 8000 },
                { id: "bagaj", description: "🎒 Bagaj", charge: 7000 },
            ]
        }
    },
};
