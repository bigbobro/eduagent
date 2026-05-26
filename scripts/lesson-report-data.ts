/// <reference types="node" />
import path from 'path';
import fs from 'fs';
import type { Database } from 'better-sqlite3';
import { getCourseById } from '../src/data/courses';
import type { WordCard } from '../src/types/course';

export interface ReportData {
  session: {
    id: string;
    courseId: string;
    courseTitle: string;
    targetWords: string[];
    startTime: string;
    endTime: string | null;
    durationSec: number | null;
    interactionCount: number;
    ended: boolean;
  };
  tokens: {
    llm: {
      requests: number;
      input: number;
      output: number;
      avgInputPerRound: number;
      maxInput: number;
      promptInputBreakdown: PromptInputBreakdownSummary;
    };
    asr: { requests: number; tracked: boolean };
    tts: { requests: number; tracked: boolean };
  };
  anomalies: {
    highAvgInput: boolean;
    asrUsageNotTracked: boolean;
    ttsUsageNotTracked: boolean;
    tokensCorrupted: boolean;
  };
  interactions: Array<{
    n: number;
    ts: string;
    user: string;
    ai: string;
    actions: unknown[];
  }>;
  eval: EvalScorecard;
}

export interface CourseWord {
  id: string;
  english: string;
  chinese: string;
}

export interface CourseDefinition {
  title: string;
  words: string[];
  wordCards?: CourseWord[];
}

export type CourseLoader = (courseId: string) => Promise<CourseDefinition | null>;

interface EvalScorecard {
  sessionHealth: {
    status: 'ok' | 'warn' | 'fail';
    ended: boolean;
    durationSec: number | null;
    interactionCount: number;
    recordedInteractionCount: number;
    interactionCountMatchesLog: boolean;
    llmRequestsPerInteraction: number;
    providerUsageTracked: {
      asr: boolean;
      tts: boolean;
    };
    tokensCorrupted: boolean;
    issues: string[];
  };
  costContext: {
    llmRequests: number;
    llmInputTokens: number;
    llmOutputTokens: number;
    avgInputPerRound: number;
    maxInput: number;
    highAvgInput: boolean;
    promptBreakdownTrackedTurns: number;
    promptBreakdownCoverageRate: number;
    largestPromptBucket: null | {
      key: string;
      label: string;
      shareOfEstimatedTokens: number;
      avgEstimatedTokens: number;
    };
  };
  teachingLoop: {
    targetWordCount: number;
    attemptedWordCount: number;
    clearedWordCount: number;
    needsReviewWordCount: number;
    coverageRate: number;
    clearRate: number;
    attemptsPerClearedWord: number;
    totalAttempts: number;
    totalCorrect: number;
    words: Array<{
      word: string;
      attempts: number;
      correct: number;
      needsReview: boolean;
      attempted: boolean;
      cleared: boolean;
    }>;
    stuckCardRuns: Array<{
      cardId: string;
      startTurn: number;
      endTurn: number;
      length: number;
    }>;
    maxStuckRunLength: number;
  };
  agentBehavior: {
    speechCardMismatchCount: number;
    speechCardMismatches: Array<{
      turn: number;
      showCardId: string;
      mentionedOtherCardId: string;
    }>;
    prematureClosingCount: number;
    prematureClosingTurns: number[];
    emptyAiResponseTurns: number[];
    emptyActionTurns: number[];
    repeatedSpeechRuns: Array<{
      startTurn: number;
      endTurn: number;
      length: number;
      sample: string;
    }>;
    maxRepeatedSpeechRunLength: number;
  };
  nextIterationSignals: Array<{
    key: string;
    severity: 'info' | 'warn' | 'critical';
    reason: string;
    metric: string;
    value: string | number | boolean;
  }>;
}

