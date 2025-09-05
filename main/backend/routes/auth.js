const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const router = express.Router();

// Student registration
router.post('/register', async (req, res) => {
    const { rfid, username, pin, name, student_id, email } = req.body;

    try {
        // Check if RFID already exists
        const existingRfid = await db.query(
            'SELECT id FROM users WHERE rfid_id = $1',
            [rfid]
        );

        if (existingRfid.rows.length > 0) {
            return res.status(400).json({ error: 'RFID already registered' });
        }

        // Check if username exists
        const existingUser = await db.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Hash PIN
        const saltRounds = 10;
        const hashedPin = await bcrypt.hash(pin, saltRounds);

        // Create user
        const result = await db.query(`
            INSERT INTO users (rfid_id, username, pin_code, name, student_id, email)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, rfid_id, username, name, student_id
        `, [rfid, username, hashedPin, name, student_id, email]);

        // Create user points entry
        await db.query(`
            INSERT INTO user_points (rfid_id, total_points, total_bottles)
            VALUES ($1, 0, 0)
        `, [rfid]);

        res.json({
            success: true,
            message: 'Registration successful',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Student login
router.post('/login', async (req, res) => {
    const { username, pin, ip } = req.body;

    try {
        const userResult = await db.query(`
            SELECT u.*, up.total_points, up.total_bottles 
            FROM users u 
            LEFT JOIN user_points up ON u.rfid_id = up.rfid_id 
            WHERE u.username = $1
        `, [username]);

        if (userResult.rows.length === 0) {
            await db.query(`
                INSERT INTO login_attempts (ip_address, success)
                VALUES ($1, false)
            `, [ip]);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = userResult.rows[0];

        // Check if account is locked
        if (user.account_locked && user.locked_until > new Date()) {
            return res.status(423).json({ 
                error: 'Account locked', 
                locked_until: user.locked_until 
            });
        }

        // Verify PIN
        const isValidPin = await bcrypt.compare(pin, user.pin_code);

        if (!isValidPin) {
            await db.query(`
                UPDATE users 
                SET login_attempts = login_attempts + 1 
                WHERE id = $1
            `, [user.id]);

            await db.query(`
                INSERT INTO login_attempts (user_id, ip_address, success)
                VALUES ($1, $2, false)
            `, [user.id, ip]);

            if (user.login_attempts + 1 >= 3) {
                const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
                await db.query(`
                    UPDATE users 
                    SET account_locked = true, locked_until = $1 
                    WHERE id = $2
                `, [lockUntil, user.id]);
                
                return res.status(423).json({ 
                    error: 'Account locked due to too many failed attempts',
                    locked_until: lockUntil 
                });
            }

            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Reset login attempts
        await db.query(`
            UPDATE users 
            SET login_attempts = 0, account_locked = false, locked_until = NULL, last_login = NOW()
            WHERE id = $1
        `, [user.id]);

        await db.query(`
            INSERT INTO login_attempts (user_id, ip_address, success)
            VALUES ($1, $2, true)
        `, [user.id, ip]);

        // Generate session token
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.query(`
            INSERT INTO user_sessions (user_id, session_token, expires_at, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [user.id, sessionToken, expiresAt, ip]);

        // Remove sensitive data
        const { pin_code, login_attempts, account_locked, locked_until, ...userData } = user;

        res.json({
            success: true,
            message: 'Login successful',
            session_token: sessionToken,
            user: userData,
            expires_at: expiresAt
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify session
router.post('/verify-session', async (req, res) => {
    const { session_token } = req.body;

    try {
        const sessionResult = await db.query(`
            SELECT us.*, u.*, up.total_points, up.total_bottles
            FROM user_sessions us
            JOIN users u ON us.user_id = u.id
            LEFT JOIN user_points up ON u.rfid_id = up.rfid_id
            WHERE us.session_token = $1 AND us.expires_at > NOW()
        `, [session_token]);

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        const session = sessionResult.rows[0];
        const { pin_code, login_attempts, account_locked, locked_until, ...userData } = session;

        res.json({
            success: true,
            user: userData
        });

    } catch (error) {
        console.error('Session verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    const { session_token } = req.body;

    try {
        await db.query(`
            DELETE FROM user_sessions 
            WHERE session_token = $1
        `, [session_token]);

        res.json({ success: true, message: 'Logout successful' });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function generateSessionToken() {
    return require('crypto').randomBytes(32).toString('hex');
}

module.exports = router;