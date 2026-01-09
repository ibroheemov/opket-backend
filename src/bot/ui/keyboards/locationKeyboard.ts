import { call_taxi_msg } from "../messages";

export const locationRequestKeyboard = {
    keyboard: [
        [{ text: call_taxi_msg, request_location: true }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
};
