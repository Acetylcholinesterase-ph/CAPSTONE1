# Eco Recycle System

A complete recycling reward system with Arduino machine, web portal, and cloud database.

## System Components

1. **Arduino Machine** - Physical recycling machine with RFID, sensors, and display
2. **ESP8266 WiFi** - WiFi bridge for machine-to-server communication
3. **Node.js Backend** - REST API with authentication and database management
4. **PostgreSQL Database** - Cloud database on Aiven
5. **Web Frontend** - Responsive website for students and administrators

## Setup Instructions

### 1. Database Setup
```bash
# Create Aiven PostgreSQL instance
# Run database/schema.sql to create tables