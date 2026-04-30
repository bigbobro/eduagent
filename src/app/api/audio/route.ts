import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/mimo/asr';
import { synthesizeSpeech } from '@/lib/mimo/tts';
import { webmToWav } from '@/lib/audio/convert';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const action = formData.get('action') as string;

  if (action === 'transcribe') {
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      let buffer: Buffer = Buffer.from(arrayBuffer);

      // MiMo ASR only supports MP3/WAV/FLAC/M4A/OGG, not webm
      if (file.type.includes('webm') || file.type.includes('ogg')) {
        buffer = await webmToWav(buffer);
      }

      const result = await transcribeAudio(buffer, 'audio/wav');

      return NextResponse.json({
        text: result.text,
        usage: result.usage,
        latency: result.latency,
      });
    } catch (e: any) {
      console.error('ASR error:', e);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === 'synthesize') {
    const text = formData.get('text') as string;
    const voice = (formData.get('voice') as string) || '冰糖';
    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    try {
      const result = await synthesizeSpeech(text, voice);

      return new NextResponse(new Uint8Array(result.audioBuffer), {
        headers: {
          'Content-Type': 'audio/wav',
          'X-Characters': result.usage.characters.toString(),
          'X-Latency': result.latency.toString(),
        },
      });
    } catch (e: any) {
      console.error('TTS error:', e);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
