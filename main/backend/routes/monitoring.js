const express = require('express');
const db = require('../database');
const router = express.Router();

// Add bottle insertion
router.post('/add-bottle', async (req, res) => {
    const { rfid, bottles, points, sensor_data } = req.body;
    
    try {
        const isSuspicious = checkForSuspiciousActivity(rfid, sensor_data);
        
        const result = await db.query(`
            INSERT INTO bottle_history 
            (rfid_id, bottles_inserted, points_earned, sensor_readings, status, suspicion_reason)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [
            rfid, 
            bottles || 1, 
            points || 10, 
            { sensor_value: sensor_data }, 
            isSuspicious ? 'suspicious' : 'valid',
            isSuspicious ? 'Rapid insertions detected' : null
        ]);
        
        await db.query(`
            INSERT INTO user_points (rfid_id, total_points, total_bottles)
            VALUES ($1, $2, $3)
            ON CONFLICT (rfid_id) 
            DO UPDATE SET 
                total_points = user_points.total_points + $2,
                total_bottles = user_points.total_bottles + $3,
                last_updated = NOW()
        `, [rfid, points || 10, bottles || 1]);
        
        res.json({ 
            success: true, 
            pointsAdded: points || 10,
            bottlesAdded: bottles || 1,
            status: isSuspicious ? 'suspicious' : 'valid'
        });
        
    } catch (error) {
        console.error('Error adding bottle:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get machine statistics
router.get('/machine-stats', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                machine_id,
                COUNT(*) as total_operations,
                SUM(bottles_inserted) as total_bottles,
                SUM(points_earned) as total_points,
                COUNT(CASE WHEN status = 'suspicious' THEN 1 END) as suspicious_count,
                MAX(insertion_time) as last_activity
            FROM bottle_history
            GROUP BY machine_id
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching machine stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get suspicious activities
router.get('/suspicious-activities', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT bh.*, u.name, u.student_id 
            FROM bottle_history bh
            JOIN users u ON bh.rfid_id = u.rfid_id
            WHERE bh.status = 'suspicious'
            ORDER BY bh.insertion_time DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching suspicious activities:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function checkForSuspiciousActivity(rfid, sensorData) {
    return false;
}

module.exports = router;