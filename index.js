const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');

// 1. Initialize Client - Added GuildScheduledEvents intent for automatically creating events
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildScheduledEvents
    ] 
});

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

        // View Points Balance
        new SlashCommandBuilder()
            .setName('points')
            .setDescription('Check your points balance')
            .addUserOption(option => option.setName('user').setDescription('View someone else's points (Optional)').setRequired(false)),

        // ADMIN ONLY: Add Points
        new SlashCommandBuilder()
            .setName('addpoints')
            .setDescription('Add points to a user')
            .addStringOption(option => option.setName('username').setDescription('Roblox Username').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('Amount of points to add').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // ADMIN ONLY: Remove Points
        new SlashCommandBuilder()
            .setName('removepoints')
            .setDescription('Remove points from a user')
            .addStringOption(option => option.setName('username').setDescription('Roblox Username').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('Amount of points to remove').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // ADMIN ONLY: Add Aircraft
        new SlashCommandBuilder()
            .setName('addaircraft')
            .setDescription('Register a new aircraft')
            .addStringOption(option => option.setName('tailnumber').setDescription('Unique Identifier / Tail Number (e.g. N123TA)').setRequired(true))
            .addStringOption(option => option.setName('type').setDescription('Aircraft Model (e.g. A320, B737)').setRequired(true))
            .addIntegerOption(option => option.setName('capacity').setDescription('Max passenger capacity').setRequired(true))
            .addStringOption(option => option.setName('status').setDescription('Operational Status').setRequired(true)
                .addChoices(
                    { name: 'Active', value: 'Active' },
                    { name: 'Maintenance', value: 'Maintenance' },
                    { name: 'Stored', value: 'Stored' }
                )),

        // ADMIN ONLY: Add Flight (Creates Discord Event)
        new SlashCommandBuilder()
            .setName('addflight')
            .setDescription('Schedule a new flight')
            .addStringOption(option => option.setName('flightnumber').setDescription('Flight Designation Number (e.g. RX104)').setRequired(true))
            .addStringOption(option => option.setName('origin').setDescription('Departure Airport ICAO/IATA').setRequired(true))
            .addStringOption(option => option.setName('destination').setDescription('Arrival Airport ICAO/IATA').setRequired(true))
            .addStringOption(option => option.setName('aircraft').setDescription('Tail number of the assigned aircraft').setRequired(true))
            .addStringOption(option => option.setName('time').setDescription('Scheduled time description (e.g., Today at 7 PM EST)').setRequired(true))
            .addIntegerOption(option => option.setName('waitminutes').setDescription('Minutes from now until event officially starts').setRequired(true)),

        // PAX: View upcoming flights
        new SlashCommandBuilder()
            .setName('upcomingflights')
            .setDescription('View currently scheduled airline operations')
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

    const { commandName, options, user, guild } = interaction;

    // ==================== COMMAND: LINK ====================
    if (commandName === 'link') {
        await interaction.deferReply();
        const username = options.getString('username');
        const robloxUser = await getRobloxUser(username);

        if (!robloxUser) return interaction.editReply(`Could not find a Roblox user named "${username}".`);

        try {
            await axios.put(`${DATABASE_URL}links/${user.id}.json`, JSON.stringify(robloxUser.id));
            await interaction.editReply(`Account Linked Successfully! Your Discord account has been tied to **${robloxUser.displayName}** (\`@${robloxUser.name}\`).`);
        } catch (err) {
            await interaction.editReply('Database error linking your account.');
        }
    }

    // ==================== COMMAND: UNLINK ====================
    if (commandName === 'unlink') {
        await interaction.deferReply();
        try {
            await axios.delete(`${DATABASE_URL}links/${user.id}.json`);
            await interaction.editReply('Your Roblox account link has been successfully removed.');
        } catch (err) {
            await interaction.editReply('Failed to update database context.');
        }
    }

    // ==================== COMMAND: POINTS ====================
    if (commandName === 'points') {
        await interaction.deferReply();
        const targetDiscordUser = options.getUser('user') || user;

        try {
            const linkResponse = await axios.get(`${DATABASE_URL}links/${targetDiscordUser.id}.json`);
            if (!linkResponse.data) {
                return interaction.editReply(targetDiscordUser.id === user.id 
                    ? "You haven't linked a Roblox account yet! Use `/link` first." 
                    : `${targetDiscordUser.username} has not linked a Roblox account.`);
            }

            const robloxId = linkResponse.data;

            let robloxName = "Unknown";
            let robloxDisplayName = "Unknown";
            try {
                const robloxProfile = await axios.get(`https://users.roblox.com/v1/users/${robloxId}`);
                robloxName = robloxProfile.data.name;
                robloxDisplayName = robloxProfile.data.displayName;
            } catch (apiErr) {
                console.warn(`⚠️ Could not fetch names for Roblox ID ${robloxId}.`);
            }

            const pointsResponse = await axios.get(`${DATABASE_URL}points/${robloxId}.json`);
            const points = pointsResponse.data !== null ? pointsResponse.data : 0;
            const tierLevel = points >= 3000 ? 'Sapphire Tier' : 'Opal Tier';
            const directBannerUrl = "https://i.postimg.cc/QBzZnDDf/Group-3-2-png.webp";

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
                                            url: directBannerUrl
                                        }
                                    }
                                ]
                            },
                            { type: 14, spacing: 1, divider: true },
                            { type: 10, content: `## Welcome, ${robloxName}!\n` },
                            { type: 14, spacing: 1, divider: true },
                            { type: 10, content: `${robloxDisplayName}` },
                            { type: 14, spacing: 1, divider: true },
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

        if (amount <= 0) return interaction.editReply('Amount must be greater than zero.');

        const robloxUser = await getRobloxUser(username);
        if (!robloxUser) return interaction.editReply(`Roblox user "${username}" not found.`);

        try {
            const currentResponse = await axios.get(`${DATABASE_URL}points/${robloxUser.id}.json`);
            const currentPoints = currentResponse.data !== null ? currentResponse.data : 0;
            const newTotal = currentPoints + amount;

            await axios.put(`${DATABASE_URL}points/${robloxUser.id}.json`, JSON.stringify(newTotal));
            await interaction.editReply(`Successfully added **${amount.toLocaleString()}** points to **${robloxUser.name}**'s account. New total: **${newTotal.toLocaleString()}**`);
        } catch (err) {
            await interaction.editReply('Failed to update records.');
        }
    }

    // ==================== ADMIN COMMAND: REMOVE POINTS ====================
    if (commandName === 'removepoints') {
        await interaction.deferReply();
        const username = options.getString('username');
        const amount = options.getInteger('amount');

        if (amount <= 0) return interaction.editReply('Amount must be greater than zero.');

        const robloxUser = await getRobloxUser(username);
        if (!robloxUser) return interaction.editReply(`Roblox user "${username}" not found.`);

        try {
            const currentResponse = await axios.get(`${DATABASE_URL}points/${robloxUser.id}.json`);
            const currentPoints = currentResponse.data !== null ? currentResponse.data : 0;
            
            let newTotal = currentPoints - amount;
            if (newTotal < 0) newTotal = 0; 

            await axios.put(`${DATABASE_URL}points/${robloxUser.id}.json`, JSON.stringify(newTotal));
            await interaction.editReply(`Successfully removed **${amount.toLocaleString()}** points from **${robloxUser.name}**'s account. New total: **${newTotal.toLocaleString()}**`);
        } catch (err) {
            await interaction.editReply('Failed to update records.');
        }
    }

    // ==================== ADMIN COMMAND: ADD AIRCRAFT ====================
    if (commandName === 'addaircraft') {
        await interaction.deferReply();
        
        // Strict baseline permissions check check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.editReply('Unauthorized: Admin permissions are required.');
        }

        const tailNumber = options.getString('tailnumber').toUpperCase().replace(/[^A-Z0-9-]/g, '');
        const type = options.getString('type').toUpperCase();
        const capacity = options.getInteger('capacity');
        const status = options.getString('status');

        const aircraftData = { type, capacity, status };

        try {
            await axios.put(`${DATABASE_URL}aircraft/${tailNumber}.json`, JSON.stringify(aircraftData));
            await interaction.editReply(`**Aircraft Registered!** \n• Tail: \`${tailNumber}\`\n• Model: **${type}**\n• Capacity: **${capacity} pax**\n• Status: \`${status}\``);
        } catch (err) {
            await interaction.editReply('Database infrastructure error saving aircraft profile data.');
        }
    }

    // ==================== ADMIN COMMAND: ADD FLIGHT ====================
    if (commandName === 'addflight') {
        await interaction.deferReply();

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.editReply('Unauthorized: Admin permissions are required.');
        }

        const flightNumber = options.getString('flightnumber').toUpperCase();
        const origin = options.getString('origin').toUpperCase();
        const destination = options.getString('destination').toUpperCase();
        const aircraftTail = options.getString('aircraft').toUpperCase();
        const timeDesc = options.getString('time');
        const waitMinutes = options.getInteger('waitminutes');

        try {
            // Verify if airframe exists first
            const airframeCheck = await axios.get(`${DATABASE_URL}aircraft/${aircraftTail}.json`);
            if (!airframeCheck.data) {
                return interaction.editReply(`Error: Tail number \`${aircraftTail}\` does not exist in the fleet directory. Register it via \`/addaircraft\` first.`);
            }

            // Provision a Native Discord Guild Scheduled Event
            const scheduledStartTime = new Date(Date.now() + waitMinutes * 60000);
            const scheduledEndTime = new Date(scheduledStartTime.getTime() + 3600000 * 2); // default 2 hrs baseline

            const discordEvent = await guild.scheduledEvents.create({
                name: `Flight ${flightNumber} | ${origin} ➔ ${destination}`,
                scheduledStartTime: scheduledStartTime,
                scheduledEndTime: scheduledEndTime,
                privacyLevel: 2, // GUILD_ONLY
                entityType: 3,   // EXTERNAL location
                entityMetadata: { location: `Rex Hub` },
                description: `New scheduled flight. \nAircraft: ${airframeCheck.data.type} (${aircraftTail})\nCapacity: ${airframeCheck.data.capacity} passengers.`
            });

            const flightRecord = {
                flightNumber,
                origin,
                destination,
                aircraftTail,
                aircraftType: airframeCheck.data.type,
                timeDesc,
                eventUrl: discordEvent.url
            };

            // Store cleanly indexed via the flight identifier
            await axios.put(`${DATABASE_URL}flights/${flightNumber}.json`, JSON.stringify(flightRecord));
            await interaction.editReply(`Flight Operations Setup Complete!**\n• Flight: **${flightNumber}** (${origin} ➔ ${destination})\n• Fleet Frame: \`${aircraftTail}\` (${airframeCheck.data.type})\n• Departure: *${timeDesc}*\n\n🔗 **Event Link:** ${discordEvent.url}`);
        } catch (err) {
            console.error(err);
            await interaction.editReply('Operation failure while organizing discord schedule structures.');
        }
    }

    // ==================== PAX COMMAND: UPCOMING FLIGHTS ====================
    if (commandName === 'upcomingflights') {
        await interaction.deferReply();

        try {
            const flightDump = await axios.get(`${DATABASE_URL}flights.json`);
            if (!flightDump.data) {
                return interaction.editReply('There are currently no upcoming flight profiles scheduled. Check back later!');
            }

            let dashboardOutput = '## 📋 Scheduled Route Network Operations\n';
            for (const key in flightDump.data) {
                const f = flightDump.data[key];
                dashboardOutput += `### Flight ${f.flightNumber}\n` +
                                   `• **Route:** \`${f.origin}\` to \`${f.destination}\`\n` +
                                   `• **Equipment:** ${f.aircraftType} (\`${f.aircraftTail}\`)\n` +
                                   `• **Departs:** *${f.timeDesc}*\n` +
                                   `• **Join/RSVP:** ${f.eventUrl}\n\n` +
                                   `--- \n`;
            }

            await interaction.editReply(dashboardOutput);
        } catch (err) {
            await interaction.editReply('Failed retrieving data matrix indices.');
        }
    }
});

// 4. Secure Boot Validation
if (!DISCORD_TOKEN || !DATABASE_URL) {
    console.error("CRITICAL ERROR: Environment variables missing!");
    process.exit(1);
} else {
    client.login(DISCORD_TOKEN);
}
