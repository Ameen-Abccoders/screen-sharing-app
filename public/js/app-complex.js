class ScreenSharingApp {
    constructor() {
        this.socket = io();
        this.userType = null;
        this.userName = null;
        this.roomId = null;
        this.tutorId = null; // Added to store tutor's socket ID
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
        this.socket.on('tutor-joined', (data) => { // Assuming server sends { tutorId: socket.id }
            console.log(`[${this.userType || 'App'}] Tutor joined event received`, data);
            if (this.userType === 'student' && data && data.tutorId) {
                this.tutorId = data.tutorId;
                console.log(`[STUDENT] Tutor ID set: ${this.tutorId}`);
                this.updateStatus(`Tutor ${data.tutorName || ''} has joined. Ready to share screen.`);
            } else if (this.userType === 'tutor') {
                 this.updateStatus('You have joined the room. Waiting for students.');
            } else {
                this.updateStatus('Tutor has joined the room');
            }
        });

        // Event for student to get tutor's ID if tutor was already in room
        this.socket.on('tutor-details', (data) => {
            console.log(`[${this.userType || 'App'}] Tutor details received`, data);
            if (this.userType === 'student' && data && data.tutorId) {
                this.tutorId = data.tutorId;
                console.log(`[STUDENT] Tutor ID set from tutor-details: ${this.tutorId}`);
                this.updateStatus(`Tutor is in the room. Ready to share screen.`);
            }
        });

        this.socket.on('student-joined', (data) => {
            console.log(`[${this.userType || 'App'}] Student joined event received`, data);
            if (this.userType === 'tutor') {
                this.addStudentToGrid(data.studentId, data.name);
                this.updateTutorStatus();
            }
        });

        this.socket.on('student-left', (data) => {
            console.log(`[${this.userType || 'App'}] Student left event received`, data);
            if (this.userType === 'tutor') {
                this.removeStudentFromGrid(data.studentId);
                this.updateTutorStatus();
            }
        });

        this.socket.on('student-screen-share-started', (data) => {
            console.log(`[${this.userType || 'App'}] Student screen share started event`, data);
            if (this.userType === 'tutor') {
                this.handleStudentScreenShareStarted(data);
            }
        });

        this.socket.on('student-screen-share-stopped', (data) => {
            console.log(`[${this.userType || 'App'}] Student screen share stopped event`, data);
            if (this.userType === 'tutor') {
                this.handleStudentScreenShareStopped(data);
            }
        });

        this.socket.on('webrtc-offer', async (data) => {
            console.log(`[${this.userType || 'App'}] Received webrtc-offer from ${data.sender}`, data.offer);
            // This is typically handled by the tutor
            if (this.userType === 'tutor') {
                await this.handleWebRTCOffer(data);
            }
        });

        this.socket.on('webrtc-answer', async (data) => {
            console.log(`[${this.userType || 'App'}] Received webrtc-answer from ${data.sender}`, data.answer);
            // This is typically handled by the student
            if (this.userType === 'student') {
                await this.handleWebRTCAnswer(data);
            }
        });

        this.socket.on('webrtc-ice-candidate', async (data) => {
            console.log(`[${this.userType || 'App'}] Received webrtc-ice-candidate from ${data.sender}`, data.candidate);
            // Handled by both student (from tutor) and tutor (from student)
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
        console.log(`[DEBUG][${this.userType}] Attempting to start screen share. Current localStream:`, this.localStream, "PeerConnections:", this.peerConnections.size);
        // Ensure any previous stream and connections are fully cleaned up
        if (this.localStream || this.peerConnections.size > 0) {
            console.warn(`[DEBUG][${this.userType}] startScreenShare called with existing stream or connections. Performing cleanup first.`);
            this.stopScreenShare(false); // Call internal stop without emitting to server yet
        }

        try {
            console.log(`[${this.userType}] Requesting new screen capture stream.`);
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: 'screen' },
                audio: true // Consider if audio is always needed or configurable
            });
            console.log(`[${this.userType}] New local stream acquired:`, this.localStream.id);

            this.localVideo.srcObject = this.localStream;
            this.localVideo.style.display = 'block';
            
            this.shareScreenBtn.style.display = 'none';
            this.stopSharingBtn.style.display = 'inline-block';

            console.log(`[${this.userType}] Screen sharing started locally. Stream:`, this.localStream);
            this.localStream.getTracks().forEach(track => {
                console.log(`[${this.userType}] Local track: ${track.kind}, label: ${track.label}, id: ${track.id}`);
            });

            this.updateStatus('Screen sharing active. Notifying server...');
            this.socket.emit('start-screen-share');
            console.log(`[${this.userType}] Emitted 'start-screen-share' to server.`);

            // Handle stream ending
            this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.stopScreenShare();
            });

            // Wait a bit for the tutor to be notified, then initiate connection
            setTimeout(async () => {
                console.log(`[${this.userType}] Initiating peer connections.`);
                await this.initiatePeerConnections();
            }, 1000); // Delay to allow server to process 'start-screen-share'

        } catch (error) {
            console.error(`[${this.userType}] Error starting screen share:`, error);
            alert('Failed to start screen sharing. Please check permissions and ensure you are on HTTPS if not localhost.');
            this.updateStatus('Screen sharing failed.');
            // Reset buttons
            this.shareScreenBtn.style.display = 'inline-block';
            this.stopSharingBtn.style.display = 'none';
        }
    }

    stopScreenShare(notifyServer = true) {
        console.log(`[DEBUG][${this.userType}] stopScreenShare called. notifyServer: ${notifyServer}. Current localStream:`, this.localStream ? this.localStream.id : 'null', "PeerConnections:", this.peerConnections.size);

        if (this.localStream) {
            console.log(`[${this.userType}] Stopping all tracks for local stream: ${this.localStream.id}`);
            this.localStream.getTracks().forEach(track => {
                console.log(`[${this.userType}] Stopping local track: ${track.kind}, label: ${track.label}, id: ${track.id}, readyState: ${track.readyState}`);
                track.stop();
                console.log(`[${this.userType}] Track ${track.id} stopped. readyState: ${track.readyState}`);
            });
            this.localStream = null;
            console.log(`[${this.userType}] Local stream object set to null.`);
        } else {
            console.log(`[${this.userType}] No local stream to stop.`);
        }

        this.localVideo.srcObject = null;
        this.localVideo.style.display = 'none';
        this.shareScreenBtn.style.display = 'inline-block';
        this.stopSharingBtn.style.display = 'none';
        console.log(`[${this.userType}] UI elements for screen share reset.`);

        if (notifyServer) {
            this.updateStatus(`Connected to room ${this.roomId}. Screen share stopped.`);
            this.socket.emit('stop-screen-share');
            console.log(`[${this.userType}] Emitted 'stop-screen-share' to server.`);
        }

        // Close all peer connections
        if (this.peerConnections.size > 0) {
            console.log(`[${this.userType}] Closing all peer connections. Count: ${this.peerConnections.size}`);
            this.peerConnections.forEach((pc, peerId) => {
                console.log(`[DEBUG][${this.userType}] Closing peer connection with ${peerId}. State: ${pc.connectionState}, Signaling: ${pc.signalingState}`);
                pc.close();
                console.log(`[${this.userType}] Peer connection with ${peerId} closed. State: ${pc.connectionState}, Signaling: ${pc.signalingState}`);
            });
            this.peerConnections.clear();
            console.log(`[${this.userType}] Peer connections map cleared.`);
        } else {
            console.log(`[${this.userType}] No peer connections to close.`);
        }
        console.log(`[DEBUG][${this.userType}] stopScreenShare finished. localStream:`, this.localStream, "PeerConnections:", this.peerConnections.size);
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
        const pc = this.peerConnections.get(studentId);
        if (pc) {
            console.log(`[TUTOR][DEBUG] Closing and removing peer connection for student ${studentId} in removeStudentFromGrid. PC state: ${pc.connectionState}`);
            pc.close();
            this.peerConnections.delete(studentId);
            console.log(`[TUTOR][DEBUG] Peer connection for student ${studentId} removed.`);
        } else {
            console.log(`[TUTOR][DEBUG] No peer connection found for student ${studentId} in removeStudentFromGrid to remove.`);
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
        console.log(`[TUTOR][DEBUG] Handling student screen share stopped for studentId: ${data.studentId}, name: ${data.name}`);
        const studentId = data.studentId;
        const streamDiv = document.getElementById(`stream-${studentId}`);

        if (streamDiv) {
            const videoElement = streamDiv.querySelector('video');
            if (videoElement) {
                videoElement.srcObject = null;
                console.log(`[TUTOR][DEBUG] Video srcObject set to null for student ${studentId}.`);
            }
            this.updateStudentStreamStatus(studentId, 'Not sharing screen', false);
            console.log(`[TUTOR][DEBUG] UI updated for student ${studentId} to not sharing.`);
        } else {
            console.warn(`[TUTOR][DEBUG] Stream div not found for student ${studentId} in handleStudentScreenShareStopped.`);
        }

        // Close and remove peer connection
        const pc = this.peerConnections.get(studentId);
        if (pc) {
            console.log(`[TUTOR][DEBUG] Closing and removing peer connection for student ${studentId}. PC state: ${pc.connectionState}`);
            pc.close();
            this.peerConnections.delete(studentId);
            console.log(`[TUTOR][DEBUG] Peer connection for student ${studentId} removed.`);
        } else {
            console.log(`[TUTOR][DEBUG] No peer connection found for student ${studentId} to close.`);
        }
        this.updateTutorStatus(); // Update overall tutor status
    }

    async createPeerConnection(peerId, isInitiator) {
        console.log(`[${this.userType}] Creating peer connection. Peer ID: ${peerId}, Initiator: ${isInitiator}`);
        
        if (!peerId) {
            console.error(`[${this.userType}] Peer ID is undefined. Cannot create peer connection.`);
            return null;
        }

        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                // { urls: 'stun:stun2.l.google.com:19302' }, // Often have issues with too many STUNs
                // { urls: 'stun:stun.cloudflare.com:3478' }
            ],
            iceCandidatePoolSize: 10 // Not strictly necessary with Trickle ICE
        });

        this.peerConnections.set(peerId, peerConnection);
        console.log(`[${this.userType}] Peer connection created and stored for ${peerId}.`);

        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            console.log(`[${this.userType}] Received remote media track event from ${peerId}. Number of streams: ${event.streams.length}, Track:`, event.track);
            const remoteStream = event.streams && event.streams[0];

            if (!remoteStream) {
                console.error(`[${this.userType}] No remote stream found in ontrack event for ${peerId}.`);
                return;
            }
            console.log(`[${this.userType}] Remote stream for ${peerId}: ID=${remoteStream.id}, Active=${remoteStream.active}. Video tracks: ${remoteStream.getVideoTracks().length}, Audio tracks: ${remoteStream.getAudioTracks().length}`);

            if (this.userType === 'tutor') { // Tutor receives student's screen share
                this.displayRemoteStream(peerId, remoteStream);
            } else if (this.userType === 'student') {
                // Students typically don't receive video streams in this app model
                console.log(`[STUDENT] Received remote track from ${peerId} (tutor), but not expecting to display it.`);
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`[${this.userType}] Generated ICE candidate for ${peerId}:`, event.candidate.candidate.substring(0, 30) + "...");
                this.socket.emit('webrtc-ice-candidate', {
                    target: peerId,
                    candidate: event.candidate
                });
                console.log(`[${this.userType}] Sent ICE candidate to ${peerId}.`);
            } else {
                console.log(`[${this.userType}] All ICE candidates have been sent for ${peerId}.`);
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(`[${this.userType}] Connection state with ${peerId}: ${peerConnection.connectionState}`);
            if (peerConnection.connectionState === 'failed') {
                console.error(`[${this.userType}][DEBUG] WebRTC connection with ${peerId} FAILED. State: ${peerConnection.connectionState}, Signaling: ${peerConnection.signalingState}`);
                this.cleanupPeerConnection(peerId, isInitiator);
                // Optionally, try to restart the connection
                // this.restartConnection(peerId, isInitiator); // Be cautious with auto-restarts on 'failed'
            } else if (peerConnection.connectionState === 'connected') {
                console.log(`[${this.userType}][DEBUG] WebRTC connection with ${peerId} CONNECTED. State: ${peerConnection.connectionState}, Signaling: ${peerConnection.signalingState}`);
            } else if (peerConnection.connectionState === 'disconnected') {
                console.warn(`[${this.userType}][DEBUG] WebRTC connection with ${peerId} DISCONNECTED. State: ${peerConnection.connectionState}, Signaling: ${peerConnection.signalingState}. Will wait for potential auto-reconnect or ICE restart.`);
                // Browsers might attempt to auto-reconnect. Don't clean up immediately.
                // If it transitions to 'failed' or stays 'disconnected' for too long, then cleanup.
            } else if (peerConnection.connectionState === 'closed') {
                console.log(`[${this.userType}][DEBUG] WebRTC connection with ${peerId} CLOSED. State: ${peerConnection.connectionState}, Signaling: ${peerConnection.signalingState}. Cleaning up.`);
                this.cleanupPeerConnection(peerId, isInitiator);
            } else {
                 console.log(`[${this.userType}][DEBUG] WebRTC connection with ${peerId} state changed: ${peerConnection.connectionState}. Signaling: ${peerConnection.signalingState}`);
            }
        };

        // Handle ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`[${this.userType}] ICE connection state with ${peerId}: ${peerConnection.iceConnectionState}`);
        };

        peerConnection.onsignalingstatechange = () => {
            console.log(`[${this.userType}] Signaling state with ${peerId}: ${peerConnection.signalingState}`);
        };


        // Add local stream tracks if this peer connection is supposed to send them
        if (this.localStream && isInitiator) { // Student is initiator and sends stream
            console.log(`[${this.userType}] Adding local stream tracks to peer connection with ${peerId}.`);
            this.localStream.getTracks().forEach(track => {
                console.log(`[${this.userType}] Adding track: ${track.kind} (label: ${track.label}, id: ${track.id}) to PC for ${peerId}`);
                try {
                    peerConnection.addTrack(track, this.localStream);
                } catch (e) {
                    console.error(`[${this.userType}] Error adding track ${track.id} to PC for ${peerId}:`, e);
                }
            });
            console.log(`[${this.userType}] Finished adding local tracks for ${peerId}. Senders:`, peerConnection.getSenders().length);
        } else {
             console.log(`[${this.userType}] Not adding local stream tracks. LocalStream available: ${!!this.localStream}, Is Initiator: ${isInitiator}`);
        }

        // Create offer if initiator (student will be initiator)
        if (isInitiator) {
            console.log(`[${this.userType}] Creating WebRTC offer for ${peerId}.`);
            try {
                const offer = await peerConnection.createOffer();
                console.log(`[${this.userType}] Offer created for ${peerId}. Setting local description.`);
                await peerConnection.setLocalDescription(offer);
                console.log(`[${this.userType}] Local description set for ${peerId}. Signaling state: ${peerConnection.signalingState}. Emitting webrtc-offer.`);

                this.socket.emit('webrtc-offer', {
                    target: peerId, // Should be tutorId
                    offer: offer
                });
                console.log(`[${this.userType}] Sent webrtc-offer to ${peerId}.`);
            } catch (e) {
                console.error(`[${this.userType}] Error creating offer for ${peerId}:`, e);
            }
        }

        return peerConnection;
    }

    async initiatePeerConnections() {
        console.log(`[${this.userType}] Attempting to initiate peer connections.`);
        // This is called by students to initiate connections with the tutor
        if (this.userType === 'student' && this.localStream) {
            if (this.tutorId) {
                console.log(`[STUDENT] Initiating peer connection with tutor: ${this.tutorId}`);
                await this.createPeerConnection(this.tutorId, true);
            } else {
                console.warn('[STUDENT] Tutor ID not available. Cannot initiate peer connection for screen sharing.');
                this.updateStatus('Tutor not found or not ready. Cannot start WebRTC.');
            }
        } else {
            console.log(`[${this.userType}] Conditions not met for initiating peer connection. UserType: ${this.userType}, LocalStream: ${!!this.localStream}`);
        }
    }

    async restartConnection(peerId, wasInitiator) {
        console.warn(`[${this.userType}][DEBUG] Restarting connection with ${peerId}. Was initiator: ${wasInitiator}`);
        
        this.cleanupPeerConnection(peerId, wasInitiator); // Ensure full cleanup before restart

        // Wait a bit before retrying to prevent immediate re-fail loops
        setTimeout(async () => {
            console.log(`[${this.userType}][DEBUG] Attempting to re-establish peer connection with ${peerId} after delay.`);
            if (this.userType === 'student' && peerId === this.tutorId) {
                 if (this.localStream && this.localStream.active) {
                    console.log(`[STUDENT][DEBUG] Re-initiating connection with tutor ${this.tutorId} as part of restart.`);
                    await this.createPeerConnection(this.tutorId, true);
                 } else {
                    console.warn(`[STUDENT][DEBUG] Local stream not available or inactive during restart. Cannot re-initiate with tutor ${this.tutorId}.`);
                 }
            } else if (this.userType === 'tutor') {
                console.log(`[TUTOR][DEBUG] Connection with student ${peerId} failed/restarted. Tutor waits for new offer. UI should reflect stoppage.`);
                // UI cleanup for this student is handled by cleanupPeerConnection via handleStudentScreenShareStopped
            }
        }, 3000);
    }

    cleanupPeerConnection(peerId, isInitiatorContext) {
        console.log(`[${this.userType}][DEBUG] cleanupPeerConnection called for peerId: ${peerId}`);
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            console.log(`[${this.userType}][DEBUG] Closing peer connection for ${peerId}. Current state: ${pc.connectionState}, signaling: ${pc.signalingState}`);
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.onconnectionstatechange = null;
            pc.oniceconnectionstatechange = null;
            pc.onsignalingstatechange = null;
            pc.close();
            this.peerConnections.delete(peerId);
            console.log(`[${this.userType}][DEBUG] Peer connection for ${peerId} closed and removed from map.`);
        } else {
            console.log(`[${this.userType}][DEBUG] No peer connection found for ${peerId} in cleanupPeerConnection.`);
        }

        if (this.userType === 'tutor' && peerId) {
            // If tutor, ensure UI for this student is reset
            this.handleStudentScreenShareStopped({ studentId: peerId, name: 'Peer' });
        } else if (this.userType === 'student' && peerId === this.tutorId) {
            // If student, and this was the connection to the tutor, they might need to be able to share again
            // The main stopScreenShare method handles student's UI reset for their own stream.
            console.log(`[STUDENT][DEBUG] Cleaned up PC with tutor ${peerId}. Student can attempt to share again.`);
        }
    }

    async handleWebRTCOffer(data) {
        // This is typically called on the Tutor's side
        const studentId = data.sender;
        console.log(`[TUTOR][DEBUG] Received WebRTC offer from student ${studentId}.`);

        let existingPC = this.peerConnections.get(studentId);
        if (existingPC) {
            console.warn(`[TUTOR][DEBUG] Existing peer connection found for student ${studentId} while handling new offer. State: ${existingPC.connectionState}, Signaling: ${existingPC.signalingState}. Closing old PC before creating new one.`);
            this.cleanupPeerConnection(studentId, false); // false because tutor is not initiator here
        }
        
        // Create a new peer connection instance for this student. Tutor is not the initiator.
        const peerConnection = await this.createPeerConnection(studentId, false);
        if (!peerConnection) {
            console.error(`[TUTOR][DEBUG] Failed to create peer connection for student ${studentId} upon receiving offer.`);
            return;
        }

        try {
            console.log(`[TUTOR] Setting remote description from offer for student ${studentId}. Current signaling state: ${peerConnection.signalingState}`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log(`[TUTOR] Remote description set for student ${studentId}. Signaling state: ${peerConnection.signalingState}. Creating answer.`);

            const answer = await peerConnection.createAnswer();
            console.log(`[TUTOR] Answer created for student ${studentId}. Setting local description.`);
            await peerConnection.setLocalDescription(answer);
            console.log(`[TUTOR] Local description set for student ${studentId}. Signaling state: ${peerConnection.signalingState}. Emitting webrtc-answer.`);

            this.socket.emit('webrtc-answer', {
                target: studentId, // Send answer back to the student who sent the offer
                answer: answer
            });
            console.log(`[TUTOR] Sent webrtc-answer to student ${studentId}.`);
        } catch (error) {
            console.error(`[TUTOR] Error handling WebRTC offer from ${studentId}:`, error);
        }
    }

    async handleWebRTCAnswer(data) {
        // This is typically called on the Student's side
        const peerId = data.sender; // This should be the tutor's ID
        console.log(`[STUDENT] Received WebRTC answer from ${peerId} (expected tutor).`);

        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            if (peerConnection.signalingState === 'have-local-offer') {
                try {
                    console.log(`[STUDENT] Setting remote description from answer from ${peerId}. Current signaling state: ${peerConnection.signalingState}`);
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                    console.log(`[STUDENT] Remote description set from answer from ${peerId}. Signaling state: ${peerConnection.signalingState}. Connection should establish.`);
                } catch (error) {
                    console.error(`[STUDENT] Error setting remote description from answer from ${peerId}:`, error);
                }
            } else {
            console.warn(`[STUDENT][DEBUG] Received answer from ${peerId}, but signaling state is ${peerConnection.signalingState} (expected 'have-local-offer'). This might be a late answer or a bug.`);
            }
        } else {
            console.error(`[STUDENT][DEBUG] No peer connection found for ${peerId} (tutor) when handling answer. Current tutorId: ${this.tutorId}. PeerConnections map size: ${this.peerConnections.size}`);
        }
    }

    async handleICECandidate(data) {
        const peerId = data.sender;
        console.log(`[${this.userType}] Received ICE candidate from ${peerId}. Candidate:`, data.candidate ? data.candidate.candidate.substring(0,30)+"..." : "null");

        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            // Ensure candidate is not null or empty string before adding
            if (data.candidate && data.candidate.candidate) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                    console.log(`[${this.userType}] Added ICE candidate from ${peerId}.`);
                } catch (error) {
                    console.error(`[${this.userType}] Error adding ICE candidate from ${peerId}:`, error, "Candidate:", data.candidate);
                }
            } else {
                 console.log(`[${this.userType}] Received null or empty ICE candidate from ${peerId}. Ignoring.`);
            }
        } else {
            console.error(`[${this.userType}] No peer connection found for ${peerId} when trying to add ICE candidate.`);
        }
    }

    updateStatus(message) {
        const statusEl = document.getElementById('connectionStatus'); // Student's main status
        const tutorStatusEl = document.getElementById('tutorStatus'); // Tutor's main status

        if (this.userType === 'student' && statusEl) {
            statusEl.textContent = message;
        } else if (this.userType === 'tutor' && tutorStatusEl) {
            // Tutors might also want to see generic status messages, or this could be logged
            console.log(`[TUTOR] Status Update: ${message}`);
        } else if (statusEl) { // Fallback for general messages if specific element not found
            statusEl.textContent = message;
        }
    }

    updateTutorStatus() {
        const statusEl = document.getElementById('tutorStatus');
        const studentCount = this.studentStreams.children.length;
        const activeSharingCount = document.querySelectorAll('.student-stream.sharing').length;
        
        if (statusEl) {
            if (studentCount === 0) {
                statusEl.textContent = 'Waiting for students...';
            } else {
                statusEl.textContent = `${studentCount} student${studentCount > 1 ? 's' : ''} connected. ${activeSharingCount} sharing.`;
            }
        }
    }

    displayRemoteStream(peerId, remoteStream, attempt = 1) {
        const maxAttempts = 5;
        const delay = 500; // ms

        console.log(`[TUTOR] Attempt ${attempt}/${maxAttempts} to display remote stream from student ${peerId}. Stream active: ${remoteStream.active}`);

        if (!remoteStream.active) {
            console.warn(`[TUTOR] Remote stream from ${peerId} is not active. Won't display.`);
            this.updateStudentStreamStatus(peerId, 'Stream inactive', false);
            return;
        }

        if (remoteStream.getVideoTracks().length === 0) {
            console.warn(`[TUTOR] Remote stream from ${peerId} has no video tracks. Won't display.`);
            this.updateStudentStreamStatus(peerId, 'No video tracks', false);
            return;
        }

        const streamDiv = document.getElementById(`stream-${peerId}`);
        if (streamDiv) {
            const video = streamDiv.querySelector('video');
            const statusDiv = streamDiv.querySelector('.stream-status');

            console.log(`[TUTOR] Assigning remote stream from ${peerId} to video element. Current srcObject:`, video.srcObject ? video.srcObject.id : 'null');
            video.srcObject = remoteStream;

            // Remove old listeners if any, to prevent multiple triggers
            video.onloadedmetadata = null;
            video.onplaying = null;
            video.onerror = null;
            video.onstalled = null;
            video.onwaiting = null;

            video.onloadedmetadata = () => {
                console.log(`[TUTOR] Video metadata loaded for student ${peerId}. Dimensions: ${video.videoWidth}x${video.videoHeight}.`);
                this.updateStudentStreamStatus(peerId, `Sharing: ${video.videoWidth}x${video.videoHeight}`, true);
            };
            video.onplaying = () => {
                console.log(`[TUTOR] Video started playing for student ${peerId}.`);
                this.updateStudentStreamStatus(peerId, `Playing stream`, true);
            };
            video.onerror = (e) => {
                console.error(`[TUTOR] Video error for student ${peerId}:`, video.error);
                this.updateStudentStreamStatus(peerId, `Video error: ${video.error ? video.error.message : 'Unknown'}`, false);
            };
            video.onstalled = () => {
                console.warn(`[TUTOR] Video stalled for student ${peerId}.`);
                this.updateStudentStreamStatus(peerId, 'Stream stalled', true, 'stalled'); // Keep sharing true, but indicate issue
            };
            video.onwaiting = () => {
                console.warn(`[TUTOR] Video waiting for data for student ${peerId}.`);
                this.updateStudentStreamStatus(peerId, 'Stream buffering...', true, 'waiting');
            };

            // Clear existing click listener before adding a new one to prevent duplicates
            video.onclick = null;
            video.onclick = () => {
                console.log(`[TUTOR] Video element for student ${peerId} clicked.`);
                if (!document.fullscreenElement) {
                    video.requestFullscreen()
                        .then(() => {
                            console.log(`[TUTOR] Video for student ${peerId} entered fullscreen mode.`);
                        })
                        .catch(err => {
                            console.error(`[TUTOR] Error attempting to enable fullscreen for student ${peerId}:`, err.message, err.name);
                        });
                } else if (document.fullscreenElement === video) {
                    document.exitFullscreen()
                        .then(() => {
                            console.log(`[TUTOR] Video for student ${peerId} exited fullscreen mode.`);
                        })
                        .catch(err => {
                            console.error(`[TUTOR] Error attempting to exit fullscreen for student ${peerId}:`, err.message, err.name);
                        });
                } else {
                    // Another element is fullscreen, perhaps log or decide behavior
                    console.log(`[TUTOR] Another element is currently in fullscreen. Cannot toggle for student ${peerId} video.`);
                }
            };

            try {
                console.log(`[TUTOR] Attempting to play video for student ${peerId}.`);
                video.play().catch(e => {
                    console.error(`[TUTOR] Error calling video.play() for ${peerId}:`, e);
                    this.updateStudentStreamStatus(peerId, `Play failed: ${e.name}`, false);
                });
            } catch (e) {
                 console.error(`[TUTOR] Exception calling video.play() for ${peerId}:`, e);
                 this.updateStudentStreamStatus(peerId, `Play exception: ${e.name}`, false);
            }

        } else {
            console.warn(`[TUTOR] Stream div for student ${peerId} not found. Attempt ${attempt}. Retrying in ${delay}ms.`);
            if (attempt < maxAttempts) {
                setTimeout(() => {
                    this.displayRemoteStream(peerId, remoteStream, attempt + 1);
                }, delay);
            } else {
                console.error(`[TUTOR] Failed to find stream div for student ${peerId} after ${maxAttempts} attempts.`);
                this.updateStudentStreamStatus(peerId, 'UI element not found', false);
            }
        }
    }

    updateStudentStreamStatus(studentId, statusText, isSharing, stateClass = '') {
        const streamDiv = document.getElementById(`stream-${studentId}`);
        if (streamDiv) {
            const statusDiv = streamDiv.querySelector('.stream-status');
            statusDiv.textContent = statusText;
            if (isSharing) {
                streamDiv.classList.add('sharing');
                streamDiv.classList.remove('not-sharing', 'stalled', 'waiting');
                if (stateClass) streamDiv.classList.add(stateClass); // e.g. 'stalled' or 'waiting'
            } else {
                streamDiv.classList.remove('sharing', 'stalled', 'waiting');
                streamDiv.classList.add('not-sharing');
            }
            this.updateTutorStatus(); // Update overall student count and sharing status
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