import db from './db.js';

/**
 * Generate the weekly highlights and leaderboard message
 * @returns {string} The formatted weekly report message
 */
export function generateWeeklyReport() {
  // Query all workouts from the last 7 days
  const workouts = db.prepare(`
    SELECT w.*, p.name, p.position 
    FROM workouts w
    JOIN players p ON w.player_phone = p.phone_number
    WHERE w.created_at >= datetime('now', '-7 days')
  `).all();

  if (workouts.length === 0) {
    return `📊 *WEEKLY S&C ROUNDUP* 📊\n\nNo workouts logged this week. Summer is ticking, boys! Let's get active and start logging some sessions next week. 🏉💪`;
  }

  // Calculate aggregates
  let totalMinutes = 0;
  const totalWorkouts = workouts.length;
  
  // Calculate player leaderboards: map of phone_number -> { name, position, points, sessions }
  const playerStats = {};

  for (const w of workouts) {
    totalMinutes += w.duration_minutes;
    
    if (!playerStats[w.player_phone]) {
      playerStats[w.player_phone] = {
        name: w.name,
        position: w.position,
        points: 0,
        sessions: 0
      };
    }
    
    playerStats[w.player_phone].points += w.points;
    playerStats[w.player_phone].sessions += 1;
  }

  // Convert to array and sort by points descending, then by sessions descending
  const sortedPlayers = Object.values(playerStats).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.sessions - a.sessions;
  });

  // Format leaderboard
  let leaderboardText = '';
  const medals = ['🥇', '🥈', '🥉'];
  
  sortedPlayers.slice(0, 5).forEach((player, index) => {
    const medal = medals[index] || ` ${index + 1}.`;
    leaderboardText += `${medal} *${player.name}* (${player.position}) - *${player.points} pts* (${player.sessions} workouts)\n`;
  });

  // Calculate hours
  const totalHours = (totalMinutes / 60).toFixed(1);

  // Format final report
  const report = `📊 *WEEKLY S&C ROUNDUP* 📊\n\n` +
    `🔥 *The Leaderboard (Top Performers)*:\n` +
    `${leaderboardText}\n` +
    `💪 *Squad Milestones*:\n` +
    `- Total Workouts: *${totalWorkouts}*\n` +
    `- Total Grind Time: *${totalMinutes} mins* (~${totalHours} hours) 🤯\n\n` +
    `Congrats to everyone who got their sessions in this week! Let's turn up the heat next week. 🏉🚀`;

  return report;
}

/**
 * Initialize cron job scheduler for weekly report
 * @param {object} client - The whatsapp-web.js client
 * @param {string} feedGroupId - The group ID to send the report to
 * @param {string} cronExpression - Optional custom cron expression (default: Sunday at 7:00 PM)
 */
export function initWeeklyScheduler(client, feedGroupId, cronExpression = '0 19 * * 0') {
  import('node-cron').then((cron) => {
    cron.default.schedule(cronExpression, async () => {
      console.log('Running weekly highlights scheduler...');
      try {
        const report = generateWeeklyReport();
        if (feedGroupId && feedGroupId !== 'dummy-feed-group-id@g.us') {
          await client.sendMessage(feedGroupId, report);
          console.log('Weekly highlights report posted successfully.');
        } else {
          console.warn('Skipping weekly report post: FEED_GROUP_ID is not configured.');
        }
      } catch (err) {
        console.error('Error broadcasting weekly report:', err);
      }
    });
    if (cronExpression === '0 19 * * 0') {
      console.log('Weekly highlights scheduler initialized. Scheduled for: Sundays at 7:00 PM.');
    } else {
      console.log(`Weekly highlights scheduler initialized with cron: "${cronExpression}"`);
    }
  });
}
