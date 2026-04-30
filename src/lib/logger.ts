import { TokenUsage, InteractionLog } from '@/types/session';

export function logInteraction(sessionId: string, log: InteractionLog): void {
  console.log(`[Lesson ${sessionId}] User: ${log.userInput}`);
  console.log(`[Lesson ${sessionId}] AI: ${log.aiResponse}`);
  if (log.actions.length > 0) {
    console.log(`[Lesson ${sessionId}] Actions:`, JSON.stringify(log.actions));
  }
  console.log(`[Lesson ${sessionId}] LLM: ${log.modelCalls.llm.inputTokens}in/${log.modelCalls.llm.outputTokens}out (${log.modelCalls.llm.latency}ms)`);
}

export function logTokenUsage(sessionId: string, usage: TokenUsage): void {
  console.log(`\n[Lesson ${sessionId}] === Token Usage Summary ===`);
  console.log(`  ASR: ${usage.asr.requests} requests, ${usage.asr.tokens} tokens`);
  console.log(`  LLM: ${usage.llm.requests} requests, ${usage.llm.inputTokens} input / ${usage.llm.outputTokens} output tokens`);
  console.log(`  TTS: ${usage.tts.requests} requests, ${usage.tts.characters} characters`);
}

export function logSessionStart(sessionId: string, courseId: string): void {
  console.log(`\n[Lesson ${sessionId}] === Session Started ===`);
  console.log(`  Course: ${courseId}`);
  console.log(`  Time: ${new Date().toISOString()}`);
}

export function logSessionEnd(sessionId: string, interactionCount: number): void {
  console.log(`\n[Lesson ${sessionId}] === Session Ended ===`);
  console.log(`  Interactions: ${interactionCount}`);
  console.log(`  Time: ${new Date().toISOString()}`);
}
