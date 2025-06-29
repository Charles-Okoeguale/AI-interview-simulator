import React, { useEffect, useState } from 'react';
import { HiOutlineArrowLongLeft, HiStop } from 'react-icons/hi2';
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { UserOptions } from "jspdf-autotable";
import { AudioWave } from './AudioWave';
import { EventEmitter } from 'events';
import OpenAI from 'openai';

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
      });

      voiceService.on(VoiceInteractionService.Events.AI_SPEECH_END, () => {
        setSpeakingState(prev => ({ ...prev, isAISpeaking: false }));
      });

      voiceService.on(VoiceInteractionService.Events.USER_SPEECH_START, () => {
        setSpeakingState(prev => ({ ...prev, isUserSpeaking: true }));
      });

      voiceService.on(VoiceInteractionService.Events.USER_SPEECH_END, () => {
        setSpeakingState(prev => ({ ...prev, isUserSpeaking: false }));
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

  const startInterview = async () => {

    if (!aiService || !audioService) {
      alert('Services not initialized. Please check your environment configuration and API key.');
      return;
    }

    setIsCallStarting(true);
    try {
      const interviewContext = `You are Emily, a professional career coach and expert interviewer from CAREERONTRACK AI. 
      
      Interview Details:
      - Candidate: ${interviewData.candidateName}
      - Position: ${interviewData.jobTitle}
      - Questions: ${interviewData.numberOfQuestions}
      - Difficulty: ${interviewData.difficulty}
      - Type: ${interviewData.questionType}
      
      Instructions:
      1. Warmly greet ${interviewData.candidateName}
      2. Ask exactly ${interviewData.numberOfQuestions} ${interviewData.questionType.toLowerCase()} questions suitable for ${interviewData.difficulty} level
      3. Listen to their responses and provide constructive feedback
      4. Keep responses concise and engaging
      5. End the interview professionally after all questions`;


      setIsInterviewActive(true);
      setIsCallEnded(false);
      setIsCallStarting(false);
      setShowSetup(false);
      
      await aiService.startConversation(interviewContext, 'Emily');
      
    } catch (error) {
      console.error('Error starting interview:', error);
      setIsCallStarting(false);
      setIsInterviewActive(false);
      alert(`Error starting interview: ${error instanceof Error ? error.message : 'Please try again.'}`);
    }
  };

  const endInterview = async () => {
    if (audioService) {
      audioService.stopAIResponse();
      audioService.stopMonitoringAudio();
      audioService.stopRecording();
      audioService.cleanup();
      audioService.removeAllListeners();
    }

    if (aiService) {
      const finalHistory = aiService.getConversationHistory();
      const formattedLog = finalHistory.map(msg => ({
        speaker: msg.role === 'assistant' ? 'Emily (AI)' : 'You',
        content: msg.content
      }));
      setConversationLog(formattedLog);
      
      aiService.clearConversation();
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
            onClick={startInterview}
            disabled={!interviewData.candidateName || !interviewData.jobTitle || isCallStarting}
            className="w-full py-3 mt-6 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-pink-600 hover:to-purple-700 transition-all"
          >
            {isCallStarting ? "Starting Interview..." : "Start Interview"}
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

class VoiceInteractionService extends EventEmitter {
  static Events = {
    USER_SPEECH_START: 'userSpeechStart',
    USER_SPEECH_END: 'userSpeechEnd',
    AI_SPEECH_START: 'aiSpeechStart',
    AI_SPEECH_END: 'aiSpeechEnd',
    ERROR: 'error',
    TURN_TIMEOUT: 'turnTimeout',
    AUDIO_PLAY_COMPLETE: 'audioPlayComplete',
    USER_INTERRUPTION: 'userInterruption'
  };

  private static instance: VoiceInteractionService;
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private isSpeaking: boolean = false;
  private silenceThreshold = -45; 
  private silenceTimer: NodeJS.Timeout | null = null;  
  private silenceDelay = 0; 
  private voiceThreshold = -5;
  private isMonitoring = false; 
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioSource: AudioBufferSourceNode | null = null;
  private isAISpeaking: boolean = false;

  async initialize() {
    try {
      if (!this.checkBrowserSupport()) {
        throw new Error('Browser does not support required APIs');
      }

      this.audioContext = new (window.AudioContext)();

      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      return true;
    } catch (error) {
      console.error('Error initializing voice service:', error);
      throw error;
    }
  }

  public async testAudioSetup() {    
    if (this.analyser) {
      const dataArray = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatTimeDomainData(dataArray);
      const volume = Math.max(...Array.from(dataArray));
      const db = 20 * Math.log10(volume);
    }
  }

  cleanup() {
    this.isMonitoring = false;
    
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    if (this.audioSource) {
      try {
        this.audioSource.stop();
      } catch (e) {
      }
      this.audioSource = null;
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }

  private ensureAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext)();
    }
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    return this.audioContext;
  }

  async playAIResponse(audioBuffer: ArrayBuffer) {
    const audioContext = this.ensureAudioContext();  

    if (this.isAISpeaking) {
      console.log('AI is already speaking. Ignoring new play request.');
      return;
    }
    
    try {
      if (this.audioStream) {
        const streamSource = audioContext.createMediaStreamSource(this.audioStream);
        this.analyser = audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        streamSource.connect(this.analyser);
      }

      const audioDataPromise = audioContext.decodeAudioData(audioBuffer.slice(0));
      const source = audioContext.createBufferSource(); 
      this.audioSource = source;

      source.onended = () => {
        this.isAISpeaking = false;
        this.emit(VoiceInteractionService.Events.AI_SPEECH_END);
        
        if (this.audioStream) {
          setTimeout(() => {
            this.monitorAudioLevel();
          }, 500);
        }
      };

      source.buffer = await audioDataPromise;
      source.connect(audioContext.destination);
      this.isAISpeaking = true;
      this.emit(VoiceInteractionService.Events.AI_SPEECH_START);
      source.start(0); 
      
      this.monitorDuringAISpeech();
    } catch (error) {
      console.error('Error playing AI response:', error);
      this.isAISpeaking = false;
      this.emit(VoiceInteractionService.Events.AI_SPEECH_END);
    }
  }

  private monitorDuringAISpeech() { 
    if (!this.analyser || !this.isAISpeaking) {
      return;
    }
    
    const dataArray = new Float32Array(this.analyser.frequencyBinCount);
    
    const checkAudioLevel = () => {
      if (!this.analyser || !this.isAISpeaking) return;
      
      this.analyser.getFloatTimeDomainData(dataArray);
      const volume = Math.max(...Array.from(dataArray).map(Math.abs));
      const db = 20 * Math.log10(volume);
      const interruptionThreshold = -12;

      if (db > interruptionThreshold && this.isAISpeaking) { 
        if (this.audioSource) {
          try {
            this.audioSource.stop();
          } catch (e) {
          }
          this.audioSource = null;
        }
        
        this.isAISpeaking = false;
        this.emit(VoiceInteractionService.Events.USER_INTERRUPTION);
        
        setTimeout(() => {
          this.startRecording();
          this.monitorAudioLevel();
        }, 500);
        
        return;
      }
      
      if (this.isAISpeaking) {
        requestAnimationFrame(checkAudioLevel);
      }
    };
    
    requestAnimationFrame(checkAudioLevel);
  }

  public stopAIResponse() {
    if (this.audioSource) {
      try {
        this.audioSource.stop();
        this.audioSource = null;
        this.isAISpeaking = false;
        this.emit(VoiceInteractionService.Events.AI_SPEECH_END);
      } catch (error) {
        console.error('Error stopping AI response:', error);
      }
    }
  }

  public async stopMonitoringAudio() {
    if (this.isMonitoring) {
      this.isMonitoring = false;

      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      if (this.isSpeaking) {
        const audioBlob = await this.stopRecording(); 
        try {
          this.emit(VoiceInteractionService.Events.USER_SPEECH_END, audioBlob);
        } catch (error) {
          console.error('Error emitting USER_SPEECH_END event:', error);
        }
        this.isSpeaking = false;
      }
    }
  }

  private checkBrowserSupport(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return !!(
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      (typeof window.AudioContext !== 'undefined')
    );
  }

  private monitorAudioLevel() {
    if (!this.analyser) {
      console.error('No analyser available for audio monitoring');
      return;
    }
    
    const dataArray = new Float32Array(this.analyser.frequencyBinCount);

    const checkAudioLevel = () => {
      if (!this.analyser || this.isAISpeaking) return;
      
      this.analyser.getFloatTimeDomainData(dataArray);
      const volume = Math.max(...Array.from(dataArray).map(Math.abs));
      const db = 20 * Math.log10(volume);
    
      if (db > this.voiceThreshold) { 
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
        
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.startRecording();
          this.emit(VoiceInteractionService.Events.USER_SPEECH_START);
        }
      } 
      else if (db <= this.silenceThreshold && this.isSpeaking) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(async () => {
            this.isSpeaking = false;
            this.isMonitoring = false;
            const audioBlob = await this.stopRecording();
            this.emit(VoiceInteractionService.Events.USER_SPEECH_END, audioBlob);
          }, this.silenceDelay);
        }
      }
      
      if (this.isMonitoring) {
        requestAnimationFrame(checkAudioLevel);
      }
    };
    
    this.isMonitoring = true;
    requestAnimationFrame(checkAudioLevel);
  }

  private startRecording() {
    if (!this.audioStream) return;
    
    this.audioChunks = [];
    
    try {
      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: 'audio/webm;codecs=opus'
      });
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(this.audioStream);
    }
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };
    
    this.mediaRecorder.start();
  }
  
  public stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(new Blob());
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { 
          type: this.mediaRecorder?.mimeType || 'audio/webm' 
        });
        this.audioChunks = [];
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  public static getInstance(): VoiceInteractionService {
    if (!VoiceInteractionService.instance) {
      VoiceInteractionService.instance = new VoiceInteractionService();
    }
    return VoiceInteractionService.instance;
  }
} 

