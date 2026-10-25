'use client';

import Image from 'next/image';
import maji from '../../../desktop/build-resources/icon-source.png';
import type { CourseProgress, SessionSummary } from '@/types/progress';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Tag } from '@/components/ui/Tag';
import { WordMastery } from '@/components/records/WordMastery';
import '@/components/records/records.css';
import './done.css';

interface DoneCelebrateFrameProps {
  course: CourseProgress;
  session?: SessionSummary;
  next?: CourseProgress;
  onHome: () => void;
  onAgain: () => void;
  onNext: () => void;
}

export function DoneCelebrateFrame({ course, session, next, onHome, onAgain, onNext }: DoneCelebrateFrameProps) {
  const learned = course.words.filter(word => word.masteryStars >= 2).length;
  const remaining = course.totalWords - learned;
  const nextLearned = next?.words.filter(word => word.masteryStars >= 2).length ?? 0;
  const title = course.courseTitle.split(/\s+[A-Za-z]/)[0];
  const duration = session ? `用时 ${Math.round(session.durationMs / 60000)} 分钟` : '';
  const later = remaining > 0 ? `还有 ${remaining} 个词下次再练` : '';

  return (
    <div className="done-page">
      <section className="done-left">
        <header className="done-heading">
          <Image src={maji} alt="麻吉" width={88} height={88} />
          <div>
            <Tag tone="mint">课堂完成</Tag>
            <h1>{title}课,{remaining === 0 ? `${learned} 个词全部过关` : `过关 ${learned} 个词`}</h1>
            <p>
              {duration}
              {duration && later && ' · '}
              {later}
            </p>
          </div>
        </header>
        <div className="done-table">
          {course.words.map(word => <WordMastery key={word.word} word={word} />)}
        </div>
      </section>
      <aside className="done-right">
        <section className="done-kpi">
          <span>今天学会</span>
          <div>{learned}<small>个词</small></div>
          <ProgressBar value={learned / course.totalWords * 100} label="本课学会单词" />
        </section>
        {next ? (
          <section className="done-next">
            <span>建议下一课</span>
            <div className="done-next-title">
              {next.words[0]?.imageUrl && <Image src={next.words[0].imageUrl} width={72} height={72} alt="" />}
              <div>
                <b>{next.courseTitle}</b>
                <small>已会 {nextLearned} 个 · 还剩 {next.totalWords - nextLearned} 个</small>
              </div>
            </div>
            <div className="done-preview">
              {next.words.filter(word => word.masteryStars < 2).slice(0, 4).map(word => (
                word.imageUrl && <Image key={word.word} src={word.imageUrl} width={160} height={160} alt={word.word} />
              ))}
            </div>
            <Button size="lg" onClick={onNext}>开始下一课</Button>
          </section>
        ) : (
          <section className="done-next">
            <p>暂无建议的下一课</p>
          </section>
        )}
        <div className="done-actions">
          <Button variant="glass" onClick={onAgain}>再上一遍</Button>
          <Button variant="glass" onClick={onHome}>回到课程</Button>
        </div>
      </aside>
    </div>
  );
}

export function suggestedCourse(courses: CourseProgress[], currentId: string) {
  const other = courses.filter(course => course.courseId !== currentId && course.words.some(word => word.masteryStars < 2));
  return other.find(course => course.hasResume) ?? other.find(course => course.timesStarted === 0);
}
