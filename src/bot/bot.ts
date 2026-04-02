import TelegramBot from 'node-telegram-bot-api';

const token = process.env.BOT_TOKEN!;
const bot = new TelegramBot(token, { polling: true });

// /start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendPhoto(
        chatId,
        'https://picsum.photos/400/300', // image URL
        {
            caption: '👋 Welcome!\nThis is a demo bot with image and button.',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: 'Click me 🚀',
                            callback_data: 'btn_click',
                        },
                    ],
                ],
            },
        }
    );
});

// Handle button click
bot.on('callback_query', async (query) => {
    if (query.data === 'btn_click') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(query.message!.chat.id, 'You clicked the button!');
    }
});

console.log('Bot is running...');