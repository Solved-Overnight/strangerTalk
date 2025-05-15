import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ref, onValue, set, remove, onDisconnect, serverTimestamp, get } from 'firebase/database';
import { database } from '../firebase';
import { ConnectionStatus, User, ChatMessage, VideoStreamState } from '../types';
import { ChatRequest } from '../components/ChatRequest';
import { createRoot } from 'react-dom/client';

interface AppContextType {
  user: User;
  connectionStatus: ConnectionStatus;
  videoState: VideoStreamState;
  messages: ChatMessage[];
  activeUsers: number;
  permissionError: string | null;
  setUser: (user: User) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  updateVideoState: (state: Partial<VideoStreamState>) => void;
  sendMessage: (text: string) => void;
  toggleVideo: () => void;
  toggleAudio: () => void;
  skipChat: () => void;
  startNewChat: () => void;
  retryMediaAccess: () => void;
}

const defaultUser: User = {
  id: uuidv4(),
  nickname: 'Anonymous',
  interests: [],
};

const defaultVideoState: VideoStreamState = {
  localStream: null,
  remoteStream: null,
  isVideoEnabled: true,
  isAudioEnabled: true,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(defaultUser);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [videoState, setVideoState] = useState<VideoStreamState>(defaultVideoState);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeUsers, setActiveUsers] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [currentChatPartner, setCurrentChatPartner] = useState<string | null>(null);

  useEffect(() => {
    const userRef = ref(database, `users/${user.id}`);
    const connectedRef = ref(database, '.info/connected');

    const handleConnection = async (snapshot: any) => {
      if (snapshot.val() === true) {
        const userStatus = {
          id: user.id,
          nickname: user.nickname || 'Anonymous',
          online: true,
          status: 'available',
          lastSeen: serverTimestamp(),
          interests: user.interests,
        };

        await onDisconnect(userRef).remove();
        await set(userRef, userStatus);
      }
    };

    const unsubscribeConnection = onValue(connectedRef, handleConnection);

    const usersRef = ref(database, 'users');
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const users = snapshot.val();
        const onlineUsers = Object.values(users).filter((u: any) => u.online === true && u.id !== user.id);
        setActiveUsers(onlineUsers.length);
      } else {
        setActiveUsers(0);
      }
    });

    const requestsRef = ref(database, `requests/${user.id}`);
    const unsubscribeRequests = onValue(requestsRef, async (snapshot) => {
      if (snapshot.exists() && connectionStatus === 'disconnected') {
        const request = snapshot.val();
        const fromUserRef = ref(database, `users/${request.from}`);
        const fromUserSnapshot = await get(fromUserRef);
        
        if (fromUserSnapshot.exists()) {
          const fromUser = fromUserSnapshot.val();
          const requestElement = document.createElement('div');
          requestElement.id = 'chat-request-modal';
          document.body.appendChild(requestElement);

          const root = createRoot(requestElement);
          root.render(
            <ChatRequest
              senderNickname={fromUser.nickname || 'Anonymous'}
              receiverNickname={user.nickname || 'Anonymous'}
              onAccept={async () => {
                root.unmount();
                requestElement.remove();

                const mediaInitialized = await initializeMedia();
                if (!mediaInitialized) {
                  await set(ref(database, `responses/${request.from}`), {
                    accepted: false,
                    error: 'media_failed',
                    timestamp: serverTimestamp(),
                  });
                  return;
                }

                await set(ref(database, `responses/${request.from}`), {
                  accepted: true,
                  from: user.id,
                  timestamp: serverTimestamp(),
                });

                setCurrentChatPartner(request.from);
                setConnectionStatus('connected');

                const chatStatus = {
                  status: 'chatting',
                  chatPartner: request.from,
                  online: true,
                  lastSeen: serverTimestamp(),
                };

                await set(userRef, {
                  ...user,
                  ...chatStatus,
                });

                await set(fromUserRef, {
                  ...fromUser,
                  status: 'chatting',
                  chatPartner: user.id,
                  online: true,
                  lastSeen: serverTimestamp(),
                });

                const roomId = [user.id, request.from].sort().join('-');
                const roomRef = ref(database, `rooms/${roomId}`);
                await set(roomRef, {
                  participants: [user.id, request.from],
                  startedAt: serverTimestamp(),
                  active: true,
                });

                const messagesRef = ref(database, `rooms/${roomId}/messages`);
                onValue(messagesRef, (snapshot) => {
                  if (snapshot.exists()) {
                    const messages = Object.values(snapshot.val());
                    setMessages(messages as ChatMessage[]);
                  }
                });

                await remove(requestsRef);
              }}
              onDecline={async () => {
                root.unmount();
                requestElement.remove();
                
                await set(ref(database, `responses/${request.from}`), {
                  accepted: false,
                  timestamp: serverTimestamp(),
                });

                await remove(requestsRef);
              }}
            />
          );
        }
      }
    });

    const responsesRef = ref(database, `responses/${user.id}`);
    const unsubscribeResponses = onValue(responsesRef, async (snapshot) => {
      if (snapshot.exists() && connectionStatus === 'connecting') {
        const response = snapshot.val();
        
        if (response.accepted) {
          const targetUserRef = ref(database, `users/${response.from}`);
          const targetUserSnapshot = await get(targetUserRef);
          
          if (targetUserSnapshot.exists()) {
            const targetUser = targetUserSnapshot.val();
            setCurrentChatPartner(response.from);
            setConnectionStatus('connected');

            await set(userRef, {
              ...user,
              status: 'chatting',
              chatPartner: response.from,
              online: true,
              lastSeen: serverTimestamp(),
            });

            await set(targetUserRef, {
              ...targetUser,
              status: 'chatting',
              chatPartner: user.id,
              online: true,
              lastSeen: serverTimestamp(),
            });
            
            const roomId = [user.id, response.from].sort().join('-');
            const roomRef = ref(database, `rooms/${roomId}`);
            await set(roomRef, {
              participants: [user.id, response.from],
              startedAt: serverTimestamp(),
              active: true,
            });

            const messagesRef = ref(database, `rooms/${roomId}/messages`);
            onValue(messagesRef, (snapshot) => {
              if (snapshot.exists()) {
                const messages = Object.values(snapshot.val());
                setMessages(messages as ChatMessage[]);
              }
            });
          }
        } else {
          setConnectionStatus('disconnected');
          startNewChat();
        }
        
        await remove(responsesRef);
      }
    });

    const chatPartnerStatusRef = ref(database, `users/${currentChatPartner}`);
    const unsubscribeChatPartner = onValue(chatPartnerStatusRef, (snapshot) => {
      if (currentChatPartner && !snapshot.exists()) {
        setConnectionStatus('disconnected');
        setCurrentChatPartner(null);
        clearChat();
      }
    });

    return () => {
      unsubscribeConnection();
      unsubscribeUsers();
      unsubscribeRequests();
      unsubscribeResponses();
      unsubscribeChatPartner();
      remove(userRef);
    };
  }, [user.id, user.nickname, connectionStatus, currentChatPartner]);

  const findAvailableUser = async () => {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    
    if (snapshot.exists()) {
      const users = snapshot.val();
      const availableUsers = Object.values(users).filter((u: any) => 
        u.online === true && 
        u.id !== user.id && 
        u.status === 'available'
      );
      
      if (availableUsers.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableUsers.length);
        const randomUser = availableUsers[randomIndex] as any;
        return randomUser.id;
      }
    }
    return null;
  };

  const sendChatRequest = async (targetUserId: string) => {
    const requestRef = ref(database, `requests/${targetUserId}`);
    const userRef = ref(database, `users/${user.id}`);
    const targetUserRef = ref(database, `users/${targetUserId}`);

    try {
      const targetUserSnapshot = await get(targetUserRef);
      if (!targetUserSnapshot.exists() || targetUserSnapshot.val().status !== 'available') {
        setConnectionStatus('disconnected');
        startNewChat();
        return;
      }

      await set(userRef, {
        ...user,
        online: true,
        status: 'requesting',
        lastSeen: serverTimestamp(),
      });

      await set(requestRef, {
        from: user.id,
        timestamp: serverTimestamp(),
      });

      const responseRef = ref(database, `responses/${user.id}`);
      const unsubscribe = onValue(responseRef, async (snapshot) => {
        if (snapshot.exists()) {
          const response = snapshot.val();
          if (response.accepted) {
            setCurrentChatPartner(targetUserId);
            setConnectionStatus('connected');
            
            await set(userRef, {
              ...user,
              status: 'chatting',
              chatPartner: targetUserId,
              online: true,
              lastSeen: serverTimestamp(),
            });

            const roomId = [user.id, targetUserId].sort().join('-');
            const roomRef = ref(database, `rooms/${roomId}`);
            await set(roomRef, {
              participants: [user.id, targetUserId],
              startedAt: serverTimestamp(),
              active: true,
            });

            const messagesRef = ref(database, `rooms/${roomId}/messages`);
            onValue(messagesRef, (snapshot) => {
              if (snapshot.exists()) {
                const messages = Object.values(snapshot.val());
                setMessages(messages as ChatMessage[]);
              }
            });
          } else {
            setConnectionStatus('disconnected');
            startNewChat();
          }
          unsubscribe();
          await remove(responseRef);
        }
      });

      setTimeout(async () => {
        const currentUserSnapshot = await get(userRef);
        if (currentUserSnapshot.exists() && currentUserSnapshot.val().status === 'requesting') {
          unsubscribe();
          await remove(responseRef);
          await remove(requestRef);
          await set(userRef, {
            ...user,
            status: 'available',
            online: true,
            lastSeen: serverTimestamp(),
          });
          setConnectionStatus('disconnected');
          startNewChat();
        }
      }, 10000);
    } catch (error) {
      console.error('Error sending chat request:', error);
      setConnectionStatus('disconnected');
    }
  };

  const updateVideoState = (state: Partial<VideoStreamState>) => {
    setVideoState(prev => ({ ...prev, ...state }));
  };

  const sendMessage = (text: string) => {
    if (!currentChatPartner) return;

    const roomId = [user.id, currentChatPartner].sort().join('-');
    const messageRef = ref(database, `rooms/${roomId}/messages/${uuidv4()}`);
    
    const newMessage: ChatMessage = {
      id: uuidv4(),
      senderId: user.id,
      text,
      timestamp: Date.now(),
    };
    
    set(messageRef, newMessage);
  };

  const toggleVideo = () => {
    if (videoState.localStream) {
      const videoTracks = videoState.localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !videoState.isVideoEnabled;
      });
      updateVideoState({ isVideoEnabled: !videoState.isVideoEnabled });
    }
  };

  const toggleAudio = () => {
    if (videoState.localStream) {
      const audioTracks = videoState.localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !videoState.isAudioEnabled;
      });
      updateVideoState({ isAudioEnabled: !videoState.isAudioEnabled });
    }
  };

  const skipChat = () => {
    if (connectionStatus === 'connected') {
      setConnectionStatus('disconnected');
      clearChat();
      startNewChat();
    }
  };

  const clearChat = async () => {
    setMessages([]);
    if (currentChatPartner) {
      const roomId = [user.id, currentChatPartner].sort().join('-');
      const roomRef = ref(database, `rooms/${roomId}`);
      await set(roomRef, { active: false });
      
      const userRef = ref(database, `users/${user.id}`);
      await set(userRef, {
        ...user,
        status: 'available',
        chatPartner: null,
        online: true,
        lastSeen: serverTimestamp(),
      });
    }
    setCurrentChatPartner(null);
  };

  const startNewChat = async () => {
    if (connectionStatus === 'connecting') return;

    clearChat();
    setConnectionStatus('connecting');
    setPermissionError(null);
    
    try {
      const mediaInitialized = await initializeMedia();
      if (!mediaInitialized) {
        setConnectionStatus('disconnected');
        return;
      }

      const userRef = ref(database, `users/${user.id}`);
      await set(userRef, {
        ...user,
        online: true,
        status: 'available',
        lastSeen: serverTimestamp(),
      });

      const findAndConnect = async () => {
        const targetUserId = await findAvailableUser();
        if (targetUserId) {
          await sendChatRequest(targetUserId);
        } else {
          setTimeout(findAndConnect, 2000);
        }
      };

      await findAndConnect();
    } catch (error) {
      console.error('Error starting new chat:', error);
      setConnectionStatus('disconnected');
    }
  };

  const initializeMedia = async () => {
    try {
      // First check if any media devices are available
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideoDevice = devices.some(device => device.kind === 'videoinput');
      const hasAudioDevice = devices.some(device => device.kind === 'audioinput');

      if (!hasVideoDevice && !hasAudioDevice) {
        setPermissionError(
          'No camera or microphone found. Please connect a camera or microphone to your device and try again. ' +
          'You can also check if your devices are properly connected in your system settings.'
        );
        return false;
      }

      // Try video and audio first
      if (hasVideoDevice && hasAudioDevice) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });

          stream.getVideoTracks().forEach(track => track.enabled = true);
          stream.getAudioTracks().forEach(track => track.enabled = true);

          updateVideoState({
            localStream: stream,
            isVideoEnabled: true,
            isAudioEnabled: true
          });

          setPermissionError(null);
          return true;
        } catch (error) {
          console.warn('Failed to get both video and audio, trying audio only:', error);
        }
      }

      // If video+audio failed or video device isn't available, try audio only
      if (hasAudioDevice) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
          });

          audioStream.getAudioTracks().forEach(track => track.enabled = true);

          updateVideoState({
            localStream: audioStream,
            isVideoEnabled: false,
            isAudioEnabled: true
          });

          setPermissionError(null);
          return true;
        } catch (error) {
          console.error('Failed to get audio access:', error);
          if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
            setPermissionError(
              'To use this app, please allow access to your microphone. ' +
              'Click the microphone icon in your browser\'s address bar to update permissions, ' +
              'then click "Try Again" below.'
            );
          } else {
            setPermissionError('An error occurred while accessing your microphone. Please check your audio device connections and try again.');
          }
        }
      } else if (hasVideoDevice) {
        // If only video is available, try video only
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });

          videoStream.getVideoTracks().forEach(track => track.enabled = true);

          updateVideoState({
            localStream: videoStream,
            isVideoEnabled: true,
            isAudioEnabled: false
          });

          setPermissionError(null);
          return true;
        } catch (error) {
          console.error('Failed to get video access:', error);
          setPermissionError('An error occurred while accessing your camera. Please check your camera connections and try again.');
        }
      }

      updateVideoState({
        localStream: null,
        isVideoEnabled: false,
        isAudioEnabled: false
      });
      return false;
    } catch (error) {
      console.error('Error initializing media:', error);
      setPermissionError('An unexpected error occurred while accessing your media devices. Please refresh the page and try again.');
      return false;
    }
  };

  const retryMediaAccess = () => {
    startNewChat();
  };

  useEffect(() => {
    return () => {
      if (videoState.localStream) {
        videoState.localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const value = {
    user,
    connectionStatus,
    videoState,
    messages,
    activeUsers,
    permissionError,
    setUser,
    setConnectionStatus,
    updateVideoState,
    sendMessage,
    toggleVideo,
    toggleAudio,
    skipChat,
    startNewChat,
    retryMediaAccess
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};