# Screen Sharing App for Online Tutoring

A real-time screen sharing application that allows students to share their screens with tutors during online classes.

## Features

- **Student Screen Sharing**: Students can share their entire screen with the tutor
- **Tutor Dashboard**: Tutors can monitor multiple student screens simultaneously
- **Real-time Communication**: Uses WebRTC for low-latency screen sharing
- **Room Management**: Simple room-based system for organizing classes
- **Responsive Design**: Works on desktop and mobile devices

## How to Use

### For Tutors:
1. Enter your name
2. Select "Tutor" option
3. Leave Room ID empty (will be auto-generated) or enter a custom one
4. Click "Join Room"
5. Share the Room ID with your students
6. Monitor student screens from the dashboard

### For Students:
1. Enter your name
2. Select "Student" option
3. Enter the Room ID provided by your tutor
4. Click "Join Room"
5. Click "Share Screen" to start sharing
6. Select the screen/window you want to share

## Installation & Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser and go to `http://localhost:3000`

## Development

Run the server in development mode with auto-restart:
```bash
npm run dev
```

## Technology Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5, CSS3, JavaScript
- **Real-time Communication**: WebRTC, Socket.io
- **Screen Capture**: getDisplayMedia API

## Browser Requirements

- Chrome 72+
- Firefox 66+
- Safari 13+
- Edge 79+

## Security Notes

- The application requires HTTPS in production for screen sharing to work
- Screen sharing permissions must be granted by the user
- No data is stored permanently - all connections are real-time only