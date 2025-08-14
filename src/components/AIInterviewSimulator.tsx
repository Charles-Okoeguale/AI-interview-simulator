import React, { useEffect, useState } from 'react';
import { HiOutlineArrowLongLeft, HiStop } from 'react-icons/hi2';
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { UserOptions } from "jspdf-autotable";
import { AudioWave } from './AudioWave';
import { AIConversationService } from '../services/ai/AIConversationService';
import { VoiceInteractionService } from '../services/voice/VoiceInteractionService';

interface jsPDFCustom extends jsPDF {
  autoTable: (options: UserOptions) => void;
}

interface SpeakingState {
  isAISpeaking: boolean;
  isUserSpeaking: boolean;
}

interface InterviewData {
  candidateName: string;
  jobTitle: string;
  numberOfQuestions: number;
  difficulty: 'Entry Level' | 'Mid-Level' | 'Senior' | 'Executive';
  questionType: 'Technical' | 'Behavioral' | 'Situational' | 'Mixed';
}

export const AIInterviewSimulator: React.FC = () => {
  const [isCallEnded, setIsCallEnded] = useState(false);
  const [conversationLog, setConversationLog] = useState<{ speaker: string; content: string }[]>([]);
  const [isCallStarting, setIsCallStarting] = useState(false);
  const [aiService, setAIService] = useState<AIConversationService | null>(null);
  const [audioService, setAudioService] = useState<VoiceInteractionService | null>(null);
  const [speakingState, setSpeakingState] = useState<SpeakingState>({
    isAISpeaking: false,
    isUserSpeaking: false,
  });
  const [showSetup, setShowSetup] = useState(true);
  const [interviewData, setInterviewData] = useState<InterviewData>({
    candidateName: '',
    jobTitle: '',
    numberOfQuestions: 3,
    difficulty: 'Mid-Level',
    questionType: 'Mixed'
  });
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [showInterviewRoom, setShowInterviewRoom] = useState(false);

  useEffect(() => {
    const initializeServices = async () => {
      const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
      
      if (!apiKey) {
        console.error('OpenAI API key not found in environment variables');
        alert('OpenAI API key not configured. Please check your .env file and restart the development server.');
        return;
      }

      const voiceService = new VoiceInteractionService();
      
      voiceService.on(VoiceInteractionService.Events.AI_SPEECH_START, () => {
        setSpeakingState(prev => ({ ...prev, isAISpeaking: true }));
        console.log("AI is speaking")
      });

      voiceService.on(VoiceInteractionService.Events.AI_SPEECH_END, () => {
        setSpeakingState(prev => ({ ...prev, isAISpeaking: false }));
        console.log("AI has stopped speaking")
      });

      voiceService.on(VoiceInteractionService.Events.USER_SPEECH_START, () => {
        setSpeakingState(prev => ({ ...prev, isUserSpeaking: true }));
        console.log('USER is speaking')
      });

      voiceService.on(VoiceInteractionService.Events.USER_SPEECH_END, () => {
        setSpeakingState(prev => ({ ...prev, isUserSpeaking: false }));
        console.log("USER has stopped speaking")
      });

      try {
        const openAIService = new AIConversationService(apiKey, voiceService);
        openAIService.on('conversationUpdate', (history: any[]) => {
          const formattedLog = history.map(msg => ({
            speaker: msg.role === 'assistant' ? 'Emily (AI)' : 'You',
            content: msg.content
          }));
          setConversationLog(formattedLog);
        });

        openAIService.on('aiSpeakingStateChange', (isSpeaking: boolean) => {
          setSpeakingState(prev => ({ ...prev, isAISpeaking: isSpeaking }));
        });

        setAIService(openAIService);
        
        await voiceService.initialize();
        setAudioService(voiceService);
      
      } catch (error) {
        console.error('Error initializing services:', error);
        alert(`Error initializing services: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    initializeServices();
  }, []);


  const navigateToInterviewRoom = () => {
    setShowSetup(false);
    setShowInterviewRoom(true);
    setIsInterviewActive(false);
    setIsCallEnded(false);
  };

  const beginInterview = async () => {
    if (!aiService || !audioService) {
      alert('Services not initialized. Please check your environment configuration and API key.');
      return;
    }

    setIsCallStarting(true);
    try {
      const interviewContext = `You are Emily, a professional AI interviewer. 
      Interview Details:
      - Candidate: ${interviewData.candidateName}
      - Position: ${interviewData.jobTitle}
      - Questions: ${interviewData.numberOfQuestions} ${interviewData.questionType} questions
      - Difficulty: ${interviewData.difficulty} level

      Instructions:
      1. Warmly greet ${interviewData.candidateName} and introduce yourself
      2. Ask if they're here for AI Assistance (practice with sample answers) or Interview Prep (live practice with feedback)
      3. Based on their choice:
        - AI Assistance: Ask ${interviewData.numberOfQuestions} questions and provide detailed sample answers
        - Interview Prep: Ask ${interviewData.numberOfQuestions} questions, listen to their responses, and provide constructive feedback
      4. Keep responses concise and engaging
      5. End the interview professionally after all questions

      Style: Be warm, professional, and supportive throughout the conversation.`;

      setIsInterviewActive(true);
      setIsCallEnded(false);
      setIsCallStarting(false);
      
      await aiService.startConversation(interviewContext, 'Emily');
      
    } catch (error) {
      console.error('Error starting interview:', error);
      setIsCallStarting(false);
      setIsInterviewActive(false);
      alert(`Error starting interview: ${error instanceof Error ? error.message : 'Please try again.'}`);
    }
  };

  const endInterview = async () => {
    if (aiService) {
      aiService.stopProcessing();
      
      const finalHistory = aiService.getConversationHistory();
      const formattedLog = finalHistory.map(msg => ({
        speaker: msg.role === 'assistant' ? 'Emily (AI)' : 'You',
        content: msg.content
      }));
      setConversationLog(formattedLog);
    }

    if (audioService) {
      audioService.stopAIResponse();
      audioService.stopMonitoringAudio();
      audioService.stopRecording();
      audioService.cleanup();
      audioService.removeAllListeners();
    }

    setIsInterviewActive(false);
    setIsCallEnded(true);
    setSpeakingState({
      isAISpeaking: false,
      isUserSpeaking: false
    });
    
  };

  const resetApp = () => {
    setShowSetup(true);
    setShowInterviewRoom(false);
    setIsCallEnded(false);
    setIsInterviewActive(false);
    setConversationLog([]);
    setSpeakingState({
      isAISpeaking: false,
      isUserSpeaking: false
    });
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF() as jsPDFCustom;
    
    doc.setFontSize(16);
    doc.text('AI Interview Transcript', 20, 20);
    doc.setFontSize(12);
    doc.text(`Candidate: ${interviewData.candidateName}`, 20, 35);
    doc.text(`Position: ${interviewData.jobTitle}`, 20, 45);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 55);
    
    doc.autoTable({
      head: [['Speaker', 'Message']],
      body: conversationLog.map(log => [log.speaker, log.content]),
      startY: 65,
    });

    doc.save(`interview-transcript-${interviewData.candidateName}.pdf`);
  };

  if (showSetup) {
    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full border border-white/20">
        <h1 className="text-3xl font-bold text-white text-center mb-8">AI Interview Simulator</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">Your Name</label>
            <input
              type="text"
              value={interviewData.candidateName}
              onChange={(e) => setInterviewData({...interviewData, candidateName: e.target.value})}
              className="w-full p-3 rounded-lg bg-white/20 text-white placeholder-white/60 border border-white/30"
              placeholder="Enter your name"
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Job Title</label>
            <input
              type="text"
              value={interviewData.jobTitle}
              onChange={(e) => setInterviewData({...interviewData, jobTitle: e.target.value})}
              className="w-full p-3 rounded-lg bg-white/20 text-white placeholder-white/60 border border-white/30"
              placeholder="e.g., Software Engineer"
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Number of Questions</label>
            <select
              value={interviewData.numberOfQuestions}
              onChange={(e) => setInterviewData({...interviewData, numberOfQuestions: parseInt(e.target.value)})}
              className="w-full p-3 rounded-lg bg-white/20 text-white border border-white/30"
            >
              <option value={3}>3 Questions</option>
              <option value={5}>5 Questions</option>
              <option value={7}>7 Questions</option>
            </select>
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Difficulty Level</label>
            <select
              value={interviewData.difficulty}
              onChange={(e) => setInterviewData({...interviewData, difficulty: e.target.value as any})}
              className="w-full p-3 rounded-lg bg-white/20 text-white border border-white/30"
            >
              <option value="Entry Level">Entry Level</option>
              <option value="Mid-Level">Mid-Level</option>
              <option value="Senior">Senior</option>
              <option value="Executive">Executive</option>
            </select>
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Question Type</label>
            <select
              value={interviewData.questionType}
              onChange={(e) => setInterviewData({...interviewData, questionType: e.target.value as any})}
              className="w-full p-3 rounded-lg bg-white/20 text-white border border-white/30"
            >
              <option value="Technical">Technical</option>
              <option value="Behavioral">Behavioral</option>
              <option value="Situational">Situational</option>
              <option value="Mixed">Mixed</option>
            </select>
          </div>
          
          <button
            onClick={navigateToInterviewRoom}
            disabled={!interviewData.candidateName || !interviewData.jobTitle}
            className="w-full py-3 mt-6 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-pink-600 hover:to-purple-700 transition-all"
          >
            Enter Interview Room
          </button>
        </div>
      </div>
    );
  }

  if (showInterviewRoom && !isInterviewActive) {
    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-2xl w-full border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Interview Room</h1>
          <p className="text-white/80">Ready to interview {interviewData.candidateName} for {interviewData.jobTitle}</p>
        </div>
        
        <div className="flex justify-center gap-8 mb-8">
          <div className="w-32 h-32 rounded-full border-2 border-white/30 agentImage flex items-center justify-center">
            <img 
              src="/emily.jpg" 
              alt="AI Interviewer Emily" 
              className="w-28 h-28 rounded-full object-cover"
              onError={(e) => {
                e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRkY2Qzk0Ii8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RW1pbHk8L3RleHQ+Cjwvc3ZnPg==';
              }}
            />
          </div>

          <div className="w-32 h-32 rounded-full border-2 border-white/30 userimage flex items-center justify-center">
            <img 
              src="/user-avatar.jpg" 
              alt="User" 
              className="w-28 h-28 rounded-full object-cover"
              onError={(e) => {
                e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjNjM5NkZGIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+WW91PC90ZXh0Pgo8L3N2Zz4=';
              }}
            />
          </div>
        </div>

        <div className="text-center mb-8">
          <p className="text-white/60 mb-4">
            Interview Settings: {interviewData.numberOfQuestions} {interviewData.questionType} questions at {interviewData.difficulty} level
          </p>
          <p className="text-white/60">
            Click "Start Interview" when you're ready to begin
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={beginInterview}
            disabled={isCallStarting}
            className="py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold hover:from-pink-600 hover:to-purple-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCallStarting ? "Starting Interview..." : "Start Interview"}
          </button>

          <button
            onClick={resetApp}
            className="py-3 rounded-lg bg-gray-600 text-white font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
          >
            <HiOutlineArrowLongLeft size={20} />
            Back to Setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-2xl w-full border border-white/20">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">AI Interview in Progress</h1>
        <p className="text-white/80">Interviewing {interviewData.candidateName} for {interviewData.jobTitle}</p>
      </div>
      
      <div className="flex justify-center gap-8 mb-8">
        <div
          className={`w-32 h-32 rounded-full transition-all duration-500 ${
            speakingState.isAISpeaking ? "animate-pulse border-4 border-pink-400" : "border-2 border-white/30"
          } agentImage flex items-center justify-center`}
        >
          <img 
            src="/emily.jpg" 
            alt="AI Interviewer Emily" 
            className="w-28 h-28 rounded-full object-cover"
            onError={(e) => {
              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRkY2Qzk0Ii8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RW1pbHk8L3RleHQ+Cjwvc3ZnPg==';
            }}
          />
        </div>

        <div
          className={`w-32 h-32 rounded-full transition-all duration-500 ${
            speakingState.isUserSpeaking ? "animate-pulse border-4 border-blue-400" : "border-2 border-white/30"
          } userimage flex items-center justify-center`}
        >
          <img 
            src="/user-avatar.jpg" 
            alt="User" 
            className="w-28 h-28 rounded-full object-cover"
            onError={(e) => {
              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjNjM5NkZGIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+WW91PC90ZXh0Pgo8L3N2Zz4=';
            }}
          />
        </div>
      </div>

      <AudioWave 
        isUserSpeaking={speakingState.isUserSpeaking}
        isAISpeaking={speakingState.isAISpeaking}
      />

      <div className="flex flex-col gap-3 mt-8">
        <button
          onClick={endInterview}
          disabled={!isInterviewActive}
          className="py-3 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <HiStop size={20} />
          {isInterviewActive ? "End Interview" : "No Active Interview"}
        </button>

        <button
          onClick={resetApp}
          className="py-3 rounded-lg bg-gray-600 text-white font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
        >
          <HiOutlineArrowLongLeft size={20} />
          Back to Setup
        </button>

        {isCallEnded && (
          <button 
            className="py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold hover:from-pink-600 hover:to-purple-700 transition-all"
            onClick={handleDownloadPDF}
          >
            Download Interview Transcript
          </button>
        )}
      </div>
    </div>
  );
};