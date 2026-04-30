export interface Word {
  english: string;
  chinese: string;
  phonetic?: string;
  imageId?: string;
  difficulty: number;
  tags: string[];
}

export interface ImageRegion {
  id: string;
  label: string;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface CourseImage {
  id: string;
  url: string;
  description: string;
  regions: ImageRegion[];
}

export interface TeachingHints {
  opening: string;
  reviewWords: string[];
  newWords: string[];
  quizQuestions: string[];
  closing: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  targetAge: [number, number];
  objectives: {
    words: Word[];
    sentences: string[];
  };
  images: CourseImage[];
  teachingHints: TeachingHints;
}
