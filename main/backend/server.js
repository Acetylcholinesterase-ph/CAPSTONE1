const express = require('express');
const cors = require('cors');
require('dotenv').config();

const studentRoutes = require('./routes/students');
const redemptionRoutes = require('./routes/redemption');
const monitoringRoutes = require('./routes/monitoring');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/student', studentRoutes);
app.use('/api/redemption', redemptionRoutes);
app.use('/api/monitoring', monitoringRoutes);

// Health check endpoint (public)
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Eco Recycle API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 API available at http://localhost:${PORT}/api`);
});