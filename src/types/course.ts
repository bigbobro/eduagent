export interface WordCard {
  id: string;
  english: string;
  chinese: string;
  imageUrl: string;
  kind: 'word' | 'sentence';
  drillParts: string[];
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

export type CourseTheme = 'transport' | 'time-numbers' | 'animals' | 'food' | 'colors';

export interface Course {
  id: string;
  title: string;
  description: string;
  targetAge: [number, number];
  theme: CourseTheme;
  cards: WordCard[];
  objectives: {
    sentences: string[];
  };
  teachingHints: TeachingHints;
}
