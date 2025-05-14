import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { VideoChat } from './components/VideoChat';
import { ChatPanel } from './components/ChatPanel';
import { Header } from './components/Header';
import { ProfileModal } from './components/ProfileModal';
import { ParticleBackground } from './components/ParticleBackground';

function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <AppProvider>
      <div className="relative w-screen h-screen overflow-hidden bg-black">
        <ParticleBackground />
        
        <Header onOpenProfile={() => setIsProfileOpen(true)} />
        
        <main className="relative h-full w-full">
          <VideoChat onToggleChat={() => setIsChatOpen(prev => !prev)} />
        </main>
        
        <ChatPanel 
          isOpen={isChatOpen} 
          onClose={() => setIsChatOpen(false)} 
        />
        
        <ProfileModal 
          isOpen={isProfileOpen} 
          onClose={() => setIsProfileOpen(false)} 
        />
      </div>
    </AppProvider>
  );
}

export default App;