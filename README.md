# WhatsApp Message Scheduler Bot 📱

A web-based application that allows you to schedule WhatsApp messages to be sent at specific times in the future. Perfect for reminders, birthday messages, or any scheduled communication.

## Features

- 🔗 **WhatsApp Web Integration**: Connect your WhatsApp account securely
- ⏰ **Message Scheduling**: Schedule messages for any future date and time
- 💬 **Chat Selection**: Choose from all your WhatsApp contacts and groups
- 📱 **Real-time Interface**: Live updates when messages are sent
- 💾 **Persistent Storage**: Messages are saved and loaded even after server restart
- 🎨 **Modern UI**: Clean, responsive design that works on all devices

## Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd schedulerBot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the application**:
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Open your browser** and go to `http://localhost:3000`

## Setup Instructions

### First Time Setup

1. **Start the server** using `npm start`
2. **Open your browser** and navigate to `http://localhost:3000`
3. **Scan the QR code** that appears with your WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices
   - Tap "Link a Device"
   - Scan the QR code displayed on the web interface

4. **Wait for connection** - Once connected, you'll see:
   - Green status indicator showing "Connected to WhatsApp"
   - Your chat list will populate in the dropdown

### Scheduling Messages

1. **Select a chat** from the dropdown (contacts and groups)
2. **Type your message** in the text area
3. **Choose date and time** for when you want the message sent
4. **Click "Schedule Message"**

Your message will be saved and automatically sent at the specified time.

### Managing Scheduled Messages

- View all scheduled messages in the right panel
- See message status: Pending, Sent, Failed, or Missed
- Cancel pending messages by clicking the "Cancel" button
- Refresh the list to see updates

## How It Works

The application uses several key technologies:

- **whatsapp-web.js**: Connects to WhatsApp Web API
- **node-cron**: Handles message scheduling
- **SQLite**: Stores scheduled messages persistently
- **Socket.io**: Provides real-time updates to the web interface
- **Express.js**: Serves the web interface and API

## Important Notes

### Security & Privacy
- Your WhatsApp session is stored locally on your computer
- Messages are stored in a local SQLite database
- No data is sent to external servers
- The application only runs on your local machine

### Limitations
- Requires your computer to be online when scheduled messages should be sent
- WhatsApp session needs to remain active
- If WhatsApp Web session expires, you'll need to scan the QR code again

### Timezone
- The application uses your local system timezone
- Make sure your computer's time/timezone is set correctly

## Troubleshooting

### WhatsApp Won't Connect
- Make sure WhatsApp Web works in your regular browser
- Try refreshing the page to get a new QR code
- Check that your phone has internet connection
- Ensure WhatsApp is running on your phone

### Messages Not Sending
- Check that WhatsApp connection is active (green status)
- Verify your computer is online at the scheduled time
- Check the scheduled messages list for error status

### Database Issues
- Delete `scheduler.db` file to reset all scheduled messages
- Restart the application if you encounter database errors

## Development

### Project Structure
```
schedulerBot/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── scheduler.db           # SQLite database (auto-created)
├── public/
│   └── index.html         # Web interface
└── .wwebjs_auth/          # WhatsApp session data (auto-created)
```

### API Endpoints
- `GET /api/status` - Get connection status
- `GET /api/chats` - Get available chats
- `GET /api/scheduled-messages` - Get all scheduled messages
- `POST /api/schedule-message` - Schedule a new message
- `DELETE /api/scheduled-messages/:id` - Cancel a scheduled message
- `POST /api/send-message` - Send message immediately

## License

ISC License - Feel free to modify and use as needed.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

If you encounter any issues:
1. Check the console logs for error messages
2. Ensure all dependencies are properly installed
3. Verify your internet connection
4. Try restarting the application

For additional help, please create an issue in the repository.
