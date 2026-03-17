export interface Quiz {
  id: number;
  title: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Round {
  id: number;
  quizId: number;
  name: string;
  type: string;
  order: number;
  timerDuration: number;
  questionCount: number;
}

export interface Question {
  id: number;
  roundId?: number;
  text: string;
  options: AnswerOption[];
  category?: string;
  mediaUrl?: string;
  mediaType?: 'mp3' | 'mp4';
}

export interface AnswerOption {
  text: string;
  isCorrect: boolean;
}

export interface Session {
  id: number;
  quizId: number;
  pin: string;
  maxTeams: number;
  status: 'pending' | 'active' | 'completed';
  createdAt: Date;
}

export interface Team {
  id: number;
  sessionId: number;
  teamName: string;
  score: number;
  isEliminated: boolean;
  isConnected: boolean;
}

export interface Answer {
  id: number;
  teamId: number;
  questionId: number;
  selectedOptionIndex: number;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface GameState {
  sessionId: number;
  state: string;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  questionState: string;
  timerRemaining: number;
  timerRunning: boolean;
  teams: Team[];
  responses: Record<number, number>;
}
