import React from 'react';
import { User, MessageCircle } from 'lucide-react';

interface ChatRequestProps {
  userName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export const ChatRequest: React.FC<ChatRequestProps> = ({ userName, onAccept, onDecline }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-fade-up">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-blue-400" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">
              Chat Request
            </h3>
            <p className="text-gray-300">
              <span className="font-medium text-blue-400">{userName}</span> wants to start a video chat with you
            </p>
          </div>
          
          <div className="flex gap-3 w-full mt-6">
            <button
              onClick={onDecline}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};