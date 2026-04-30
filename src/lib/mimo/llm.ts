import { AgentResponse } from '@/types/tools';

const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.mimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';

interface LLMResult {
  response: AgentResponse;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  latency: number;
}

export async function callLLM(
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<LLMResult> {
  const start = Date.now();

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mimo-v2.5-pro',
      messages: apiMessages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('MiMo LLM error body:', errorBody);
    throw new Error(`MiMo LLM error: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const data = await res.json();
  const latency = Date.now() - start;

  const content = data.choices[0].message.content;
  let parsed: AgentResponse;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // If the LLM didn't return valid JSON, try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`LLM returned non-JSON response: ${content.substring(0, 200)}`);
    }
  }

  return {
    response: parsed,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
    latency,
  };
}
