export type FocusStyle = 'zoom' | 'highlight' | 'circle' | 'pulse';
export type AnnotateType = 'circle' | 'checkmark' | 'arrow' | 'text';

export interface ShowParams {
  image_id: string;
}

export interface FocusParams {
  target: string;
  style: FocusStyle;
}

export interface AnnotateParams {
  type: AnnotateType;
  target: string;
  content?: string;
}

export interface GenerateState {
  type: 'sentence' | 'question' | 'comparison';
  content: string;
  topic: string;
}

export type ToolName = 'show' | 'focus' | 'annotate';

export interface ToolAction {
  tool: ToolName;
  params: ShowParams | FocusParams | AnnotateParams;
}

export interface AgentResponse {
  speech: string;
  actions: ToolAction[];
  state_update: {
    current_word?: string;
    phase?: 'opening' | 'review' | 'learning' | 'quiz' | 'closing';
    words_learned?: string[];
    generated_content?: GenerateState;
  };
}