class AIConversationService extends EventEmitter {
  private openai: OpenAI;
  private voiceService: VoiceInteractionService;
  private conversationHistory: { role: 'user' | 'assistant' | 'system', content: string }[] = [];
  private isAISpeaking: boolean = false;
  private systemPrompt: string = '';
  private isProcessing: boolean = false;

  constructor(apiKey: string, voiceService: VoiceInteractionService) {
    super();
    
    if (!apiKey || !apiKey.startsWith('sk-')) {
      throw new Error('Invalid OpenAI API key format. Key must start with "sk-"');
    }
    
    
    this.openai = new OpenAI({ 
      apiKey, 
      dangerouslyAllowBrowser: true 
    });
    this.voiceService = voiceService;
    
    this.voiceService.on(VoiceInteractionService.Events.USER_SPEECH_END, async (audioBlob: Blob) => {
      if (!this.isProcessing) {
        await this.handleUserResponse(audioBlob);
      }
    });

    this.voiceService.on(VoiceInteractionService.Events.USER_INTERRUPTION, async (audioBlob: Blob) => {
      if (!this.isProcessing) {
        await this.handleUserResponse(audioBlob);
      }
    });
  }

  private async handleUserResponse(audioBlob: Blob) {
    if (!audioBlob || audioBlob.size === 0) {
      console.log('Empty or undefined audio blob received, skipping processing');
      return;
    }

    this.isProcessing = true;

    try {
      const audioFile = new File([audioBlob], 'audio.webm', { 
        type: audioBlob.type || 'audio/webm'
      });
      
      console.log('Transcribing audio...', {
        size: audioBlob.size,
        type: audioBlob.type
      });

      const transcript = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
      });

