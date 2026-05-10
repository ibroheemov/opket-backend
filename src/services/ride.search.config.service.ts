import { IRideSearchConfig, RideSearchConfigModel, DEFAULT_RIDE_SEARCH_CONFIG } from "../models/RideSearchConfigModel";

let cached: IRideSearchConfig | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30_000; // refresh every 30s

export const RideSearchConfigService = {
    async get(): Promise<IRideSearchConfig> {
        const now = Date.now();
        if (cached && now < cacheExpiresAt) return cached;

        let config = await RideSearchConfigModel.findOne().lean<IRideSearchConfig>();
        if (!config) {
            config = await RideSearchConfigModel.create(DEFAULT_RIDE_SEARCH_CONFIG) as IRideSearchConfig;
        }

        cached = config;
        cacheExpiresAt = now + CACHE_TTL_MS;
        return config;
    },

    invalidate() {
        cached = null;
        cacheExpiresAt = 0;
    },
};
