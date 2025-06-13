// Simplified WebRTC implementation for screen sharing
class SimpleWebRTC {
    constructor(socket, isInitiator) {
        this.socket = socket;
        this.isInitiator = isInitiator;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        
        this.createPeerConnection();
    }

    createPeerConnection() {
        console.log('Creating peer connection, isInitiator:', this.isInitiator);
        
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate');
                this.socket.emit('ice-candidate', {
                    candidate: event.candidate
                });
            }
        };

        this.peerConnection.ontrack = (event) => {
            console.log('Received remote stream');
            this.remoteStream = event.streams[0];
            this.onRemoteStream(this.remoteStream);
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);
        };
    }

    async addLocalStream(stream) {
        console.log('Adding local stream');
        this.localStream = stream;
        
        stream.getTracks().forEach(track => {
            console.log('Adding track:', track.kind);
            this.peerConnection.addTrack(track, stream);
        });

        if (this.isInitiator) {
            await this.createOffer();
        }
    }

    async createOffer() {
        console.log('Creating offer');
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                offer: offer
            });
            console.log('Offer sent');
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleOffer(offer) {
        console.log('Handling offer');
        try {
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.socket.emit('answer', {
                answer: answer
            });
            console.log('Answer sent');
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(answer) {
        console.log('Handling answer');
        try {
            await this.peerConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleIceCandidate(candidate) {
        console.log('Handling ICE candidate');
        try {
            await this.peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    onRemoteStream(stream) {
        // Override this method
        console.log('Remote stream received - override this method');
    }

    close() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
    }
}