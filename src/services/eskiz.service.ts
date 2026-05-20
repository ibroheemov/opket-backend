import axios from "axios";

const BASE_URL = "https://notify.eskiz.uz/api";
const FROM = "4546";

let cachedToken: string | null = null;

async function login(): Promise<string> {
    const res = await axios.post<{ data: { token: string } }>(`${BASE_URL}/auth/login`, {
        email: process.env.ESKIZ_EMAIL,
        password: process.env.ESKIZ_PASSWORD,
    });
    cachedToken = res.data.data.token;
    return cachedToken;
}

async function refreshToken(): Promise<string> {
    try {
        const res = await axios.patch<{ data: { token: string } }>(
            `${BASE_URL}/auth/refresh`,
            {},
            { headers: { Authorization: `Bearer ${cachedToken}` } }
        );
        cachedToken = res.data.data.token;
        return cachedToken;
    } catch {
        return login();
    }
}

async function getToken(): Promise<string> {
    if (!cachedToken) return login();
    return cachedToken;
}

async function withAuth<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const token = await getToken();
    try {
        return await fn(token);
    } catch (err: any) {
        if (err?.response?.status === 401) {
            const fresh = await refreshToken();
            return fn(fresh);
        }
        throw err;
    }
}

export const EskizService = {
    async sendSms(phone: number, text: string): Promise<any> {
        return withAuth(async (token) => {
            const res = await axios.post(
                `${BASE_URL}/message/sms/send-batch`,
                {
                    messages: [{ user_sms_id: `sms_${Date.now()}`, to: Number(`998${phone}`), text }],
                    from: FROM,
                    dispatch_id: Date.now(),
                    callback_url: "",
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return res.data;
        });
    },
};
