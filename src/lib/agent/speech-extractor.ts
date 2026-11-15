import type { AgentResponse, ToolAction } from '@/types/tools';
import { stateUpdateSchema, toolActionSchema } from '@/lib/lesson-protocol';

type State =
  | 'LOOKING_FOR_KEY'    // 寻找下一个键
  | 'IN_KEY'             // 读键名
  | 'AFTER_KEY'          // 读完键,等冒号
  | 'AFTER_COLON'        // 读冒号后,等值开始
  | 'IN_STRING'          // 在 speech 字符串里
  | 'IN_STRING_ESCAPE'   // 字符串里收到反斜杠
  | 'IN_UNICODE_ESCAPE'  // 字符串里收到 \u,收 4 个 hex
  | 'DONE';              // speech 字段已完整读完

const SPEECH_KEY = 'speech';

export interface ExtractedResult {
  speech: string;
  actions: AgentResponse['actions'];
  state_update: AgentResponse['state_update'];
  malformed?: boolean;
}

export class StreamingSpeechExtractor {
  private state: State = 'LOOKING_FOR_KEY';
  private buffer = ''; // 累积全文用于 finalize
  private keyBuf = '';
  private currentKey = '';
  private speech = '';
  private unicodeBuf = '';

  // Accumulates the raw buffer (for finalize's JSON.parse) and incrementally decodes
  // the speech value into this.speech as a fallback for when JSON.parse fails. The
  // result is consumed only via finalize(); feed() itself returns nothing.
  feed(chunk: string): void {
    this.buffer += chunk;

    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];

