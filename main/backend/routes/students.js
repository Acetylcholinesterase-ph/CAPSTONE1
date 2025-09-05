const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Get student by RFID
router.get('/rfid/:rfid', authenticateToken, async (req, res) => {
    try {
        if (req.user.rfid_id !== req.params.rfid) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(`
            SELECT u.*, up.total_points, up.total_bottles 
            FROM users u 
            LEFT JOIN user_points up ON u.rfid_id = up.rfid_id 
            WHERE u.rfid_id = $1
        `, [req.params.rfid]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        const { pin_code, login_attempts, account_locked, locked_until, ...studentData } = result.rows[0];
        
        res.json(studentData);
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get student by student ID
router.get('/id/:studentId', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT u.*, up.total_points, up.total_bottles 
            FROM users u 
            LEFT JOIN user_points up ON u.rfid_id = up.rfid_id 
            WHERE u.student_id = $1
        `, [req.params.studentId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        const { pin_code, login_attempts, account_locked, locked_until, ...studentData } = result.rows[0];
        
        res.json(studentData);
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get student redemption codes
router.get('/:rfid/codes', authenticateToken, async (req, res) => {
    try {
        if (req.user.rfid_id !== req.params.rfid) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(`
            SELECT rc.redemption_code, cc.coupon_name, rc.status, rc.expiry_date
            FROM redeemed_coupons rc
            JOIN coupons_catalog cc ON rc.coupon_id = cc.id
            WHERE rc.rfid_id = $1 AND rc.status = 'active' AND rc.expiry_date > NOW()
            ORDER BY rc.redeemed_at DESC
        `, [req.params.rfid]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching redemption codes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;