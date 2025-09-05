const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Get top 10 leaderboard
router.get('/top', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT name, student_id, total_bottles, total_points, rank
            FROM leaderboard
            WHERE position <= 10
            ORDER BY rank
            LIMIT 10
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's rank and position
router.get('/my-rank', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT rank, position, total_bottles, total_points
            FROM leaderboard
            WHERE id = $1
        `, [req.user.id]);
        
        if (result.rows.length === 0) {
            return res.json({ 
                rank: 'N/A', 
                position: 'N/A', 
                total_bottles: 0,
                total_points: 0,
                message: 'Start recycling to get on the leaderboard!' 
            });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching user rank:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get users around current user's position
router.get('/around-me', authenticateToken, async (req, res) => {
    try {
        const userResult = await db.query(`
            SELECT position FROM leaderboard WHERE id = $1
        `, [req.user.id]);
        
        if (userResult.rows.length === 0) {
            return res.json([]);
        }
        
        const userPosition = userResult.rows[0].position;
        const range = 2; // Show 2 above and 2 below
        
        const result = await db.query(`
            SELECT name, student_id, total_bottles, total_points, rank, position
            FROM leaderboard
            WHERE position BETWEEN $1 AND $2
            ORDER BY position
        `, [userPosition - range, userPosition + range]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching around me:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;