interface PromptInputBreakdownSummary {
  trackedTurns: number;
  avgTotalChars: number;
  avgSystemChars: number;
  avgMessageChars: number;
  avgMessageCount: number;
  largestBucket: null | {
    key: string;
    label: string;
    by: 'estimatedTokens' | 'chars';
    value: number;
  };
  buckets: Array<{
    key: string;
    label: string;
    totalChars: number;
    avgChars: number;
    totalEstimatedTokens: number;
    avgEstimatedTokens: number;
    shareOfEstimatedTokens: number;
  }>;
}

interface LessonRow {
  id: string;
  course_id: string;
  start_time: string;
  end_time: string | null;
  interaction_count: number;
  token_usage: string;
}

interface InteractionRow {
  timestamp: string;
  user_input: string;
  ai_response: string;
  actions: string;
  model_calls: string;
}

interface WordPerformanceRow {
  word: string;
  attempts: number;
  correct: number;
  needs_review: number;
}

export async function buildReport(
  db: Database,
  sessionId: string | null,
  courseLoader: CourseLoader
): Promise<ReportData> {
  const lesson = sessionId
    ? (db.prepare('SELECT * FROM lesson_logs WHERE id = ?').get(sessionId) as LessonRow | undefined)
    : (db.prepare('SELECT * FROM lesson_logs ORDER BY start_time DESC LIMIT 1').get() as LessonRow | undefined);

  if (!lesson) {
    throw new Error(`session not found: ${sessionId ?? '(latest)'}`);
  }

  const course = await courseLoader(lesson.course_id);
  const courseTitle = course?.title ?? lesson.course_id;
  const targetWords = (course?.words ?? []).map((w) => w.toLowerCase());
  const wordCards = buildCourseWordCards(course, targetWords);

  const rows = db.prepare(
    'SELECT timestamp, user_input, ai_response, actions, model_calls FROM interaction_logs WHERE lesson_id = ? ORDER BY id ASC'
  ).all(lesson.id) as InteractionRow[];

  const interactions = rows.map((r, i) => ({
    n: i + 1,
    ts: r.timestamp,
    user: r.user_input,
    ai: r.ai_response,
    actions: safeJsonParse(r.actions, []) as unknown[],
  }));

  const usage = parseTokenUsage(lesson.token_usage);
  const modelCalls = rows.map((r) => safeJsonParse(r.model_calls, {}) as ModelCallsRow);
  const inputs = modelCalls.map((mc) => {
    return mc.llm?.inputTokens ?? 0;
  });
  const sumInput = inputs.reduce((a, b) => a + b, 0);
  const avgInputPerRound = inputs.length > 0 ? Math.round(sumInput / inputs.length) : 0;
  const maxInput = inputs.length > 0 ? Math.max(...inputs) : 0;
  const promptInputBreakdown = summarizePromptInputBreakdown(modelCalls);
  const wordPerformanceRows = readWordPerformance(db, lesson.id);

  const startMs = Date.parse(lesson.start_time);
  const endMs = lesson.end_time ? Date.parse(lesson.end_time) : null;
  const durationSec = endMs !== null ? Math.round((endMs - startMs) / 1000) : null;
  const session = {
    id: lesson.id,
    courseId: lesson.course_id,
    courseTitle,
    targetWords,
    startTime: lesson.start_time,
    endTime: lesson.end_time,
    durationSec,
    interactionCount: interactions.length,
    ended: lesson.end_time !== null,
  };
  const tokens = {
    llm: {
      requests: usage.llm.requests,
      input: usage.llm.inputTokens,
      output: usage.llm.outputTokens,
      avgInputPerRound,
      maxInput,
      promptInputBreakdown,
    },
    asr: { requests: usage.asr.requests, tracked: usage.asr.requests > 0 },
    tts: { requests: usage.tts.requests, tracked: usage.tts.requests > 0 },
  };
  const anomalies = {
    highAvgInput: avgInputPerRound > 1000,
    asrUsageNotTracked: usage.asr.requests === 0,
    ttsUsageNotTracked: usage.tts.requests === 0,
    tokensCorrupted: usage.corrupted,
  };
  return {
    session: {
      ...session,
    },
    tokens: {
      ...tokens,
    },
    anomalies: {
      ...anomalies,
    },
    interactions,
    eval: buildEvalScorecard({
      lesson,
      session,
      tokens,
      anomalies,
      interactions,
      modelCalls,
      targetWords,
      wordCards,
      wordPerformanceRows,
    }),
  };
}

