class ScreenSharingApp {
    constructor() {
        this.socket = io();
        this.userType = null;
        this.userName = null;
        this.roomId = null;
        this.tutorId = null;
        // this.localStream = null; // Will be replaced by combinedStream for sending
        this.screenStream = null;
        this.userMediaStream = null;
        this.combinedStream = null;
        this.peerConnections = new Map();
        this.shareAttempt = 0;
        this._screenStreamEndedHandler = null;
        this._lastScreenVideoTrack = null;
        this.isMediaActive = false; // Tracks if any media is being shared
        
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
        // Old buttons (commented out in HTML, remove refs here)
        // this.shareScreenBtn = document.getElementById('shareScreenBtn');
        // this.stopSharingBtn = document.getElementById('stopSharingBtn');
        // this.leaveRoomBtn = document.getElementById('leaveRoomBtn'); // Still used by new hangupBtn logic
        // this.toggleCameraBtn = document.getElementById('toggleCameraBtn'); // Old button
        // this.toggleMicBtn = document.getElementById('toggleMicBtn'); // Old button
        this.localVideo = document.getElementById('localVideo');

        // New control bar buttons
        this.micBtn = document.getElementById('micBtn');
        this.cameraBtn = document.getElementById('cameraBtn');
        this.presentBtn = document.getElementById('presentBtn');
        this.hangupBtn = document.getElementById('hangupBtn');


        // Tutor elements
        this.tutorLeaveBtn = document.getElementById('tutorLeaveBtn');
        this.roomIdDisplay = document.getElementById('roomIdDisplay');
        this.studentStreams = document.getElementById('studentStreams');
    }

