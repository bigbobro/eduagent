export interface WordCard {
  id: string;
  english: string;
  chinese: string;
  imageUrl: string;
  kind: 'word' | 'sentence';
  difficulty?: number;
  tags?: string[];
}

export interface TeachingHints {
  opening: string;
  reviewCardIds: string[];
  newCardIds: string[];
  quizQuestions: string[];
  closing: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  targetAge: [number, number];
  cards: WordCard[];
  objectives: {
    sentences: string[];
  };
  teachingHints: TeachingHints;
}
