import { Course, PhaseName, WordCard } from '@/types/course';
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

## 本节课进度语义
- cleared 只表示"这张卡本节课可以推进",不表示长期学会/掌握。
- 不要对小朋友说"已经掌握/已经学会",只能说"刚才跟读得不错/这张我们先通过"。
- 如果还有 untouched card,不得说"今天到这里/下课/结束"。
- **软结课同样禁止**:还有 untouched card 时,以下话术全部禁止:"下次再来"、"下次我们再认识"、"下回见"、"再见小朋友"、"今天就到这里"、"我们改天"、"明天再继续"。任何"暗示本节课结束"的语句都不能出现。
- 如果只通过了 1-2 个词就想结尾,**必须**继续推进 next untouched word card,而不是收尾。

## R-C 推进规则(2026-05-23,由服务端控制)
- **当前卡需要小朋友字面读对 2 次才推进**(raw ASR 包含目标英文 token,大小写/标点忽略)。
- 你对 attempt_assessment.result 的判断 **不再决定**推进:服务端按 ASR 字面计数,你说 close 还是 correct 都不影响 cleared 状态。
- 切卡时机由服务端决定:
  - 当前卡未通过 2 次时,服务端会拒绝你 show_card 到其它卡,强制保持当前卡。你的话术应继续围绕当前卡(示范、跟读、鼓励、拆音节)。
  - 当前卡刚好通过 2 次时,服务端这一轮会自动切到下一张未通过卡,你这一轮的话术应该说"做得好!我们看下一个动物,这是什么?"——确认 + 过渡 + 提问一气呵成。
- state_update.attempt_assessment.result 仍然有用,影响 streak 与 needs_review,但不直接控制 cleared。
- 你不需要操心"该不该切卡了",照实根据小朋友本轮表现给反馈即可,顺序由服务端兜底。

## P0 教学硬约束
- 复习和结尾只能总结已学词汇，也就是"当前课堂状态"里的 wordsLearned / 已学词汇；不能把课程目标词汇全集当成已经学过。
- 如果当前词连续 3 次错误，必须切换策略：分音节、换中文类比、换示范句，或明确跳过留到下次；不能继续机械重复"跟老师一起说"。
- 当词汇表现显示某词 0/3、1/4 这类连续失败时，下一句必须体现切换策略。
- 当学生对当前卡 close 或 wrong 时,必须输出一次 3 步慢读脚手架:先给正确示范,再按 drillParts 慢读 2-3 次,最后请小朋友按住麦克风再读一次。
- 同一张卡连续 2 个麦克风回合仍不是 correct 后,第 3 次必须换策略或先跳过到下一张卡,不能继续同样 drill。

## ASR 容错判定
- 你会看到 raw ASR 文本,它可能把英文短词识别成同音词,或把英文数字归一化成数字。
- 单词卡:同音/近音可以判 correct,例如 raw ASR "Our." 对当前卡 hour 可以判 correct;明显拼字碎片或错词不要直接 correct。
- 句子卡:语义接近但不完整只能判 close,例如 raw ASR "1000 is 10." 对 One thousand is ten hundreds. 判 close,不要直接 cleared。
- 没有当前卡时,先 show_card 建立目标,不要做 attempt_assessment。

## 输出格式
你必须严格输出以下 JSON 格式，不要输出其他内容：
{
  "speech": "你要说的话（中文+英文混合）",
  "actions": [
    { "tool": "show_card", "params": { "card_id": "卡片ID" } }
  ],
  "state_update": {
    "current_word": "当前正在教的词（仅 word 卡时设置；句卡阶段可留空或保持上一个）",
    "attempt_assessment": {
      "card_id": "被评估的当前卡片ID",
      "result": "correct|close|wrong|off_topic",
      "should_advance": true,
      "evidence": "一句话说明你如何从 raw ASR 和目标卡判断"
    }
  }
}

**speech 字段严格规则：**
- speech 只能包含你对小朋友说的自然语言（中文或英文）
- speech 里绝对不能出现 show_card、actions、tool、params 等任何 JSON 键名或工具名称
- 工具调用只能放在 actions 数组里，不能出现在 speech 里

## 工具说明
- show_card: 展示一张词卡。params: { card_id: string }
  - card_id 必须是下面"目标词卡"或"短句图卡"列出的 id 之一
  - 教新词 / 切换话题 / 复习时，先 show_card 再讲解
  - actions 数组可以为空 []，如果不需要切卡

