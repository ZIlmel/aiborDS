require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const Bottleneck = require('bottleneck');

// Initialize the rate limiter
const limiter = new Bottleneck({
    minTime: 2000, // 1 request per 2 seconds
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log('Ready!');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const apiKey = process.env.OPENAI_API_KEY;
    const url = 'https://api.openai.com/v1/chat/completions';

    const requestBody = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: message.content }],
        max_tokens: 1500,
        temperature: 0.7
    };

    const makeApiRequest = async () => {
        try {
            const response = await axios.post(url, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            const botReply = response.data.choices[0].message.content.trim();

            // Split the response if it's too long
            if (botReply.length > 2000) {
                const parts = botReply.match(/.{1,2000}/g);
                for (const part of parts) {
                    await message.channel.send(part);
                }
            } else {
                await message.reply(botReply);
            }
        } catch (error) {
            if (error.response && error.response.data && error.response.data.error && error.response.data.error.code === 'rate_limit_exceeded') {
                console.error('Rate limit exceeded. Retrying...');
                // Retry after a delay (exponential backoff)
                setTimeout(makeApiRequest, 20000); // Retry after 20 seconds
            } else {
                console.error('Error with OpenAI API request:', error.response ? error.response.data : error.message);
                await message.reply('An error occurred while processing your request.');
            }
        }
    };

    // Use the rate limiter to schedule the API request
    limiter.schedule(makeApiRequest);
});

client.login(process.env.DISCORD_TOKEN);
































































































































































































































































































































































































































































                                                                                                 















































































                                                  