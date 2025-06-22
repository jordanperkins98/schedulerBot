const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cron = require('node-cron');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Handle auth directory - preserve sessions for reconnection
const authDir = path.join(__dirname, '.wwebjs_auth');
const cacheDir = path.join(__dirname, '.wwebjs_cache');

// Only clear auth if explicitly requested via environment variable
const FORCE_FRESH_AUTH = process.env.FORCE_FRESH_AUTH === 'true';

if (FORCE_FRESH_AUTH) {
    console.log('🔄 FORCE_FRESH_AUTH=true - Removing existing auth for fresh start...');
    if (fs.existsSync(authDir)) {
        try {
            fs.rmSync(authDir, { recursive: true, force: true });
            console.log('Auth directory removed successfully');
        } catch (err) {
            console.error('Error removing auth directory:', err);
        }
    }
    if (fs.existsSync(cacheDir)) {
        try {
            fs.rmSync(cacheDir, { recursive: true, force: true });
            console.log('Cache directory removed successfully');
        } catch (err) {
            console.error('Error removing cache directory:', err);
        }
    }
} else {
    console.log('🔐 Preserving existing WhatsApp session for automatic reconnection...');
    if (fs.existsSync(authDir)) {
        console.log('✅ Found existing auth directory - will attempt to reconnect');
    } else {
        console.log('📱 No existing auth found - will show QR code for first-time setup');
    }
}

// Ensure auth directories exist
fs.mkdirSync(authDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

// Initialize WhatsApp client with enhanced reconnection settings
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: authDir
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-application-cache',
            '--no-default-browser-check',
            '--ignore-certificate-errors'
        ]
    },
    qrMaxRetries: 5,
    qrTimeoutMs: 45000,  // Increase QR timeout to 45 seconds
    authTimeoutMs: 60000, // Increase auth timeout to 60 seconds
    restartOnAuthFail: true, // Restart on auth failure
    takeoverOnConflict: true, // Take over if WhatsApp Web is open elsewhere
    takeoverTimeoutMs: 30000 // Timeout for takeover
});

// Initialize SQLite database
const db = new sqlite3.Database('./scheduler.db');

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS scheduled_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        chat_name TEXT NOT NULL,
        message TEXT NOT NULL,
        scheduled_time DATETIME NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

let clientReady = false;
let qrCodeString = '';
let chats = [];
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectTimeout = null;
let isReconnecting = false;

// WhatsApp client events
client.on('qr', async (qr) => {
    console.log('QR Code received');
    try {
        // Generate QR code for web interface
        qrCodeString = await qrcode.toDataURL(qr);
        console.log('QR code converted to data URL successfully');
        
        // Emit to all connected clients
        io.emit('qr', qrCodeString);
        console.log('QR code emitted via socket.io');
        
        // Also display QR code in terminal for easier scanning
        console.log('\nScan this QR code with WhatsApp:');
        qrcodeTerminal.generate(qr, { small: true });
        console.log('\nOr scan the QR code displayed in the web interface at http://localhost:3000');
    } catch (error) {
        console.error('Failed to generate QR code:', error);
        console.error(error);
    }
});

client.on('ready', async () => {
    console.log('WhatsApp client is ready!');
    clientReady = true;
    
    // Reset reconnection state on successful connection
    reconnectAttempts = 0;
    isReconnecting = false;
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    
    try {
        // Get all chats
        const allChats = await client.getChats();
        console.log(`Found ${allChats.length} chats`);
        
        chats = allChats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.id.user,
            isGroup: chat.isGroup
        }));
        
        io.emit('client_ready', { chats });
    } catch (error) {
        console.error('Error getting chats:', error);
    }
});

client.on('authenticated', () => {
    console.log('WhatsApp client authenticated');
    io.emit('authenticated');
});

client.on('loading_screen', (percent, message) => {
    console.log(`Loading screen: ${percent}% - ${message}`);
});