      if (!transcript.text.trim()) {
        this.isProcessing = false;
        return;
      }

      this.conversationHistory.push({
        role: 'user',
        content: transcript.text
      });

      this.emit('conversationUpdate', this.getConversationHistory());

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: this.conversationHistory,
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0].message.content;
      if (!aiResponse) {
        console.log('No AI response generated');
        this.isProcessing = false;
        return;
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: aiResponse
      });

      this.emit('conversationUpdate', this.getConversationHistory());

      await this.speakAIResponse(aiResponse);
      
    } catch (error) {
      console.error('Error handling user response:', error);
      
      try {
        await this.speakAIResponse("I'm sorry, I didn't catch that. Could you please try again?");
      } catch (speechError) {
        console.error('Error providing error feedback:', speechError);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async initialize() {
    await this.voiceService.initialize();
  }

  public clearConversation() {
    this.conversationHistory = [];
    this.isAISpeaking = false;
    this.isProcessing = false;
    this.systemPrompt = '';
  }

  async startConversation(interviewContext: string, agentId: string = 'Emily') {
    try {     
      this.systemPrompt = `You are ${agentId}, an AI interviewer. ${interviewContext}`;
      this.conversationHistory = [{
        role: 'system',
        content: this.systemPrompt
      }];

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          ...this.conversationHistory,
          {
            role: 'system',
            content: 'Please introduce yourself and start the interview. Keep your introduction concise (under 30 seconds) and professional. Address the candidate by name from the context.'
          }
        ],
        max_tokens: 50,
        temperature: 0.7,
      });

      const initialPrompt = completion.choices[0].message.content;
      if (!initialPrompt) {
        throw new Error('Failed to generate initial prompt');
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: initialPrompt
      });

      this.emit('conversationUpdate', this.getConversationHistory());

      await this.speakAIResponse(initialPrompt);
      
    } catch (error) {
      console.error('Error starting conversation:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error('Authentication failed. Please check your OpenAI API key and ensure it is valid and has sufficient credits.');
        } else if (error.message.includes('429')) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        } else if (error.message.includes('500')) {
          throw new Error('OpenAI server error. Please try again later.');
        } else {
          throw new Error(`OpenAI API error: ${error.message}`);
        }
      }
      
      throw error;
    }
  } 

  private async speakAIResponse(text: string) {
    if (this.isAISpeaking) {
      console.log('AI is already speaking, queuing response...');
      return;
    }

    this.isAISpeaking = true;
    
    try {

      const speechResponse = await this.openai.audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: text,
        speed: 1.0,
      });

      const audioBuffer = await speechResponse.arrayBuffer();    
      await this.voiceService.playAIResponse(audioBuffer);
      
    } catch (error) {
      console.error('Error in speakAIResponse:', error);
      
      this.voiceService.emit(VoiceInteractionService.Events.AI_SPEECH_END);
      
      throw error;
    } finally {
      this.isAISpeaking = false;
    }
  }

  public async speak(text: string) {
    await this.speakAIResponse(text);
  }

  public getConversationHistory() {
    return this.conversationHistory.filter(msg => msg.role !== 'system');
  }

  public get processing() {
    return this.isProcessing;
  }

  public get speaking() {
    return this.isAISpeaking;
  }
}