function safeJsonParse(s: string, fallback: unknown): unknown {
  try { return JSON.parse(s); } catch { return fallback; }
}

function buildCourseWordCards(course: CourseDefinition | null, targetWords: string[]): CourseWord[] {
  if (course?.wordCards?.length) {
    return course.wordCards.map((card) => ({
      id: card.id,
      english: card.english.toLowerCase(),
      chinese: card.chinese,
    }));
  }
  return targetWords.map((word) => ({ id: word, english: word, chinese: '' }));
}

interface ModelCallsRow {
  llm?: {
    inputTokens?: number;
    outputTokens?: number;
    inputBreakdown?: {
      totalChars?: number;
      systemChars?: number;
      messageChars?: number;
      messageCount?: number;
      buckets?: Array<{
        key?: string;
        label?: string;
        chars?: number;
        estimatedTokens?: number;
      }>;
    };
  };
}

type PromptInputBreakdownRow = NonNullable<NonNullable<ModelCallsRow['llm']>['inputBreakdown']>;

function isPromptInputBreakdownRow(value: unknown): value is PromptInputBreakdownRow {
  return !!value && typeof value === 'object' && Array.isArray((value as PromptInputBreakdownRow).buckets);
}

function summarizePromptInputBreakdown(modelCalls: ModelCallsRow[]): PromptInputBreakdownSummary {
  const breakdowns = modelCalls
    .map((mc) => mc.llm?.inputBreakdown)
    .filter(isPromptInputBreakdownRow);

  if (breakdowns.length === 0) {
    return {
      trackedTurns: 0,
      avgTotalChars: 0,
      avgSystemChars: 0,
      avgMessageChars: 0,
      avgMessageCount: 0,
      largestBucket: null,
      buckets: [],
    };
  }

  const bucketMap = new Map<string, {
    key: string;
    label: string;
    totalChars: number;
    totalEstimatedTokens: number;
  }>();
  let totalChars = 0;
  let systemChars = 0;
  let messageChars = 0;
  let messageCount = 0;

  for (const breakdown of breakdowns) {
    totalChars += Number(breakdown.totalChars ?? 0);
    systemChars += Number(breakdown.systemChars ?? 0);
    messageChars += Number(breakdown.messageChars ?? 0);
    messageCount += Number(breakdown.messageCount ?? 0);

    for (const bucket of breakdown.buckets || []) {
      if (!bucket.key) continue;
      const existing = bucketMap.get(bucket.key) || {
        key: bucket.key,
        label: bucket.label || bucket.key,
        totalChars: 0,
        totalEstimatedTokens: 0,
      };
      existing.totalChars += Number(bucket.chars ?? 0);
      existing.totalEstimatedTokens += Number(bucket.estimatedTokens ?? 0);
      bucketMap.set(bucket.key, existing);
    }
  }

  const totalEstimatedTokens = Array.from(bucketMap.values())
    .reduce((sum, bucket) => sum + bucket.totalEstimatedTokens, 0);
  const buckets = Array.from(bucketMap.values())
    .map((bucket) => ({
      ...bucket,
      avgChars: Math.round(bucket.totalChars / breakdowns.length),
      avgEstimatedTokens: Math.round(bucket.totalEstimatedTokens / breakdowns.length),
      shareOfEstimatedTokens: totalEstimatedTokens > 0
        ? Number((bucket.totalEstimatedTokens / totalEstimatedTokens).toFixed(4))
        : 0,
    }))
    .sort((a, b) => (
      totalEstimatedTokens > 0
        ? b.totalEstimatedTokens - a.totalEstimatedTokens
        : b.totalChars - a.totalChars
    ));

  const top = buckets[0];
  return {
    trackedTurns: breakdowns.length,
    avgTotalChars: Math.round(totalChars / breakdowns.length),
    avgSystemChars: Math.round(systemChars / breakdowns.length),
    avgMessageChars: Math.round(messageChars / breakdowns.length),
    avgMessageCount: Math.round(messageCount / breakdowns.length),
    largestBucket: top ? {
      key: top.key,
      label: top.label,
      by: totalEstimatedTokens > 0 ? 'estimatedTokens' : 'chars',
      value: totalEstimatedTokens > 0 ? top.totalEstimatedTokens : top.totalChars,
    } : null,
    buckets,
  };
}

