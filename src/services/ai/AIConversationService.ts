import { EventEmitter } from 'events';
import OpenAI from 'openai';
import { VoiceInteractionService } from '../voice/VoiceInteractionService';

export class AIConversationService extends EventEmitter {
  private openai: OpenAI;
  private voiceService: VoiceInteractionService;
  private conversationHistory: { role: 'user' | 'assistant' | 'system', content: string }[] = [];
  private systemPrompt: string = '';
  private isProcessing: boolean = false;
  private isInterviewActive: boolean = false;
  private abortController: AbortController | null = null;
  private speechQueue: string[] = [];
  private isProcessingQueue: boolean = false;
  private sentenceCount = 0;
  private sentenceBuffer = '';
  private targetSentenceBatch = 4;

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

    if (audioBlob.size < 1024) {
      console.log('Audio blob too small (likely echo), skipping processing');
      return;
    }

    if (!this.isInterviewActive) {
      console.log('Interview ended, ignoring user response');
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

      this.speechQueue = [];
      
      this.abortController = new AbortController();
      
      const stream = await this.openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: this.conversationHistory,
        max_tokens: 500,
        temperature: 0.7,
        stream: true,
      }, { signal: this.abortController.signal });

      let accumulatedText = '';
      let currentSentence = '';

      for await (const chunk of stream) {
        if (!this.isInterviewActive) {
          console.log('Interview ended, stopping text generation');
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';
        accumulatedText += content;
        currentSentence += content;

        // Check if we have a complete sentence
        if (this.isCompleteSentence(currentSentence)) {
          this.sentenceBuffer += currentSentence.trim() + ' ';
          this.sentenceCount++;
          
          // Process when we have 4 sentences (or at end of stream)
          if (this.sentenceCount >= this.targetSentenceBatch) {
            const sentencesToProcess = this.sentenceBuffer.trim();
            if (sentencesToProcess.length > 0) {
              this.speechQueue.push(sentencesToProcess);
              this.updateAISpeakingState();
              this.processSpeechQueue();
            }
            this.sentenceBuffer = '';
            this.sentenceCount = 0;
          }
          currentSentence = '';
        }
      }

      if (currentSentence.trim().length > 0) {
        this.sentenceBuffer += currentSentence.trim();
        this.sentenceCount++;
      }
      
      if (this.sentenceBuffer.trim().length > 0) {
        this.speechQueue.push(this.sentenceBuffer.trim());
        this.updateAISpeakingState();
        this.processSpeechQueue();
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: accumulatedText
      });

      this.emit('conversationUpdate', this.getConversationHistory());
      
    } catch (error) {
      console.error('Error handling user response:', error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was aborted due to interview ending');
        return;
      }
      
      // ADD THESE LINES: Clear queue and buffer on error
      this.speechQueue = [];
      this.sentenceBuffer = '';
      this.sentenceCount = 0;
      this.isProcessingQueue = false;
      this.updateAISpeakingState();
      
      if (this.isInterviewActive) {
        try {
          await this.speakAIResponseChunked("I'm sorry, I didn't catch that. Could you please try again?");
        } catch (speechError) {
          console.error('Error providing error feedback:', speechError);
        }
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
    this.isProcessing = false;
    this.systemPrompt = '';
    this.speechQueue = [];
    this.isProcessingQueue = false;
    this.sentenceCount = 0;
    this.sentenceBuffer = '';
    this.targetSentenceBatch = 4;
    this.updateAISpeakingState(); // ADD THIS LINE
  }

  public stopProcessing() {
    this.isInterviewActive = false;
    this.isProcessing = false;
    
    // Clear speech queue
    this.speechQueue = [];
    this.isProcessingQueue = false;
    
    // ADD THESE LINES: Clear sentence batch
    this.sentenceBuffer = '';
    this.sentenceCount = 0;
    
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    this.removeAllListeners();
  }

  async startConversation(interviewContext: string, agentId: string = 'Emily') {
    try {     
      this.isInterviewActive = true;
      this.systemPrompt = `You are ${agentId}, an AI interviewer. ${interviewContext}`;
      this.conversationHistory = [{
        role: 'system',
        content: this.systemPrompt
      }]; 

      // Clear any existing speech queue
      this.speechQueue = [];
      
      this.abortController = new AbortController();
      
      const stream = await this.openai.chat.completions.create({
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
        stream: true,
      }, { signal: this.abortController.signal }); 

      let accumulatedText = '';
      let currentSentence = '';

      console.log("STREAM", stream) // log the stream to the console to find what is 

      for await (const chunk of stream) {
        if (!this.isInterviewActive) {
          console.log('Interview start was aborted');
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';
        accumulatedText += content;
        currentSentence += content;

        // Check if we have a complete sentence
        if (this.isCompleteSentence(currentSentence)) {
          this.sentenceBuffer += currentSentence.trim() + ' ';
          this.sentenceCount++;
          
          // Process when we have 4 sentences (or at end of stream)
          if (this.sentenceCount >= this.targetSentenceBatch) {
            const sentencesToProcess = this.sentenceBuffer.trim();
            if (sentencesToProcess.length > 0) {
              this.speechQueue.push(sentencesToProcess);
              this.updateAISpeakingState();
              this.processSpeechQueue();
            }
            this.sentenceBuffer = '';
            this.sentenceCount = 0;
          }
          currentSentence = '';
        }
      }

      // Process any remaining sentences (even if less than 4)
      if (currentSentence.trim().length > 0) {
        this.sentenceBuffer += currentSentence.trim();
        this.sentenceCount++;
      }

      if (this.sentenceBuffer.trim().length > 0) {
        this.speechQueue.push(this.sentenceBuffer.trim());
        this.updateAISpeakingState();
        this.processSpeechQueue();
      }

      // Add the complete response to conversation history
      this.conversationHistory.push({
        role: 'assistant',
        content: accumulatedText
      });

      this.emit('conversationUpdate', this.getConversationHistory());
      
    } catch (error) {
      console.error('Error starting conversation:', error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Conversation start was aborted');
        return;
      }
      
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

  private async speakAIResponseChunked(text: string) {
    if (!this.isInterviewActive) return;
    
    // Split text into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    // Add sentences to queue
    this.speechQueue.push(...sentences);
    
    // Start processing queue if not already running
    if (!this.isProcessingQueue) {
      this.processSpeechQueue();
    }
  }

  private async processSpeechQueue() {
    if (this.isProcessingQueue || this.speechQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    this.updateAISpeakingState();
    
    while (this.speechQueue.length > 0 && this.isInterviewActive) {
      const sentence = this.speechQueue.shift()!;
      
      try {
        const speechResponse = await this.openai.audio.speech.create({
          model: "tts-1",
          voice: "nova",
          input: sentence.trim(),
          speed: 1.0,
        });

        const audioBuffer = await speechResponse.arrayBuffer();
        await this.voiceService.playAIResponse(audioBuffer);
        
        await new Promise(resolve => {
          this.voiceService.once(VoiceInteractionService.Events.AI_SPEECH_END, resolve);
        });
        
      } catch (error) {
        console.error('Speech queue error:', error);
      }
    }
    
    this.isProcessingQueue = false;
    this.updateAISpeakingState();
    
    // ADD THIS: Clear any remaining sentence buffer after queue is empty
    if (this.speechQueue.length === 0) {
      this.sentenceBuffer = '';
      this.sentenceCount = 0;
      this.updateAISpeakingState();
    }
  }

  public async speak(text: string) {
    await this.speakAIResponseChunked(text);
  }

  public getConversationHistory() {
    return this.conversationHistory.filter(msg => msg.role !== 'system');
  }

  public get processing() {
    return this.isProcessing;
  }

  private isCompleteSentence(text: string): boolean {
    const sentenceEndings = ['.', '!', '?', ':', ';'];
    return sentenceEndings.some(ending => text.trim().endsWith(ending));
  }

  public get isAISpeaking(): boolean {
    return this.speechQueue.length > 0 || this.isProcessingQueue || this.sentenceBuffer.length > 0;
  }

  public setSentenceBatchSize(size: number) {
    this.targetSentenceBatch = size;
  }

  public get sentenceBatchSize(): number {
    return this.targetSentenceBatch;
  }

  private updateAISpeakingState() {
    const isSpeaking = this.isAISpeaking; // Use the getter instead of duplicating logic
    this.emit('aiSpeakingStateChange', isSpeaking);
  }
} 