const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    REST, 
    Routes, 
    PermissionFlagsBits, 
    EmbedBuilder 
} = require('discord.js');
const axios = require('axios');

// Dedicated Channel IDs
const CANCELLATION_CHANNEL_ID = '1478267125931184170';
const SURVEY_LOG_CHANNEL_ID = '1528899591884374128';

// 1. Initialize Client
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
            .addStringOption(opt => opt.setName('username').setDescription('Your Roblox Username').setRequired(true)),

        // Unlink Roblox Account
        new SlashCommandBuilder()
            .setName('unlink')
            .setDescription('Unlink your current Roblox account from your Discord Account'),

        // View Points Balance
        new SlashCommandBuilder()
            .setName('points')
            .setDescription('Check your points balance')
            .addUserOption(opt => opt.setName('user').setDescription("View someone else's points (Optional)").setRequired(false)),

        // ADMIN ONLY: Add Points
        new SlashCommandBuilder()
            .setName('addpoints')
            .setDescription('Add points to a user')
            .addStringOption(opt => opt.setName('username').setDescription('Roblox Username').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of points to add').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // ADMIN ONLY: Remove Points
        new SlashCommandBuilder()
            .setName('removepoints')
            .setDescription('Remove points from a user')
            .addStringOption(opt => opt.setName('username').setDescription('Roblox Username').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of points to remove').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // ADMIN ONLY: Add Aircraft
        new SlashCommandBuilder()
            .setName('addaircraft')
            .setDescription('Register a new aircraft')
            .addStringOption(opt => opt.setName('tailnumber').setDescription('Unique Identifier / Tail Number (e.g. N123TA)').setRequired(true))
            .addStringOption(opt => opt.setName('type').setDescription('Aircraft Model (e.g. A320, B737)').setRequired(true))
            .addIntegerOption(opt => opt.setName('capacity').setDescription('Max passenger capacity').setRequired(true))
            .addStringOption(opt => opt.setName('status').setDescription('Operational Status').setRequired(true)
                .addChoices(
                    { name: 'Active', value: 'Active' },
                    { name: 'Maintenance', value: 'Maintenance' },
                    { name: 'Out Of Service', value: 'Out Of Service' }
                )),

        // ADMIN ONLY: Add Flight (Creates Discord Event)
        new SlashCommandBuilder()
            .setName('addflight')
            .setDescription('Schedule a new flight')
            .addStringOption(opt => opt.setName('flightnumber').setDescription('Flight Designation Number (e.g. RX104)').setRequired(true))
            .addStringOption(opt => opt.setName('origin').setDescription('Departure Airport ICAO/IATA').setRequired(true))
            .addStringOption(opt => opt.setName('destination').setDescription('Arrival Airport ICAO/IATA').setRequired(true))
            .addStringOption(opt => opt.setName('aircraft').setDescription('Tail number of assigned aircraft').setRequired(true))
            .addIntegerOption(opt => opt.setName('waitminutes').setDescription('Minutes from now until departure').setRequired(true)),

        // ADMIN ONLY: Cancel Flight
        new SlashCommandBuilder()
            .setName('cancelflight')
            .setDescription('Cancel an active scheduled flight profile')
            .addStringOption(opt => opt.setName('flightnumber').setDescription('Flight Designation Number (e.g. RX104)').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for cancellation').setRequired(false))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // ADMIN ONLY: Complete Flight & Survey
        new SlashCommandBuilder()
            .setName('completeflight')
            .setDescription('Mark flight as completed and DM passengers a survey')
            .addStringOption(opt => opt.setName('flightnumber').setDescription('Flight Designation Number (e.g. RX104)').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

        // PAX: View upcoming flights
        new SlashCommandBuilder()
            .setName('flights')
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
                                items: [{ media: { url: directBannerUrl } }]
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
            await interaction.editReply('❌ Error rendering your account profile layout.');
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
            await interaction.editReply('Database error saving aircraft profile.');
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
        const waitMinutes = options.getInteger('waitminutes');

        try {
            const airframeCheck = await axios.get(`${DATABASE_URL}aircraft/${aircraftTail}.json`);
            if (!airframeCheck.data) {
                return interaction.editReply(`Error: Tail number \`${aircraftTail}\` does not exist in the fleet directory.`);
            }

            // Calculate precise timestamps
            const unixTimeSeconds = Math.floor((Date.now() + waitMinutes * 60000) / 1000);
            const scheduledStartTime = new Date(unixTimeSeconds * 1000);
            const scheduledEndTime = new Date(scheduledStartTime.getTime() + 3600000 * 2);

            // Create Discord Scheduled Event
            const discordEvent = await guild.scheduledEvents.create({
                name: `Flight ${flightNumber} | ${origin} ➔ ${destination}`,
                scheduledStartTime,
                scheduledEndTime,
                privacyLevel: 2, // GUILD_ONLY
                entityType: 3,   // EXTERNAL location
                entityMetadata: { location: `Rex Hub` },
                description: `Scheduled flight operation.\nAircraft: ${airframeCheck.data.type} (${aircraftTail})\nCapacity: ${airframeCheck.data.capacity} passengers.`
            });

            const flightRecord = {
                flightNumber,
                origin,
                destination,
                aircraftTail,
                aircraftType: airframeCheck.data.type,
                unixTimestamp: unixTimeSeconds,
                eventId: discordEvent.id,
                eventUrl: discordEvent.url
            };

            await axios.put(`${DATABASE_URL}flights/${flightNumber}.json`, JSON.stringify(flightRecord));

            // Formatted Embed with Discord Timestamps
            const flightEmbed = new EmbedBuilder()
                .setTitle("${flightNumber}`)
                .setColor(0x0099FF)
                .addFields(
                    { name: 'Route', value: `\`${origin}\` ➔ \`${destination}\``, inline: true },
                    { name: 'Aircraft', value: `${airframeCheck.data.type} (\`${aircraftTail}\`)`, inline: true },
                    { name: 'Capacity', value: `${airframeCheck.data.capacity} Seats`, inline: true },
                    { name: 'Departure Time', value: `<t:${unixTimeSeconds}:F>`, inline: false },
                    { name: 'Countdown', value: `<t:${unixTimeSeconds}:R>`, inline: false },
                    { name: 'RSVP Event', value: `[Join Event Here](${discordEvent.url})`, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [flightEmbed] });
        } catch (err) {
            console.error(err);
            await interaction.editReply('Operation failure while adding flight structure.');
        }
    }

    // ==================== ADMIN COMMAND: CANCEL FLIGHT ====================
    if (commandName === 'cancelflight') {
        await interaction.deferReply();

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.editReply('Unauthorized: Admin permissions are required.');
        }

        const flightNumber = options.getString('flightnumber').toUpperCase();
        const reason = options.getString('reason') || 'No explicit reason provided.';

        try {
            const flightRef = await axios.get(`${DATABASE_URL}flights/${flightNumber}.json`);
            if (!flightRef.data) {
                return interaction.editReply(`Flight \`${flightNumber}\` was not found in active records.`);
            }

            const fData = flightRef.data;

            // Delete Discord Scheduled Event
            if (fData.eventId) {
                await guild.scheduledEvents.delete(fData.eventId).catch(e => console.warn('Event already deleted or missing.'));
            }

            // Remove database entry
            await axios.delete(`${DATABASE_URL}flights/${flightNumber}.json`);

            // Send Cancellation Announcement
            const cancelChannel = guild.channels.cache.get(CANCELLATION_CHANNEL_ID);
            const cancelEmbed = new EmbedBuilder()
                .setTitle(`🚨 FLIGHT CANCELLATION NOTICE: ${flightNumber}`)
                .setColor(0xFF0000)
                .setDescription(`Flight **${flightNumber}** (\`${fData.origin}\` ➔ \`${fData.destination}\`) has been officially cancelled.`)
                .addFields(
                    { name: 'Aircraft', value: `${fData.aircraftType} (\`${fData.aircraftTail}\`)`, inline: true },
                    { name: 'Scheduled Time', value: `<t:${fData.unixTimestamp}:F>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            if (cancelChannel) {
                await cancelChannel.send({ embeds: [cancelEmbed] });
            }

            await interaction.editReply(`Flight **${flightNumber}** has been cancelled, event deleted, and notification broadcasted.`);
        } catch (err) {
            console.error(err);
            await interaction.editReply('Failed to process flight cancellation.');
        }
    }

    // ==================== ADMIN COMMAND: COMPLETE FLIGHT ====================
    if (commandName === 'completeflight') {
        await interaction.deferReply();

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.editReply('Unauthorized: Admin permissions are required.');
        }

        const flightNumber = options.getString('flightnumber').toUpperCase();

        try {
            const flightRef = await axios.get(`${DATABASE_URL}flights/${flightNumber}.json`);
            if (!flightRef.data) {
                return interaction.editReply(`Flight \`${flightNumber}\` was not found in records.`);
            }

            const fData = flightRef.data;
            let totalDMCount = 0;

            // Fetch attendees who subscribed to the event
            if (fData.eventId) {
                const event = await guild.scheduledEvents.fetch(fData.eventId).catch(() => null);
                if (event) {
                    const subscribers = await event.fetchSubscribers();
                    
                    const surveyEmbed = new EmbedBuilder()
                        .setTitle(`Rex Feedback Survey: ${flightNumber}`)
                        .setColor(0x00FF00)
                        .setDescription(`Thank you for flying with us on **Flight ${flightNumber}** from \`${fData.origin}\` to \`${fData.destination}\`!`)
                        .addFields(
                            { name: 'Feedback Link', value: '[Click Here to Complete Survey](https://forms.gle/your-survey-link-here)' }
                        )
                        .setFooter({ text: 'We appreciate your valuable passenger feedback!' });

                    for (const [subId, subObj] of subscribers) {
                        if (subObj.user.bot) continue;
                        try {
                            await subObj.user.send({ embeds: [surveyEmbed] });
                            totalDMCount++;
                        } catch (e) {
                            console.warn(`Could not DM user ${subObj.user.tag}`);
                        }
                    }
                }
            }

            // Post report to completion channel
            const surveyChannel = guild.channels.cache.get(SURVEY_LOG_CHANNEL_ID);
            const completionEmbed = new EmbedBuilder()
                .setTitle(`Flight Operations Completed: ${flightNumber}`)
                .setColor(0x00FF00)
                .addFields(
                    { name: 'Route', value: `\`${fData.origin}\` ➔ \`${fData.destination}\``, inline: true },
                    { name: 'Aircraft', value: `${fData.aircraftType} (\`${fData.aircraftTail}\`)`, inline: true },
                    { name: 'Surveys Dispatched', value: `${totalDMCount} Passenger DMs`, inline: true }
                )
                .setTimestamp();

            if (surveyChannel) {
                await surveyChannel.send({ embeds: [completionEmbed] });
            }

            // Clean up DB record
            await axios.delete(`${DATABASE_URL}flights/${flightNumber}.json`);

            await interaction.editReply(`Flight **${flightNumber}** completed! Sent **${totalDMCount}** passenger surveys.`);
        } catch (err) {
            console.error(err);
            await interaction.editReply('Error completing flight operation.');
        }
    }

    // ==================== PAX COMMAND: UPCOMING FLIGHTS ====================
    if (commandName === 'flights') {
        await interaction.deferReply();

        try {
            const flightDump = await axios.get(`${DATABASE_URL}flights.json`);
            if (!flightDump.data) {
                return interaction.editReply('There are currently no upcoming flight scheduled. Check back later!');
            }

            const embeds = [];
            for (const key in flightDump.data) {
                const f = flightDump.data[key];
                
                const embed = new EmbedBuilder()
                    .setTitle(`Flight ${f.flightNumber}`)
                    .setColor(0x0099FF)
                    .addFields(
                        { name: 'Route', value: `\`${f.origin}\` ➔ \`${f.destination}\``, inline: true },
                        { name: 'Equipment', value: `${f.aircraftType} (\`${f.aircraftTail}\`)`, inline: true },
                        { name: 'Departure', value: `<t:${f.unixTimestamp}:F> (<t:${f.unixTimestamp}:R>)`, inline: false },
                        { name: 'Join / RSVP', value: `[Discord Scheduled Event](${f.eventUrl})`, inline: false }
                    );

                embeds.push(embed);
            }

            await interaction.editReply({ content: '## Scheduled Rex Operations', embeds });
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