function readWordPerformance(db: Database, lessonId: string): WordPerformanceRow[] {
  try {
    return db.prepare(
      'SELECT word, attempts, correct, needs_review FROM word_performance WHERE lesson_id = ? ORDER BY id ASC'
    ).all(lessonId) as WordPerformanceRow[];
  } catch (err) {
    if (String(err).includes('no such table: word_performance')) return [];
    throw err;
  }
}

function buildEvalScorecard(args: {
  lesson: LessonRow;
  session: ReportData['session'];
  tokens: ReportData['tokens'];
  anomalies: ReportData['anomalies'];
  interactions: ReportData['interactions'];
  modelCalls: ModelCallsRow[];
  targetWords: string[];
  wordCards: CourseWord[];
  wordPerformanceRows: WordPerformanceRow[];
}): EvalScorecard {
  const sessionHealth = buildSessionHealth(args.lesson, args.session, args.tokens, args.anomalies);
  const costContext = buildCostContext(args.tokens, args.modelCalls, args.anomalies);
  const teachingLoop = buildTeachingLoop(args.targetWords, args.wordCards, args.wordPerformanceRows, args.interactions);
  const agentBehavior = buildAgentBehavior(args.interactions, args.wordCards, teachingLoop.clearRate);
  const nextIterationSignals = buildNextIterationSignals({
    sessionHealth,
    costContext,
    teachingLoop,
    agentBehavior,
  });
  return {
    sessionHealth,
    costContext,
    teachingLoop,
    agentBehavior,
    nextIterationSignals,
  };
}

function buildSessionHealth(
  lesson: LessonRow,
  session: ReportData['session'],
  tokens: ReportData['tokens'],
  anomalies: ReportData['anomalies'],
): EvalScorecard['sessionHealth'] {
  const issues: string[] = [];
  const interactionCountMatchesLog = Number(lesson.interaction_count ?? 0) === session.interactionCount;
  if (!session.ended) issues.push('session_not_ended');
  if (!interactionCountMatchesLog) issues.push('interaction_count_mismatch');
  if (anomalies.asrUsageNotTracked) issues.push('asr_usage_not_tracked');
  if (anomalies.ttsUsageNotTracked) issues.push('tts_usage_not_tracked');
  if (anomalies.tokensCorrupted) issues.push('tokens_corrupted');
  const status = anomalies.tokensCorrupted
    ? 'fail'
    : issues.length > 0
      ? 'warn'
      : 'ok';
  return {
    status,
    ended: session.ended,
    durationSec: session.durationSec,
    interactionCount: session.interactionCount,
    recordedInteractionCount: Number(lesson.interaction_count ?? 0),
    interactionCountMatchesLog,
    llmRequestsPerInteraction: roundRatio(tokens.llm.requests, session.interactionCount),
    providerUsageTracked: {
      asr: tokens.asr.tracked,
      tts: tokens.tts.tracked,
    },
    tokensCorrupted: anomalies.tokensCorrupted,
    issues,
  };
}

