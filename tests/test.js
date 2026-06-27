import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Set environment to 'test' so we use the test database
process.env.NODE_ENV = 'test';

// 2. Import helper database methods and state machine
import db, { getPlayer, getSessionState, createPlayer } from '../src/db.js';
import { handleIncomingMessage } from '../src/stateMachine.js';
import { generateWeeklyReport } from '../src/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDbPath = path.join(__dirname, '../whatsapp_sandc_test.db');

// Helper to clean database tables before tests
function cleanDatabase() {
  db.prepare('DELETE FROM workouts').run();
  db.prepare('DELETE FROM session_states').run();
  db.prepare('DELETE FROM players').run();
}

async function runTests() {
  console.log('🧪 Starting S&C Bot Test Suite...');
  
  try {
    cleanDatabase();
    
    const testPhone = '447123456789@c.us';
    
    // --- TEST 1: ONBOARDING ---
    console.log('\n--- Test 1: Onboarding Flow ---');
    
    // Step 1: Send greeting when not registered
    let res = await handleIncomingMessage(testPhone, 'Hello');
    assert.match(res.replyText, /Welcome to the Uni Rugby S&C Bot/);
    assert.strictEqual(getSessionState(testPhone).step, 'ONBOARDING_NAME');
    console.log('✅ Unregistered greeting triggers onboarding: OK');
    
    // Step 2: Send name
    res = await handleIncomingMessage(testPhone, 'John Doe');
    assert.match(res.replyText, /Got it, John Doe/);
    assert.strictEqual(getSessionState(testPhone).step, 'ONBOARDING_POSITION');
    console.log('✅ Capturing name and prompting for position: OK');
    
    // Step 3: Send position to complete registration
    res = await handleIncomingMessage(testPhone, 'Flanker');
    assert.match(res.replyText, /registered as \*John Doe \(Flanker\)\*/);
    assert.strictEqual(getSessionState(testPhone), null); // state cleared
    
    const player = getPlayer(testPhone);
    assert.ok(player);
    assert.strictEqual(player.name, 'John Doe');
    assert.strictEqual(player.position, 'Flanker');
    console.log('✅ Player registered in database: OK');
    
    // --- TEST 2: CANCEL LOGGING ---
    console.log('\n--- Test 2: Cancel Logging Flow ---');
    
    // Start logging
    res = await handleIncomingMessage(testPhone, 'log');
    assert.match(res.replyText, /What type of workout/);
    assert.strictEqual(getSessionState(testPhone).step, 'LOG_TYPE');
    
    // Cancel the logging flow midway
    res = await handleIncomingMessage(testPhone, 'cancel');
    assert.match(res.replyText, /Process cancelled/);
    assert.strictEqual(getSessionState(testPhone), null); // state cleared
    console.log('✅ Cancel command resets conversational state: OK');
    
    // --- TEST 3: COMPLETE WORKOUT LOGGING (WITH PHOTO) ---
    console.log('\n--- Test 3: Workout Logging with Media ---');
    
    // Step 1: Start logging
    res = await handleIncomingMessage(testPhone, 'log');
    assert.strictEqual(getSessionState(testPhone).step, 'LOG_TYPE');
    
    // Step 2: Choose Gym (Option 1)
    res = await handleIncomingMessage(testPhone, '1');
    assert.match(res.replyText, /Gym \/ Weights/);
    assert.strictEqual(getSessionState(testPhone).step, 'LOG_DURATION');
    
    // Step 3: Send duration (60 mins)
    res = await handleIncomingMessage(testPhone, '60');
    assert.strictEqual(getSessionState(testPhone).step, 'LOG_RPE');
    
    // Step 4: Send RPE (8)
    res = await handleIncomingMessage(testPhone, '8');
    assert.strictEqual(getSessionState(testPhone).step, 'LOG_NOTES');
    
    // Step 5: Send notes
    res = await handleIncomingMessage(testPhone, 'Hit new squat PR of 140kg x 3');
    assert.strictEqual(getSessionState(testPhone).step, 'LOG_MEDIA');
    
    // Step 6: Send photo (media object)
    const mockMedia = { mimetype: 'image/jpeg', data: 'base64data' };
    res = await handleIncomingMessage(testPhone, '', mockMedia);
    
    // Logging should complete successfully
    assert.ok(res.logSuccessful);
    assert.match(res.replyText, /\+15 pts/); // 10 base + 5 media bonus
    assert.match(res.broadcastText, /JOHN DOE/);
    assert.match(res.broadcastText, /Position: Flanker/);
    assert.match(res.broadcastText, /Gym \/ Weights/);
    assert.match(res.broadcastText, /Hit new squat PR/);
    assert.match(res.broadcastText, /\*Points\*: \*\+15 pts\*/);
    assert.strictEqual(res.broadcastMedia, mockMedia);
    assert.strictEqual(getSessionState(testPhone), null);
    
    // Check workout saved in DB
    const workouts = db.prepare('SELECT * FROM workouts WHERE player_phone = ?').all(testPhone);
    assert.strictEqual(workouts.length, 1);
    assert.strictEqual(workouts[0].workout_type, 'Gym / Weights 🏋️‍♂️');
    assert.strictEqual(workouts[0].duration_minutes, 60);
    assert.strictEqual(workouts[0].rpe, 8);
    assert.strictEqual(workouts[0].points, 15);
    assert.strictEqual(workouts[0].media_key, 'media_attached');
    console.log('✅ Logging gym session with photo (15 pts): OK');

    // --- TEST 4: LOGGING WITHOUT MEDIA (SKIP) ---
    console.log('\n--- Test 4: Workout Logging with Skip Media ---');
    
    // Step 1: Start logging
    await handleIncomingMessage(testPhone, 'log');
    // Step 2: Choose Running (Option 2)
    await handleIncomingMessage(testPhone, '2');
    // Step 3: Send duration (45 mins)
    await handleIncomingMessage(testPhone, '45');
    // Step 4: Send RPE (9)
    await handleIncomingMessage(testPhone, '9');
    // Step 5: Send notes
    await handleIncomingMessage(testPhone, 'shuttle runs');
    // Step 6: Send 'skip' to skip photo
    res = await handleIncomingMessage(testPhone, 'skip');
    
    assert.ok(res.logSuccessful);
    assert.match(res.replyText, /\+15 pts/); // Running is 15 base, no media bonus = 15 total
    assert.match(res.broadcastText, /\*Points\*: \*\+15 pts\*/);
    assert.strictEqual(res.broadcastMedia, null);
    
    const allWorkouts = db.prepare('SELECT * FROM workouts WHERE player_phone = ?').all(testPhone);
    assert.strictEqual(allWorkouts.length, 2);
    assert.strictEqual(allWorkouts[1].workout_type, 'Running / Conditioning 🏃‍♂️');
    assert.strictEqual(allWorkouts[1].points, 15);
    assert.strictEqual(allWorkouts[1].media_key, null);
    console.log('✅ Logging running session with skip (15 pts): OK');

    // --- TEST 5: WEEKLY REPORTS ---
    console.log('\n--- Test 5: Weekly highlights and leaderboard ---');
    
    // Setup a second player with lower points
    const p2Phone = '447999888777@c.us';
    createPlayer(p2Phone, 'Will Smith', 'Prop');
    // Save workout for second player (Gym, no media = 10 points)
    db.prepare(`
      INSERT INTO workouts (player_phone, workout_type, duration_minutes, rpe, notes, points)
      VALUES (?, 'Gym / Weights 🏋️‍♂️', 60, 7, 'deadlift session', 10)
    `).run(p2Phone);

    const report = generateWeeklyReport();
    assert.match(report, /WEEKLY S&C ROUNDUP/);
    assert.match(report, /John Doe/);
    assert.match(report, /30 pts/); // John Doe has 15 (gym with photo) + 15 (running skip) = 30 points
    assert.match(report, /Will Smith/);
    assert.match(report, /10 pts/);
    assert.match(report, /Total Workouts: \*3\*/);
    assert.match(report, /Total Grind Time: \*165 mins\*/);
    console.log('✅ Weekly highlights contains correct summaries and leaderboard rankings: OK');
    
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
    
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:');
    console.error(err);
    process.exit(1);
  } finally {
    // Delete the test DB file after runs to leave repository clean
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
        // Also delete journal file if it exists
        if (fs.existsSync(testDbPath + '-journal')) {
          fs.unlinkSync(testDbPath + '-journal');
        }
        if (fs.existsSync(testDbPath + '-wal')) {
          fs.unlinkSync(testDbPath + '-wal');
        }
        if (fs.existsSync(testDbPath + '-shm')) {
          fs.unlinkSync(testDbPath + '-shm');
        }
        console.log('🧹 Cleaned up test database files.');
      }
    } catch (cleanErr) {
      console.warn('Failed to clean up test DB file:', cleanErr.message);
    }
  }
}

runTests();
