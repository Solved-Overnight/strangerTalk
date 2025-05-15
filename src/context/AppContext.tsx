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
  name: 'Anonymous',
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
          name: user.name || 'Anonymous',
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
              userName={fromUser.name || 'Anonymous'}
              onAccept={async () => {
                root.unmount();
                requestElement.remove();

                // Initialize media before accepting
                const mediaInitialized = await initializeMedia();
                if (!mediaInitialized) {
                  await set(ref(database, `responses/${request.from}`), {
                    accepted: false,
                    error: 'media_failed',
                    timestamp: serverTimestamp(),
                  });
                  return;
                }

                // Update response with acceptance
                await set(ref(database, `responses/${request.from}`), {
                  accepted: true,
                  from: user.id,
                  timestamp: serverTimestamp(),
                });

                setCurrentChatPartner(request.from);
                setConnectionStatus('connected');

                // Update both users' status
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

                // Set up chat room
                const roomId = [user.id, request.from].sort().join('-');
                const roomRef = ref(database, `rooms/${roomId}`);
                await set(roomRef, {
                  participants: [user.id, request.from],
                  startedAt: serverTimestamp(),
                  active: true,
                });

                // Listen for room messages
                const messagesRef = ref(database, `rooms/${roomId}/messages`);
                onValue(messagesRef, (snapshot) => {
                  if (snapshot.exists()) {
                    const messages = Object.values(snapshot.val());
                    setMessages(messages as ChatMessage[]);
                  }
                });

                // Clear the request
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

    // Listen for responses to our requests
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

            // Update own status
            await set(userRef, {
              ...user,
              status: 'chatting',
              chatPartner: response.from,
              online: true,
              lastSeen: serverTimestamp(),
            });

            // Update target user status
            await set(targetUserRef, {
              ...targetUser,
              status: 'chatting',
              chatPartner: user.id,
              online: true,
              lastSeen: serverTimestamp(),
            });
            
            // Set up chat room
            const roomId = [user.id, response.from].sort().join('-');
            const roomRef = ref(database, `rooms/${roomId}`);
            await set(roomRef, {
              participants: [user.id, response.from],
              startedAt: serverTimestamp(),
              active: true,
            });

            // Listen for room messages
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
          startNewChat(); // Try another user if rejected
        }
        
        await remove(responsesRef);
      }
    });

    // Listen for chat partner status changes
    const chatPartnerStatusRef = ref(database, `users/${currentChatPartner}`);
    const unsubscribeChatPartner = onValue(chatPartnerStatusRef, (snapshot) => {
      if (currentChatPartner && !snapshot.exists()) {
        // Chat partner disconnected
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
  }, [user.id, user.name, connectionStatus, currentChatPartner]);

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
        // Randomize user selection
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
      // Check if target user is still available
      const targetUserSnapshot = await get(targetUserRef);
      if (!targetUserSnapshot.exists() || targetUserSnapshot.val().status !== 'available') {
        setConnectionStatus('disconnected');
        startNewChat();
        return;
      }

      // Update own status
      await set(userRef, {
        ...user,
        online: true,
        status: 'requesting',
        lastSeen: serverTimestamp(),
      });

      // Send request
      await set(requestRef, {
        from: user.id,
        timestamp: serverTimestamp(),
      });

      // Listen for response
      const responseRef = ref(database, `responses/${user.id}`);
      const unsubscribe = onValue(responseRef, async (snapshot) => {
        if (snapshot.exists()) {
          const response = snapshot.val();
          if (response.accepted) {
            setCurrentChatPartner(targetUserId);
            setConnectionStatus('connected');
            
            // Update both users' status
            await set(userRef, {
              ...user,
              status: 'chatting',
              chatPartner: targetUserId,
              online: true,
              lastSeen: serverTimestamp(),
            });

            // Set up chat room
            const roomId = [user.id, targetUserId].sort().join('-');
            const roomRef = ref(database, `rooms/${roomId}`);
            await set(roomRef, {
              participants: [user.id, targetUserId],
              startedAt: serverTimestamp(),
              active: true,
            });

            // Listen for room messages
            const messagesRef = ref(database, `rooms/${roomId}/messages`);
            onValue(messagesRef, (snapshot) => {
              if (snapshot.exists()) {
                const messages = Object.values(snapshot.val());
                setMessages(messages as ChatMessage[]);
              }
            });
          } else {
            setConnectionStatus('disconnected');
            startNewChat(); // Try another user if rejected
          }
          unsubscribe();
          await remove(responseRef);
        }
      });

      // Timeout after 10 seconds
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
          startNewChat(); // Try another user if timed out
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

      // Update user status to available
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
          // No users available, retry after delay
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
    } catch (error: any) {
      console.error('Error accessing media devices:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
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
        } catch (audioError: any) {
          if (audioError.name === 'NotAllowedError' || audioError.name === 'PermissionDeniedError') {
            setPermissionError(
              'To use this app, please allow access to your camera and/or microphone. ' +
              'Click the camera icon in your browser\'s address bar to update permissions, ' +
              'then click "Try Again" below.'
            );
          } else {
            setPermissionError('An error occurred while accessing your media devices. Please check your hardware connections and try again.');
          }
          
          updateVideoState({
            localStream: null,
            isVideoEnabled: false,
            isAudioEnabled: false
          });
          return false;
        }
      } else {
        setPermissionError('An unexpected error occurred while accessing your media devices. Please refresh the page and try again.');
        return false;
      }
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