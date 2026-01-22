import { call_taxi_msg, go_back_msg, send_location_msg } from "../messages";

export const premiumTaxiKeyboard = {
    keyboard: [
        [
            { text: send_location_msg, request_location: true },
        ],
        [{ text: go_back_msg }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
};
