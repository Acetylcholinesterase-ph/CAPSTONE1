const db = require('../database');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const sessionResult = await db.query(`
            SELECT us.*, u.*
            FROM user_sessions us
            JOIN users u ON us.user_id = u.id
            WHERE us.session_token = $1 AND us.expires_at > NOW()
        `, [token]);

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        req.user = sessionResult.rows[0];
        next();

    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { authenticateToken };