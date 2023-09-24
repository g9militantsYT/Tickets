const { Client, Intents, MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
  ],
});

const fs = require('fs');

const logChannelId = '1145452982494830685'; // Change this to the desired channel ID

const activeTickets = new Map();
const usersWithActiveTickets = new Set();

client.once('ready', async () => {
  logToFile('Bot is ready.');

  const ticketingPanelChannel = client.channels.cache.get('1141791486938189905');
  if (ticketingPanelChannel.isText()) {
    const messages = await ticketingPanelChannel.messages.fetch({ limit: 100 });
    ticketingPanelChannel.bulkDelete(messages);
    logToFile('Deleted messages in ticketing panel channel');
  }

  const targetChannel = client.channels.cache.get('1141791486938189905');

  const formEmbed = new MessageEmbed()
    .setTitle('Ticket Form')
    .setDescription('Click the button below to open the ticket form.')
    .setColor('#FFD700');

  const button = new MessageButton()
    .setCustomId('form_button')
    .setLabel('Open Ticket Form')
    .setStyle('PRIMARY');

  const row = new MessageActionRow().addComponents(button);

  await targetChannel.send({ embeds: [formEmbed], components: [row] });
  logToFile('Sent ticket form panel to target channel');

  // Update activity status on bot startup
  updateActivityStatus();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const ticketData = activeTickets.get(userId);

  if (interaction.customId === 'form_button') {
    logToFile(`${interaction.user.tag} clicked the Open Ticket Form button.`);

    if (usersWithActiveTickets.has(userId)) {
      logToFile(`${interaction.user.tag} already has an open ticket.`);
      await interaction.reply({ content: 'You already have a ticket open. Please wait for it to be resolved.', ephemeral: true });
      return;
    }

    const ticketChannel = await createTicketChannel(interaction.user);

    activeTickets.set(userId, {
      userId: userId,
      ticketChannelId: ticketChannel.id,
      ticketChannelName: ticketChannel.name,
      createdByUserId: interaction.user.id,
      createdByUsername: interaction.user.username
    });

    usersWithActiveTickets.add(userId);

    try {
      const dmChannel = await interaction.user.createDM();
      dmChannel.send(`Ticket created in ${ticketChannel}!`);
      logToFile(`Sent DM to ${interaction.user.tag} about ticket creation`);
    } catch (error) {
      await ticketChannel.send(`${interaction.user}, Ticket created! Please wait for assistance.`);
      logToFile(`DM couldn't be sent, notified ${interaction.user.tag} in ticket channel`);
    }

    await interaction.reply({ content: 'Ticket creation successful! Check your DMs for more details.', ephemeral: true });
  } else if (interaction.customId === 'close_ticket_button') {
    if (ticketData) {
      logToFile(`${interaction.user.tag} clicked the Close Ticket button.`);

      const ticketChannel = interaction.guild.channels.cache.get(ticketData.ticketChannelId);
      if (ticketChannel) {
        try {
          const messages = await ticketChannel.messages.fetch({ limit: 100 });
          const transcript = messages.map(msg => `${msg.author.tag}: ${msg.content}`).join('\n');

          const dmChannel = await interaction.user.createDM();
          if (dmChannel) {
            await dmChannel.send('Here is a transcript of your closed ticket:\n```' + transcript + '```');
            logToFile(`Sent transcript to ${interaction.user.tag} in DM`);
          }

          await ticketChannel.delete();
          activeTickets.delete(userId);
          usersWithActiveTickets.delete(userId);

          await interaction.reply({ content: 'Ticket closed successfully.', ephemeral: true });
          logToFile(`Closed ticket and notified ${interaction.user.tag} about closure`);
        } catch (error) {
          console.error('Error deleting ticket channel:', error);
          await interaction.reply({ content: 'An error occurred while closing the ticket.', ephemeral: true });
        }
      }
    }
  } else if (interaction.customId.startsWith('game_button')) {
    const ticketChannel = interaction.guild.channels.cache.get(ticketData.ticketChannelId);
    if (ticketChannel) {
      const gameMode = interaction.customId.slice('game_button_'.length);

      // Sending a game-related query as an ephemeral message
      await interaction.reply({ content: `${interaction.user}, What is your query related to ${gameMode}?`, ephemeral: true });
      logToFile(`${interaction.user.tag} clicked the ${gameMode} button.`);
    }
  }
  updateActivityStatus();
});


// Function to update bot's activity status
function updateActivityStatus() {
  const numOpenTickets = activeTickets.size;
  const activityText = numOpenTickets === 1 ? '1 ticket open' : `${numOpenTickets} tickets open`;

  client.user.setActivity(activityText, { type: 'WATCHING' });

  // Log activity status update
  sendLogMessage(`Activity status updated: ${activityText}`);
}

async function createTicketChannel(user) {
  const ticketCategory = client.channels.cache.get('1145599531258482698');

  if (!ticketCategory) {
    const categoryNotFoundLog = 'Ticket category not found.';
    console.error(categoryNotFoundLog);
    logToFile(categoryNotFoundLog);
    return;
  }

  const existingTicketData = activeTickets.get(user.id);
  if (existingTicketData) {
    const existingTicketChannel = user.client.channels.cache.get(existingTicketData.ticketChannelId);
    if (existingTicketChannel) {
      return existingTicketChannel;
    }
  }

  const ticketChannel = await ticketCategory.guild.channels.create(`ticket-${user.username}`, {
    type: 'text',
    parent: ticketCategory,
    permissionOverwrites: [
      {
        id: user.id,
        allow: ['VIEW_CHANNEL'],
      },
      {
        id: '1096489078825943130', // Replace with the appropriate role ID
        allow: ['VIEW_CHANNEL'],
      },
      {
        id: '1143279060571652227', // Replace with the appropriate role ID
        allow: ['VIEW_CHANNEL'],
      },
      {
        id: ticketCategory.guild.roles.everyone,
        deny: ['VIEW_CHANNEL'],
      },
    ],
  });


  const mention = `<@${user.id}> here's your ticket!`;
  const ticketEmbed = new MessageEmbed()
    .setTitle('Ticket Created')
    .setDescription(`Ticket of ${user}.\n\nUse this channel to communicate your issue.`)
    .setColor('#FFA500');
  const options = new MessageActionRow().addComponents(
    new MessageButton()
      .setCustomId('game_button_ksp')
      .setLabel('KSP')
      .setStyle('PRIMARY'),
      new MessageButton()
      .setCustomId('game_button_minecraft')
      .setLabel('Minecraft')
      .setStyle('PRIMARY'),    
    new MessageButton()
      .setCustomId('game_button_csgo')
      .setLabel('CSGO')
      .setStyle('PRIMARY'),
    new MessageButton()
      .setCustomId('close_ticket_button')
      .setLabel('Close Ticket')
      .setStyle('DANGER')
  );

  await ticketChannel.send({ content: mention, embeds: [ticketEmbed], components: [options] });

  sendLogMessage(`Created ticket channel for ${user.tag}`);
  return ticketChannel;
}

// Function to send logs to both console, bot.log, and specified Discord logging channel
async function sendLogMessage(message) {
  console.log(message); // Log to console

  // Log to bot.log
  logToFile(message);

  // Log to Discord logging channel
  const logChannel = client.channels.cache.get(logChannelId);
  if (logChannel) {
    logChannel.send(message);
  } else {
    console.error('Log channel not found. Unable to send log to Discord channel.');
  }
}

function logToFile(message) {
  console.log(message); // Log to console
  fs.appendFile('bot.log', `[${new Date().toISOString()}] ${message}\n`, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

client.login(process.env.DISCORD_TOKEN);