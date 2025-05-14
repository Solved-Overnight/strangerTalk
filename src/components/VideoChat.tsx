import React, { useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Video, VideoOff, Mic, MicOff, X, SkipForward, MessageSquare, Users } from 'lucide-react';

interface VideoChatProps {
  onToggleChat: () => void;
}

export const VideoChat: React.FC<VideoChatProps> = ({ onToggleChat }) => {
  const { 
    videoState, 
    connectionStatus,
    setConnectionStatus, 
    toggleVideo, 
    toggleAudio, 
    skipChat,
    startNewChat,
    activeUsers 
  } = useAppContext();
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (localVideoRef.current && videoState.localStream) {
      localVideoRef.current.srcObject = videoState.localStream;
    }
  }, [videoState.localStream]);
  
  useEffect(() => {
    if (remoteVideoRef.current && videoState.remoteStream) {
      remoteVideoRef.current.srcObject = videoState.remoteStream;
    }
  }, [videoState.remoteStream]);

  const handleEndChat = () => {
    if (videoState.localStream) {
      videoState.localStream.getTracks().forEach(track => track.stop());
    }
    if (videoState.remoteStream) {
      videoState.remoteStream.getTracks().forEach(track => track.stop());
    }
    setConnectionStatus('disconnected');
  };

  return (
    <div className="relative w-full h-full bg-[#0a0a1f] overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-pink-900/20 animate-gradient-shift"></div>
      <div className="absolute inset-0 backdrop-blur-[100px]"></div>
      
      {/* Connection status indicator */}
      <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-20 px-6 py-3 rounded-full font-medium text-sm transition-all duration-500 ${
        connectionStatus === 'connected' 
          ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
          : connectionStatus === 'connecting' 
            ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 animate-pulse' 
            : 'bg-red-500/20 text-red-300 border border-red-500/30'
      }`}>
        <span className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' 
              ? 'bg-green-400 animate-pulse' 
              : connectionStatus === 'connecting' 
                ? 'bg-yellow-400 animate-ping' 
                : 'bg-red-400'
          }`}></span>
          <span>
            {connectionStatus === 'connected' 
              ? 'Connected' 
              : connectionStatus === 'connecting' 
                ? 'Finding someone...' 
                : 'Disconnected'
            }
          </span>
        </span>
      </div>
      
      {/* Active users count */}
      <div className="absolute top-4 right-4 z-20 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
        <div className="flex items-center space-x-2">
          <Users size={16} className="text-blue-400" />
          <span className="text-white/90 font-medium">{activeUsers} online</span>
        </div>
      </div>
      
      {/* Main video container */}
      <div className="relative flex flex-col items-center justify-center w-full h-full z-10">
        {connectionStatus === 'disconnected' ? (
          <div className="flex flex-col items-center justify-center space-y-8 p-12 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 max-w-lg">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">Welcome to StrangerChat</h2>
              <p className="text-gray-300 text-lg">Connect with people from around the world through live video chat.</p>
            </div>
            
            <div className="w-full space-y-6">
              <div className="flex items-center justify-center space-x-4 text-gray-400">
                <div className="flex items-center space-x-2">
                  <Video size={20} />
                  <span>Video Chat</span>
                </div>
                <span>•</span>
                <div className="flex items-center space-x-2">
                  <MessageSquare size={20} />
                  <span>Text Chat</span>
                </div>
                <span>•</span>
                <div className="flex items-center space-x-2">
                  <Users size={20} />
                  <span>{activeUsers} Online</span>
                </div>
              </div>
              
              <button 
                onClick={startNewChat}
                className="group relative w-full py-4 px-8 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white font-medium rounded-full overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/25 hover:scale-105 active:scale-95"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <span className="relative flex items-center justify-center space-x-2">
                  <Video size={20} />
                  <span>Start Video Chat</span>
                </span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {videoState.remoteStream && connectionStatus === 'connected' ? (
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                className={`absolute inset-0 w-full h-full object-cover z-10 transition-opacity duration-500 ${
                  connectionStatus === 'connected' ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-6">
                  <div className="relative w-24 h-24">
                    <div className="absolute inset-0 rounded-full border-4 border-blue-500/30"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                    <div className="absolute inset-2 rounded-full border-4 border-purple-500/30"></div>
                    <div className="absolute inset-2 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" style={{ animationDuration: '2s' }}></div>
                  </div>
                  <p className="text-white/70 text-xl font-medium animate-pulse">
                    Finding your next chat partner...
                  </p>
                </div>
              </div>
            )}
            
            {/* Local video */}
            <div className="absolute bottom-24 right-6 z-20 w-1/4 max-w-[240px] min-w-[160px] aspect-video rounded-lg overflow-hidden border-2 border-white/20 shadow-xl transition-transform duration-300 hover:scale-105">
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full object-cover ${!videoState.isVideoEnabled ? 'opacity-0' : 'opacity-100'}`}
              />
              {!videoState.isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <VideoOff className="text-white/70" size={40} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      {/* Control bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 py-6 px-6 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="flex items-center justify-center space-x-4">
          <button 
            onClick={toggleVideo}
            className={`p-4 rounded-full backdrop-blur-md border transform hover:scale-110 active:scale-95 transition-all duration-300 ${
              videoState.isVideoEnabled 
                ? 'bg-white/10 border-white/20 hover:bg-white/20' 
                : 'bg-red-500/20 border-red-500/30 hover:bg-red-500/30'
            }`}
            aria-label="Toggle video"
          >
            {videoState.isVideoEnabled ? (
              <Video className="text-white" size={24} />
            ) : (
              <VideoOff className="text-white" size={24} />
            )}
          </button>
          
          <button 
            onClick={toggleAudio}
            className={`p-4 rounded-full backdrop-blur-md border transform hover:scale-110 active:scale-95 transition-all duration-300 ${
              videoState.isAudioEnabled 
                ? 'bg-white/10 border-white/20 hover:bg-white/20' 
                : 'bg-red-500/20 border-red-500/30 hover:bg-red-500/30'
            }`}
            aria-label="Toggle audio"
          >
            {videoState.isAudioEnabled ? (
              <Mic className="text-white" size={24} />
            ) : (
              <MicOff className="text-white" size={24} />
            )}
          </button>
          
          {connectionStatus === 'connected' && (
            <>
              <button 
                onClick={skipChat}
                className="flex items-center space-x-2 px-6 py-4 rounded-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white transform hover:scale-110 active:scale-95 transition-all duration-300 font-medium shadow-lg shadow-blue-500/25"
                aria-label="Skip to next person"
              >
                <SkipForward className="text-white" size={20} />
                <span>Find Next</span>
              </button>
              
              <button 
                onClick={onToggleChat}
                className="p-4 rounded-full backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20 transform hover:scale-110 active:scale-95 transition-all duration-300"
                aria-label="Toggle chat"
              >
                <MessageSquare className="text-white" size={24} />
              </button>
            </>
          )}
          
          {connectionStatus !== 'disconnected' && (
            <button 
              onClick={handleEndChat}
              className="p-4 rounded-full backdrop-blur-md bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transform hover:scale-110 active:scale-95 transition-all duration-300"
              aria-label="End chat"
            >
              <X className="text-white" size={24} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};