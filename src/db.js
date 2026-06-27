import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbName = process.env.NODE_ENV === 'test' ? 'whatsapp_sandc_test.db' : 'whatsapp_sandc.db';
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..');

// Ensure data directory exists
if (process.env.DATA_DIR && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, dbName);
const schemaPath = path.join(__dirname, '../database/schema.sql');

// Open the database (creates it if it doesn't exist)
const db = new Database(dbPath);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');

// Read and execute schema
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Migration: Add posted_to_group column to workouts if it doesn't exist
try {
  db.prepare("ALTER TABLE workouts ADD COLUMN posted_to_group INTEGER DEFAULT 0").run();
  console.log("Migration: Added 'posted_to_group' column to 'workouts' table.");
} catch (err) {
  if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
    console.error("Migration Error:", err);
  }
}

// Migration: Add media_data column to workouts if it doesn't exist
try {
  db.prepare("ALTER TABLE workouts ADD COLUMN media_data TEXT").run();
  console.log("Migration: Added 'media_data' column to 'workouts' table.");
} catch (err) {
  if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
    console.error("Migration Error:", err);
  }
}

// Migration: Add media_mimetype column to workouts if it doesn't exist
try {
  db.prepare("ALTER TABLE workouts ADD COLUMN media_mimetype TEXT").run();
  console.log("Migration: Added 'media_mimetype' column to 'workouts' table.");
} catch (err) {
  if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
    console.error("Migration Error:", err);
  }
}

/**
 * Get player details by phone number
 */
export function getPlayer(phone) {
  const stmt = db.prepare('SELECT * FROM players WHERE phone_number = ?');
  return stmt.get(phone);
}

/**
 * Register a new player
 */
export function createPlayer(phone, name, position) {
  const stmt = db.prepare('INSERT INTO players (phone_number, name, position) VALUES (?, ?, ?)');
  return stmt.run(phone, name, position);
}

/**
 * Save state for a player's conversational flow
 */
export function saveSessionState(phone, step, tempData) {
  const stmt = db.prepare(`
    INSERT INTO session_states (player_phone, step, temp_data, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(player_phone) DO UPDATE SET
      step = excluded.step,
      temp_data = excluded.temp_data,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(phone, step, JSON.stringify(tempData));
}

/**
 * Get active session state for a player
 */
export function getSessionState(phone) {
  const stmt = db.prepare('SELECT * FROM session_states WHERE player_phone = ?');
  const row = stmt.get(phone);
  if (!row) return null;
  return {
    player_phone: row.player_phone,
    step: row.step,
    temp_data: JSON.parse(row.temp_data)
  };
}

/**
 * Delete conversational session state (clears state machine)
 */
export function deleteSessionState(phone) {
  const stmt = db.prepare('DELETE FROM session_states WHERE player_phone = ?');
  return stmt.run(phone);
}

/**
 * Record a logged workout
 */
export function createWorkout(phone, type, duration, rpe, notes, mediaKey, points, mediaData = null, mediaMimetype = null) {
  const stmt = db.prepare(`
    INSERT INTO workouts (player_phone, workout_type, duration_minutes, rpe, notes, media_key, points, media_data, media_mimetype)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(phone, type, duration, rpe, notes, mediaKey, points, mediaData, mediaMimetype);
}

/**
 * Fetch workouts logged since a specific ISO date-time string
 */
export function getWorkoutsSince(dateString) {
  const stmt = db.prepare(`
    SELECT w.*, p.name, p.position 
    FROM workouts w
    JOIN players p ON w.player_phone = p.phone_number
    WHERE w.created_at >= ?
    ORDER BY w.created_at DESC
  `);
  return stmt.all(dateString);
}

/**
 * Update an existing player's details
 */
export function updatePlayer(phone, name, position) {
  const stmt = db.prepare(`
    UPDATE players 
    SET name = ?, position = ? 
    WHERE phone_number = ?
  `);
  return stmt.run(name, position, phone);
}

/**
 * Mark a workout as posted to the group (and clear raw media data to save space)
 */
export function markWorkoutAsPosted(workoutId) {
  const stmt = db.prepare('UPDATE workouts SET posted_to_group = 1, media_data = NULL WHERE id = ?');
  return stmt.run(workoutId);
}

/**
 * Fetch all workouts that have not been posted to the group yet
 */
export function getUnpostedWorkouts() {
  const stmt = db.prepare(`
    SELECT w.*, p.name, p.position 
    FROM workouts w
    JOIN players p ON w.player_phone = p.phone_number
    WHERE w.posted_to_group = 0
    ORDER BY w.created_at ASC
  `);
  return stmt.all();
}

export default db;