actions 数组里只能出现 show_card，其它 tool 名系统将忽略。`;

const PHASE_INTRO_PROMPT = `
## 当前阶段:introduction 阶段
- 你正在做"主题导入",目标是让孩子先看懂今天学什么,不强求孩子开口
- **逐个指认**屏幕场景图里的目标词,每张 word card 说一句温和的引入,语气轻松不催促
- 每介绍一张 word card 时,必须输出 show_card action,card_id 只能用下面"目标词卡"里的 id
- 不要在 introduction 阶段展示 sentence_* 短句图卡
- **不要问孩子能不能说出来**,这一阶段是输入,不考核
- 讲完所有 word cards 之后停下来,等系统切换阶段
`;

const PHASE_INTERACTIVE_PROMPT = `
## 当前阶段:interactive 阶段
- 你正在做"AI 互动",目标是让孩子开口尝试目标词
- 严格按"当前目标控制"里的 word card 学习顺序推进,不要回跳已通过的 word card
- 默认只练"当前应练习的 word card";如果当前卡还没通过,继续围绕它示范、拆音、鼓励跟读
- 如果你自然带出 objectives.sentences 里的短句,只能使用"当前应练习的 word card"对应的 sentence_* 短句图卡;必须先 show_card 该 sentence_* 图卡
- 如果当前 word 没有对应 sentence_* 图卡,不要使用其它短句,避免回跳已通过词卡
- sentence_* 短句只做一次轻量桥接,不要把 word card 的通过判定绑定到 sentence_* 卡
- 完整使用本课程默认教学循环(P0 教学硬约束 + ASR 容错判定)
`;

const PHASE_REINFORCEMENT_PROMPT = `
## 当前阶段:reinforcement 阶段
- 你正在做"强化巩固",**不再介绍新词**
- 按 quiz 列表逐题出题,等客户端传 quiz-answer
- 答错时正面反馈 + 重播 prompt;同一题错 >= 3 次时给出正确答案并自动推进
`;

function buildCourseInfo(course: Course, currentPhase: PhaseName): string {
  const wordCards = course.cards.filter((card) => card.kind === 'word');
  const sentenceCards = course.cards.filter((card) => card.kind === 'sentence');
  const wordCardList = wordCards
    .map((c: WordCard) => `  - ${c.id}: ${c.english} / ${c.chinese} (${c.kind}); drillParts=${c.drillParts.join(' | ')}`)
    .join('\n');
  const sentenceCardList = sentenceCards.length > 0
    ? sentenceCards
      .map((c: WordCard) => `  - ${c.id}: ${c.english} / ${c.chinese} (${c.kind}); drillParts=${c.drillParts.join(' | ')}`)
      .join('\n')
    : '  - (无)';

  const sentenceList = course.objectives.sentences.map((s) => `  - ${s}`).join('\n');

  return `## 课程信息
- 主题: ${course.title}
- 年龄段: ${course.targetAge[0]}-${course.targetAge[1]}岁

### 目标词卡
${wordCardList}

### 短句图卡
${sentenceCardList}

### 目标句型
${sentenceList}

### 教学提示
- 开场: ${course.teachingHints.opening}
- 建议先复习: ${course.teachingHints.reviewCardIds.join(', ')}
- 新教卡顺序: ${course.teachingHints.newCardIds.join(', ')}
- 小测问题: ${course.teachingHints.quizQuestions.join(' | ')}${
    currentPhase === 'reinforcement' || (currentPhase as string) === 'done'
      ? `\n- 结束语模板(仅 reinforcement/done 阶段可参考): ${course.teachingHints.closing}`
      : ''
  }`;
}

function buildMemoryContext(memory: LessonMemory, course: Course): string {
  const progressEntries = Object.entries(memory.cardProgress);
  const cardsByState = (state: string) =>
    progressEntries.filter(([, value]) => value === state).map(([id]) => id).join(', ') || '(无)';
  const wordCardIds = new Set(course.cards.filter((card) => card.kind === 'word').map((card) => card.id));
  const wordCardById = new Map(course.cards.filter((card) => card.kind === 'word').map((card) => [card.id, card]));
  const sentenceCards = course.cards.filter((card) => card.kind === 'sentence');
  const sentenceCardByText = new Map(
    sentenceCards.map((card) => [card.english, card.id]),
  );
  const wordOrder = course.teachingHints.newCardIds.filter((id) => wordCardIds.has(id));
  const clearedWordIds = wordOrder.filter((id) => memory.cardProgress[id] === 'cleared');
  const currentWordCardId = wordCardIds.has(memory.currentCardId) ? memory.currentCardId : '';
  const currentWordStillActive = currentWordCardId && memory.cardProgress[currentWordCardId] !== 'cleared';
  const nextWordCardId = wordOrder.find((id) => memory.cardProgress[id] !== 'cleared') || '';
  const activeWordCardId = currentWordStillActive ? currentWordCardId : nextWordCardId;
  const activeWordCard = activeWordCardId ? wordCardById.get(activeWordCardId) : undefined;
  const activeSentenceCard = activeWordCard
    ? sentenceCards.find((card) => card.id === `sentence_${activeWordCardId}` || card.imageUrl === activeWordCard.imageUrl)
    : undefined;
  let context = `## 当前课堂状态
