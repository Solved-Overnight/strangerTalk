import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { VideoChat } from './components/VideoChat';
import { ChatPanel } from './components/ChatPanel';
import { Header } from './components/Header';
import { ProfileModal } from './components/ProfileModal';
import { ParticleBackground } from './components/ParticleBackground';
import { Toaster } from 'react-hot-toast';

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

        <Toaster
          position="top-center"
          reverseOrder={false}
          toastOptions={{
            duration: 5000,
            style: {
              background: '#333',
              color: '#fff',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            },
          }}
        />
      </div>
    </AppProvider>
  );
}

export default App;