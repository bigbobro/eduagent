export interface ShowCardParams {
  card_id: string;
}

export type ToolName = 'show_card';

export interface ToolAction {
  tool: 'show_card';
  params: ShowCardParams;
}

export interface GenerateState {
  type: 'sentence' | 'question' | 'comparison';
  content: string;
  topic: string;
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
