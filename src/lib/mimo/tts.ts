const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';

interface TTSResult {
  audioBuffer: Buffer;
  usage: { characters: number };
  latency: number;
}

export async function synthesizeSpeech(
  text: string,
  voice: string = '冰糖',
  style?: string
): Promise<TTSResult> {
  const start = Date.now();

  const messages: any[] = [];

  // Style instruction in user message
  if (style) {
    messages.push({ role: 'user', content: style });
  } else {
    messages.push({
      role: 'user',
      content: '温暖、亲切、适合儿童的语气，语速稍慢。',
    });
  }

  // Text to synthesize in assistant message
  messages.push({ role: 'assistant', content: text });

  const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mimo-v2.5-tts',
      messages,
      audio: {
        format: 'wav',
        voice,
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`MiMo TTS error: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const data = await res.json();
  const latency = Date.now() - start;

  const audioData = data.choices?.[0]?.message?.audio?.data;
  if (!audioData) {
    throw new Error('MiMo TTS returned no audio data');
  }

  // Decode base64 audio
  const audioBuffer = Buffer.from(audioData, 'base64');

  return {
    audioBuffer,
    usage: { characters: text.length },
    latency,
  };
}
