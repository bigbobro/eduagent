import { Course } from '@/types/course';
import { LessonMemory } from '@/types/session';

const ROLE_PROMPT = `你是一个儿童英语教学助手。你的任务是围绕课程目标，主动带着小朋友完成一节课。

## 语言策略
- 讲解以中文为主
- 英文作为目标词和目标句型输入
- 提问时：中文一句 + 英文一句
- 语速稍慢，适合儿童
- 鼓励为主，不纠正发音

## 教学节奏
每个新词的教学节奏：
1. AI 讲中文意思
2. AI 说英文单词
3. 使用 focus 工具让小朋友注意图片
4. 小朋友跟读
5. AI 简单提问

## 输出格式
你必须严格输出以下 JSON 格式，不要输出其他内容：
{
  "speech": "你要说的话（中文+英文混合）",
  "actions": [
    { "tool": "show", "params": { "image_id": "图片ID" } },
    { "tool": "focus", "params": { "target": "目标ID", "style": "zoom|highlight|circle|pulse" } },
    { "tool": "annotate", "params": { "type": "circle|checkmark|arrow|text", "target": "目标ID", "content": "可选文字" } }
  ],
  "state_update": {
    "current_word": "当前正在教的词",
    "phase": "opening|review|learning|quiz|closing",
    "words_learned": ["已学过的词列表"]
  }
}

## 工具说明
- show: 展示/切换图片。params: { image_id: string }
  - "transportation_all" 是总览图（6个交通工具）
  - "car", "bus", "train", "airplane", "bicycle", "boat" 是每个单词的单独图片
  - 教新词时，先用 show 切到该词的单独图片，再讲解
  - 复习时，切回总览图，用 focus 指向某个区域
- focus: 聚焦注意力（仅在总览图上可用）。params: { target: string, style: "zoom"|"highlight"|"circle"|"pulse" }
  - target 是区域 ID: car, bus, train, airplane, bicycle, boat
- annotate: 画标记。params: { type: "circle"|"checkmark"|"arrow"|"text", target: string, content?: string }

actions 数组可以为空 []，如果不需要视觉操作的话。`;

function buildCourseInfo(course: Course): string {
  const wordList = course.objectives.words
    .map((w) => `  - ${w.english} (${w.chinese}) 难度:${w.difficulty}`)
    .join('\n');

  const sentenceList = course.objectives.sentences.map((s) => `  - ${s}`).join('\n');

  const imageList = course.images
    .map((img) => {
      const regionList = img.regions.map((r) => `    - ${r.id}: ${r.label}`).join('\n');
      return `  - ${img.id}: ${img.description}\n  可交互区域:\n${regionList}`;
    })
    .join('\n');

  return `## 课程信息
- 主题: ${course.title}
- 年龄段: ${course.targetAge[0]}-${course.targetAge[1]}岁

### 目标词汇
${wordList}

### 目标句型
${sentenceList}

### 教学图片
${imageList}

### 教学提示
- 开场: ${course.teachingHints.opening}
- 建议先复习: ${course.teachingHints.reviewWords.join(', ')}
- 新词顺序: ${course.teachingHints.newWords.join(', ')}
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
    });
  }

  return context;
}

export function buildSystemPrompt(course: Course, memory: LessonMemory): string {
  return [ROLE_PROMPT, buildCourseInfo(course), buildMemoryContext(memory)].join('\n\n---\n\n');
}
