import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink, readFile } from 'fs/promises';
import { randomUUID } from 'crypto';

export async function webmToWav(webmBuffer: Buffer): Promise<Buffer> {
  const id = randomUUID().slice(0, 8);
  const inputPath = join(tmpdir(), `eduagent_${id}.webm`);
  const outputPath = join(tmpdir(), `eduagent_${id}.wav`);

  try {
    await writeFile(inputPath, webmBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('wav')
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });

    const wavBuffer = await readFile(outputPath);
    return wavBuffer;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
