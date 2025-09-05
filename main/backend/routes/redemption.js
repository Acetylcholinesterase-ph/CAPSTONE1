const express = require('express');
const db = require('../database');
const router = express.Router();

// Redeem a coupon
router.post('/redeem', async (req, res) => {
    const { rfid, coupon_id } = req.body;
    
    try {
        await db.query('BEGIN');
        
        const pointsResult = await db.query(
            'SELECT total_points FROM user_points WHERE rfid_id = $1',
            [rfid]
        );
        
        if (pointsResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        const couponResult = await db.query(
            'SELECT points_required, coupon_name FROM coupons_catalog WHERE id = $1 AND is_active = true',
            [coupon_id]
        );
        
        if (couponResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Coupon not found' });
        }
        
        if (pointsResult.rows[0].total_points < couponResult.rows[0].points_required) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient points' });
        }
        
        const redemptionCode = generateRedemptionCode();
        
        await db.query(
            'UPDATE user_points SET total_points = total_points - $1 WHERE rfid_id = $2',
            [couponResult.rows[0].points_required, rfid]
        );
        
        await db.query(
            `INSERT INTO redeemed_coupons (rfid_id, coupon_id, points_used, redemption_code, expiry_date)
             VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')`,
            [rfid, coupon_id, couponResult.rows[0].points_required, redemptionCode]
        );
        
        await db.query('COMMIT');
        
        res.json({ 
            success: true, 
            code: redemptionCode,
            coupon: couponResult.rows[0].coupon_name,
            pointsUsed: couponResult.rows[0].points_required
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error redeeming coupon:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function generateRedemptionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Get available coupons
router.get('/coupons', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, coupon_name, description, points_required, coupon_value, validity_days
            FROM coupons_catalog
            WHERE is_active = true
            ORDER BY points_required
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;