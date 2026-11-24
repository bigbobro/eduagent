export interface WordCard {
  id: string;
  english: string;
  chinese: string;
  imageUrl: string;
  kind: 'word' | 'sentence';
  drillParts: string[];
  asrAliases?: string[];
  /** Realtime classroom only: this word's own sound (`/sounds/words/<course>/<card>.mp3`), played when the card first appears and in sound quizzes. Leave unset when no sound points to this one word. */
  soundUrl?: string;
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

export type PaletteKey = 'peach' | 'butter' | 'mint' | 'sky' | 'lilac';

export type PhaseName = 'intro' | 'interactive' | 'reinforcement' | 'done';

export interface IntroductionPhase {
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
  tone: PaletteKey;
  cards: WordCard[];
  objectives: {
    sentences: string[];
  };
  teachingHints: TeachingHints;
  phases: Phases;
}
