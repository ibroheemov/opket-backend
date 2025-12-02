import { cancel_ride_message } from "../messages";

export const cancelRideKeyboard = {
    inline_keyboard: [[{ text: cancel_ride_message, callback_data: "cancel_ride" }]],
};