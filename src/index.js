import 'dotenv/config';
import path from 'path';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import { handleIncomingMessage } from './stateMachine.js';
import { getSessionState } from './db.js';
import { initWeeklyScheduler } from './scheduler.js';

console.log('Initializing WhatsApp Strength & Conditioning Bot...');

let resolvedAdminJid = null;

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(process.env.DATA_DIR || '.', '.wwebjs_auth')
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu'
    ]
  }
});

// Print QR code in terminal for authentication
client.on('qr', (qr) => {
  console.log('\n==================================================================');
  console.log('📲 ACTION REQUIRED: Scan the QR code below using your WhatsApp app:');
  console.log('   Settings > Linked Devices > Link a Device');
  console.log('==================================================================\n');
  qrcode.generate(qr, { small: true });
});

// Ready event
client.on('ready', async () => {
  console.log('\n✅ WhatsApp client is ready and connected!');
  
  // List all joined groups on startup to help find FEED_GROUP_ID
  try {
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);
    
    console.log('\n=================== JOINED WHATSAPP GROUPS ===================');
    if (groups.length === 0) {
      console.log(' No groups found. Make sure the bot is added to your S&C Feed Group.');
    } else {
      console.log('Copy the matching Group ID and paste it into your .env file:');
      groups.forEach(g => {
        console.log(` Group Name : "${g.name}"`);
        console.log(` Group ID   : ${g.id._serialized}`);
        console.log(' -----------------------------------------------------------');
      });
    }
    console.log('==============================================================\n');
  } catch (err) {
    console.error('Error fetching chats/groups:', err);
  }

  // Initialize weekly highlights cron
  const feedGroupId = process.env.FEED_GROUP_ID;
  const cronExpression = process.env.WEEKLY_SUMMARY_CRON || '0 19 * * 0';
  initWeeklyScheduler(client, feedGroupId, cronExpression);

  // Resolve admin JID on startup
  const adminPhone = process.env.ADMIN_PHONE_NUMBER;
  if (adminPhone) {
    try {
      const numberId = await client.getNumberId(adminPhone);
      if (numberId) {
        resolvedAdminJid = numberId._serialized;
        console.log(`🔑 Admin Phone Number ${adminPhone} resolved to JID: "${resolvedAdminJid}"`);
      } else {
        console.warn(`⚠️ Could not resolve JID for admin phone number: ${adminPhone}`);
      }
    } catch (err) {
      console.error('❌ Failed to resolve admin phone JID on startup:', err);
    }
  }
});

