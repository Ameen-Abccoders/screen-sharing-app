class ScreenSharingApp {
    constructor() {
        this.socket = io();
        this.userType = null;
        this.userName = null;
        this.roomId = null;
        this.localStream = null;
        this.peerConnections = new Map();
        
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
        this.socket.on('tutor-joined', () => {
            this.updateStatus('Tutor has joined the room');
        });

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

        this.socket.on('webrtc-offer', async (data) => {
            await this.handleWebRTCOffer(data);
        });

        this.socket.on('webrtc-answer', async (data) => {
            await this.handleWebRTCAnswer(data);
        });

        this.socket.on('webrtc-ice-candidate', async (data) => {
            await this.handleICECandidate(data);
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
                video: { mediaSource: 'screen' },
                audio: true
            });

            this.localVideo.srcObject = this.localStream;
            this.localVideo.style.display = 'block';
            
            this.shareScreenBtn.style.display = 'none';
            this.stopSharingBtn.style.display = 'inline-block';

            console.log('Screen sharing started, local stream:', this.localStream);

            this.updateStatus('Screen sharing active');
            this.socket.emit('start-screen-share');

            // Handle stream ending
            this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.stopScreenShare();
            });

            // Wait a bit for the tutor to be notified, then initiate connection
            setTimeout(async () => {
                await this.initiatePeerConnections();
            }, 1000);

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

        this.localVideo.style.display = 'none';
        this.shareScreenBtn.style.display = 'inline-block';
        this.stopSharingBtn.style.display = 'none';

        this.updateStatus(`Connected to room ${this.roomId}`);
        this.socket.emit('stop-screen-share');

        // Close all peer connections
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
    }

    leaveRoom() {
        this.stopScreenShare();
        this.socket.disconnect();
        location.reload();
    }

    addStudentToGrid(studentId, name) {
        const streamDiv = document.createElement('div');
        streamDiv.className = 'student-stream';
        streamDiv.id = `stream-${studentId}`;
        
        streamDiv.innerHTML = `
            <h3>${name}</h3>
            <video autoplay playsinline controls></video>
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

        // Clean up peer connection
        if (this.peerConnections.has(studentId)) {
            this.peerConnections.get(studentId).close();
            this.peerConnections.delete(studentId);
        }

        this.updateTutorStatus();
    }

    async handleStudentScreenShareStarted(data) {
        const streamDiv = document.getElementById(`stream-${data.studentId}`);
        if (streamDiv) {
            streamDiv.classList.add('sharing');
            streamDiv.querySelector('.stream-status').textContent = 'Sharing screen';
            streamDiv.querySelector('.stream-status').className = 'stream-status sharing';
        }

        // For tutors: wait for WebRTC offer from student
        // The peer connection will be created when we receive the offer
    }

    handleStudentScreenShareStopped(data) {
        const streamDiv = document.getElementById(`stream-${data.studentId}`);
        if (streamDiv) {
            streamDiv.classList.remove('sharing');
            streamDiv.querySelector('.stream-status').textContent = 'Not sharing screen';
            streamDiv.querySelector('.stream-status').className = 'stream-status not-sharing';
            streamDiv.querySelector('video').srcObject = null;
        }

        // Close peer connection
        if (this.peerConnections.has(data.studentId)) {
            this.peerConnections.get(data.studentId).close();
            this.peerConnections.delete(data.studentId);
        }
    }

    async createPeerConnection(peerId, isInitiator) {
        console.log(`Creating peer connection with ${peerId}, isInitiator: ${isInitiator}`);
        
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' }
            ],
            iceCandidatePoolSize: 10
        });

        this.peerConnections.set(peerId, peerConnection);

        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from', peerId, event.streams);
            const [remoteStream] = event.streams;
            
            // For tutors receiving from students, use the peerId (student's socket ID)
            // For students, this won't be used since they don't receive streams
            if (this.userType === 'tutor') {
                const setStreamToVideo = () => {
                    const streamDiv = document.getElementById(`stream-${peerId}`);
                    if (streamDiv) {
                        const video = streamDiv.querySelector('video');
                        
                        // Debug the stream before setting it
                        console.log('Stream details for', peerId);
                        console.log('Stream active:', remoteStream.active);
                        console.log('Video tracks:', remoteStream.getVideoTracks());
                        console.log('Audio tracks:', remoteStream.getAudioTracks());
                        remoteStream.getVideoTracks().forEach((track, index) => {
                            console.log(`Video track ${index}:`, track.label, 'enabled:', track.enabled, 'readyState:', track.readyState);
                        });
                        
                        video.srcObject = remoteStream;
                        
                        // Add event listeners to debug video
                        video.onloadedmetadata = () => {
                            console.log('Video metadata loaded for', peerId, 'dimensions:', video.videoWidth, 'x', video.videoHeight);
                            // Try to play when metadata is loaded
                            video.play().catch(e => {
                                console.log('Auto-play prevented, will try manual interaction:', e);
                                // Remove muted and add click handler for manual play
                                video.muted = false;
                                video.addEventListener('click', () => {
                                    video.play().then(() => {
                                        console.log('Video playing after manual click');
                                    });
                                }, { once: true });
                            });
                        };
                        video.onplaying = () => {
                            console.log('Video started playing for', peerId);
                        };
                        video.onerror = (e) => {
                            console.error('Video error for', peerId, e);
                        };
                        video.onloadstart = () => {
                            console.log('Video load start for', peerId);
                        };
                        video.oncanplay = () => {
                            console.log('Video can play for', peerId);
                        };
                        
                        console.log('Set remote stream to video element for', peerId);
                        return true;
                    }
                    return false;
                };

                // Try to set stream immediately
                if (!setStreamToVideo()) {
                    console.log('Stream div not found yet, retrying in 500ms for', peerId);
                    // If not found, wait a bit and try again (student might still be joining)
                    setTimeout(() => {
                        if (!setStreamToVideo()) {
                            console.error('Stream div still not found after retry for', peerId);
                            // Debug: list all available stream divs
                            const allStreamDivs = document.querySelectorAll('[id^="stream-"]');
                            console.log('Available stream divs:', Array.from(allStreamDivs).map(div => div.id));
                        }
                    }, 500);
                }
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate to', peerId);
                this.socket.emit('webrtc-ice-candidate', {
                    target: peerId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state with ${peerId}:`, peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                console.error('WebRTC connection failed for', peerId);
                // Try to restart the connection
                this.restartConnection(peerId, isInitiator);
            } else if (peerConnection.connectionState === 'connected') {
                console.log('WebRTC connection successful for', peerId);
            }
        };

        // Handle ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state with ${peerId}:`, peerConnection.iceConnectionState);
        };

        // Add local stream if available (for students)
        if (this.localStream && isInitiator) {
            console.log('Adding local stream tracks to peer connection');
            this.localStream.getTracks().forEach(track => {
                console.log('Adding track:', track.kind, track.label);
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Create offer if initiator (student)
        if (isInitiator) {
            console.log('Creating offer for', peerId);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            this.socket.emit('webrtc-offer', {
                target: peerId,
                offer: offer
            });
            console.log('Sent offer to', peerId);
        }

        return peerConnection;
    }

    async initiatePeerConnections() {
        // This is called by students to initiate connections with tutor
        if (this.userType === 'student' && this.localStream) {
            // Create peer connection with tutor
            await this.createPeerConnection('tutor', true);
        }
    }

    async restartConnection(peerId, wasInitiator) {
        console.log('Restarting connection with', peerId);
        
        // Close existing connection
        if (this.peerConnections.has(peerId)) {
            this.peerConnections.get(peerId).close();
            this.peerConnections.delete(peerId);
        }

        // Wait a bit before retrying
        setTimeout(async () => {
            console.log('Retrying connection with', peerId);
            await this.createPeerConnection(peerId, wasInitiator);
        }, 2000);
    }

    async handleWebRTCOffer(data) {
        console.log('Received WebRTC offer from', data.sender);
        const peerConnection = await this.createPeerConnection(data.sender, false);
        
        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.socket.emit('webrtc-answer', {
            target: data.sender,
            answer: answer
        });
        console.log('Sent WebRTC answer to', data.sender);
    }

    async handleWebRTCAnswer(data) {
        console.log('Received WebRTC answer from', data.sender);
        const peerConnection = this.peerConnections.get(data.sender);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(data.answer);
            console.log('Set remote description from answer');
        } else {
            console.error('No peer connection found for', data.sender);
        }
    }

    async handleICECandidate(data) {
        console.log('Received ICE candidate from', data.sender);
        const peerConnection = this.peerConnections.get(data.sender);
        if (peerConnection) {
            await peerConnection.addIceCandidate(data.candidate);
            console.log('Added ICE candidate');
        } else {
            console.error('No peer connection found for ICE candidate from', data.sender);
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

    generateRoomId() {
        return Math.random().toString(36).substr(2, 8).toUpperCase();
    }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    new ScreenSharingApp();
});