import React, { useState } from 'react';
import { X, User } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, setUser } = useAppContext();
  const [name, setName] = useState(user.name);
  const [interests, setInterests] = useState(user.interests.join(', '));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const interestsArray = interests
      .split(',')
      .map(interest => interest.trim())
      .filter(interest => interest !== '');
    
    setUser({
      ...user,
      name: name || 'Anonymous',
      interests: interestsArray,
    });
    
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative z-10 w-full max-w-md bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">Profile Settings</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-700/50 transition-colors"
          >
            <X className="text-gray-400" size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center">
              <User className="text-gray-400" size={48} />
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Anonymous"
              />
            </div>
            
            <div>
              <label htmlFor="interests" className="block text-sm font-medium text-gray-300 mb-1">
                Interests (comma separated)
              </label>
              <textarea
                id="interests"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                className="w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="music, travel, gaming"
                rows={3}
              />
              <p className="mt-1 text-xs text-gray-400">
                You'll be matched with people who share similar interests
              </p>
            </div>
          </div>
          
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
            >
              Save Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};