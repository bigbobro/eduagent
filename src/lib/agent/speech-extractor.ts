import { AgentResponse } from '@/types/tools';

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

export interface FeedResult {
  speechDelta?: string;
  complete?: boolean;
}

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

  feed(chunk: string): FeedResult {
    this.buffer += chunk;
    let speechDelta = '';
    let complete = false;

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
            complete = true;
          } else if (c === '\\') {
            this.state = 'IN_STRING_ESCAPE';
          } else {
            speechDelta += c;
            this.speech += c;
          }
          break;

        case 'IN_STRING_ESCAPE':
          if (c === 'u') {
            this.state = 'IN_UNICODE_ESCAPE';
            this.unicodeBuf = '';
          } else {
            const ch = decodeSimpleEscape(c);
            speechDelta += ch;
            this.speech += ch;
            this.state = 'IN_STRING';
          }
          break;

        case 'IN_UNICODE_ESCAPE':
          this.unicodeBuf += c;
          if (this.unicodeBuf.length === 4) {
            const ch = String.fromCharCode(parseInt(this.unicodeBuf, 16));
            speechDelta += ch;
            this.speech += ch;
            this.state = 'IN_STRING';
          }
          break;

        case 'DONE':
          // 已读完 speech,后续字符全部忽略(等 finalize 拿 actions)
          break;
      }
    }

    const result: FeedResult = {};
    if (speechDelta) result.speechDelta = speechDelta;
    if (complete) result.complete = true;
    return result;
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
    return {
      speech: this.speech,
      actions: parsed?.actions ?? [],
      state_update: parsed?.state_update ?? {},
      malformed: malformed || undefined,
    };
  }
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
