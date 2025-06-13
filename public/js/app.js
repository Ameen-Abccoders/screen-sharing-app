class ScreenSharingApp {
    constructor() {
        this.socket = io();
        this.userType = null;
        this.userName = null;
        this.roomId = null;
        this.webrtc = null;
        this.localStream = null;
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketListeners();
    }

    initializeElements() {
        // Screens
        this.loginScreen = document.getElementById('login-screen');
        this.studentScreen = document.getElementById('student-screen');
        this.tutorScreen = document.getElementById('tutor-screen');

        // Login elements
        this.userNameInput = document.getElementById('userName');
        this.roomIdInput = document.getElementById('roomId');
        this.joinBtn = document.getElementById('joinBtn');

        // Student elements
        this.shareScreenBtn = document.getElementById('shareScreenBtn');
        this.stopSharingBtn = document.getElementById('stopSharingBtn');
        this.leaveRoomBtn = document.getElementById('leaveRoomBtn');
        this.localVideo = document.getElementById('localVideo');

        // Tutor elements
        this.tutorLeaveBtn = document.getElementById('tutorLeaveBtn');
        this.roomIdDisplay = document.getElementById('roomIdDisplay');
        this.studentStreams = document.getElementById('studentStreams');
    }

    bindEvents() {
        this.joinBtn.addEventListener('click', () => this.joinRoom());
        this.shareScreenBtn.addEventListener('click', () => this.startScreenShare());
        this.stopSharingBtn.addEventListener('click', () => this.stopScreenShare());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.tutorLeaveBtn.addEventListener('click', () => this.leaveRoom());

        // Handle user type change
        document.querySelectorAll('input[name="userType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'tutor') {
                    this.roomIdInput.placeholder = 'Room ID (leave empty to generate)';
                } else {
                    this.roomIdInput.placeholder = 'Room ID (required)';
                }
            });
        });
    }

    setupSocketListeners() {
        this.socket.on('student-joined', (data) => {
            this.addStudentToGrid(data.studentId, data.name);
        });

        this.socket.on('student-left', (data) => {
            this.removeStudentFromGrid(data.studentId);
        });

        this.socket.on('student-screen-share-started', (data) => {
            this.handleStudentScreenShareStarted(data);
        });

        this.socket.on('student-screen-share-stopped', (data) => {
            this.handleStudentScreenShareStopped(data);
        });

        // Simplified WebRTC signaling
        this.socket.on('offer', async (data) => {
            console.log('Received offer from student:', data.studentId);
            if (this.userType === 'tutor' && !this.webrtc) {
                this.webrtc = new SimpleWebRTC(this.socket, false);
                this.webrtc.onRemoteStream = (stream) => {
                    this.handleRemoteStream(stream, data.studentId);
                };
                await this.webrtc.handleOffer(data.offer);
            }
        });

        this.socket.on('answer', async (data) => {
            console.log('Received answer');
            if (this.webrtc) {
                await this.webrtc.handleAnswer(data.answer);
            }
        });

        this.socket.on('ice-candidate', async (data) => {
            console.log('Received ICE candidate');
            if (this.webrtc) {
                await this.webrtc.handleIceCandidate(data.candidate);
            }
        });
    }

    joinRoom() {
        this.userName = this.userNameInput.value.trim();
        this.userType = document.querySelector('input[name="userType"]:checked').value;
        this.roomId = this.roomIdInput.value.trim();

        if (!this.userName) {
            alert('Please enter your name');
            return;
        }

        if (this.userType === 'student' && !this.roomId) {
            alert('Students must enter a room ID');
            return;
        }

        if (this.userType === 'tutor' && !this.roomId) {
            this.roomId = this.generateRoomId();
        }

        this.socket.emit('join-room', {
            roomId: this.roomId,
            userType: this.userType,
            userName: this.userName
        });

        this.showScreen(this.userType);
        this.updateUI();
    }

    showScreen(type) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        if (type === 'student') {
            this.studentScreen.classList.add('active');
        } else {
            this.tutorScreen.classList.add('active');
        }
    }

    updateUI() {
        if (this.userType === 'student') {
            document.getElementById('studentName').textContent = this.userName;
            this.updateStatus(`Connected to room ${this.roomId}`);
        } else {
            document.getElementById('tutorName').textContent = this.userName;
            this.roomIdDisplay.querySelector('strong').textContent = this.roomId;
        }
    }

    async startScreenShare() {
        try {
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            this.localVideo.srcObject = this.localStream;
            this.localVideo.style.display = 'block';
            
            this.shareScreenBtn.style.display = 'none';
            this.stopSharingBtn.style.display = 'inline-block';

            this.updateStatus('Screen sharing active');
            this.socket.emit('start-screen-share');

            // Handle stream ending
            this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.stopScreenShare();
            });

            // Create WebRTC connection
            this.webrtc = new SimpleWebRTC(this.socket, true);
            await this.webrtc.addLocalStream(this.localStream);

        } catch (error) {
            console.error('Error starting screen share:', error);
            alert('Failed to start screen sharing. Please check permissions.');
        }
    }

    stopScreenShare() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.webrtc) {
            this.webrtc.close();
            this.webrtc = null;
        }

        this.localVideo.style.display = 'none';
        this.shareScreenBtn.style.display = 'inline-block';
        this.stopSharingBtn.style.display = 'none';

        this.updateStatus(`Connected to room ${this.roomId}`);
        this.socket.emit('stop-screen-share');
    }

    addStudentToGrid(studentId, name) {
        const streamDiv = document.createElement('div');
        streamDiv.className = 'student-stream';
        streamDiv.id = `stream-${studentId}`;
        
        streamDiv.innerHTML = `
            <h3>${name}</h3>
            <video autoplay playsinline></video>
            <div class="stream-status not-sharing">Not sharing screen</div>
        `;

        this.studentStreams.appendChild(streamDiv);
        this.updateTutorStatus();
    }

    removeStudentFromGrid(studentId) {
        const streamDiv = document.getElementById(`stream-${studentId}`);
        if (streamDiv) {
            streamDiv.remove();
        }
        this.updateTutorStatus();
    }

    handleStudentScreenShareStarted(data) {
        const streamDiv = document.getElementById(`stream-${data.studentId}`);
        if (streamDiv) {
            streamDiv.classList.add('sharing');
            streamDiv.querySelector('.stream-status').textContent = 'Sharing screen';
            streamDiv.querySelector('.stream-status').className = 'stream-status sharing';
        }
    }

    handleStudentScreenShareStopped(data) {
        const streamDiv = document.getElementById(`stream-${data.studentId}`);
        if (streamDiv) {
            streamDiv.classList.remove('sharing');
            streamDiv.querySelector('.stream-status').textContent = 'Not sharing screen';
            streamDiv.querySelector('.stream-status').className = 'stream-status not-sharing';
            streamDiv.querySelector('video').srcObject = null;
        }
    }

    handleRemoteStream(stream, studentId) {
        console.log('Handling remote stream for student:', studentId);
        const streamDiv = document.getElementById(`stream-${studentId}`);
        if (streamDiv) {
            const video = streamDiv.querySelector('video');
            video.srcObject = stream;
            video.play().catch(e => console.log('Autoplay prevented:', e));
            console.log('Set stream to video for student:', studentId);
        } else {
            console.error('Stream div not found for student:', studentId);
        }
    }

    updateStatus(message) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    updateTutorStatus() {
        const statusEl = document.getElementById('tutorStatus');
        const studentCount = this.studentStreams.children.length;
        
        if (studentCount === 0) {
            statusEl.textContent = 'Waiting for students...';
        } else {
            statusEl.textContent = `${studentCount} student${studentCount > 1 ? 's' : ''} connected`;
        }
    }

    leaveRoom() {
        this.stopScreenShare();
        this.socket.disconnect();
        location.reload();
    }

    generateRoomId() {
        return Math.random().toString(36).substr(2, 8).toUpperCase();
    }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    new ScreenSharingApp();
});