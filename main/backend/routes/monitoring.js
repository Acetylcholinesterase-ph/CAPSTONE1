const express = require('express');
const db = require('../database');
const router = express.Router();

router.post('/add-bottle', async (req, res) => {
  const { rfid, bottles, points, sensor_data } = req.body;
  
  try {
    const isSuspicious = checkForSuspiciousActivity(rfid, sensor_data);
    
    const result = await db.query(`
      INSERT INTO bottle_history 
      (rfid_id, bottles_inserted, points_earned, sensor_readings, status, suspicion_reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [rfid, bottles, points, {sensor_value: sensor_data}, 
        isSuspicious ? 'suspicious' : 'valid',
        isSuspicious ? 'Rapid insertions detected' : null]);
    
    // Update user points
    await db.query(`
      UPDATE user_points 
      SET total_points = total_points + $1, total_bottles = total_bottles + $2 
      WHERE rfid_id = $3
    `, [points, bottles, rfid]);
    
    res.json({ 
      success: true, 
      pointsAdded: points,
      status: isSuspicious ? 'suspicious' : 'valid'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    res.status(500).json({ error: error.message });
  }
});

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
    res.status(500).json({ error: error.message });
  }
});

function checkForSuspiciousActivity(rfid, sensorData) {
  // Implement anti-cheating logic here
  // This would check for rapid insertions, unusual patterns, etc.
  return false;
}

module.exports = router;