client.on('auth_failure', (error) => {
    console.error('Authentication failed:', error);
    io.emit('auth_failure', { message: 'Authentication failed' });
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp client disconnected:', reason);
    clientReady = false;
    qrCodeString = '';
    chats = [];
    
    // Emit disconnection to all connected clients
    io.emit('disconnected', { reason, reconnectAttempts, maxReconnectAttempts });
    
    // Attempt automatic reconnection
    if (!isReconnecting && reconnectAttempts < maxReconnectAttempts) {
        isReconnecting = true;
        reconnectAttempts++;
        
        const reconnectDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
        console.log(`🔄 Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts}) in ${reconnectDelay/1000} seconds...`);
        
        io.emit('reconnecting', { 
            attempt: reconnectAttempts, 
            maxAttempts: maxReconnectAttempts,
            delay: reconnectDelay 
        });
        
        reconnectTimeout = setTimeout(async () => {
            try {
                console.log(`🔄 Reconnection attempt ${reconnectAttempts}...`);
                await client.initialize();
                isReconnecting = false;
            } catch (error) {
                console.error('Reconnection failed:', error);
                isReconnecting = false;
                
                if (reconnectAttempts >= maxReconnectAttempts) {
                    console.log('❌ Max reconnection attempts reached. Manual intervention required.');
                    io.emit('reconnect_failed', { 
                        message: 'Max reconnection attempts reached. Please refresh the page or restart the application.' 
                    });
                }
            }
        }, reconnectDelay);
    } else if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('❌ Max reconnection attempts reached. Manual intervention required.');
        io.emit('reconnect_failed', { 
            message: 'Max reconnection attempts reached. Please refresh the page or restart the application.' 
        });
    }
});

// Handle general errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Socket.io events are now handled during initialization

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/status', (req, res) => {
    res.json({
        ready: clientReady,
        qr: qrCodeString,
        chats: chats
    });
});

app.get('/api/chats', (req, res) => {
    if (!clientReady) {
        return res.status(400).json({ error: 'WhatsApp client not ready' });
    }
    res.json(chats);
});

