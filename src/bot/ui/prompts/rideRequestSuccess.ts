import { userBot } from "../../PassengerBot";
import { cancelRideKeyboard } from "../keyboards/cancelRideKeyboard";
import { ride_requested_msg } from "../messages";

export function sendRideRequestSuccessMsg(chatId: number) {
    return userBot.sendMessage(
        chatId,
        ride_requested_msg,
        {
            reply_markup: cancelRideKeyboard,
        }
    );
}
