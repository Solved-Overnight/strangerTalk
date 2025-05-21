import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ref, onValue, set, remove, onDisconnect, serverTimestamp, get } from 'firebase/database';
import { database } from '../firebase';
import { ConnectionStatus, User, ChatMessage, VideoStreamState } from '../types';
import { ChatRequest } from '../components/ChatRequest';
import { createRoot } from 'react-dom/client';
import toast from 'react-hot-toast';

interface AppContextType {
  user: User;
  connectionStatus: ConnectionStatus;
  videoState: VideoStreamState;
  messages: ChatMessage[];
  activeUsers: number;
  permissionError: string | null;
  currentChatPartner: User | null;
  setUser: (user: User) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  updateVideoState: (state: Partial<VideoStreamState>) => void;
  sendMessage: (text: string) => void;
  toggleVideo: () => void;
  toggleAudio: () => void;
  skipChat: () => void;
  startNewChat: () => void;
  retryMediaAccess: () => void;
  endChat: (showNotification?: boolean) => void;
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
  const [currentChatPartner, setCurrentChatPartner] = useState<User | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

  const endChat = async (showNotification = true) => {
    if (currentChatPartner && showNotification) {
      const partnerName = currentChatPartner.nickname || 'Anonymous';
      toast.error(`${partnerName} ended the chat`);
    }

    if (videoState.localStream) {
      videoState.localStream.getTracks().forEach(track => track.stop());
    }
    if (videoState.remoteStream) {
      videoState.remoteStream.getTracks().forEach(track => track.stop());
    }

    setVideoState(defaultVideoState);
    setConnectionStatus('disconnected');
    setCurrentChatPartner(null);
    setMessages([]);

    if (currentRoomId) {
      const roomRef = ref(database, `rooms/${currentRoomId}`);
      await set(roomRef, { active: false });
      setCurrentRoomId(null);
    }

    const userRef = ref(database, `users/${user.id}`);
    await set(userRef, {
      ...user,
      status: 'available',
      chatPartner: null,
      online: true,
      lastSeen: serverTimestamp(),
    });
  };

  // Monitor chat room status
  useEffect(() => {
    if (currentRoomId && connectionStatus === 'connected') {
      const roomRef = ref(database, `rooms/${currentRoomId}`);
      const unsubscribeRoom = onValue(roomRef, (snapshot) => {
        if (snapshot.exists()) {
          const roomData = snapshot.val();
          if (!roomData.active) {
            endChat(true);
          } else if (roomData.participants) {
            const isParticipant = roomData.participants.includes(user.id);
            if (!isParticipant) {
              endChat(true);
            }
          }
        } else {
          endChat(true);
        }
      });

      return () => unsubscribeRoom();
    }
  }, [currentRoomId, connectionStatus, user.id]);

  // Monitor chat partner's connection status
  useEffect(() => {
    if (currentChatPartner && connectionStatus === 'connected') {
      const partnerRef = ref(database, `users/${currentChatPartner.id}`);
      const unsubscribePartner = onValue(partnerRef, (snapshot) => {
        if (!snapshot.exists()) {
          endChat(true);
        } else {
          const partnerData = snapshot.val();
          if (!partnerData.online || partnerData.currentRoomId !== currentRoomId) {
            endChat(true);
          }
        }
      });

      return () => unsubscribePartner();
    }
  }, [currentChatPartner, connectionStatus, currentRoomId]);

  // Main connection and user status monitoring
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

                await initializeMedia();
                
                setCurrentChatPartner(fromUser);
                setConnectionStatus('connected');

                const roomId = request.roomId || [user.id, request.from].sort().join('-');
                setCurrentRoomId(roomId);

                await set(ref(database, `responses/${request.from}`), {
                  accepted: true,
                  from: user.id,
                  timestamp: serverTimestamp(),
                  userInfo: {
                    id: user.id,
                    nickname: user.nickname,
                    interests: user.interests
                  },
                  roomId
                });

