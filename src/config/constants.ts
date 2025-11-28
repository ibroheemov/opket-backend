export const MAX_DRIVER_DISTANCE_KM = 10;
export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret_key';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret_key';

export const ACCESS_TOKEN_EXPIRY = '3d'; // short-lived
export const REFRESH_TOKEN_EXPIRY = '7d'; // long-lived