function buildCostContext(
  tokens: ReportData['tokens'],
  modelCalls: ModelCallsRow[],
  anomalies: ReportData['anomalies'],
): EvalScorecard['costContext'] {
  const llmRowsWithUsage = modelCalls.filter((mc) => {
    const llm = mc.llm;
    return !!llm && (Number(llm.inputTokens ?? 0) > 0 || Number(llm.outputTokens ?? 0) > 0);
  }).length;
  const denominator = tokens.llm.requests || llmRowsWithUsage;
  const topBucket = tokens.llm.promptInputBreakdown.buckets[0] ?? null;
  return {
    llmRequests: tokens.llm.requests,
    llmInputTokens: tokens.llm.input,
    llmOutputTokens: tokens.llm.output,
    avgInputPerRound: tokens.llm.avgInputPerRound,
    maxInput: tokens.llm.maxInput,
    highAvgInput: anomalies.highAvgInput,
    promptBreakdownTrackedTurns: tokens.llm.promptInputBreakdown.trackedTurns,
    promptBreakdownCoverageRate: roundRatio(tokens.llm.promptInputBreakdown.trackedTurns, denominator),
    largestPromptBucket: topBucket ? {
      key: topBucket.key,
      label: topBucket.label,
      shareOfEstimatedTokens: topBucket.shareOfEstimatedTokens,
      avgEstimatedTokens: topBucket.avgEstimatedTokens,
    } : null,
  };
}

function buildTeachingLoop(
  targetWords: string[],
  wordCards: CourseWord[],
  wordPerformanceRows: WordPerformanceRow[],
  interactions: ReportData['interactions'],
): EvalScorecard['teachingLoop'] {
  const performanceByWord = new Map(wordPerformanceRows.map((row) => [normalizeWord(row.word), row]));
  const targetSet = new Set(targetWords.map(normalizeWord));
  const words = targetWords.map((word) => {
    const row = performanceByWord.get(normalizeWord(word));
    const attempts = Number(row?.attempts ?? 0);
    const correct = Number(row?.correct ?? 0);
    const needsReview = Number(row?.needs_review ?? 0) > 0;
    return {
      word,
      attempts,
      correct,
      needsReview,
      attempted: attempts > 0,
      cleared: correct >= 2,
    };
  });

  const nonTargetRows = wordPerformanceRows
    .filter((row) => !targetSet.has(normalizeWord(row.word)))
    .map((row) => ({
      word: normalizeWord(row.word),
      attempts: Number(row.attempts ?? 0),
      correct: Number(row.correct ?? 0),
      needsReview: Number(row.needs_review ?? 0) > 0,
      attempted: Number(row.attempts ?? 0) > 0,
      cleared: Number(row.correct ?? 0) >= 2,
    }));
  const allWords = [...words, ...nonTargetRows];
  const scoredWords = targetWords.length > 0 ? words : allWords;
  const clearedWords = scoredWords.filter((word) => word.cleared);
  const clearedAttempts = clearedWords.reduce((sum, word) => sum + word.attempts, 0);
  const totalAttempts = allWords.reduce((sum, word) => sum + word.attempts, 0);
  const totalCorrect = allWords.reduce((sum, word) => sum + word.correct, 0);
  const targetDenominator = scoredWords.length;
  const stuckCardRuns = findStuckCardRuns(interactions, wordCards);
  return {
    targetWordCount: targetWords.length,
    attemptedWordCount: scoredWords.filter((word) => word.attempted).length,
    clearedWordCount: clearedWords.length,
    needsReviewWordCount: scoredWords.filter((word) => word.needsReview).length,
    coverageRate: roundRatio(scoredWords.filter((word) => word.attempted).length, targetDenominator),
    clearRate: roundRatio(clearedWords.length, targetDenominator),
    attemptsPerClearedWord: roundRatio(clearedAttempts, clearedWords.length),
    totalAttempts,
    totalCorrect,
    words: allWords,
    stuckCardRuns,
    maxStuckRunLength: stuckCardRuns.reduce((max, run) => Math.max(max, run.length), 0),
  };
}

