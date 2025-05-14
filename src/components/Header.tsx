import React from 'react';
import { Settings, VideoIcon } from 'lucide-react';

interface HeaderProps {
  onOpenProfile: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenProfile }) => {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <VideoIcon className="text-blue-400" size={28} />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">StrangerChat</h1>
        </div>
        
        <button
          onClick={onOpenProfile}
          className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 backdrop-blur-sm border border-white/10 text-white transition-all duration-300"
          aria-label="Profile settings"
        >
          <Settings className="text-gray-300" size={20} />
        </button>
      </div>
    </header>
  );
};