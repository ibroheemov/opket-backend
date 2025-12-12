import { cancel_ride_message } from "../messages";

export const contactRequestKeyboard = {
    keyboard: [
        [{ text: "☎️ Telefon raqam qoldirish", request_contact: true }],
        [{ text: cancel_ride_message }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
};