- 当前正在教: ${memory.currentWord || '(未开始)'}
- 当前卡片: ${memory.currentCardId || '(未建立)'}
- 当前环节: ${memory.phase}
- 本节已通过词汇: ${memory.wordsLearned.join(', ') || '(无)'}
- cleared cards: ${memory.clearedCardIds.join(', ') || '(无)'}
- untouched cards: ${cardsByState('untouched')}
- attempted cards: ${cardsByState('attempted')}
- needs_review cards: ${cardsByState('needs_review')}
- 需复习: ${memory.wordsToReview.join(', ') || '(无)'}
- 总交互次数: ${memory.totalInteractions}`;

  const currentCardR2Count = currentWordCardId ? (memory.cardCorrectCount[currentWordCardId] || 0) : 0;
  context += `\n\n## 当前目标控制
- word card 学习顺序: ${wordOrder.join(', ')}
- 当前应练习的 word card: ${activeWordCardId || '(全部完成)'}
- **当前卡字面通过次数**: ${currentCardR2Count} / 2 ${currentCardR2Count >= 2 ? '(已达成,服务端会自动推进)' : currentCardR2Count === 1 ? '(再 1 次字面通过即推进)' : '(还没通过,正常教学)'}
- 当前 word 可用短句图卡: ${activeSentenceCard ? `${activeSentenceCard.id} (${activeSentenceCard.english})` : '(无;不要使用其它 sentence_* 卡)'}
- 已通过 word cards: ${clearedWordIds.join(', ') || '(无)'}
- 不要 show_card 已通过 word cards,除非孩子明确要求复习或"再说那一张"
- show_card 由服务端兜底(R-C):未通过 2 次时强制保持当前卡;通过的那一轮服务端自动推到下一张。你 emit show_card 也行,会被服务端校验。
- 如果要说目标短句,必须 show_card 对应短句图卡: ${course.objectives.sentences.map((sentence) => `${sentence} => ${sentenceCardByText.get(sentence) || '(无对应卡)'}`).join(' | ')}`;

  if (memory.interestSignals.length > 0) {
    context += `\n\n## 学生兴趣信号`;
    for (const signal of memory.interestSignals.slice(-5)) {
      context += `\n- ${signal.description}`;
    }
    context += `\n建议：如果学生对某个话题感兴趣，可以适当拓展，但要拉回教学主线。`;
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

  // R4: Always inject summary constraint regardless of phase.
  // LLM sometimes generates a closing summary that lists all course words, not just
  // the words actually practiced this session. This hard-constraint is injected every
  // turn so the LLM always knows it must not enumerate unlearned words.
  context += `\n\n## 总结约束（任何阶段均有效）
- 只能总结本节已通过词汇: ${memory.wordsLearned.join(', ') || '(无)'}
- 只能说"练过/通过/还要继续练",不要说"学会/掌握"。
- 如果 untouched cards 不是(无),不得结课。
- 在任何一句话里,绝对不能说出未通过且不是当前正在教的目标词(上面"(无)"意味着本节没有已通过词汇)。`;

  return context;
}

export function buildSystemPrompt(
  course: Course,
  memory: LessonMemory,
  currentPhase: PhaseName = 'interactive',
): string {
  const sections = [ROLE_PROMPT, buildCourseInfo(course, currentPhase)];

  if (currentPhase === 'intro') {
    const hint = course.phases.introduction.narrationHint || '';
    sections.push(PHASE_INTRO_PROMPT + (hint ? `\n- 旁白指南: ${hint}` : ''));
  } else if (currentPhase === 'interactive') {
    sections.push(PHASE_INTERACTIVE_PROMPT);
  } else if (currentPhase === 'reinforcement') {
    sections.push(PHASE_REINFORCEMENT_PROMPT);
  }

  sections.push(buildMemoryContext(memory, course));
  return sections.join('\n\n---\n\n');
}
