
import { userBot } from "../../PassengerBot";
import { payment_success_msg } from "../messages";

export function sendPaymentSuccessMsg(chatId: number) {
    return userBot.sendMessage(
        chatId,
        payment_success_msg
    );
}


