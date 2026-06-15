const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
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

        // View Points Balance (Using raw custom component payload)
        new SlashCommandBuilder()
            .setName('points')
            .setDescription('Check your points balance')
            .addUserOption(option => option.setName('user').setDescription('View someone else\'s points (Optional)').setRequired(false)),

        // ADMIN ONLY: Add Points
        new SlashCommandBuilder()
            .setName('addpoints')
            .setDescription('Admin Only: Add points to a user')
            .addStringOption(option => option.setName('username').setDescription('Roblox Username').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('Amount of points to add').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // Requires "Manage Server" permission

        // ADMIN ONLY: Remove Points
        new SlashCommandBuilder()
            .setName('removepoints')
            .setDescription('Admin Only: Remove points from a user')
            .addStringOption(option => option.setName('username').setDescription('Roblox Username').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('Amount of points to remove').setRequired(true))
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
            await axios.put(`${DATABASE_URL}links/${user.id}.json`, JSON.stringify(robloxUser.id));
            await interaction.editReply(`✅ Account Linked Successfully! Your Discord account has been tied to **${robloxUser.displayName}** (\`@${robloxUser.name}\`).`);
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

    // ==================== COMMAND: POINTS (RAW COMPONENT INTERFACE) ====================
    if (commandName === 'points') {
        await interaction.deferReply();
        const targetDiscordUser = options.getUser('user') || user;

        try {
            // Find linked Roblox ID
            const linkResponse = await axios.get(`${DATABASE_URL}links/${targetDiscordUser.id}.json`);
            if (!linkResponse.data) {
                return interaction.editReply(targetDiscordUser.id === user.id 
                    ? "❌ You haven't linked a Roblox account yet! Use `/link` first." 
                    : `❌ ${targetDiscordUser.username} has not linked a Roblox account.`);
            }

            const robloxId = linkResponse.data;

            // Fetch profile data from Roblox API
            let robloxName = "Unknown";
            let robloxDisplayName = "Unknown";
            try {
                const robloxProfile = await axios.get(`https://users.roblox.com/v1/users/${robloxId}`);
                robloxName = robloxProfile.data.name;
                robloxDisplayName = robloxProfile.data.displayName;
            } catch (apiErr) {
                console.warn(`⚠️ Could not fetch names for Roblox ID ${robloxId}.`);
            }

            // Fetch current points from Firebase
            const pointsResponse = await axios.get(`${DATABASE_URL}points/${robloxId}.json`);
            const points = pointsResponse.data !== null ? pointsResponse.data : 0;

            // Determine dynamic Tier Level label
            const tierLevel = points >= 3000 ? 'Sapphire Tier' : 'Opal Tier';

            // Your static banner URL extracted from the webhook creator link
            const bannerUrl = "blob:https://discord-webhook.com/28c016f0-1da5-451b-92fa-1006600ce669";

            // Using raw editReply payload mapping your layout with the static banner image
            await interaction.editReply({
                flags: 32768,
                components: [
                    {
                        type: 17,
                        components: [
                            {
                                type: 12,
                                items: [
                                    {
                                        media: {
                                            url: bannerUrl
                                        }
                                    }
                                ]
                            },
                            {
                                type: 14,
                                spacing: 1,
                                divider: true
                            },
                            {
                                type: 10,
                                content: `## Welcome, ${robloxName}!\n`
                            },
                            {
                                type: 14,
                                spacing: 1,
                                divider: true
                            },
                            {
                                type: 10,
                                content: `${robloxDisplayName}`
                            },
                            {
                                type: 14,
                                spacing: 1,
                                divider: true
                            },
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 2,
                                        style: 2,
                                        label: `Points: ${points.toLocaleString()}`,
                                        custom_id: `btn_pts_${targetDiscordUser.id}`
                                    },
                                    {
                                        type: 2,
                                        style: 2,
                                        label: tierLevel,
                                        custom_id: `btn_tier_${targetDiscordUser.id}`
                                    }
                                ]
                            }
                        ]
                    }
                ]
            });

        } catch (err) {
            console.error('Points layout system crash:', err);
            await interaction.editReply('❌ Error rendering your account configuration profile layout.');
        }
    }

    // ==================== ADMIN COMMAND: ADD POINTS ====================
    if (commandName === 'addpoints') {
        await interaction.deferReply();
        const username = options.getString('username');
        const amount = options.getInteger('amount');

        if (amount <= 0) return interaction.editReply('❌ Amount must be greater than zero.');

        const robloxUser = await getRobloxUser(username);
        if (!robloxUser) return interaction.editReply(`❌ Roblox user "${username}" not found.`);

        try {
            const currentResponse = await axios.get(`${DATABASE_URL}points/${robloxUser.id}.json`);
            const currentPoints = currentResponse.data !== null ? currentResponse.data : 0;
            const newTotal = currentPoints + amount;

            await axios.put(`${DATABASE_URL}points/${robloxUser.id}.json`, JSON.stringify(newTotal));
            await interaction.editReply(`✅ Successfully added **${amount.toLocaleString()}** points to **${robloxUser.name}**'s account. New total: **${newTotal.toLocaleString()}**`);
        } catch (err) {
            await interaction.editReply('❌ Failed to update records.');
        }
    }

    // ==================== ADMIN COMMAND: REMOVE POINTS ====================
    if (commandName === 'removepoints') {
        await interaction.deferReply();
        const username = options.getString('username');
        const amount = options.getInteger('amount');

        if (amount <= 0) return interaction.editReply('❌ Amount must be greater than zero.');

        const robloxUser = await getRobloxUser(username);
        if (!robloxUser) return interaction.editReply(`❌ Roblox user "${username}" not found.`);

        try {
            const currentResponse = await axios.get(`${DATABASE_URL}points/${robloxUser.id}.json`);
            const currentPoints = currentResponse.data !== null ? currentResponse.data : 0;
            
            let newTotal = currentPoints - amount;
            if (newTotal < 0) newTotal = 0; 

            await axios.put(`${DATABASE_URL}points/${robloxUser.id}.json`, JSON.stringify(newTotal));
            await interaction.editReply(`📉 Successfully removed **${amount.toLocaleString()}** points from **${robloxUser.name}**'s account. New total: **${newTotal.toLocaleString()}**`);
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
