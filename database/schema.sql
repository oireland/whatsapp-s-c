CREATE TABLE IF NOT EXISTS players (
    phone_number TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_phone TEXT NOT NULL,
    workout_type TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    rpe INTEGER NOT NULL,
    notes TEXT,
    media_key TEXT,
    points INTEGER NOT NULL,
    media_data TEXT,
    media_mimetype TEXT,
    posted_to_group INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_phone) REFERENCES players(phone_number)
);

CREATE TABLE IF NOT EXISTS session_states (
    player_phone TEXT PRIMARY KEY,
    step TEXT NOT NULL,
    temp_data TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