function buildAgentBehavior(
  interactions: ReportData['interactions'],
  wordCards: CourseWord[],
  clearRate: number,
): EvalScorecard['agentBehavior'] {
  const wordCardsById = new Map(wordCards.map((card) => [card.id, card]));
  const speechCardMismatches: EvalScorecard['agentBehavior']['speechCardMismatches'] = [];
  const prematureClosingTurns: number[] = [];
  const emptyAiResponseTurns: number[] = [];
  const emptyActionTurns: number[] = [];

  for (const interaction of interactions) {
    const ai = interaction.ai.trim();
    const actions = asActionArray(interaction.actions);
    if (!ai) emptyAiResponseTurns.push(interaction.n);
    if (actions.length === 0) emptyActionTurns.push(interaction.n);
    if (clearRate < 1 && containsClosingPhrase(ai)) prematureClosingTurns.push(interaction.n);

    const shown = getLastWordShowCardId(actions, wordCardsById);
    if (!shown || !ai) continue;
    const shownCard = wordCardsById.get(shown);
    if (!shownCard) continue;
    const mentionsShown = speechMentionsCard(ai, shownCard);
    const mentionedOther = wordCards.find((card) => card.id !== shown && speechMentionsCard(ai, card));
    if (!mentionsShown && mentionedOther) {
      speechCardMismatches.push({
        turn: interaction.n,
        showCardId: shown,
        mentionedOtherCardId: mentionedOther.id,
      });
    }
  }

  const repeatedSpeechRuns = findRepeatedSpeechRuns(interactions);
  return {
    speechCardMismatchCount: speechCardMismatches.length,
    speechCardMismatches,
    prematureClosingCount: prematureClosingTurns.length,
    prematureClosingTurns,
    emptyAiResponseTurns,
    emptyActionTurns,
    repeatedSpeechRuns,
    maxRepeatedSpeechRunLength: repeatedSpeechRuns.reduce((max, run) => Math.max(max, run.length), 0),
  };
}

function buildNextIterationSignals(evalParts: {
  sessionHealth: EvalScorecard['sessionHealth'];
  costContext: EvalScorecard['costContext'];
  teachingLoop: EvalScorecard['teachingLoop'];
  agentBehavior: EvalScorecard['agentBehavior'];
}): EvalScorecard['nextIterationSignals'] {
  const { sessionHealth, costContext, teachingLoop, agentBehavior } = evalParts;
  const signals: EvalScorecard['nextIterationSignals'] = [];
  if (sessionHealth.tokensCorrupted) {
    signals.push(signal('token_data_integrity', 'critical', 'token_usage JSON is corrupted', 'tokensCorrupted', true));
  }
  if (!sessionHealth.providerUsageTracked.asr || !sessionHealth.providerUsageTracked.tts) {
    signals.push(signal('provider_tracking', 'warn', 'ASR or TTS usage is not tracked for this session', 'providerUsageTracked', `${sessionHealth.providerUsageTracked.asr}/${sessionHealth.providerUsageTracked.tts}`));
  }
  if (costContext.highAvgInput) {
    signals.push(signal('prompt_input_slimming', 'warn', 'Average LLM input per round is above the current 1000-token threshold', 'avgInputPerRound', costContext.avgInputPerRound));
  }
  if (costContext.llmRequests > 0 && costContext.promptBreakdownCoverageRate < 1) {
    signals.push(signal('prompt_breakdown_missing', 'info', 'Some LLM turns do not have prompt input breakdown data', 'promptBreakdownCoverageRate', costContext.promptBreakdownCoverageRate));
  }
  if (teachingLoop.targetWordCount > 0 && teachingLoop.coverageRate < 1) {
    signals.push(signal('coverage_gap', 'warn', 'Not all target words were attempted in this session', 'coverageRate', teachingLoop.coverageRate));
  }
  if (teachingLoop.targetWordCount > 0 && teachingLoop.clearRate < 0.8) {
    signals.push(signal('clear_rate_low', 'warn', 'Fewer than 80% of target words reached the two-hit cleared threshold', 'clearRate', teachingLoop.clearRate));
  }
  if (teachingLoop.maxStuckRunLength >= 3) {
    signals.push(signal('teaching_loop_stuck', 'warn', 'A word card stayed active for at least 3 consecutive turns', 'maxStuckRunLength', teachingLoop.maxStuckRunLength));
  }
  if (teachingLoop.needsReviewWordCount > 0) {
    signals.push(signal('needs_review', 'info', 'At least one word ended with needs_review data', 'needsReviewWordCount', teachingLoop.needsReviewWordCount));
  }
  if (agentBehavior.speechCardMismatchCount > 0) {
    signals.push(signal('speech_card_alignment', 'critical', 'Teacher speech mentioned a different target word than the final show_card', 'speechCardMismatchCount', agentBehavior.speechCardMismatchCount));
  }
  if (agentBehavior.prematureClosingCount > 0) {
    signals.push(signal('premature_closing', 'warn', 'Closing phrases appeared before all target words were cleared', 'prematureClosingCount', agentBehavior.prematureClosingCount));
  }
  if (agentBehavior.emptyAiResponseTurns.length > 0) {
    signals.push(signal('empty_ai_response', 'info', 'Some logged turns have no assistant speech', 'emptyAiResponseTurns', agentBehavior.emptyAiResponseTurns.length));
  }
  if (agentBehavior.maxRepeatedSpeechRunLength >= 3) {
    signals.push(signal('repeated_speech', 'warn', 'Assistant speech repeated exactly for at least 3 consecutive turns', 'maxRepeatedSpeechRunLength', agentBehavior.maxRepeatedSpeechRunLength));
  }
  return signals;
}

