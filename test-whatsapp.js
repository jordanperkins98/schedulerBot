const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

// Clear auth directory first to start fresh
const authDir = path.join(__dirname, '.wwebjs_auth');
if (fs.existsSync(authDir)) {
  console.log('Removing existing auth directory...');
  fs.rmSync(authDir, { recursive: true, force: true });
}

console.log('Initializing WhatsApp client...');

// Create a client instance
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ],
    executablePath: require('puppeteer').executablePath()
  }
});

// Print QR in terminal
client.on('qr', (qr) => {
  console.log('QR RECEIVED', qr);
  qrcode.generate(qr, { small: true });
});

// Ready event
client.on('ready', () => {
  console.log('Client is ready!');
});

// Authentication successful
client.on('authenticated', () => {
  console.log('AUTHENTICATED');
});

// Handle errors and initialize
client.on('auth_failure', msg => {
  console.error('AUTHENTICATION FAILURE', msg);
});

// Initialize client
client.initialize()
  .catch(err => {
    console.error('Failed to initialize client:', err);
  });
