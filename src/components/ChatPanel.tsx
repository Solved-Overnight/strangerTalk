import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Send, X } from 'lucide-react';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose }) => {
  const { messages, sendMessage, user, connectionStatus } = useAppContext();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSendMessage = () => {
    if (inputText.trim() && connectionStatus === 'connected') {
      sendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={`fixed inset-y-0 right-0 z-40 w-full md:w-80 lg:w-96 bg-black/80 backdrop-blur-md border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-xl font-semibold text-white">Chat</h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-700/50 transition-colors"
            aria-label="Close chat"
          >
            <X className="text-gray-400" size={24} />
          </button>
        </div>
        
        {/* Messages */}
        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {connectionStatus !== 'connected' ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-center">
                {connectionStatus === 'connecting' 
                  ? 'Finding someone to chat with...' 
                  : 'Connect with someone to start chatting'}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-center">No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div 
                key={message.id}
                className={`flex ${message.senderId === user.id ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] p-3 rounded-lg ${
                  message.senderId === user.id 
                    ? 'bg-blue-600 text-white rounded-br-none' 
                    : 'bg-gray-700 text-white rounded-bl-none'
                }`}>
                  <p className="break-words">{message.text}</p>
                  <span className="text-xs opacity-70 mt-1 block text-right">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input area */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center space-x-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-grow p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={1}
              disabled={connectionStatus !== 'connected'}
            />
            <button 
              onClick={handleSendMessage}
              className={`p-3 rounded-full ${
                inputText.trim() && connectionStatus === 'connected'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-700 opacity-50 cursor-not-allowed'
              } transition-colors`}
              disabled={!inputText.trim() || connectionStatus !== 'connected'}
              aria-label="Send message"
            >
              <Send className="text-white" size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};