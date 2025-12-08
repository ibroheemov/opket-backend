import axios from "axios";
import Base64 from "js-base64";

const WEBHOOK_URL = "http://localhost:3000/paynet/webhook";

// Replace these with your actual settings
const USERNAME = "username";
const PASSWORD = "password";
const ACCOUNT_FIELD = "phone"; // your settings.PAYNET_ACCOUNT_FIELD

const authHeader = `Basic ${Base64.encode(`${USERNAME}:${PASSWORD}`)}`;

// Helper to send JSON-RPC request
async function sendRPC(method: string, params: any, id: number) {
    const payload = { jsonrpc: "2.0", id, method, params };

    try {
        const res = await axios.post(WEBHOOK_URL, payload, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": authHeader
            }
        });
        console.log(`--- ${method} Response ---`, res.data);
        return res.data;
    } catch (err: any) {
        console.error(`--- ${method} Error ---`, err.response?.data || err.message);
        return null;
    }
}

async function runTests() {
    // 1️⃣ PerformTransaction
    const performTx = await sendRPC("PerformTransaction", {
        serviceId: '11111111111111',
        transactionId: '6',
        amount: 500,
        fields: {
            [ACCOUNT_FIELD]: "992707255"
        }
    }, 1);

    // 2️⃣ CheckTransaction
    await sendRPC("CheckTransaction", {
        serviceId: '11111111111111',
        transactionId: '6'
    }, 2);

    // 3️⃣ CancelTransaction
    await sendRPC("CancelTransaction", {
        serviceId: '11111111111111',
        transactionId: '6'
    }, 3);

    // 4️⃣ CheckTransaction after cancellation
    await sendRPC("CheckTransaction", {
        serviceId: '11111111111111',
        transactionId: '6'
    }, 4);

    // 5️⃣ GetStatement
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    await sendRPC("GetStatement", {
        serviceId: '11111111111111',
        dateFrom: yesterday.toISOString(),
        dateTo: now.toISOString()
    }, 5);

    // 6️⃣ GetInformation
    await sendRPC("GetInformation", {
        serviceId: '11111111111111',
        fields: {
            [ACCOUNT_FIELD]: "6920b280310ad0f704e0eb06" // must exist in DriverModel for test
        }
    }, 6);

    // 7️⃣ ChangePassword
    await sendRPC("ChangePassword", {
        serviceId: '11111111111111',
        newPassword: "newpass123"
    }, 7);

    console.log("✅ All tests completed.");
}

runTests();
