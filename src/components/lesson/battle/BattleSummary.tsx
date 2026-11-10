'use client';

import Image from 'next/image';
import type { Course } from '@/types/course';
import type { Monster, Teammate } from './battle-state';
import { MonsterImage, monsterOf } from './monsters';

interface BattleSummaryProps {
  course: Course;
  collectedCardIds: string[];
  /** Monsters tamed in the sitting that just ended. */
  team?: Teammate[];
  /** The monster still on stage when the sitting ended: it comes back first next time. */
  escaped?: Monster;
  /** One slim row for a page that already lists the words (the course-done page). */
  compact?: boolean;
}

/** What the child keeps after a sitting or a finished course: the collection, today's new friends, and who to catch next. */
export function BattleSummary({ course, collectedCardIds, team = [], escaped, compact }: BattleSummaryProps) {
  const words = course.cards.filter((card) => card.kind === 'word');
  const have = new Set(collectedCardIds); const count = words.filter((word) => have.has(word.id)).length;
  const full = count === words.length;
  return <section className={compact ? 'bt-summary bt-summary-compact' : 'bt-summary'} aria-label="单词大战成果" data-battle-summary={count}>
    <h2>{full ? `收藏册收满啦！${words.length} 张卡全部救回` : `收藏册 ${count} / ${words.length}`}</h2>
    <div className="bt-summary-grid">{words.map((word) => <span key={word.id} data-collected={have.has(word.id) || undefined}>
      {have.has(word.id) && <Image src={word.imageUrl} alt={word.chinese} width={56} height={56} unoptimized />}
    </span>)}</div>
    {(team.length > 0 || (escaped && !full)) && <div className="bt-summary-row">
      {team.length > 0 && <div><div className="bt-summary-team">{team.map((mate, i) => <MonsterImage key={i} monster={mate} pose="friend" />)}</div><p>今天收服了 {team.length} 只</p></div>}
      {escaped && !full && <div className="bt-summary-next"><span><MonsterImage monster={escaped} pose="idle" /></span>{monsterOf(escaped.kind).name}跑掉了，下次再来抓它</div>}
    </div>}
  </section>;
}
