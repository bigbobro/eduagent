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

export type PhaseName = 'intro' | 'interactive' | 'reinforcement' | 'done';

export interface IntroductionPhase {
  sceneImage: string;
  sceneCaption?: string;
  narrationHint?: string;
}

export interface InteractivePhase {
  // Reserved for future phase-specific agent/tool preferences.
}

export interface ReinforcementPhase {
  quizzes: Quiz[];
}

export interface Phases {
  introduction: IntroductionPhase;
  interactive: InteractivePhase;
  reinforcement: ReinforcementPhase;
}

export type Quiz =
  | {
      id: string;
      type: 'pick-word';
      prompt: string;
      correctCardId: string;
      distractorCardIds: string[];
    }
  | {
      id: string;
      type: 'repeat-after-me';
      cardId: string;
      targetText: string;
    };

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
  phases: Phases;
}