                const chatStatus = {
                  status: 'chatting',
                  chatPartner: request.from,
                  online: true,
                  lastSeen: serverTimestamp(),
                  currentRoomId: roomId
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
                  currentRoomId: roomId
                });

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
          await initializeMedia();
          
          const targetUserRef = ref(database, `users/${response.from}`);
          const targetUserSnapshot = await get(targetUserRef);
          
          if (targetUserSnapshot.exists()) {
            const targetUser = targetUserSnapshot.val();
            
            setCurrentChatPartner({
              id: response.from,
              nickname: response.userInfo?.nickname || 'Anonymous',
              interests: response.userInfo?.interests || []
            });
            
            setConnectionStatus('connected');
            setCurrentRoomId(response.roomId);

            await set(userRef, {
              ...user,
              status: 'chatting',
              chatPartner: response.from,
              online: true,
              lastSeen: serverTimestamp(),
              currentRoomId: response.roomId
            });

            await set(targetUserRef, {
              ...targetUser,
              status: 'chatting',
              chatPartner: user.id,
              online: true,
              lastSeen: serverTimestamp(),
              currentRoomId: response.roomId
            });
            
            const roomRef = ref(database, `rooms/${response.roomId}`);
            await set(roomRef, {
              participants: [user.id, response.from],
              startedAt: serverTimestamp(),
              active: true,
            });

            const messagesRef = ref(database, `rooms/${response.roomId}/messages`);
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

    return () => {
      unsubscribeConnection();
      unsubscribeUsers();
      unsubscribeRequests();
      unsubscribeResponses();
      remove(userRef);
    };
  }, [user.id, user.nickname]);

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

      const roomId = [user.id, targetUserId].sort().join('-');
      setCurrentRoomId(roomId);

      await set(userRef, {
        ...user,
        online: true,
        status: 'requesting',
        lastSeen: serverTimestamp(),
        currentRoomId: roomId
      });

      await set(requestRef, {
        from: user.id,
        timestamp: serverTimestamp(),
        userInfo: {
          id: user.id,
          nickname: user.nickname,
          interests: user.interests
        },
        roomId
      });

      const responseRef = ref(database, `responses/${user.id}`);
      const unsubscribe = onValue(responseRef, async (snapshot) => {
        if (snapshot.exists()) {
          const response = snapshot.val();
          if (response.accepted) {
            const targetUser = targetUserSnapshot.val();
            setCurrentChatPartner(targetUser);
            setConnectionStatus('connected');
            
            await set(userRef, {
              ...user,
              status: 'chatting',
              chatPartner: targetUserId,
              online: true,
              lastSeen: serverTimestamp(),
              currentRoomId: roomId
            });

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
            setCurrentRoomId(null);
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
            currentRoomId: null
          });
          setConnectionStatus('disconnected');
          setCurrentRoomId(null);
          startNewChat();
        }
      }, 10000);
    } catch (error) {
      console.error('Error sending chat request:', error);
      setConnectionStatus('disconnected');
      setCurrentRoomId(null);
    }
  };

  const updateVideoState = (state: Partial<VideoStreamState>) => {
    setVideoState(prev => ({ ...prev, ...state }));
  };

  const sendMessage = (text: string) => {
    if (!currentChatPartner || !currentRoomId) return;

    const messageRef = ref(database, `rooms/${currentRoomId}/messages/${uuidv4()}`);
    
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
      endChat(false);
      startNewChat();
    }
  };

  const clearChat = async () => {
    setMessages([]);
    if (currentRoomId) {
      const roomRef = ref(database, `rooms/${currentRoomId}`);
      await set(roomRef, { active: false });
      setCurrentRoomId(null);
    }
    
    if (currentChatPartner) {
      const userRef = ref(database, `users/${user.id}`);
      await set(userRef, {
        ...user,
        status: 'available',
        chatPartner: null,
        online: true,
        lastSeen: serverTimestamp(),
        currentRoomId: null
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
      await initializeMedia();
      const userRef = ref(database, `users/${user.id}`);
      await set(userRef, {
        ...user,
        online: true,
        status: 'available',
        lastSeen: serverTimestamp(),
        currentRoomId: null
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
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideoDevice = devices.some(device => device.kind === 'videoinput');
      const hasAudioDevice = devices.some(device => device.kind === 'audioinput');

      if (!hasVideoDevice && !hasAudioDevice) {
        updateVideoState({
          localStream: null,
          isVideoEnabled: false,
          isAudioEnabled: false
        });
        return true;
      }

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

          return true;
        } catch (error) {
          console.warn('Failed to get both video and audio, trying audio only:', error);
        }
      }

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

          return true;
        } catch (error) {
          console.warn('Failed to get audio access:', error);
        }
      }

      if (hasVideoDevice) {
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

          return true;
        } catch (error) {
          console.warn('Failed to get video access:', error);
        }
      }

      updateVideoState({
        localStream: null,
        isVideoEnabled: false,
        isAudioEnabled: false
      });
      return true;
    } catch (error) {
      console.error('Error initializing media:', error);
      updateVideoState({
        localStream: null,
        isVideoEnabled: false,
        isAudioEnabled: false
      });
      return true;
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
    currentChatPartner,
    setUser,
    setConnectionStatus,
    updateVideoState,
    sendMessage,
    toggleVideo,
    toggleAudio,
    skipChat,
    startNewChat,
    retryMediaAccess,
    endChat
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