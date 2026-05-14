import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: env === 'production' ? '.env.production' : '.env.development' });

const token = process.env.OPKET_BOT_TOKEN;
if (!token) {
    throw new Error('OPKET_BOT_TOKEN is not set. Add it to your .env file.');
}
const bot = new TelegramBot(token, { polling: true });

const APP_STORE_URL = 'https://apps.apple.com/us/app/opket-taxi/id6759873649';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.saabiqoon.tasbeeh';

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
        chatId,
        '🚖 *Opket Taxi’ga xush kelibsiz!*\n\n' +
        'Tez, qulay va arzon taksi xizmati endi sizning telefoningizda.\n\n' +
        '📲 Ilovani hoziroq yuklab oling va birinchi safaringizni boshlang:',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🍎 App Store’dan yuklash', url: APP_STORE_URL }],
                    [{ text: '🤖 Google Play’dan yuklash', url: GOOGLE_PLAY_URL }],
                ],
            },
        }
    );
});

console.log('Bot is running...');
