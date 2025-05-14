import { useEffect, useRef, useState } from 'react';
import { ConnectionStatus } from '../types';

interface WebRTCOptions {
  onConnectionStateChange?: (state: ConnectionStatus) => void;
  onRemoteStreamChanged?: (stream: MediaStream | null) => void;
  onDataChannelMessage?: (message: string) => void;
}

export const useWebRTC = (localStream: MediaStream | null, options: WebRTCOptions = {}) => {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  const createPeerConnection = () => {
    try {
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          // Here we would send the ICE candidate to the peer
          console.log('New ICE candidate:', event.candidate);
        }
      };

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        let newStatus: ConnectionStatus = 'disconnected';

        switch (state) {
          case 'connected':
            newStatus = 'connected';
            break;
          case 'connecting':
          case 'new':
            newStatus = 'connecting';
            break;
          case 'failed':
          case 'disconnected':
          case 'closed':
            newStatus = 'disconnected';
            break;
          default:
            newStatus = 'disconnected';
        }

        setConnectionStatus(newStatus);
        options.onConnectionStateChange?.(newStatus);
      };

      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          options.onRemoteStreamChanged?.(event.streams[0]);
        }
      };

      // Set up data channel for text chat
      const dataChannel = peerConnection.createDataChannel('chat', {
        ordered: true,
      });

      dataChannel.onmessage = (event) => {
        options.onDataChannelMessage?.(event.data);
      };

      dataChannelRef.current = dataChannel;
      peerConnectionRef.current = peerConnection;

      // Add local tracks to the peer connection
      if (localStream) {
        localStream.getTracks().forEach(track => {
          if (peerConnection && localStream) {
            peerConnection.addTrack(track, localStream);
          }
        });
      }

      return peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      return null;
    }
  };

  const createOffer = async () => {
    try {
      const peerConnection = peerConnectionRef.current || createPeerConnection();
      if (!peerConnection) return null;

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await peerConnection.setLocalDescription(offer);
      return offer;
    } catch (error) {
      console.error('Error creating offer:', error);
      return null;
    }
  };

  const createAnswer = async (offer: RTCSessionDescriptionInit) => {
    try {
      const peerConnection = peerConnectionRef.current || createPeerConnection();
      if (!peerConnection) return null;

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      return answer;
    } catch (error) {
      console.error('Error creating answer:', error);
      return null;
    }
  };

  const acceptAnswer = async (answer: RTCSessionDescriptionInit) => {
    try {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) return false;

      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      return true;
    } catch (error) {
      console.error('Error accepting answer:', error);
      return false;
    }
  };

  const addIceCandidate = async (candidate: RTCIceCandidateInit) => {
    try {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) return false;

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      return true;
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      return false;
    }
  };

  const sendMessage = (message: string) => {
    try {
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        dataChannelRef.current.send(message);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  };

  const closeConnection = () => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setConnectionStatus('disconnected');
    options.onConnectionStateChange?.('disconnected');
    options.onRemoteStreamChanged?.(null);
  };

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      closeConnection();
    };
  }, []);

  return {
    connectionStatus,
    createPeerConnection,
    createOffer,
    createAnswer,
    acceptAnswer,
    addIceCandidate,
    sendMessage,
    closeConnection,
  };
};