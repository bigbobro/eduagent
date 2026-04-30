const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';

interface ASRResult {
  text: string;
  usage: { tokens: number };
  latency: number;
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<ASRResult> {
  const start = Date.now();

  // Convert audio buffer to base64
  const base64Audio = audioBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Audio}`;

  const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mimo-v2.5',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: dataUrl },
            },
            {
              type: 'text',
              text: '请将音频内容转写为文字，只输出转写结果，不要加任何额外内容。',
            },
          ],
        },
      ],
      max_completion_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`MiMo ASR error: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const data = await res.json();
  const latency = Date.now() - start;
  const text = data.choices?.[0]?.message?.content || '';

  return {
    text: text.trim(),
    usage: { tokens: data.usage?.prompt_tokens || 0 },
    latency,
  };
}
