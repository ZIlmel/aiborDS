require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.once('ready', () => {
    console.log('Ready!');
});

let voiceConnection = null;
let audioPlayer = null;

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const prefix = '!';
    const apiKey = process.env.OPENAI_API_KEY;
    const url = 'https://api.openai.com/v1/chat/completions';

    if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'join') {
            const voiceChannel = message.member.voice.channel;
            if (voiceChannel) {
                try {
                    voiceConnection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: voiceChannel.guild.id,
                        adapterCreator: voiceChannel.guild.voiceAdapterCreator
                    });

                    voiceConnection.on(VoiceConnectionStatus.Ready, () => {
                        console.log(`Joined voice channel: ${voiceChannel.name}`);
                        message.reply(`Joined voice channel: ${voiceChannel.name}`);
                    });

                    audioPlayer = createAudioPlayer();
                    voiceConnection.subscribe(audioPlayer);

                } catch (error) {
                    console.error(`Error joining voice channel: ${error}`);
                    await message.reply('Failed to join voice channel.');
                }
            } else {
                await message.reply('You need to join a voice channel first!');
            }
        }

        if (command === 'ask') {
            const requestBody = {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: args.join(' ') }],
                max_tokens: 1500,
                temperature: 0.7,
            };

            const makeApiRequest = async () => {
                try {
                    const response = await axios.post(url, requestBody, {
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${apiKey}`,
                        },
                    });

                    const botReply = response.data.choices[0].message.content.trim();

                    if (voiceConnection && audioPlayer) {
                        const ttsUrls = await getGoogleTTSAudio(botReply);

                        if (ttsUrls.length > 0) {
                            for (const ttsUrl of ttsUrls) {
                                const audioResource = createAudioResource(ttsUrl);
                                audioPlayer.play(audioResource);

                                await new Promise((resolve) => {
                                    audioPlayer.once(AudioPlayerStatus.Idle, resolve);
                                });
                            }
                        } else {
                            await message.reply('Failed to generate TTS audio.');
                        }

                    } else {
                        await message.reply('I am not in a voice channel. Use !join to invite me.');
                    }

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
                        setTimeout(makeApiRequest, 20000);
                    } else {
                        console.error('Error with OpenAI API request:', error.response ? error.response.data : error.message);
                        await message.reply('An error occurred while processing your request.');
                    }
                }
            };

            limiter.schedule(makeApiRequest);
        }
    }
});

async function getGoogleTTSAudio(text) {
    const chunkSize = 200; // Максимальный размер текста для одного запроса к Google TTS
    const chunks = [];

    // Разбить текст на части
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }

    const urls = [];
    for (const chunk of chunks) {
        try {
            const url = `http://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=ru&client=tw-ob`;
            urls.push(url);
        } catch (error) {
            console.error('Error fetching Google TTS audio:', error);
        }
    }
    return urls;
}

client.login(process.env.DISCORD_TOKEN);

