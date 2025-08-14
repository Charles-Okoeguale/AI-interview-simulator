import { EventEmitter } from 'events';

export class VoiceInteractionService extends EventEmitter {
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
  private silenceThreshold = -50; 
  private silenceTimer: NodeJS.Timeout | null = null;  
  private silenceDelay = 1000; 
  private voiceThreshold = -15;
  private interruptionThreshold = -15;
  private isMonitoring = false; 
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioSource: AudioBufferSourceNode | null = null;
  private isSpeaking: boolean = false;

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
          sampleRate: 44100,
          channelCount: 1,
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
        this.emit(VoiceInteractionService.Events.AI_SPEECH_END);
        
        if (this.audioStream) {
          setTimeout(() => {
            this.monitorAudioLevel();
          }, 500);
        }
      };

      source.buffer = await audioDataPromise;
      source.connect(audioContext.destination);
      this.emit(VoiceInteractionService.Events.AI_SPEECH_START);
      source.start(0); 
      
      this.monitorDuringAISpeech();
    } catch (error) {
      console.error('Error playing AI response:', error);
      this.emit(VoiceInteractionService.Events.AI_SPEECH_END);
    }
  }

  private monitorDuringAISpeech() { 
    if (!this.analyser) {
      return;
    }
    
    const dataArray = new Float32Array(this.analyser.frequencyBinCount);
    
    const checkAudioLevel = () => {
      if (!this.analyser) return;
      
      this.analyser.getFloatTimeDomainData(dataArray);
      const volume = Math.max(...Array.from(dataArray).map(Math.abs));
      const db = 20 * Math.log10(volume);

      if (db > this.interruptionThreshold) { 
        if (this.audioSource) {
          try {
            this.audioSource.stop();
          } catch (e) {
          }
          this.audioSource = null;
        }
        
        this.emit(VoiceInteractionService.Events.USER_INTERRUPTION);
        
        setTimeout(() => {
          this.startRecording();
          this.monitorAudioLevel();
        }, 1000);
        
        return;
      }
      
      // Continue monitoring if no interruption
      requestAnimationFrame(checkAudioLevel);
    };
    
    requestAnimationFrame(checkAudioLevel);
  }

  public stopAIResponse() {
    if (this.audioSource) {
      try {
        this.audioSource.stop();
        this.audioSource = null;
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
      if (!this.analyser) return;
      
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
          }, this.silenceDelay); // This is now 1000ms (1 second)
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

  public setVoiceThreshold(threshold: number) {
    this.voiceThreshold = threshold;
  }

  public setSilenceThreshold(threshold: number) {
    this.silenceThreshold = threshold;
  }

  public setInterruptionThreshold(threshold: number) {
    this.interruptionThreshold = threshold;
  }

  public static getInstance(): VoiceInteractionService {
    if (!VoiceInteractionService.instance) {
      VoiceInteractionService.instance = new VoiceInteractionService();
    }
    return VoiceInteractionService.instance;
  }
} 