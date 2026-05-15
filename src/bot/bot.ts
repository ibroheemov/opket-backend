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
        '🚖 *OPKET TAXI ga xush kelibsiz!*\n' +
        '⬇️ Ilovani yuklab oling ⬇️',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🍎 Android uchun', url: GOOGLE_PLAY_URL }],
                    [{ text: '🤖 iPhone uchun', url: APP_STORE_URL }],
                ],
            },
        }
    );
});

console.log('Bot is running...');
