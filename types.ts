export interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  image?: string; // User-uploaded image
  generatedImage?: string; // AI-generated image
  imagePrompt?: string; // The prompt used for generation
  loadingImage?: boolean;
  feedback?: 'like' | 'dislike' | null;
  historyOnly?: boolean;
}

export type Gender = 'male' | 'female' | '';

export type Tone = 'critical' | 'witty' | 'friendly' | '';

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}
