import { userBot } from "../../PassengerBot";
import { RideAssignedPayload } from "../../socket/types";
import { cancelRideKeyboard } from "../keyboards/cancelRideKeyboard";

export function rideAssignedPrompt(chatId: number, data: RideAssignedPayload) {
    const { driver, location } = data;

    return userBot.sendMessage(
        chatId,
        `Haydovchi yo'lda ☝️\n\n👨‍✈️Haydovchi: ${driver.name}\n🚗 Mashina: ${driver.carColor}, ${driver.carModel}\n🔢 Raqam: ${driver.carNumber}\n☎️ +998${driver.phone}`,
        {
            reply_markup: cancelRideKeyboard,
        }
    );
}
