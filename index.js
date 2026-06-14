const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');

// 1. Initialize Client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const DATABASE_URL = process.env.DATABASE_URL;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    // 2. Define All Slash Commands
    const commands = [
        // Link Roblox Account
        new SlashCommandBuilder()
            .setName('link')
            .setDescription('Link your Roblox account to your Discord account')
            .addStringOption(option => option.setName('username').setDescription('Your Roblox Username').setRequired(true)),

        // Unlink Roblox Account
        new SlashCommandBuilder()
            .setName('unlink')
            .setDescription('Unlink your current Roblox account from your Discord Account'),

        // View Points/Miles Balance
        new SlashCommandBuilder()
            .setName('points')
            .setDescription('Check your points balance')
            .addUserOption(option => option.setName('user').setDescription('View someone else\'s miles (Optional)').setRequired(false)),

        // ADMIN ONLY: Add Points
        new SlashCommandBuilder()
            .setName('addpoints')
            .setDescription('Admin Only: Add points to a user')
            .addStringOption(option => option.setName('username').setDescription('Roblox Username').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('Amount of miles to add').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // Requires "Manage Server" permission

        // ADMIN ONLY: Remove Points
        new SlashCommandBuilder()
            .setName('removepoints')
            .setDescription('Admin Only: Remove points from a user')
            .addStringOption(option => option.setName('username').setDescription('Roblox Username').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('Amount of miles to remove').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Requires "Manage Server" permission
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    try {
        console.log('🔄 Deploying application slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Slash commands successfully registered!');
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
    }
});

// Helper function to resolve Roblox Username to UserID
async function getRobloxUser(username) {
    try {
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: true
        });
        return response.data.data.length ? response.data.data[0] : null;
    } catch (e) {
        return null;
    }
}

// 3. Command Interaction Handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    // ==================== COMMAND: LINK ====================
    if (commandName === 'link') {
        await interaction.deferReply();
        const username = options.getString('username');
        const robloxUser = await getRobloxUser(username);

        if (!robloxUser) return interaction.editReply(`❌ Could not find a Roblox user named "${username}".`);

        try {
            // Save link to database under links/discordId -> robloxId
            await axios.put(`${DATABASE_URL}links/${user.id}.json`, JSON.stringify(robloxUser.id));
            
            const embed = new EmbedBuilder()
                .setColor('#00ff7f')
                .setTitle('Account Linked Successfully!')
                .setDescription(`Your Discord account has been tied to **${robloxUser.displayName}** (\`@${robloxUser.name}\`).`)
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxUser.id}&width=150&height=150&format=png`);
            
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('❌ Database error linking your account.');
        }
    }

    // ==================== COMMAND: UNLINK ====================
    if (commandName === 'unlink') {
        await interaction.deferReply();
        try {
            await axios.delete(`${DATABASE_URL}links/${user.id}.json`);
            await interaction.editReply('Your Roblox account link has been successfully removed.');
        } catch (err) {
            await interaction.editReply('❌ Failed to update database context.');
        }
    }

    // ==================== COMMAND: MILES (BALANCE) ====================
    if (commandName === 'points') {
        await interaction.deferReply();
        const targetDiscordUser = options.getUser('user') || user;

        try {
            // Find linked Roblox ID
            const linkResponse = await axios.get(`${DATABASE_URL}links/${targetDiscordUser.id}.json`);
            if (!linkResponse.data) {
                return interaction.editReply(targetDiscordUser.id === user.id 
                    ? '❌ You haven\'t linked a Roblox account yet! Use `/link` first.' 
                    : `❌ ${targetDiscordUser.username} has not linked a Roblox account.`);
            }

            const robloxId = linkResponse.data;

            // Fetch current miles
            const milesResponse = await axios.get(`${DATABASE_URL}miles/${robloxId}.json`);
            const miles = milesResponse.data !== null ? milesResponse.data : 0;

            const embed = new EmbedBuilder()
                .setColor('#00d2ff')
                .setTitle(`Rex Flyer Account Summary`)
                .setDescription(`Account holder: <@${targetDiscordUser.id}>`)
                .addFields(
                    { name: 'Total Balance', value: `✨ **${miles.toLocaleString()}** Miles`, inline: true },
                    { name: 'Tier Level', value: miles >= 3000 ? '🥇 Sapphire' : 'Opal', inline: true }
                )
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`);

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('❌ Error accessing profile information.');
        }
    }

    // ==================== ADMIN COMMAND: ADD MILES ====================
    if (commandName === 'addmiles') {
        await interaction.deferReply();
        const username = options.getString('username');
        const amount = options.getInteger('amount');

        if (amount <= 0) return interaction.editReply('❌ Amount must be greater than zero.');

        const robloxUser = await getRobloxUser(username);
        if (!robloxUser) return interaction.editReply(`❌ Roblox user "${username}" not found.`);

        try {
            const currentResponse = await axios.get(`${DATABASE_URL}miles/${robloxUser.id}.json`);
            const currentMiles = currentResponse.data !== null ? currentResponse.data : 0;
            const newTotal = currentMiles + amount;

            await axios.put(`${DATABASE_URL}miles/${robloxUser.id}.json`, JSON.stringify(newTotal));
            await interaction.editReply(`✅ Successfully added **${amount.toLocaleString()}** miles to **${robloxUser.name}**'s account. New total: **${newTotal.toLocaleString()}**`);
        } catch (err) {
            await interaction.editReply('❌ Failed to update records.');
        }
    }

    // ==================== ADMIN COMMAND: REMOVE MILES ====================
    if (commandName === 'removemiles') {
        await interaction.deferReply();
        const username = options.getString('username');
        const amount = options.getInteger('amount');

        if (amount <= 0) return interaction.editReply('❌ Amount must be greater than zero.');

        const robloxUser = await getRobloxUser(username);
        if (!robloxUser) return interaction.editReply(`❌ Roblox user "${username}" not found.`);

        try {
            const currentResponse = await axios.get(`${DATABASE_URL}miles/${robloxUser.id}.json`);
            const currentMiles = currentResponse.data !== null ? currentResponse.data : 0;
            
            let newTotal = currentMiles - amount;
            if (newTotal < 0) newTotal = 0; // Prevent negative balances

            await axios.put(`${DATABASE_URL}miles/${robloxUser.id}.json`, JSON.stringify(newTotal));
            await interaction.editReply(`Successfully removed **${amount.toLocaleString()}** miles from **${robloxUser.name}**'s account. New total: **${newTotal.toLocaleString()}**`);
        } catch (err) {
            await interaction.editReply('❌ Failed to update records.');
        }
    }
});

// 4. Secure Boot Validation
if (!DISCORD_TOKEN || !DATABASE_URL) {
    console.error("❌ CRITICAL ERROR: Environment variables missing!");
    process.exit(1);
} else {
    client.login(DISCORD_TOKEN);
}
