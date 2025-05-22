const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

console.log('Starting WhatsApp connection test...');

// Clear previous authentication data if exists
const authPath = path.join(__dirname, '.wwebjs_auth');
if (fs.existsSync(authPath)) {
  console.log('Removing existing authentication data...');
  fs.rmSync(authPath, { recursive: true, force: true });
  console.log('Authentication data removed.');
}

// Create a new whatsapp client instance with better error handling
const client = new Client({
  authStrategy: new LocalAuth(),
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
  webVersion: '2.2318.11',
  webVersionCache: { type: 'none' }
});

// Event: QR code received
client.on('qr', (qr) => {
  console.log('QR Code received:');
  qrcode.generate(qr, { small: true });
  console.log('Scan this QR code with your WhatsApp app to connect');
});

// Event: Initializing
client.on('loading_screen', (percent, message) => {
  console.log(`Loading: ${percent}% - ${message}`);
});

// Event: Client is ready
client.on('ready', () => {
  console.log('WhatsApp client is ready! Connection successful.');
  console.log('You can now use the main application.');
});

// Event: Authentication successful
client.on('authenticated', () => {
  console.log('Authentication successful!');
});

// Event: Authentication failure
client.on('auth_failure', (msg) => {
  console.error('Authentication failed:', msg);
});

// Event: Disconnected
client.on('disconnected', (reason) => {
  console.log('Client disconnected:', reason);
});

// Initialize the client
console.log('Initializing WhatsApp client...');
console.log('Waiting for QR code...');

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the client with proper error handling
client.initialize()
  .catch(err => {
    console.error('Failed to initialize the WhatsApp client:');
    console.error(err);
  });

console.log('If a QR code doesn\'t appear within 30 seconds, there might be connection issues.');
console.log('Press Ctrl+C to exit.');
