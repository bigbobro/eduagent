export interface ShowCardParams {
  card_id: string;
}

export type ToolName = 'show_card';

export interface ToolAction {
  tool: 'show_card';
  params: ShowCardParams;
}

export interface AgentResponse {
  speech: string;
  actions: ToolAction[];
  state_update: {
    current_word?: string;
    attempt_assessment?: {
      card_id: string;
      result: 'correct' | 'close' | 'wrong' | 'off_topic';
      should_advance: boolean;
      evidence: string;
    };
  };
}
