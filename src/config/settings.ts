// settings.ts

export const settings = {
    PAYNET_USERNAME: process.env.PAYNET_USERNAME || "username",
    PAYNET_PASSWORD: process.env.PAYNET_PASSWORD || "password",
    PAYNET_ACCOUNT_FIELD: process.env.PAYNET_ACCOUNT_FIELD || "phone",
};