import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ref, onValue, set, remove, onDisconnect, serverTimestamp, get } from 'firebase/database';
import { database } from '../firebase';
import { ConnectionStatus, User, ChatMessage, VideoStreamState } from '../types';

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

  useEffect(() => {
    const userStatusRef = ref(database, `users/${user.id}`);
    const connectedRef = ref(database, '.info/connected');

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === true) {
        const userStatus = {
          id: user.id,
          name: user.name,
          online: true,
          status: 'available',
          lastSeen: serverTimestamp(),
        };

        onDisconnect(userStatusRef).set({
          ...userStatus,
          online: false,
          status: 'offline',
          lastSeen: serverTimestamp(),
        });

        set(userStatusRef, userStatus);
      }
    });

    const activeUsersRef = ref(database, 'users');
    const activeUsersUnsubscribe = onValue(activeUsersRef, (snapshot) => {
      if (snapshot.exists()) {
        const users = snapshot.val();
        const onlineUsers = Object.values(users).filter((u: any) => 
          u.online === true && u.id !== user.id && u.status === 'available'
        );
        setActiveUsers(onlineUsers.length);
      } else {
        setActiveUsers(0);
      }
    });

    return () => {
      unsubscribe();
      activeUsersUnsubscribe();
      remove(userStatusRef);
    };
  }, [user.id, user.name]);

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
        const randomUser = availableUsers[Math.floor(Math.random() * availableUsers.length)] as any;
        return randomUser.id;
      }
    }
    return null;
  };

  const sendChatRequest = async (targetUserId: string) => {
    const requestRef = ref(database, `requests/${targetUserId}`);
    await set(requestRef, {
      from: user.id,
      timestamp: serverTimestamp(),
    });

    const userStatusRef = ref(database, `users/${user.id}`);
    await set(userStatusRef, {
      id: user.id,
      name: user.name,
      online: true,
      status: 'requesting',
      lastSeen: serverTimestamp(),
    });

    // Listen for response
    const responseRef = ref(database, `responses/${user.id}`);
    const unsubscribe = onValue(responseRef, async (snapshot) => {
      if (snapshot.exists()) {
        const response = snapshot.val();
        if (response.accepted) {
          setConnectionStatus('connected');
          // Initialize WebRTC connection here
        } else {
          setConnectionStatus('disconnected');
        }
        unsubscribe();
        remove(responseRef);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      unsubscribe();
      remove(requestRef);
      setConnectionStatus('disconnected');
    }, 30000);
  };

  const updateVideoState = (state: Partial<VideoStreamState>) => {
    setVideoState(prev => ({ ...prev, ...state }));
  };

  const sendMessage = (text: string) => {
    const newMessage: ChatMessage = {
      id: uuidv4(),
      senderId: user.id,
      text,
      timestamp: Date.now(),
    };
    
    const messageRef = ref(database, `messages/${newMessage.id}`);
    set(messageRef, newMessage);
    
    setMessages(prev => [...prev, newMessage]);
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

  const clearChat = () => {
    setMessages([]);
  };

  const startNewChat = async () => {
    clearChat();
    setConnectionStatus('connecting');
    setPermissionError(null);
    
    try {
      const mediaInitialized = await initializeMedia();
      if (!mediaInitialized) {
        setConnectionStatus('disconnected');
        return;
      }

      const targetUserId = await findAvailableUser();
      if (targetUserId) {
        await sendChatRequest(targetUserId);
      } else {
        setTimeout(startNewChat, 2000); // Retry after 2 seconds
      }
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