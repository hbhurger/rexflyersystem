const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');

// 1. Initialize the Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 2. Fetch configurations securely from Northflank Environment Variables
const DATABASE_URL = process.env.DATABASE_URL;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    // 3. Register the Slash Commands globally with Discord
    const commands = [
        new SlashCommandBuilder()
            .setName('point-balance')
            .setDescription('Check your Rex Flyer points')
            .addStringOption(option => 
                option.setName('username')
                .setDescription('Your Roblox Username')
                .setRequired(true))
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    try {
        console.log('🔄 Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
    }
});

// 4. Handle Slash Command Interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'miles') {
        const username = interaction.options.getString('username');
        
        // Defer reply because fetching from Roblox & Firebase can take more than 3 seconds
        await interaction.deferReply();

        try {
            // Step A: Convert Roblox username to UserId using Roblox API
            const robloxUserResponse = await axios.post('https://users.roblox.com/v1/usernames/users', {
                usernames: [username],
                excludeBannedUsers: true
            });

            if (!robloxUserResponse.data.data.length) {
                return interaction.editReply(`Could not find a Roblox user named "${username}".`);
            }

            const userId = robloxUserResponse.data.data[0].id;
            const displayName = robloxUserResponse.data.data[0].displayName;

            // Step B: Fetch miles from your Firebase database
            // Northflank automatically provides the DATABASE_URL. We append the JSON query.
            const milesResponse = await axios.get(`${DATABASE_URL}${userId}.json`);
            const miles = milesResponse.data !== null ? milesResponse.data : 0;

            // Step C: Build a professional aviation-themed status card
            const embed = new EmbedBuilder()
                .setColor('#00d2ff')
                .setTitle(`Rex Flyer System: ${displayName}`)
                .setDescription(`\`@${username}\``)
                .addFields(
                    { name: 'Total Point Balance', value: `**${miles.toLocaleString()}** Points`, inline: true },
                    { name: 'Tier Level', value: miles >= 3000 ? 'Sapphire Member Tier' : 'Opal Member Tier', inline: true }
                )
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`)
                .setFooter({ text: 'Rex Flyer System' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Database/API Error:', error);
            await interaction.editReply('❌ There was an internal network error fetching your mileage data.');
        }
    }
});

// 5. Connect the Bot to Discord
if (!DISCORD_TOKEN || !DATABASE_URL) {
    console.error("❌ CRITICAL ERROR: Environment variables 'DISCORD_TOKEN' or 'DATABASE_URL' are missing on Northflank!");
    process.exit(1);
} else {
    client.login(DISCORD_TOKEN);
}