function signal(
  key: string,
  severity: 'info' | 'warn' | 'critical',
  reason: string,
  metric: string,
  value: string | number | boolean,
): EvalScorecard['nextIterationSignals'][number] {
  return { key, severity, reason, metric, value };
}

function findStuckCardRuns(
  interactions: ReportData['interactions'],
  wordCards: CourseWord[],
): EvalScorecard['teachingLoop']['stuckCardRuns'] {
  const wordCardsById = new Map(wordCards.map((card) => [card.id, card]));
  const runs: EvalScorecard['teachingLoop']['stuckCardRuns'] = [];
  let currentCardId = '';
  let startTurn = 0;
  let length = 0;

  const flush = (endTurn: number) => {
    if (currentCardId && length >= 3) {
      runs.push({ cardId: currentCardId, startTurn, endTurn, length });
    }
  };

  for (const interaction of interactions) {
    const cardId = getLastWordShowCardId(asActionArray(interaction.actions), wordCardsById);
    if (!cardId) {
      flush(interaction.n - 1);
      currentCardId = '';
      startTurn = 0;
      length = 0;
      continue;
    }
    if (cardId === currentCardId) {
      length += 1;
      continue;
    }
    flush(interaction.n - 1);
    currentCardId = cardId;
    startTurn = interaction.n;
    length = 1;
  }
  flush(interactions[interactions.length - 1]?.n ?? 0);
  return runs;
}

function findRepeatedSpeechRuns(
  interactions: ReportData['interactions'],
): EvalScorecard['agentBehavior']['repeatedSpeechRuns'] {
  const runs: EvalScorecard['agentBehavior']['repeatedSpeechRuns'] = [];
  let current = '';
  let sample = '';
  let startTurn = 0;
  let length = 0;

  const flush = (endTurn: number) => {
    if (current && length >= 2) {
      runs.push({ startTurn, endTurn, length, sample });
    }
  };

  for (const interaction of interactions) {
    const normalized = normalizeSpeech(interaction.ai);
    if (!normalized) {
      flush(interaction.n - 1);
      current = '';
      sample = '';
      startTurn = 0;
      length = 0;
      continue;
    }
    if (normalized === current) {
      length += 1;
      continue;
    }
    flush(interaction.n - 1);
    current = normalized;
    sample = interaction.ai.trim().slice(0, 160);
    startTurn = interaction.n;
    length = 1;
  }
  flush(interactions[interactions.length - 1]?.n ?? 0);
  return runs;
}

