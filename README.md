# AI Interview Simulator Mini App

A React-based mini application that simulates AI-powered job interviews using OpenAI's GPT and voice technologies. This application allows users to practice interviews with an AI interviewer named Emily in a natural, conversational format.

## Features

- **Voice-Based Interaction**: Real-time speech recognition and text-to-speech
- **AI-Powered Interviewer**: Uses OpenAI GPT-4 for intelligent questioning and responses  
- **Customizable Interviews**: Configure candidate name, job title, difficulty level, and question types
- **Visual Feedback**: Audio wave visualization showing who's speaking
- **Transcript Generation**: Download interview transcripts as PDF
- **Browser-Based**: No server required, runs entirely in the browser

## Technologies Used

- **Frontend**: React 18, TypeScript, Create React App
- **Styling**: Tailwind CSS
- **AI Services**: OpenAI GPT-4 Turbo, Whisper, TTS
- **Audio Processing**: Web Audio API, MediaRecorder API
- **PDF Generation**: jsPDF

## Prerequisites

- Node.js 18+ 
- OpenAI API key with access to:
  - GPT-4 Turbo
  - Whisper (speech-to-text)
  - TTS (text-to-speech)
- Modern browser with microphone access

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-interview-mini
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   **Important**: Edit `.env` and replace the placeholder with your actual OpenAI API key:
   ```
   REACT_APP_OPENAI_API_KEY=your_actual_api_key_here
   ```
   
   **Note**: 
   - The `REACT_APP_` prefix is required for React applications to access environment variables in the browser
   - Without a valid API key, the application will not function

4. **Run the development server**
   ```bash
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## Usage

### Starting an Interview

1. **Setup Phase**:
   - Fill in your name and the job title you're interviewing for
   - Select number of questions (3, 5, or 7)
   - Choose difficulty level (Entry Level, Mid-Level, Senior, Executive)
   - Pick question type (Technical, Behavioral, Situational, Mixed)

2. **Interview Phase**:
   - Grant microphone permissions when prompted
   - Emily (AI interviewer) will introduce herself and start the interview
   - Speak naturally when asked questions
   - Visual indicators show when you or the AI is speaking
   - The AI will provide follow-up questions and feedback

3. **Completion**:
   - End the interview at any time using the "End Call" button
   - Download your interview transcript as a PDF
   - Return to setup to start a new interview

### Audio Controls

- **Speaking Indicators**: 
  - Pink glow = AI is speaking
  - Blue glow = You are speaking
  - Audio wave visualization shows conversation activity

- **Interruption Support**: You can interrupt the AI if needed

## Configuration Options

### Interview Parameters

- **Candidate Name**: Used for personalization
- **Job Title**: Tailors questions to the specific role
- **Number of Questions**: Controls interview length
- **Difficulty Level**: Adjusts question complexity
- **Question Type**: Focuses on specific skill areas

### Voice Settings

The application uses optimized settings for:
- Echo cancellation
- Noise suppression  
- Automatic gain control
- Voice activity detection

## Security Considerations

⚠️ **Important**: This application runs the OpenAI API key client-side for simplicity. For production use, consider:

- Implementing a backend API to proxy OpenAI requests
- Using environment variables on the server-side
- Adding authentication and rate limiting
- Storing transcripts securely

## Browser Compatibility

**Recommended Browsers**:
- Chrome 80+
- Firefox 76+
- Safari 13.1+
- Edge 80+

**Required APIs**:
- Web Audio API
- MediaRecorder API
- getUserMedia API

## Troubleshooting

### Common Issues

1. **Microphone not working**:
   - Check browser permissions
   - Ensure HTTPS connection (required for microphone access)
   - Try refreshing the page

2. **AI not responding**:
   - Verify OpenAI API key is set correctly in `.env`
   - Ensure the API key has sufficient credits
   - Check browser console for error messages
   - Restart the development server after changing environment variables
   - Ensure stable internet connection

3. **Audio playback issues**:
   - Check system audio settings
   - Try using headphones to prevent feedback
   - Refresh the page to reset audio context

4. **Poor speech recognition**:
   - Speak clearly and at normal pace
   - Reduce background noise
   - Use a quality microphone

## Development

### Project Structure

   ```
ai-interview-simulator/
├── public/              # Static assets
│   ├── index.html
│   └── manifest.json
├── src/                 # Source code
│   ├── components/      # React components
│   │   ├── AIInterviewSimulator.tsx
│   │   └── AudioWave.tsx
│   ├── services/        # Core services
│   │   ├── VoiceInteractionService.ts
│   │   └── AIConversationService.ts
│   ├── App.tsx          # Main App component
│   ├── App.css          # App styles
│   ├── index.tsx        # Entry point
│   └── index.css        # Global styles
└── .env                 # Environment variables
```

### Key Components

- **AIInterviewSimulator**: Main component handling UI and state
- **VoiceInteractionService**: Manages audio input/output and speech detection
- **AIConversationService**: Handles OpenAI API interactions
- **AudioWave**: Visual audio activity indicator

### Building for Production

```bash
npm run build
# Build files will be in the 'build' directory
# You can serve them with any static file server
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is provided as-is for educational and demonstration purposes.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Ensure all prerequisites are met
4. Verify API key permissions and credits 