import React from 'react';

interface AudioWaveProps {
  isUserSpeaking: boolean;
  isAISpeaking: boolean;
}

export const AudioWave: React.FC<AudioWaveProps> = ({ isUserSpeaking, isAISpeaking }) => {
  const isActive = isUserSpeaking || isAISpeaking;
  const speakerType = isUserSpeaking ? 'user' : isAISpeaking ? 'ai' : 'none';

  return (
    <div className="flex justify-center items-center h-16 bg-white/10 rounded-lg backdrop-blur-sm">
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className={`w-1 bg-white rounded-full transition-all duration-150 ${
              isActive
                ? `animate-pulse ${speakerType === 'user' ? 'bg-blue-400' : 'bg-pink-400'}`
                : 'bg-white/30'
            }`}
            style={{
              height: isActive ? `${Math.random() * 20 + 10}px` : '4px',
              animationDelay: `${i * 100}ms`,
            }}
          />
        ))}
      </div>
      
      <div className="ml-4 text-white/80 text-sm">
        {isUserSpeaking && "🎤 You're speaking..."}
        {isAISpeaking && "🤖 AI is speaking..."}
        {!isActive && "💬 Conversation ready"}
      </div>
    </div>
  );
}; 