function asActionArray(actions: unknown[]): Array<{ tool?: string; params?: { card_id?: string } }> {
  return actions.filter((action): action is { tool?: string; params?: { card_id?: string } } => {
    return !!action && typeof action === 'object';
  });
}

function getLastWordShowCardId(
  actions: Array<{ tool?: string; params?: { card_id?: string } }>,
  wordCardsById: Map<string, CourseWord>,
): string {
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    const cardId = action.tool === 'show_card' ? action.params?.card_id ?? '' : '';
    if (wordCardsById.has(cardId)) return cardId;
  }
  return '';
}

function containsClosingPhrase(speech: string): boolean {
  return [
    /下次再来/,
    /下次我们/,
    /今天我们一起/,
    /今天.*学了/,
    /\bsee you next time\b/i,
    /\bthat'?s all\b/i,
  ].some((pattern) => pattern.test(speech));
}

function speechMentionsCard(speech: string, card: CourseWord): boolean {
  const english = card.english.trim();
  const chinese = card.chinese.trim();
  const lower = speech.toLowerCase();
  return Boolean(
    (english && new RegExp(`\\b${escapeRegExp(english)}\\b`, 'i').test(speech))
    || (english && lower.includes(english.toLowerCase()))
    || (chinese && speech.includes(chinese))
  );
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

function normalizeSpeech(speech: string): string {
  return speech.trim().replace(/\s+/g, ' ').toLowerCase();
}

function roundRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ParsedUsage {
  llm: { requests: number; inputTokens: number; outputTokens: number };
  asr: { requests: number };
  tts: { requests: number };
  corrupted: boolean;
}

function parseTokenUsage(raw: string): ParsedUsage {
  const empty: ParsedUsage = {
    llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
    asr: { requests: 0 },
    tts: { requests: 0 },
    corrupted: false,
  };
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, number>>;
    return {
      llm: {
        requests: parsed.llm?.requests ?? 0,
        inputTokens: parsed.llm?.inputTokens ?? 0,
        outputTokens: parsed.llm?.outputTokens ?? 0,
      },
      asr: { requests: parsed.asr?.requests ?? 0 },
      tts: { requests: parsed.tts?.requests ?? 0 },
      corrupted: false,
    };
  } catch {
    return { ...empty, corrupted: true };
  }
}

export const defaultCourseLoader: CourseLoader = async (courseId) => {
  const course = getCourseById(courseId);
  if (!course) return null;
  const wordCards = course.cards.filter((card: WordCard) => card.kind === 'word');
  return {
    title: course.title,
    words: wordCards.map((card: WordCard) => card.english),
    wordCards: wordCards.map((card: WordCard) => ({
      id: card.id,
      english: card.english,
      chinese: card.chinese,
    })),
  };
};

async function main(): Promise<void> {
  const sessionId = process.argv[2] ?? null;
  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './db/eduagent.db');

  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`DB 不存在:${dbPath}。先跑过 dev server 让其初始化数据库。\n`);
    process.exit(1);
  }

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  try {
    const data = await buildReport(db, sessionId, defaultCourseLoader);
    process.stdout.write(JSON.stringify(data, null, 2));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('session not found')) {
      process.stderr.write(`${err.message}\n\n最近 5 节课:\n`);
      const recent = db.prepare(
        'SELECT id, course_id, start_time FROM lesson_logs ORDER BY start_time DESC LIMIT 5'
      ).all() as Array<{ id: string; course_id: string; start_time: string }>;
      recent.forEach((r) => process.stderr.write(`  ${r.id}  ${r.course_id}  ${r.start_time}\n`));
      process.exit(1);
    }
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  } finally {
    db.close();
  }
}

const isMain = process.argv[1]?.endsWith('lesson-report-data.ts');
if (isMain) {
  void main();
}