// Handle incoming messages (using message_create to catch all events, including synced/read DMs)
client.on('message_create', async (message) => {
  // Ignore messages sent by the bot itself to prevent infinite feedback loops
  if (message.fromMe) {
    return;
  }

  console.log(`\n📥 [Incoming Event] From: ${message.from} | Type: ${message.type} | Body: "${message.body || '[Media/Special]'}"`);

  // If it's a group message, log its ID to help configure FEED_GROUP_ID
  if (message.from.endsWith('@g.us')) {
    try {
      const chat = await message.getChat();
      console.log(`ℹ️ [Group Chat Message] Group Name: "${chat.name}" | Group ID: "${chat.id._serialized}"`);
    } catch (err) {
      console.warn('⚠️ Failed to fetch details for group message:', err.message);
    }
    return;
  }

  // Only respond to personal direct messages (DMs), ignore other types (LID is standard for new WhatsApp DMs)
  const isDM = message.from.endsWith('@c.us') || message.from.endsWith('@lid');
  if (!isDM) {
    console.log(`ℹ️ [Ignored Message] Sender is not a personal chat contact (e.g. status or broadcast).`);
    return;
  }

  // DEV COMMANDS (Only available to resolvedAdminJid resolved on startup)
  if (message.body && message.body.trim().toLowerCase().startsWith('!dev-')) {
    const isAdmin = resolvedAdminJid && message.from === resolvedAdminJid;
    
    if (!isAdmin) {
      console.warn(`⚠️ [Unauthorized Dev Command] Attempted by ${message.from}`);
      return;
    }

    const cmd = message.body.trim().toLowerCase();
    const feedGroupId = process.env.FEED_GROUP_ID;

    if (cmd === '!dev-workout') {
      console.log(`🛠️ [Dev Command] Simulating workout broadcast to group: ${feedGroupId}...`);
      const testWorkoutText = `🔥 *DEMO ATHLETE*\n_Position: Flanker_\n\n🏆 *Type*: Gym / Weights 🏋️‍♂️\n⏱️ *Duration*: 60 mins (RPE: 8/10)\n📝 *Notes*: "This is a simulated dev workout to check group styling. deadlift PR!"\n\n📈 *Points*: *+15 pts* (+5 pt Media Bonus!)`;
      try {
        if (feedGroupId && feedGroupId !== 'dummy-feed-group-id@g.us') {
          await client.sendMessage(feedGroupId, testWorkoutText, { sendSeen: false });
          await client.sendMessage(message.from, `✅ Simulated workout broadcast posted successfully to feed group!`);
        } else {
          await client.sendMessage(message.from, `❌ Dev Broadcast failed: FEED_GROUP_ID is not configured in .env`);
        }
      } catch (err) {
        console.error('Failed to send dev workout simulation:', err);
        await client.sendMessage(message.from, `❌ Dev Broadcast error: ${err.message}`);
      }
      return;
    }

    if (cmd === '!dev-weekly') {
      console.log(`🛠️ [Dev Command] Simulating weekly highlights broadcast to group: ${feedGroupId}...`);
      try {
        import('./scheduler.js').then(async (module) => {
          const report = module.generateWeeklyReport();
          if (feedGroupId && feedGroupId !== 'dummy-feed-group-id@g.us') {
            await client.sendMessage(feedGroupId, report, { sendSeen: false });
            await client.sendMessage(message.from, `✅ Weekly highlights report simulated and posted successfully to feed group!`);
          } else {
            await client.sendMessage(message.from, `❌ Dev Broadcast failed: FEED_GROUP_ID is not configured in .env`);
          }
        }).catch(async (err) => {
          await client.sendMessage(message.from, `❌ Error loading scheduler module: ${err.message}`);
        });
      } catch (err) {
        console.error('Failed to send dev weekly summary simulation:', err);
        await client.sendMessage(message.from, `❌ Dev Broadcast error: ${err.message}`);
      }
      return;
    }
  }

  try {
    const sender = message.from;
    const body = message.body;

    // Retrieve active state to decide if we need to download media
    const state = getSessionState(sender);
    console.log(`🛠️ [Processing DM] Sender: ${sender} | Current State: ${state ? state.step : 'IDLE (Unregistered or waiting)'}`);
    
    let media = null;
    if (message.hasMedia && state && state.step === 'LOG_MEDIA') {
      console.log(`📸 [Media Detected] Downloading media attachment from ${sender}...`);
      media = await message.downloadMedia();
      console.log(`📸 [Media Loaded] Mimetype: ${media.mimetype} | Size: ${media.data.length} bytes`);
    }

    // Process message through state machine
    console.log(`🧠 [State Machine] Evaluating inputs...`);
    const result = await handleIncomingMessage(sender, body, media);
    console.log(`🧠 [State Machine Result] Reply text generated: ${result.replyText ? 'Yes' : 'No'} | Log success: ${result.logSuccessful ? 'Yes' : 'No'}`);

    // Send reply to sender
    if (result.replyText) {
      console.log(`📤 [Sending Reply] Sending text to ${sender}...`);
      await client.sendMessage(sender, result.replyText);
      console.log(`📤 [Reply Sent] Successfully replied to ${sender}`);
    }

    // If workout logged successfully, broadcast it to the S&C feed group
    if (result.logSuccessful && result.broadcastText) {
      const feedGroupId = process.env.FEED_GROUP_ID;
      
      if (feedGroupId && feedGroupId !== 'dummy-feed-group-id@g.us') {
        console.log(`📢 [Broadcasting Workout] Posting update to feed group: ${feedGroupId}...`);
        try {
          if (result.broadcastMedia) {
            // Re-instantiate MessageMedia to ensure it is recognized as a MessageMedia instance
            const mediaToBroadcast = new MessageMedia(
              result.broadcastMedia.mimetype,
              result.broadcastMedia.data,
              result.broadcastMedia.filename
            );
            
            await client.sendMessage(feedGroupId, mediaToBroadcast, { 
              caption: result.broadcastText,
              sendSeen: false // Avoid "t: t" errors caused by marking group chats as read
            });
          } else {
            await client.sendMessage(feedGroupId, result.broadcastText, {
              sendSeen: false
            });
          }
          console.log(`📢 [Broadcast Complete] Workout posted for ${sender}`);
        } catch (broadcastErr) {
          console.error(`❌ [Broadcast Error] Failed to send workout update to group ${feedGroupId}:`, broadcastErr);
        }
      } else {
        console.warn('⚠️ [Broadcast Skipped] Workout log was NOT broadcasted: FEED_GROUP_ID is not configured in .env');
      }
    }
  } catch (err) {
    console.error('❌ [Error] Failed to process incoming DM:', err);
  }
});

// Connection state logging
client.on('auth_failure', (msg) => {
  console.error('❌ WhatsApp authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️ WhatsApp client was disconnected:', reason);
});

// Start the client
client.initialize().catch(err => {
  console.error('Failed to initialize WhatsApp client:', err);
});
