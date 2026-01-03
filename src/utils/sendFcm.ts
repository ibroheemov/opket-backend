import admin from 'firebase-admin';

export const sendFcm = async (fcmToken: string, amount: number) => {

    // const fcmToken = updatedDriver.fcmToken;

    if (fcmToken) {
        const message = {
            token: fcmToken,
            android: {
                priority: "high" as const,
            },
            data: {
                type: 'balance_updated',
                amount: amount.toString(),
                source: "",
                message: `Balansingizdan ${amount} UZS komissiya yechib olindi`,
            },
        };

        try {
            await admin.messaging().send(message);
        } catch (error) {
            // console.error(`❌ Error sending FCM to driver ${updatedDriver.id}:`, error);
        }

    }
};
