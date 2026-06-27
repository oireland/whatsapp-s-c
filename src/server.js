// src/server.js
import express from 'express';
import basicAuth from 'express-basic-auth';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { updatePlayer } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

// Protect the dashboard with a username and password
app.use(basicAuth({
    users: { 'admin': process.env.DASHBOARD_PASSWORD || 'supersecret' },
    challenge: true,
    realm: 'Admin Dashboard',
}));

// Route: View Dashboard
app.get('/', (req, res) => {
    // Fetch all players and their stats using a JOIN query
    const players = db.prepare(`
        SELECT p.phone_number, p.name, p.position, 
               COUNT(w.id) as total_workouts, 
               COALESCE(SUM(w.points), 0) as total_points
        FROM players p
        LEFT JOIN workouts w ON p.phone_number = w.player_phone
        GROUP BY p.phone_number
        ORDER BY total_points DESC
    `).all();

    res.render('dashboard', { players });
});

// Route: Handle Edits
app.post('/edit', (req, res) => {
    const { phone_number, name, position } = req.body;
    if (phone_number && name && position) {
        updatePlayer(phone_number, name, position);
    }
    // Redirect back to the dashboard after saving
    res.redirect('/');
});

export function startServer() {
    app.listen(PORT, () => {
        console.log(`🌐 Admin Dashboard running on port ${PORT}`);
    });
}