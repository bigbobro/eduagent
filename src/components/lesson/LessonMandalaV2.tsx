'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Course } from '@/types/course';
import type { ToolAction } from '@/types/tools';
import type { AnswerResult, Classroom, LessonStateName, SoundCue } from '@/lib/voice/classroom';
import { LessonCard } from './LessonCard';
import { PushToTalkPill } from '@/components/ui/PushToTalkPill';
import { talkState } from './talkState';
import { ConversationDock } from './ConversationDock';
import { BattleStage } from './battle/BattleStage';
import type { BattleState } from './battle/battle-state';

interface LessonMandalaV2Props {
  course: Course;
  controller: Classroom;
  // R1 (2026-07-20 session persistence): position on the breakpoint card / cleared set for a
  // resumed session instead of the first word card and an empty cleared set. Undefined/omitted
  // for a fresh (non-resumed) lesson — falls back to today's default.
  initialCardId?: string;
  initialClearedCardIds?: string[];
  /** Word battle (conversation classroom only): true once the sitting's closing recall game starts; the view then becomes the battle scene. */
  battle?: boolean;
  /** Collection when this view mounts; kept current from progress until the battle starts. */
  initialCollectedCardIds?: string[];
  onBattleChange?: (battle: BattleState) => void;
}

interface ProgressSnapshot {
  clearedCardIds: string[];
  totalAttempts: number;
  collectedCardIds?: string[];
}

export function LessonMandalaV2({ course, controller, initialCardId, initialClearedCardIds, battle, initialCollectedCardIds, onBattleChange }: LessonMandalaV2Props) {
  const cards = useMemo(() => course.cards, [course.cards]);
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const [state, setState] = useState<LessonStateName>(controller.getState());
  const [currentCardId, setCurrentCardId] = useState(initialCardId || wordCards[0]?.id || '');
  const [clearedCardIds, setClearedCardIds] = useState<Set<string>>(() => new Set(initialClearedCardIds));
  const showableCardIds = useMemo(() => new Set(cards.map((card) => card.id)), [cards]);
  const [answers, setAnswers] = useState<AnswerResult[]>([]);
  const collected = useRef(initialCollectedCardIds ?? []);
  // Snapshot taken when the battle starts: what the child owned, which of today's words the monster snatches, and where the battle's answers begin.
  const [fight, setFight] = useState<{ collected: string[]; stolen: string[]; from: number } | null>(null);
  // Realtime word-card sounds: the latest cue per card and the card a sound quiz hides (the controller decides both).
  const [cues, setCues] = useState<Record<string, SoundCue['status']>>({});
  const [hiddenCardId, setHiddenCardId] = useState('');

  useEffect(() => {
    const onState = (next: LessonStateName) => setState(next);
    const onProgress = (next: ProgressSnapshot) => {
      const cleared = new Set(next.clearedCardIds);
      setClearedCardIds(cleared);
      if (next.collectedCardIds) collected.current = next.collectedCardIds;
    };
    const onActions = (actions: ToolAction[]) => {
      for (let i = actions.length - 1; i >= 0; i--) {
        const cardId = actions[i].params.card_id;
        if (actions[i].tool === 'show_card' && showableCardIds.has(cardId)) {
          setCurrentCardId(cardId);
          break;
        }
      }
    };
    controller.on('state', onState);
    controller.on('progress', onProgress);
    controller.on('actions', onActions);
    const onAnswer = (answer: AnswerResult) => setAnswers((all) => [...all, answer]);
    controller.on('answer-result', onAnswer);
    const onCue = (cue: SoundCue) => setCues((all) => ({ ...all, [cue.cardId]: cue.status }));
    const onHidden = ({ cardId, hidden }: { cardId: string; hidden: boolean }) => setHiddenCardId((current) => hidden ? cardId : current === cardId ? '' : current);
    controller.on('sound-cue', onCue);
    controller.on('word-hidden', onHidden);
    return () => {
      controller.off('sound-cue', onCue);
      controller.off('word-hidden', onHidden);
      controller.off('answer-result', onAnswer);
      controller.off('state', onState);
      controller.off('progress', onProgress);
      controller.off('actions', onActions);
    };
  }, [controller, showableCardIds]);

  const currentCard = useMemo(
    () => cards.find((card) => card.id === currentCardId) ?? wordCards[0],
    [cards, currentCardId, wordCards],
  );
  // Report the card after React committed it, so conversation speech binds to what the child actually saw.
  useEffect(() => { if (currentCard) controller.presented?.({ kind: 'card', id: currentCard.id }); }, [controller, currentCard]);
  const conversation = controller.interaction === 'conversation';
  const fighting = Boolean(battle) && conversation;
  useEffect(() => {
    if (!fighting) { setFight(null); return; }
    setFight((current) => {
      if (current) return current;
      const wordIds = new Set(wordCards.map((card) => card.id));
      const stolen = Array.from(new Set(answers.filter((answer) => answer.via === 'voice' && !answer.quizId && wordIds.has(answer.cardId)).map((answer) => answer.cardId)));
      return { collected: collected.current, stolen, from: answers.length };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a snapshot at the moment the battle starts
  }, [fighting]);
  const battleAnswers = useMemo(() => fight ? answers.slice(fight.from) : [], [answers, fight]);
  const canAskTeacher = state === 'awaiting';
  const cardState = state === 'listening'
    ? 'recording'
    : currentCard && clearedCardIds.has(currentCard.id)
      ? 'correct'
      : 'listening';
  if (!currentCard) return null;

  const handleTeacherRepeat = () => {
    if (!canAskTeacher) return;
    void controller.repeatCard(currentCard.id);
  };
  const soundCue = cues[currentCard.id];
  const cueing = Object.values(cues).some((status) => status !== 'done');
  const canReplay = conversation && Boolean(currentCard.soundUrl) && Boolean(controller.replaySound);

  if (fight) return <BattleStage course={course} card={currentCard} cardState={cardState} answers={battleAnswers} initialCollectedCardIds={fight.collected} stolenCardIds={fight.stolen}
    paused={state === 'paused'} onRepeat={handleTeacherRepeat} repeatDisabled={!canAskTeacher} onBattleChange={onBattleChange}
    dock={<ConversationDock state={state} cue={cueing} onPause={(paused) => { void controller.setPaused?.(paused); }} />} />;

  return <section className="p2-stage">
    <LessonCard card={currentCard} state={cardState} onRepeat={handleTeacherRepeat} repeatDisabled={!canAskTeacher}
      hideEnglish={hiddenCardId === currentCard.id} soundCue={soundCue}
      onReplaySound={canReplay ? () => controller.replaySound?.(currentCard.id) : undefined} replaySoundDisabled={cueing || state === 'paused'} />
    <div className="p2-dock">{conversation
      ? <ConversationDock state={state} cue={cueing} onPause={(paused) => { void controller.setPaused?.(paused); }} />
      : <PushToTalkPill state={talkState(state)} onPress={() => controller.startListening()} onRelease={() => controller.stopListening()} />}</div>
  </section>;
}