    bindEvents() {
        this.joinBtn.addEventListener('click', () => this.joinRoom());
        // Old button listeners (commented out/removed)
        // if (this.shareScreenBtn) this.shareScreenBtn.addEventListener('click', () => this.startScreenShare());
        // if (this.stopSharingBtn) this.stopSharingBtn.addEventListener('click', () => this.stopScreenShare());
        // if (this.leaveRoomBtn) this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom()); // Now hangupBtn
        // if (this.toggleCameraBtn) this.toggleCameraBtn.addEventListener('click', () => this.toggleCamera());
        // if (this.toggleMicBtn) this.toggleMicBtn.addEventListener('click', () => this.toggleMicrophone());

        // New control bar button listeners
        if (this.micBtn) this.micBtn.addEventListener('click', () => this.toggleMicrophone());
        if (this.cameraBtn) this.cameraBtn.addEventListener('click', () => this.toggleCamera());
        if (this.presentBtn) this.presentBtn.addEventListener('click', () => this.togglePresentation());
        if (this.hangupBtn) this.hangupBtn.addEventListener('click', () => this.leaveRoom());

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

    async startScreenShare() { // Renaming to startMediaCapture or similar might be good eventually
        this.shareAttempt = (this.shareAttempt || 0) + 1;
        const currentShareAttempt = this.shareAttempt;
        console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Attempting to start media capture. Current combinedStream:`, this.combinedStream?.id, `Active: ${this.combinedStream?.active}. PeerConnections: ${this.peerConnections.size}`);

        if (this.combinedStream || this.screenStream || this.userMediaStream || this.peerConnections.size > 0) {
            console.warn(`[STUDENT][DEBUG Share #${currentShareAttempt}] startScreenShare called with existing streams or connections. Performing cleanup first.`);
            this.stopScreenShare(false);
            console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Cleanup finished. combinedStream: ${this.combinedStream}, screenStream: ${this.screenStream}, userMediaStream: ${this.userMediaStream}, PeerConnections: ${this.peerConnections.size}`);
        }

        let acquiredScreen = false;
        let acquiredUserMedia = false;

        try {
            // Attempt to get screen sharing stream
            try {
                console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Requesting screen capture stream.`);
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { mediaSource: 'screen' }, // Typically includes audio from the screen share
                    audio: true
                });
                console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Screen stream acquired: ID=${this.screenStream.id}, Active=${this.screenStream.active}`);
                this.screenStream.getTracks().forEach(t => console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Screen track: ${t.kind} id: ${t.id}, label: ${t.label}`));
                acquiredScreen = true;

                if (this.screenStream.getVideoTracks().length > 0) {
                    if (this._screenStreamEndedHandler && this._lastScreenVideoTrack) {
                         console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Removing old 'ended' listener from screen track ${this._lastScreenVideoTrack.id}`);
                         this._lastScreenVideoTrack.removeEventListener('ended', this._screenStreamEndedHandler);
                    }
                    this._screenStreamEndedHandler = () => {
                        console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Screen stream video track 'ended' event triggered.`);
                        this.stopScreenShare();
                    };
                    this._lastScreenVideoTrack = this.screenStream.getVideoTracks()[0];
                    console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Adding 'ended' listener to screen video track ${this._lastScreenVideoTrack.id}`);
                    this._lastScreenVideoTrack.addEventListener('ended', this._screenStreamEndedHandler);
                } else {
                    console.warn(`[STUDENT][DEBUG Share #${currentShareAttempt}] Screen stream has no video tracks. Cannot add 'ended' listener.`);
                }
            } catch (err) {
                console.warn(`[STUDENT][DEBUG Share #${currentShareAttempt}] Could not acquire screen share stream:`, err.name, err.message);
                if (err.name !== "NotAllowedError" && err.name !== "NotFoundError") { // Only alert if not a simple denial
                    alert(`Screen sharing permission denied or error: ${err.message}`);
                }
            }

            // Attempt to get camera/microphone stream
            try {
                console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Requesting user media (camera/mic).`);
                this.userMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] User media stream acquired: ID=${this.userMediaStream.id}, Active=${this.userMediaStream.active}`);
                this.userMediaStream.getTracks().forEach(t => console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] User media track: ${t.kind} id: ${t.id}, label: ${t.label}`));
                acquiredUserMedia = true;
            } catch (err) {
                console.warn(`[STUDENT][DEBUG Share #${currentShareAttempt}] Could not acquire user media (camera/mic):`, err.name, err.message);
                 if (err.name !== "NotAllowedError" && err.name !== "NotFoundError") {
                    alert(`Camera/microphone permission denied or error: ${err.message}`);
                }
            }

            if (!acquiredScreen && !acquiredUserMedia) {
                console.error(`[STUDENT][DEBUG Share #${currentShareAttempt}] Failed to acquire any media stream.`);
                this.updateStatus('Failed to acquire any media. Please check permissions.');
                // this.shareScreenBtn.style.display = 'inline-block'; // Old button
                // this.stopSharingBtn.style.display = 'none'; // Old button
                this.updateControlBarButtonStates(); // Reset to default
                return;
            }

            this.combinedStream = new MediaStream();
            console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Created combinedStream: ID=${this.combinedStream.id}`);

            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => {
                    console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Adding screen track to combinedStream: ${track.kind} id: ${track.id}`);
                    this.combinedStream.addTrack(track.clone()); // Clone tracks to avoid issues if original stream is stopped independently
                });
            }
            if (this.userMediaStream) {
                this.userMediaStream.getTracks().forEach(track => {
                    console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Adding user media track to combinedStream: ${track.kind} id: ${track.id}`);
                    this.combinedStream.addTrack(track.clone());
                });
            }
            console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Combined stream has ${this.combinedStream.getTracks().length} tracks:`);
            this.combinedStream.getTracks().forEach(t => console.log(`  - Track kind: ${t.kind}, id: ${t.id}, label: ${t.label}`));


            // Update local video preview: Prioritize screen share for the main preview element
            if (this.screenStream && this.screenStream.getVideoTracks().length > 0) {
                this.localVideo.srcObject = this.screenStream;
                console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Displaying screenStream in localVideo.`);
            } else if (this.userMediaStream && this.userMediaStream.getVideoTracks().length > 0) {
                // If only camera is available, show that in localVideo.
                // Or, if you want a dedicated camera preview element, that would be a separate UI task.
                this.localVideo.srcObject = this.userMediaStream;
                console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Displaying userMediaStream in localVideo (screen share not available/no video).`);
            } else {
                 this.localVideo.srcObject = null; // No video to preview
            }
            this.localVideo.style.display = (this.localVideo.srcObject) ? 'block' : 'none';

            // this.shareScreenBtn.style.display = 'none'; // Old button
            // this.stopSharingBtn.style.display = 'inline-block'; // Old button
            this.isMediaActive = true;
            this.updateControlBarButtonStates();


            this.updateStatus('Media sharing active. Notifying server...');
            this.socket.emit('start-screen-share');
            console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Emitted 'start-screen-share' to server.`);

            setTimeout(async () => {
                console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Initiating peer connections with combinedStream.`);
                await this.initiatePeerConnections();
            }, 1000);

        } catch (error) {
            console.error(`[STUDENT][DEBUG Share #${currentShareAttempt}] Error in startScreenShare main try block:`, error);
            alert('An unexpected error occurred while starting media sharing.');
            this.stopScreenShare(false);
            this.updateStatus('Media sharing failed.');
        }
    }

    stopScreenShare(notifyServer = true) {
        const currentShareAttempt = this.userType === 'student' ? this.shareAttempt : 'N/A';
        console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] stopScreenShare called. notifyServer: ${notifyServer}. PeerConnections: ${this.peerConnections.size}`);
        console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] State before cleanup: screenStream: ${this.screenStream?.id}, userMediaStream: ${this.userMediaStream?.id}, combinedStream: ${this.combinedStream?.id}`);

        // Stop screen stream tracks
        if (this.screenStream) {
            console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] Stopping screenStream tracks: ${this.screenStream.id}`);
            this.screenStream.getTracks().forEach(track => {
                console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] Stopping screen track: ${track.kind} id: ${track.id}, readyState: ${track.readyState}`);
                if (this.userType === 'student' && track.kind === 'video' && this._screenStreamEndedHandler && track === this._lastScreenVideoTrack) {
                    console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Removing 'ended' listener from screen video track ${track.id}`);
                    track.removeEventListener('ended', this._screenStreamEndedHandler);
                }
                track.stop();
            });
            this.screenStream = null;
            this._lastScreenVideoTrack = null;
            this._screenStreamEndedHandler = null;
            console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] screenStream nulled.`);
        }

        // Stop user media stream tracks
        if (this.userMediaStream) {
            console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] Stopping userMediaStream tracks: ${this.userMediaStream.id}`);
            this.userMediaStream.getTracks().forEach(track => {
                console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] Stopping user media track: ${track.kind} id: ${track.id}, readyState: ${track.readyState}`);
                track.stop();
            });
            this.userMediaStream = null;
            console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] userMediaStream nulled.`);
        }

        // Combined stream tracks are references, they are stopped when original streams are stopped.
        if(this.combinedStream){
            console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] Nullifying combinedStream. Tracks should be already stopped.`);
            this.combinedStream = null; // Nullify the combined stream reference
        }


        this.localVideo.srcObject = null;
        this.localVideo.style.display = 'none';
        // this.shareScreenBtn.style.display = 'inline-block'; // Old button
        // this.stopSharingBtn.style.display = 'none'; // Old button
        this.isMediaActive = false;
        this.updateControlBarButtonStates(); // Update buttons to reflect stopped state
        console.log(`[${this.userType}] UI elements for screen share reset.`);

        if (notifyServer) {
            this.updateStatus(`Connected to room ${this.roomId}. Screen share stopped.`);
            this.socket.emit('stop-screen-share');
            console.log(`[${this.userType}] Emitted 'stop-screen-share' to server.`);
        }

        // Close all peer connections by first collecting keys, then iterating
        const peerIdsToClose = Array.from(this.peerConnections.keys());
        if (peerIdsToClose.length > 0) {
            console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] Closing all peer connections. Count: ${peerIdsToClose.length}`);
            peerIdsToClose.forEach(peerId => {
                // Determine initiator context for cleanup logging, assumes student is always initiator for its connections
                const isInitiatorContext = (this.userType === 'student' && peerId === this.tutorId);
                this.cleanupPeerConnection(peerId, isInitiatorContext);
            });
            if(this.peerConnections.size > 0) { // Should be 0 if cleanupPeerConnection works
                console.warn(`[${this.userType}][DEBUG Share #${currentShareAttempt}] Peer connections map not empty after targeted cleanup. Size: ${this.peerConnections.size}. Forcing clear.`);
                this.peerConnections.clear();
            }
            console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] All peer connections processed for closure.`);
        } else {
            console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] No peer connections to close.`);
        }
        console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] State after cleanup: combinedStream: ${this.combinedStream}, screenStream: ${this.screenStream}, userMediaStream: ${this.userMediaStream}, PeerConnections: ${this.peerConnections.size}`);
    }

    toggleCamera() {
        const currentShareAttempt = this.shareAttempt;
        if (!this.userMediaStream) {
            console.warn(`[STUDENT][DEBUG Share #${currentShareAttempt}] toggleCamera: No userMediaStream to toggle camera.`);
            return;
        }
        const videoTrack = this.userMediaStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Camera ${videoTrack.enabled ? 'ENABLED' : 'DISABLED'}`);
        } else {
            console.warn(`[STUDENT][DEBUG Share #${currentShareAttempt}] toggleCamera: No video track found in userMediaStream.`);
        }
        this.updateControlBarButtonStates();
    }

    toggleMicrophone() {
        const currentShareAttempt = this.shareAttempt;
        if (!this.userMediaStream) {
            console.warn(`[STUDENT][DEBUG Share #${currentShareAttempt}] toggleMicrophone: No userMediaStream to toggle microphone.`);
            return;
        }
        const audioTrack = this.userMediaStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Microphone ${audioTrack.enabled ? 'ENABLED' : 'DISABLED'}`);
        } else {
            console.warn(`[STUDENT][DEBUG Share #${currentShareAttempt}] toggleMicrophone: No audio track found in userMediaStream.`);
        }
        this.updateControlBarButtonStates();
    }

    togglePresentation() {
        const currentShareAttempt = this.shareAttempt;
        console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] togglePresentation called. isMediaActive: ${this.isMediaActive}`);
        if (this.isMediaActive) {
            this.stopScreenShare(true); // true to notify server
        } else {
            this.startScreenShare();
        }
        // Button states will be updated by stopScreenShare or startScreenShare
    }

    updateControlBarButtonStates() {
        const currentShareAttempt = this.shareAttempt;
        // Mic Button
        if (this.micBtn) {
            const audioTrack = this.userMediaStream ? this.userMediaStream.getAudioTracks()[0] : null;
            if (audioTrack && this.isMediaActive) { // Only show as active if media session is active
                this.micBtn.classList.toggle('mic-on', audioTrack.enabled);
                this.micBtn.classList.toggle('mic-off', !audioTrack.enabled);
                this.micBtn.innerHTML = audioTrack.enabled ? '🎤' : '<span style="text-decoration: line-through;">🎤</span>';
            } else {
                this.micBtn.classList.remove('mic-on', 'mic-off');
                this.micBtn.innerHTML = '🎤'; // Default icon
            }
        }

        // Camera Button
        if (this.cameraBtn) {
            const videoTrack = this.userMediaStream ? this.userMediaStream.getVideoTracks()[0] : null;
            if (videoTrack && this.isMediaActive) { // Only show as active if media session is active
                this.cameraBtn.classList.toggle('camera-on', videoTrack.enabled);
                this.cameraBtn.classList.toggle('camera-off', !videoTrack.enabled);
                this.cameraBtn.innerHTML = videoTrack.enabled ? '📷' : '<span style="text-decoration: line-through;">📷</span>';
            } else {
                this.cameraBtn.classList.remove('camera-on', 'camera-off');
                this.cameraBtn.innerHTML = '📷'; // Default icon
            }
        }

        // Present Button
        if (this.presentBtn) {
            if (this.isMediaActive) {
                this.presentBtn.classList.add('presenting');
                this.presentBtn.innerHTML = '💻'; // Could change to "Stop" icon or text
                this.presentBtn.title = "Stop Presenting";
            } else {
                this.presentBtn.classList.remove('presenting');
                this.presentBtn.innerHTML = '💻';
                this.presentBtn.title = "Start Presenting";
            }
        }
        console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Control bar buttons updated. isMediaActive: ${this.isMediaActive}`);
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
            const attempt = (isInitiator && this.userType === 'student') ? `#${this.shareAttempt}` : '';
            console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${attempt}] Connection state: ${peerConnection.connectionState}, Signaling: ${peerConnection.signalingState}, ICE: ${peerConnection.iceConnectionState}`);
            if (peerConnection.connectionState === 'failed') {
                console.error(`[${this.userType}][PC ${peerId}][DEBUG Share ${attempt}] WebRTC connection FAILED.`);
                this.cleanupPeerConnection(peerId, isInitiator);
            } else if (peerConnection.connectionState === 'connected') {
                console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${attempt}] WebRTC connection CONNECTED.`);
            } else if (peerConnection.connectionState === 'disconnected') {
                console.warn(`[${this.userType}][PC ${peerId}][DEBUG Share ${attempt}] WebRTC connection DISCONNECTED. Waiting for potential auto-reconnect.`);
            } else if (peerConnection.connectionState === 'closed') {
                console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${attempt}] WebRTC connection CLOSED. Cleaning up.`);
                this.cleanupPeerConnection(peerId, isInitiator);
            }
        };

        // Handle ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
            const attempt = (isInitiator && this.userType === 'student') ? `#${this.shareAttempt}` : '';
            console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${attempt}] ICE connection state: ${peerConnection.iceConnectionState}, Signaling: ${peerConnection.signalingState}`);
        };

        peerConnection.onsignalingstatechange = () => {
            const attempt = (isInitiator && this.userType === 'student') ? `#${this.shareAttempt}` : '';
            console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${attempt}] Signaling state: ${peerConnection.signalingState}, Connection: ${peerConnection.connectionState}, ICE: ${peerConnection.iceConnectionState}`);
        };


        // Add local stream tracks if this peer connection is supposed to send them
        // STUDENT SIDE: 'isInitiator' is true. 'this.combinedStream' should be used.
        if (isInitiator && this.combinedStream) {
            console.log(`[STUDENT][PC ${peerId}] Adding combinedStream tracks to peer connection.`);
            this.combinedStream.getTracks().forEach(track => {
                console.log(`[STUDENT][PC ${peerId}] Adding track: ${track.kind} (label: ${track.label}, id: ${track.id})`);
                try {
                    // Ensure track is active before adding
                    if (track.readyState === 'live') {
                        peerConnection.addTrack(track, this.combinedStream);
                    } else {
                        console.warn(`[STUDENT][PC ${peerId}] Skipping inactive track: ${track.kind} id: ${track.id}, label: ${track.label}`);
                    }
                } catch (e) {
                    console.error(`[STUDENT][PC ${peerId}] Error adding track ${track.id}:`, e);
                }
            });
            console.log(`[STUDENT][PC ${peerId}] Finished adding combinedStream tracks. Senders:`, peerConnection.getSenders().length);
        } else if (!isInitiator) {
            // TUTOR SIDE: isInitiator is false. Tutor does not send tracks in this model.
            console.log(`[TUTOR][PC ${peerId}] Not adding local tracks as tutor does not send media.`);
        } else {
             console.log(`[STUDENT][PC ${peerId}] Not adding local tracks. CombinedStream available: ${!!this.combinedStream} (Tracks: ${this.combinedStream?.getTracks().length}), Is Initiator: ${isInitiator}`);
        }

        // Create offer if initiator (student will be initiator)
        if (isInitiator) {
            const currentShareAttempt = this.userType === 'student' ? this.shareAttempt : 'N/A';
            console.log(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Creating WebRTC offer for tutor ${peerId}.`);
            try {
                const offer = await peerConnection.createOffer();
                console.log(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Offer created. Setting local description. Signaling state: ${peerConnection.signalingState}`);
                await peerConnection.setLocalDescription(offer);
                console.log(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Local description set. Signaling state: ${peerConnection.signalingState}. Emitting webrtc-offer.`);

                this.socket.emit('webrtc-offer', {
                    target: peerId, // Should be tutorId
                    offer: offer
                });
                console.log(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Sent webrtc-offer to tutor ${peerId}.`);
            } catch (e) {
                console.error(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Error creating offer for tutor ${peerId}:`, e);
            }
        }

        return peerConnection;
    }

    async initiatePeerConnections() {
        const currentShareAttempt = this.userType === 'student' ? this.shareAttempt : 'N/A';
        console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] Attempting to initiate peer connections.`);
        // This is called by students to initiate connections with the tutor
        if (this.userType === 'student' && this.combinedStream && this.combinedStream.getTracks().length > 0) {
            if (this.tutorId) {
                console.log(`[STUDENT][DEBUG Share #${currentShareAttempt}] Initiating peer connection with tutor: ${this.tutorId} using combinedStream.`);
                await this.createPeerConnection(this.tutorId, true);
            } else {
                console.warn(`[STUDENT][DEBUG Share #${currentShareAttempt}] Tutor ID not available. Cannot initiate peer connection.`);
                this.updateStatus('Tutor not found or not ready. Cannot start WebRTC.');
            }
        } else {
            console.log(`[${this.userType}][DEBUG Share #${currentShareAttempt}] Conditions not met for initiating peer connection. UserType: ${this.userType}, CombinedStream Tracks: ${this.combinedStream?.getTracks().length}`);
        }
    }

    async restartConnection(peerId, wasInitiator) {
        const currentShareAttempt = (this.userType === 'student' && wasInitiator) ? `#${this.shareAttempt}` : '';
        console.warn(`[${this.userType}][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Restarting connection. Was initiator: ${wasInitiator}`);
        
        this.cleanupPeerConnection(peerId, wasInitiator);

        setTimeout(async () => {
            console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Attempting to re-establish connection after delay.`);
            if (this.userType === 'student' && peerId === this.tutorId) { // Student is restarting connection with Tutor
                 if (this.localStream && this.localStream.active) {
                    console.log(`[STUDENT][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Re-initiating connection with tutor.`);
                    await this.createPeerConnection(this.tutorId, true);
                 } else {
                    console.warn(`[STUDENT][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Local stream not available/active during restart. Cannot re-initiate.`);
                 }
            } else if (this.userType === 'tutor') { // Tutor's connection with a student failed
                console.log(`[TUTOR][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Connection with student failed/restarted. Tutor waits for new offer.`);
            }
        }, 3000);
    }

    cleanupPeerConnection(peerId, isInitiatorContext) {
        const currentShareAttempt = (this.userType === 'student' && isInitiatorContext) ? `#${this.shareAttempt}` : '';
        console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${currentShareAttempt}] cleanupPeerConnection called.`);
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Cleaning up peer connection. Current state: ${pc.connectionState}, signaling: ${pc.signalingState}`);
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.onconnectionstatechange = null;
            pc.oniceconnectionstatechange = null;
            pc.onsignalingstatechange = null;
            console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Event listeners nulled.`);
            if (pc.signalingState !== 'closed') {
                pc.close();
                console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Peer connection closed. New state: ${pc.connectionState}, signaling: ${pc.signalingState}`);
            } else {
                console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Peer connection already closed.`);
            }
            this.peerConnections.delete(peerId);
            console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Peer connection removed from map. Map size: ${this.peerConnections.size}`);
        } else {
            console.log(`[${this.userType}][PC ${peerId}][DEBUG Share ${currentShareAttempt}] No peer connection found for cleanup.`);
        }

        if (this.userType === 'tutor' && peerId) {
            this.handleStudentScreenShareStopped({ studentId: peerId, name: 'Peer (cleaned)' });
        } else if (this.userType === 'student' && peerId === this.tutorId) {
            console.log(`[STUDENT][PC ${peerId}][DEBUG Share ${currentShareAttempt}] Cleaned up PC with tutor. Student can attempt to share again if needed.`);
        }
    }

    async handleWebRTCOffer(data) {
        const studentId = data.sender;
        console.log(`[TUTOR][PC ${studentId}][DEBUG] Received WebRTC offer.`);

        let existingPC = this.peerConnections.get(studentId);
        if (existingPC) {
            console.warn(`[TUTOR][PC ${studentId}][DEBUG] Existing peer connection found while handling new offer. State: ${existingPC.connectionState}, Signaling: ${existingPC.signalingState}. Cleaning up old PC.`);
            this.cleanupPeerConnection(studentId, false);
        }

        const peerConnection = await this.createPeerConnection(studentId, false);
        if (!peerConnection) {
            console.error(`[TUTOR][PC ${studentId}][DEBUG] Failed to create peer connection upon receiving offer.`);
            return;
        }

        try {
            console.log(`[TUTOR][PC ${studentId}] Setting remote description from offer. Current signaling state: ${peerConnection.signalingState}`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log(`[TUTOR][PC ${studentId}] Remote description set. Signaling state: ${peerConnection.signalingState}. Creating answer.`);

            const answer = await peerConnection.createAnswer();
            console.log(`[TUTOR][PC ${studentId}] Answer created. Setting local description. Signaling state: ${peerConnection.signalingState}`);
            await peerConnection.setLocalDescription(answer);
            console.log(`[TUTOR][PC ${studentId}] Local description set. Signaling state: ${peerConnection.signalingState}. Emitting webrtc-answer.`);

            this.socket.emit('webrtc-answer', {
                target: studentId,
                answer: answer
            });
            console.log(`[TUTOR][PC ${studentId}] Sent webrtc-answer.`);
        } catch (error) {
            console.error(`[TUTOR][PC ${studentId}] Error handling WebRTC offer:`, error);
        }
    }

    async handleWebRTCAnswer(data) {
        const peerId = data.sender; // Tutor's ID
        const currentShareAttempt = this.userType === 'student' ? this.shareAttempt : 'N/A';
        console.log(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Received WebRTC answer from tutor ${peerId}.`);

        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            console.log(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Current PC signaling state: ${peerConnection.signalingState}.`);
            if (peerConnection.signalingState === 'have-local-offer') {
                try {
                    console.log(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Setting remote description from answer.`);
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                    console.log(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Remote description set. Signaling state: ${peerConnection.signalingState}. Connection should establish.`);
                } catch (error) {
                    console.error(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Error setting remote description from answer:`, error);
                }
            } else {
                console.warn(`[STUDENT][PC ${peerId}][DEBUG Share #${currentShareAttempt}] Received answer, but signaling state is ${peerConnection.signalingState} (expected 'have-local-offer'). This might be a late answer or a bug.`);
            }
        } else {
            console.error(`[STUDENT][DEBUG Share #${currentShareAttempt}] No peer connection found for tutor ${peerId} when handling answer. Current tutorId: ${this.tutorId}. PeerConnections map size: ${this.peerConnections.size}`);
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