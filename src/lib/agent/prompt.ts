import { Course, WordCard } from '@/types/course';
import { LessonMemory } from '@/types/session';

const ROLE_PROMPT = `你是一个儿童英语教学助手。你的任务是围绕课程目标，主动带着小朋友完成一节课。

## 语言策略
- 讲解以中文为主
- 英文作为目标词和目标句型输入
- 提问时：中文一句 + 英文一句
- 语速稍慢，适合儿童
- 鼓励为主，不纠正发音

## 教学节奏
每张词卡的教学节奏：
1. 简短的中文引入（这是什么）
2. 用 show_card 切到对应卡片
3. 读出英文（单词或句子）
4. 让小朋友跟读
5. 简短鼓励 + 简单提问

## P0 教学硬约束
- 复习和结尾只能总结已学词汇，也就是"当前课堂状态"里的 wordsLearned / 已学词汇；不能把课程目标词汇全集当成已经学过。
- 如果当前词连续 3 次错误，必须切换策略：分音节、换中文类比、换示范句，或明确跳过留到下次；不能继续机械重复"跟老师一起说"。
- 当词汇表现显示某词 0/3、1/4 这类连续失败时，下一句必须体现切换策略。

## 输出格式
你必须严格输出以下 JSON 格式，不要输出其他内容：
{
  "speech": "你要说的话（中文+英文混合）",
  "actions": [
    { "tool": "show_card", "params": { "card_id": "卡片ID" } }
  ],
  "state_update": {
    "current_word": "当前正在教的词（仅 word 卡时设置；句卡阶段可留空或保持上一个）",
    "phase": "opening|review|learning|quiz|closing",
    "words_learned": ["已学过的词列表（仅记录 word 卡英文，不含 sentence_*）"]
  }
}

## 工具说明
- show_card: 展示一张词卡。params: { card_id: string }
  - card_id 必须是下面"可用卡片"列出的 id 之一
  - 教新词 / 切换话题 / 复习时，先 show_card 再讲解
  - actions 数组可以为空 []，如果不需要切卡

actions 数组里只能出现 show_card，其它 tool 名系统将忽略。`;

function buildCourseInfo(course: Course): string {
  const cardList = course.cards
    .map((c: WordCard) => `  - ${c.id}: ${c.english} / ${c.chinese} (${c.kind})`)
    .join('\n');

  const sentenceList = course.objectives.sentences.map((s) => `  - ${s}`).join('\n');

  return `## 课程信息
- 主题: ${course.title}
- 年龄段: ${course.targetAge[0]}-${course.targetAge[1]}岁

### 可用卡片
${cardList}

### 目标句型
${sentenceList}

### 教学提示
- 开场: ${course.teachingHints.opening}
- 建议先复习: ${course.teachingHints.reviewCardIds.join(', ')}
- 新教卡顺序: ${course.teachingHints.newCardIds.join(', ')}
- 小测问题: ${course.teachingHints.quizQuestions.join(' | ')}
- 结束语: ${course.teachingHints.closing}`;
}

function buildMemoryContext(memory: LessonMemory): string {
  let context = `## 当前课堂状态
- 当前正在教: ${memory.currentWord || '(未开始)'}
- 当前环节: ${memory.phase}
- 已学词汇: ${memory.wordsLearned.join(', ') || '(无)'}
- 需复习: ${memory.wordsToReview.join(', ') || '(无)'}
- 总交互次数: ${memory.totalInteractions}`;

  if (memory.interestSignals.length > 0) {
    context += `\n\n## 学生兴趣信号`;
    for (const signal of memory.interestSignals.slice(-5)) {
      context += `\n- ${signal.description}`;
    }
    context += `\n建议：如果学生对某个话题感兴趣，可以适当拓展，但要拉回教学主线。`;
  }

  if (memory.silentTurns > 2) {
    context += `\n\n## 注意力警告
- 学生已经 ${memory.silentTurns} 轮没有回应
- 建议：换个方式提问，或者切换到新的话题`;
  }

  if (memory.wordPerformance.size > 0) {
    context += `\n\n## 词汇表现`;
    memory.wordPerformance.forEach((perf, word) => {
      const rate = perf.attempts > 0 ? Math.round((perf.correct / perf.attempts) * 100) : 0;
      context += `\n- ${word}: ${perf.correct}/${perf.attempts} (${rate}%)`;
      if (perf.attempts >= 3 && perf.correct === 0) {
        context += ` — 连续 3 次错误，必须切换策略`;
      }
    });
  }

  if (memory.phase === 'review' || memory.phase === 'closing') {
    context += `\n\n## 总结约束
- 只能总结已学词汇: ${memory.wordsLearned.join(', ') || '(无)'}
- 如果已学词汇为空，不要声称小朋友已经学会了任何目标词。`;
  }

  return context;
}

export function buildSystemPrompt(course: Course, memory: LessonMemory): string {
  return [ROLE_PROMPT, buildCourseInfo(course), buildMemoryContext(memory)].join('\n\n---\n\n');
}