      switch (this.state) {
        case 'LOOKING_FOR_KEY':
          if (c === '"') {
            this.state = 'IN_KEY';
            this.keyBuf = '';
          }
          // 其他字符(空格、{,[、:、,)忽略
          break;

        case 'IN_KEY':
          if (c === '"') {
            this.currentKey = this.keyBuf;
            this.state = 'AFTER_KEY';
          } else if (c === '\\') {
            // 键里出现转义,简单跳过下一个字符(JSON 键里几乎没有转义)
            i++;
          } else {
            this.keyBuf += c;
          }
          break;

        case 'AFTER_KEY':
          if (c === ':') {
            this.state = 'AFTER_COLON';
          }
          break;

        case 'AFTER_COLON':
          if (c === '"') {
            // 仅当当前键是 speech 时进入字符串读取模式
            if (this.currentKey === SPEECH_KEY) {
              this.state = 'IN_STRING';
            } else {
              // 跳过非 speech 字符串值
              i = this.skipUntilStringEnd(chunk, i + 1);
              this.state = 'LOOKING_FOR_KEY';
            }
          } else if (c === '{' || c === '[') {
            // 非 speech 的对象/数组值:跳到匹配括号
            i = this.skipNested(chunk, i);
            this.state = 'LOOKING_FOR_KEY';
          } else if (c === ',' || c === '}') {
            this.state = 'LOOKING_FOR_KEY';
          }
          // 数字/true/false/null 等基本类型:扫到下一个 , 或 }
          else if (/[a-zA-Z0-9\-]/.test(c)) {
            while (i < chunk.length && chunk[i] !== ',' && chunk[i] !== '}' && chunk[i] !== ']') {
              i++;
            }
            i--;
            this.state = 'LOOKING_FOR_KEY';
          }
          break;

        case 'IN_STRING':
          if (c === '"') {
            this.state = 'DONE';
          } else if (c === '\\') {
            this.state = 'IN_STRING_ESCAPE';
          } else {
            this.speech += c;
          }
          break;

        case 'IN_STRING_ESCAPE':
          if (c === 'u') {
            this.state = 'IN_UNICODE_ESCAPE';
            this.unicodeBuf = '';
          } else {
            const ch = decodeSimpleEscape(c);
            this.speech += ch;
            this.state = 'IN_STRING';
          }
          break;

        case 'IN_UNICODE_ESCAPE':
          this.unicodeBuf += c;
          if (this.unicodeBuf.length === 4) {
            const ch = String.fromCharCode(parseInt(this.unicodeBuf, 16));
            this.speech += ch;
            this.state = 'IN_STRING';
          }
          break;

        case 'DONE':
          // 已读完 speech,后续字符全部忽略(等 finalize 拿 actions)
          break;
      }
    }
  }

  private skipUntilStringEnd(chunk: string, start: number): number {
    let i = start;
    while (i < chunk.length) {
      if (chunk[i] === '\\') {
        i += 2;
      } else if (chunk[i] === '"') {
        return i;
      } else {
        i++;
      }
    }
    return chunk.length - 1;
  }

  private skipNested(chunk: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < chunk.length; i++) {
      const c = chunk[i];
      if (escaped) { escaped = false; continue; }
      if (inString) {
        if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return chunk.length - 1;
  }

  finalize(): ExtractedResult {
    let parsed: any = null;
    let malformed = false;
    try {
      parsed = JSON.parse(this.buffer);
    } catch {
      malformed = true;
    }
    // Prefer the fully-parsed speech when the JSON is well-formed: the streaming state machine can
    // lose the whole speech value when a preceding non-speech value is split across a feed() chunk
    // boundary (skipUntilStringEnd / skipNested only scan the current chunk). The parsed buffer is
    // authoritative; fall back to the streamed value only when JSON.parse failed.
    const speech = typeof parsed?.speech === 'string' ? parsed.speech : this.speech;
    // Validate at the LLM boundary with the browser's transport contract. Drop only bad fields/items so
    // the guards can still choose the card and the browser can accept the resulting actions event.
    const dropped: Record<string, number> = {};
    const drop = (field: string, count = 1) => { if (count > 0) dropped[field] = (dropped[field] ?? 0) + count; };
    const rawActions: unknown[] = Array.isArray(parsed?.actions) ? parsed.actions : [];
    if (parsed?.actions !== undefined && !Array.isArray(parsed.actions)) drop('actions');
    const actions = rawActions.flatMap((action) => {
      const checked = toolActionSchema.safeParse(action);
      if (!checked.success) { drop('actions'); return []; }
      const raw = action as ToolAction; // the shared schema just validated the shape
      drop('actions.extra_keys', countExtraKeys(raw, checked.data) + countExtraKeys(raw.params, checked.data.params));
      return [checked.data];
    });
    const state_update: AgentResponse['state_update'] = {};
    const rawState = parsed?.state_update;
    if (rawState && typeof rawState === 'object' && !Array.isArray(rawState)) {
      drop('state_update.extra_keys', countExtraKeys(rawState, stateUpdateSchema.shape));
      const word = stateUpdateSchema.shape.current_word.safeParse(rawState.current_word);
      if (!word.success) drop('state_update.current_word');
      else if (word.data !== undefined) state_update.current_word = word.data;
      const assessment = stateUpdateSchema.shape.attempt_assessment.safeParse(rawState.attempt_assessment);
      if (!assessment.success) drop('state_update.attempt_assessment');
      else if (assessment.data !== undefined) {
        state_update.attempt_assessment = assessment.data;
        drop('state_update.attempt_assessment.extra_keys', countExtraKeys(rawState.attempt_assessment, assessment.data));
      }
    } else if (rawState !== undefined) drop('state_update');
    if (Object.keys(dropped).length) console.warn('[extractor] dropped malformed fields', dropped);
    return {
      speech,
      actions,
      state_update,
      malformed: malformed || undefined,
    };
  }
}

/** Count stripped keys without logging their model-supplied names or values. */
function countExtraKeys(raw: object, allowed: object): number {
  return Object.keys(raw).filter((key) => !Object.prototype.hasOwnProperty.call(allowed, key)).length;
}

function decodeSimpleEscape(c: string): string {
  switch (c) {
    case '"': return '"';
    case '\\': return '\\';
    case '/': return '/';
    case 'b': return '\b';
    case 'f': return '\f';
    case 'n': return '\n';
    case 'r': return '\r';
    case 't': return '\t';
    default: return c;
  }
}

// 剥离 card_id 风格的下划线 token(sentence_cat / word_apple 等),
// 防止 TTS 直接把 _ 读成"underscore / 下划线"。
// 替换成空格而非删空,避免相邻词被粘连。
export function sanitizeSpeech(text: string): string {
  return text.replace(/(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+(?![A-Za-z0-9])/g, ' ');
}
