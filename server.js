const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, userType, userName } = data;
    
    socket.join(roomId);
    socket.userType = userType;
    socket.userName = userName;
    socket.roomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        tutor: null,
        students: new Map()
      });
    }

    const room = rooms.get(roomId);

    if (userType === 'tutor') {
      room.tutor = socket.id;
      socket.to(roomId).emit('tutor-joined');
    } else {
      room.students.set(socket.id, {
        name: userName,
        screenSharing: false
      });
      
      if (room.tutor) {
        io.to(room.tutor).emit('student-joined', {
          studentId: socket.id,
          name: userName
        });
      }
    }

    console.log(`${userType} ${userName} joined room ${roomId}`);
  });

  socket.on('start-screen-share', () => {
    const room = rooms.get(socket.roomId);
    if (room && room.students.has(socket.id)) {
      room.students.get(socket.id).screenSharing = true;
      
      if (room.tutor) {
        io.to(room.tutor).emit('student-screen-share-started', {
          studentId: socket.id,
          name: socket.userName
        });
      }
    }
  });

  socket.on('stop-screen-share', () => {
    const room = rooms.get(socket.roomId);
    if (room && room.students.has(socket.id)) {
      room.students.get(socket.id).screenSharing = false;
      
      if (room.tutor) {
        io.to(room.tutor).emit('student-screen-share-stopped', {
          studentId: socket.id,
          name: socket.userName
        });
      }
    }
  });

  // Simplified WebRTC signaling
  socket.on('offer', (data) => {
    const room = rooms.get(socket.roomId);
    if (room && room.tutor && socket.userType === 'student') {
      // Student sending offer to tutor
      io.to(room.tutor).emit('offer', {
        offer: data.offer,
        studentId: socket.id
      });
    }
  });

  socket.on('answer', (data) => {
    const room = rooms.get(socket.roomId);
    if (room && socket.userType === 'tutor') {
      // Tutor sending answer to student
      socket.broadcast.to(socket.roomId).emit('answer', {
        answer: data.answer
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    // Broadcast ICE candidate to other users in the room
    socket.broadcast.to(socket.roomId).emit('ice-candidate', {
      candidate: data.candidate
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const room = rooms.get(socket.roomId);
    if (room) {
      if (socket.userType === 'tutor') {
        room.tutor = null;
        socket.to(socket.roomId).emit('tutor-left');
      } else {
        room.students.delete(socket.id);
        if (room.tutor) {
          io.to(room.tutor).emit('student-left', {
            studentId: socket.id,
            name: socket.userName
          });
        }
      }

      if (!room.tutor && room.students.size === 0) {
        rooms.delete(socket.roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});