app.get('/api/scheduled-messages', (req, res) => {
    db.all('SELECT * FROM scheduled_messages ORDER BY scheduled_time', (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.post('/api/schedule-message', (req, res) => {
    console.log('📩 New message scheduling request received');
    console.log('Request body:', req.body);
    
    const { chatId, chatName, message, scheduledTime } = req.body;
    
    if (!chatId || !message || !scheduledTime) {
        console.log('❌ Missing required fields in request');
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!clientReady) {
        console.log('❌ WhatsApp client not ready');
        return res.status(400).json({ error: 'WhatsApp client not ready' });
    }
    
    // Declare scheduleDate in the outer scope so it's available in the callback
    let scheduleDate;
    
    try {
        // Validate scheduled time is in the future
        const now = new Date();
        scheduleDate = new Date(scheduledTime);
        
        console.log(`🕒 Scheduling details:`);
        console.log(`- Input time string: ${scheduledTime}`);
        console.log(`- Parsed date object: ${scheduleDate}`);
        console.log(`- Current time: ${now.toLocaleString('en-GB')}`);
        console.log(`- Scheduled time: ${scheduleDate.toLocaleString('en-GB')}`);
        console.log(`- Time until scheduled: ${(scheduleDate - now) / 1000 / 60} minutes`);
        
        if (isNaN(scheduleDate.getTime())) {
            console.log('❌ Invalid date format');
            return res.status(400).json({ error: 'Invalid date format' });
        }
        
        if (scheduleDate <= now) {
            console.log('❌ Scheduled time must be in the future');
            return res.status(400).json({ error: 'Scheduled time must be in the future' });
        }
    } catch (error) {
        console.error('❌ Error validating scheduled time:', error);
        return res.status(400).json({ error: 'Invalid date format' });
    }
    
    db.run(
        'INSERT INTO scheduled_messages (chat_id, chat_name, message, scheduled_time) VALUES (?, ?, ?, ?)',
        [chatId, chatName, message, scheduledTime],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const messageId = this.lastID;
            scheduleMessage(messageId, chatId, message, scheduleDate);
            
            res.json({
                id: messageId,
                message: 'Message scheduled successfully'
            });
        }
    );
});

app.delete('/api/scheduled-messages/:id', (req, res) => {
    const messageId = req.params.id;
    
    db.run('DELETE FROM scheduled_messages WHERE id = ?', [messageId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        res.json({ message: 'Message cancelled successfully' });
    });
});

app.post('/api/send-message', async (req, res) => {
    const { chatId, message } = req.body;
    
    if (!clientReady) {
        return res.status(400).json({ error: 'WhatsApp client not ready' });
    }
    
    try {
        await client.sendMessage(chatId, message);
        res.json({ message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Manual reconnection endpoint
app.post('/api/reconnect', async (req, res) => {
    console.log('🔄 Manual reconnection requested');
    
    if (isReconnecting) {
        return res.status(400).json({ error: 'Reconnection already in progress' });
    }
    
    if (clientReady) {
        return res.status(400).json({ error: 'Client is already connected' });
    }
    
    try {
        // Clear any existing reconnection timeout
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        
        // Reset reconnection attempts for manual reconnect
        reconnectAttempts = 0;
        isReconnecting = true;
        
        console.log('🔄 Starting manual reconnection...');
        io.emit('reconnecting', { 
            attempt: 1, 
            maxAttempts: maxReconnectAttempts,
            manual: true 
        });
        
        await client.initialize();
        isReconnecting = false;
        
        res.json({ message: 'Reconnection initiated successfully' });
    } catch (error) {
        console.error('Manual reconnection failed:', error);
        isReconnecting = false;
        res.status(500).json({ error: 'Reconnection failed', details: error.message });
    }
});

// Reset session endpoint (force fresh QR)
app.post('/api/reset-session', async (req, res) => {
    console.log('🔄 Session reset requested');
    
    try {
        // Destroy current client
        if (client) {
            await client.destroy();
        }
        
        // Clear reconnection state
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        
        reconnectAttempts = 0;
        isReconnecting = false;
        clientReady = false;
        qrCodeString = '';
        chats = [];
        
        // Remove auth directories
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
        }
        if (fs.existsSync(cacheDir)) {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
        
        // Recreate directories
        fs.mkdirSync(authDir, { recursive: true });
        fs.mkdirSync(cacheDir, { recursive: true });
        
        // Emit reset event
        io.emit('session_reset');
        
        // Reinitialize client after a short delay
        setTimeout(async () => {
            try {
                await client.initialize();
                res.json({ message: 'Session reset successfully. New QR code will be generated.' });
            } catch (error) {
                console.error('Failed to reinitialize after reset:', error);
                res.status(500).json({ error: 'Failed to reinitialize after reset' });
            }
        }, 2000);
        
    } catch (error) {
        console.error('Session reset failed:', error);
        res.status(500).json({ error: 'Session reset failed', details: error.message });
    }
});

// Get connection status with detailed info
app.get('/api/connection-status', (req, res) => {
    res.json({
        ready: clientReady,
        reconnecting: isReconnecting,
        reconnectAttempts: reconnectAttempts,
        maxReconnectAttempts: maxReconnectAttempts,
        hasAuth: fs.existsSync(path.join(authDir, 'session')),
        qrAvailable: !!qrCodeString
    });
});

// Function to schedule a message
function scheduleMessage(messageId, chatId, message, scheduleDate) {
    // Ensure we're working with a proper Date object
    if (typeof scheduleDate === 'string') {
        scheduleDate = new Date(scheduleDate);
    }
    
    const minutes = scheduleDate.getMinutes();
    const hours = scheduleDate.getHours();
    const dayOfMonth = scheduleDate.getDate();
    const month = scheduleDate.getMonth() + 1; // Month is 0-indexed in JS
    
    const cronTime = `${minutes} ${hours} ${dayOfMonth} ${month} *`;
    
    console.log(`=== MESSAGE SCHEDULING DETAILS ===`);
    console.log(`Message ID: ${messageId}`);
    console.log(`Chat ID: ${chatId}`);
    console.log(`Message content: ${message}`);
    console.log(`Raw scheduled date: ${scheduleDate}`);
    console.log(`Scheduled time (UK format): ${scheduleDate.toLocaleString('en-GB', { timeZone: 'Europe/London' })}`);
    console.log(`Cron expression: ${cronTime}`);
    console.log(`Current time: ${new Date().toLocaleString('en-GB')}`);
    console.log(`Timezone to be used: Europe/London`);
    console.log(`================================`);
    
    cron.schedule(cronTime, async () => {
        console.log(`⏰ EXECUTING SCHEDULED MESSAGE ⏰`);
        console.log(`Time now: ${new Date().toLocaleString('en-GB')}`);
        console.log(`Message ID: ${messageId}, Chat: ${chatId}`);
        
        try {
            if (clientReady) {
                console.log(`WhatsApp client is ready, sending message...`);
                await client.sendMessage(chatId, message);
                
                // Update status in database
                db.run('UPDATE scheduled_messages SET status = ? WHERE id = ?', ['sent', messageId]);
                
                console.log(`✅ Message successfully sent to ${chatId}: ${message}`);
                io.emit('message_sent', { messageId, chatId, message });
            } else {
                console.error(`❌ WhatsApp client not ready, message not sent`);
                db.run('UPDATE scheduled_messages SET status = ? WHERE id = ?', ['failed', messageId]);
            }
        } catch (error) {
            console.error(`❌ Error sending scheduled message:`, error);
            db.run('UPDATE scheduled_messages SET status = ? WHERE id = ?', ['failed', messageId]);
        }
    }, {
        scheduled: true,
        timezone: "Europe/London" // UK time zone
    });
}

// Load existing scheduled messages on startup
function loadScheduledMessages() {
    console.log('🔄 Loading scheduled messages from database...');
    
    db.all('SELECT * FROM scheduled_messages WHERE status = "pending"', (err, rows) => {
        if (err) {
            console.error('❌ Error loading scheduled messages:', err);
            return;
        }
        
        console.log(`📋 Found ${rows.length} pending scheduled messages`);
        
        rows.forEach(row => {
            try {
                console.log(`\nEvaluating message ID ${row.id}:`);
                console.log(`Raw date string from DB: ${row.scheduled_time}`);
                
                // Parse the date correctly
                const scheduleDate = new Date(row.scheduled_time);
                const now = new Date();
                
                console.log(`Parsed date: ${scheduleDate}`);
                console.log(`Current time: ${now}`);
                console.log(`Time until scheduled: ${(scheduleDate - now) / 1000 / 60} minutes`);
                
                if (scheduleDate > now) {
                    console.log(`✅ This message is scheduled for the future, adding to scheduler`);
                    scheduleMessage(row.id, row.chat_id, row.message, scheduleDate);
                } else {
                    console.log(`❌ This message was scheduled for the past, marking as missed`);
                    db.run('UPDATE scheduled_messages SET status = ? WHERE id = ?', ['missed', row.id]);
                }
            } catch (error) {
                console.error(`❌ Error processing scheduled message ${row.id}:`, error);
            }
        });
    });
}

// Initialize WhatsApp client
console.log('Initializing WhatsApp client...');
try {
    // Make sure to send initial status to any connected clients
    io.on('connection', (socket) => {
        console.log('Client connected');
        
        // Send current status immediately on connection
        socket.emit('status', {
            ready: clientReady,
            qr: qrCodeString,
            chats: chats
        });
        
        socket.on('disconnect', () => {
            console.log('Client disconnected');
        });
    });
    
    client.initialize()
        .then(() => {
            console.log('WhatsApp client initialized successfully');
            // Load scheduled messages after WhatsApp is ready
            setTimeout(loadScheduledMessages, 5000);
        })
        .catch(err => {
            console.error('Error during client initialization:', err);
        });
} catch (error) {
    console.error('Failed to initialize WhatsApp client:', error);
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    db.close();
    client.destroy();
    process.exit(0);
});
