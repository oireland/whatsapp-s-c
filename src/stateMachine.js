import db, {
  getPlayer,
  createPlayer,
  saveSessionState,
  getSessionState,
  deleteSessionState,
  createWorkout
} from './db.js';

// Base points for each workout type
const WORKOUT_TYPES = {
  1: { name: 'Gym / Weights 🏋️‍♂️', basePoints: 10 },
  2: { name: 'Running / Conditioning 🏃‍♂️', basePoints: 15 },
  3: { name: 'Rugby Skills 🏉', basePoints: 10 },
  4: { name: 'Recovery / Mobility 🧘‍♂️', basePoints: 5 }
};

/**
 * Main handler for incoming messages from players
 * @param {string} phone - Sender's phone number (e.g. '447123456789@c.us')
 * @param {string} text - Incoming message text
 * @param {object|null} media - WhatsApp media object (if attached)
 * @returns {Promise<object>} - Response structure: { replyText, broadcastText, broadcastMedia, logSuccessful }
 */
export async function handleIncomingMessage(phone, text, media = null) {
  const cleanText = (text || '').trim();
  const lowerText = cleanText.toLowerCase();

  // 1. Check if player exists
  const player = getPlayer(phone);

  // 2. Fetch conversation state
  const state = getSessionState(phone);

  // Global cancel command
  if (lowerText === 'cancel' && state) {
    deleteSessionState(phone);
    return {
      replyText: 'Process cancelled. Send "log" to start logging a workout, or "stats" to see your points.'
    };
  }

  // A. ONBOARDING FLOW
  if (!player) {
    if (!state) {
      // Start onboarding
      saveSessionState(phone, 'ONBOARDING_NAME', {});
      return {
        replyText: 'Welcome to the Uni Rugby S&C Bot! 🏉\nLet\'s get you set up. What is your full name?'
      };
    }

    if (state.step === 'ONBOARDING_NAME') {
      if (!cleanText) {
        return { replyText: 'Please enter a valid name:' };
      }
      saveSessionState(phone, 'ONBOARDING_POSITION', { name: cleanText });
      return {
        replyText: `Got it, ${cleanText}. What position do you play? (e.g., Prop, Flanker, Fly-half, Winger)`
      };
    }

    if (state.step === 'ONBOARDING_POSITION') {
      if (!cleanText) {
        return { replyText: 'Please enter a valid position:' };
      }
      const name = state.temp_data.name;
      const position = cleanText;

      // Register player
      createPlayer(phone, name, position);
      deleteSessionState(phone);

      return {
        replyText: `Awesome! You are now registered as *${name} (${position})*.\n\nSend *'log'* to log a workout!\nSend *'stats'* to see your current points.`
      };
    }

    // Fallback safety
    deleteSessionState(phone);
    return { replyText: 'Something went wrong. Let\'s try again. What is your full name?' };
  }

  // B. MAIN BOT COMMANDS (WHEN IDLE)
  if (!state) {
    if (lowerText === 'log') {
      saveSessionState(phone, 'LOG_TYPE', {});
      return {
        replyText: `What type of workout did you do today?\n\n` +
          `1. Gym / Weights 🏋️‍♂️\n` +
          `2. Running / Conditioning 🏃‍♂️\n` +
          `3. Rugby Skills 🏉\n` +
          `4. Recovery / Mobility 🧘‍♂️\n\n` +
          `Reply with the number (1-4) or send *'cancel'* to stop.`
      };
    }

    if (lowerText === 'stats') {
      const stats = db.prepare(`
        SELECT COUNT(*) as count, SUM(points) as total_points 
        FROM workouts WHERE player_phone = ?
      `).get(phone);
      
      const count = stats.count || 0;
      const totalPoints = stats.total_points || 0;

      return {
        replyText: `📊 *Your S&C Stats*:\n\nPlayer: *${player.name} (${player.position})*\nTotal Workouts: *${count}*\nTotal Points: *${totalPoints} pts*\n\nKeep grinding! 💪`
      };
    }

    // Default message when registered and idle
    return {
      replyText: `Hi *${player.name}*!\n\nSend *'log'* to log a new workout session.\nSend *'stats'* to see your progress.\n\nType *'cancel'* at any point during logging to reset.`
    };
  }

  // C. LOGGING WORKOUT FLOW
  const tempData = state.temp_data;

  switch (state.step) {
    case 'LOG_TYPE': {
      // Accept numbers 1-4 or matches with the workout names
      let selection = null;
      if (cleanText === '1' || lowerText.includes('gym') || lowerText.includes('weight')) selection = 1;
      else if (cleanText === '2' || lowerText.includes('run') || lowerText.includes('condition')) selection = 2;
      else if (cleanText === '3' || lowerText.includes('skill') || lowerText.includes('rugby')) selection = 3;
      else if (cleanText === '4' || lowerText.includes('recovery') || lowerText.includes('mobil') || lowerText.includes('stretch')) selection = 4;

      if (!selection) {
        return {
          replyText: 'Invalid selection. Please reply with a number (1-4):\n\n' +
            '1. Gym / Weights 🏋️‍♂️\n' +
            '2. Running / Conditioning 🏃‍♂️\n' +
            '3. Rugby Skills 🏉\n' +
            '4. Recovery / Mobility 🧘‍♂️'
        };
      }

      tempData.typeId = selection;
      saveSessionState(phone, 'LOG_DURATION', tempData);
      return {
        replyText: `Got it: *${WORKOUT_TYPES[selection].name}*.\nHow long did the session last (in minutes)?`
      };
    }

    case 'LOG_DURATION': {
      const minutes = parseInt(cleanText, 10);
      if (isNaN(minutes) || minutes <= 0) {
        return {
          replyText: 'Please enter a valid number of minutes (e.g. 45 or 60):'
        };
      }
      tempData.duration = minutes;
      saveSessionState(phone, 'LOG_RPE', tempData);
      return {
        replyText: 'Rate the intensity (RPE) of the session from 1 (very easy recovery) to 10 (max effort/exhaustion):'
      };
    }

    case 'LOG_RPE': {
      const rpe = parseInt(cleanText, 10);
      if (isNaN(rpe) || rpe < 1 || rpe > 10) {
        return {
          replyText: 'RPE must be a number between 1 and 10. Please try again:'
        };
      }
      tempData.rpe = rpe;
      saveSessionState(phone, 'LOG_NOTES', tempData);
      return {
        replyText: 'Briefly describe the highlights or notes (e.g. Squat PR 140kg, tough high speed running) or type *\'none\'*:'
      };
    }

    case 'LOG_NOTES': {
      const notes = lowerText === 'none' ? '' : cleanText;
      tempData.notes = notes;
      saveSessionState(phone, 'LOG_MEDIA', tempData);
      return {
        replyText: 'Optional: Send a photo or video of the session to get a *+5 point bonus*! Or reply *\'skip\'* to finish.'
      };
    }

    case 'LOG_MEDIA': {
      // Check if media is attached or skipped
      const hasMedia = media !== null;
      const isSkip = lowerText === 'skip' || lowerText === 'finish' || lowerText === 'done';

      if (!hasMedia && !isSkip) {
        return {
          replyText: 'Please upload a photo/video or send *\'skip\'* to complete your log:'
        };
      }

      // Calculate points
      const typeInfo = WORKOUT_TYPES[tempData.typeId];
      let points = typeInfo.basePoints;
      if (hasMedia) {
        points += 5; // Media bonus
      }

      // Save workout record
      createWorkout(
        phone,
        typeInfo.name,
        tempData.duration,
        tempData.rpe,
        tempData.notes,
        hasMedia ? 'media_attached' : null, // Store simple flag or key
        points
      );

      // Clean up state
      deleteSessionState(phone);

      // Format broadcast message for the Feed Group
      const notesText = tempData.notes ? `\n📝 *Notes*: "${tempData.notes}"` : '';
      const mediaBonusText = hasMedia ? ' (+5 pt Media Bonus!)' : '';

      const broadcastText = `🔥 *NEW WORKOUT LOGGED!* 🔥\n\n` +
        `👤 *Player*: ${player.name} (${player.position})\n` +
        `🏆 *Type*: ${typeInfo.name}\n` +
        `⏱️ *Duration*: ${tempData.duration} mins (RPE: ${tempData.rpe}/10)${notesText}\n\n` +
        `📈 *Points Earned*: *+${points} pts*${mediaBonusText}`;

      return {
        replyText: `🏋️‍♂️ *Workout Logged Successfully!*\n\nPoints Earned: *+${points} pts*.\nYour update has been sent to the group feed. Keep up the good work! 🚀`,
        broadcastText: broadcastText,
        broadcastMedia: media, // Forward the media object so index.js can send it
        logSuccessful: true
      };
    }

    default:
      deleteSessionState(phone);
      return {
        replyText: 'Something went wrong. State reset. Send "log" to try again.'
      };
  }
}
