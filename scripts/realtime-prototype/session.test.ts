// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { runAudioTurn } from './session';

const servers: WebSocketServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const client of Array.from(server.clients)) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('executes the assessment before continuing speech and returns audio and billed usage', async () => {
  const server = new WebSocketServer({ port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const address = server.address() as { port: number };
  server.on('connection', (socket) => {
    const send = (event: object) => socket.send(JSON.stringify(event));
    let confirmed = false;
    send({ type: 'session.created' });
    socket.on('message', (raw) => {
      const e = JSON.parse(String(raw));
      if (e.type === 'session.update') send({ type: 'session.updated' });
      if (e.type === 'input_audio_buffer.commit') send({ type: 'input_audio_buffer.committed', item_id: 'input-1' });
      if (e.type === 'conversation.item.create') confirmed = JSON.parse(e.item.output).ok;
      if (e.type === 'response.create' && !confirmed) {
        send({ type: 'response.done', response: { id: 'r1', status: 'completed', metadata: e.response.metadata,
          usage: { input_tokens: 100, output_tokens: 10 }, output: [{ type: 'function_call', name: 'record_assessment', call_id: 'call-1',
            arguments: JSON.stringify({ card_id: 'cat', result: 'correct', heard: 'cat', evidence: 'Target word spoken' }) }] } });
      } else if (e.type === 'response.create') {
        send({ type: 'response.output_audio.delta', delta: Buffer.from([1, 0, 2, 0]).toString('base64') });
        send({ type: 'response.output_audio_transcript.done', transcript: 'Good job!' });
        send({ type: 'response.done', response: { id: 'r2', status: 'completed', metadata: e.response.metadata,
          usage: { input_tokens: 120, output_tokens: 20 }, output: [] } });
      }
    });
  });
  const result = await runAudioTurn({ url: `ws://127.0.0.1:${address.port}`, pcm: Buffer.alloc(48000),
    model: 'test', cardId: 'cat', strategy: 'tool-first', apiKey: 'fake-key' });
  expect(result.assessments).toEqual([{ card_id: 'cat', result: 'correct', heard: 'cat', evidence: 'Target word spoken' }]);
  expect(result.audio.length).toBe(4);
  expect(result.usage).toEqual([{ input_tokens: 100, output_tokens: 10 }, { input_tokens: 120, output_tokens: 20 }]);
  expect(result.audioBeforeAssessment).toBe(false);
  expect(result.usageComplete).toBe(true);
  expect(result.transcripts).toEqual(['Good job!']);
});

it('does not count duplicate tool deliveries twice and returns rejected target receipts', async () => {
  const server = new WebSocketServer({ port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const receipts: Array<{ ok: boolean; duplicate?: boolean }> = [];
  server.on('connection', (socket) => {
    const send = (e: object) => socket.send(JSON.stringify(e));
    send({ type: 'session.created' });
    socket.on('message', (raw) => {
      const e = JSON.parse(String(raw));
      if (e.type === 'session.update') send({ type: 'session.updated' });
      if (e.type === 'input_audio_buffer.commit') send({ type: 'input_audio_buffer.committed', item_id: 'input-2' });
      if (e.type === 'conversation.item.create') receipts.push(JSON.parse(e.item.output));
      if (e.type === 'response.create' && !receipts.length) {
        const args = (card_id: string) => JSON.stringify({ card_id, result: 'correct', heard: 'cat', evidence: 'cat' });
        send({ type: 'response.done', response: { id: 'r1', status: 'completed', metadata: e.response.metadata, output: [
          { type: 'function_call', name: 'record_assessment', call_id: 'bad', arguments: args('dog') },
          { type: 'function_call', name: 'record_assessment', call_id: 'good', arguments: args('cat') },
          { type: 'function_call', name: 'record_assessment', call_id: 'good', arguments: args('cat') },
          { type: 'function_call', name: 'record_assessment', call_id: 'another', arguments: args('cat') },
        ] } });
      } else if (e.type === 'response.create') {
        send({ type: 'response.done', response: { id: 'r2', status: 'completed', metadata: e.response.metadata, output: [] } });
      }
    });
  });
  const address = server.address() as { port: number };
  const result = await runAudioTurn({ url: `ws://127.0.0.1:${address.port}`, apiKey: 'fake', model: 'test',
    pcm: Buffer.alloc(48000), cardId: 'cat', strategy: 'single' });
  expect(result.assessments).toHaveLength(1);
  expect(result.usageComplete).toBe(false);
  expect(receipts.map((r) => r.ok)).toEqual([false, true, true, true]);
  expect(receipts[3].duplicate).toBe(true);
});

it('releases a stalled connection on cancellation without an assessment', async () => {
  const server = new WebSocketServer({ port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const abort = new AbortController();
  const closed = new Promise<void>((resolve) => server.on('connection', (socket) => {
    socket.once('close', () => resolve());
    abort.abort();
  }));
  const address = server.address() as { port: number };
  await expect(runAudioTurn({ url: `ws://127.0.0.1:${address.port}`, apiKey: 'fake', model: 'test', pcm: Buffer.alloc(48000),
    cardId: 'cat', strategy: 'single', signal: abort.signal })).rejects.toThrow('cancelled');
  await closed;
});

it('keeps one session for a state-driven retry and never counts feedback as another child turn', async () => {
  const server = new WebSocketServer({ port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => server.on('listening', resolve));
  let connections = 0;
  server.on('connection', (socket) => {
    connections++;
    let childTurns = 0;
    let feedback = false;
    const send = (e: object) => socket.send(JSON.stringify(e));
    send({ type: 'session.created' });
    socket.on('message', (raw) => {
      const e = JSON.parse(String(raw));
      if (e.type === 'session.update') send({ type: 'session.updated' });
      if (e.type === 'input_audio_buffer.commit') {
        childTurns++; feedback = false;
        send({ type: 'input_audio_buffer.committed', item_id: `input-${childTurns}` });
      }
      if (e.type === 'conversation.item.create') feedback = true;
      if (e.type === 'response.create' && !feedback) send({ type: 'response.done', response: {
        id: `r${childTurns}-assess`, status: 'completed', metadata: e.response.metadata,
        output: [{ type: 'function_call', name: 'record_assessment', call_id: `call-${childTurns}`, arguments: JSON.stringify({
          card_id: 'cat', result: childTurns === 1 ? 'wrong' : 'correct', heard: childTurns === 1 ? 'dog' : 'cat',
          evidence: 'Synthetic example', mastered: childTurns === 2, next_action: childTurns === 1 ? 'retry' : 'advance',
        }) }],
      } });
      else if (e.type === 'response.create') send({ type: 'response.done', response: {
        id: `r${childTurns}-speech`, status: 'completed', metadata: e.response.metadata, output: [],
      } });
    });
  });
  const address = server.address() as { port: number };
  const result = await runAudioTurn({ url: `ws://127.0.0.1:${address.port}`, apiKey: 'fake', model: 'test',
    pcm: Buffer.alloc(48000), cardId: 'cat', strategy: 'tool-first',
    nextInput: (previous) => previous.mastered ? undefined : { pcm: Buffer.alloc(48000), cardId: 'cat' },
  });
  expect(connections).toBe(1);
  expect(result.assessments[0].result).toBe('wrong');
  expect(result.followingTurns?.map((t) => t.assessments[0].result)).toEqual(['correct']);
  expect(result.followingTurns?.[0].mastered).toBe(true);
  expect(result.turnId).not.toBe(result.followingTurns?.[0].turnId);
});

it('presents a sentence without creating a child input or recording an assessment', async () => {
  const server = new WebSocketServer({ port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const received: string[] = [];
  server.on('connection', (socket) => {
    const send = (e: object) => socket.send(JSON.stringify(e));
    send({ type: 'session.created' });
    socket.on('message', (raw) => {
      const e = JSON.parse(String(raw)); received.push(e.type);
      if (e.type === 'session.update') send({ type: 'session.updated' });
      if (e.type === 'input_audio_buffer.commit') send({ type: 'input_audio_buffer.committed' });
      if (e.type === 'response.create') {
        send({ type: 'response.output_audio.delta', delta: 'AQACAA==' });
        send({ type: 'response.done', response: { id: 'demo', status: 'completed', metadata: e.response.metadata, output: [] } });
      }
    });
  });
  const address = server.address() as { port: number };
  const result = await runAudioTurn({ url: `ws://127.0.0.1:${address.port}`, apiKey: 'fake', model: 'test',
    cardId: 'sentence-cat', targetText: 'I can see a cat.', pcm: Buffer.alloc(4800), strategy: 'tool-first', presentation: 'segmented' });
  expect(received).not.toContain('input_audio_buffer.commit');
  expect(result.assessments).toEqual([]);
  expect(result.audio.length).toBe(4);
  expect(result.kind).toBe('presentation');
});

it('can bind assessment to the acknowledged audio item and retain server-side audio evidence', async () => {
  const server = new WebSocketServer({ port: 0 }); servers.push(server);
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const inputs: unknown[] = [];
  const modalities: unknown[] = [];
  server.on('connection', (socket) => {
    const send = (e: object) => socket.send(JSON.stringify(e));
    send({ type: 'session.created' });
    socket.on('message', (raw) => {
      const e = JSON.parse(String(raw));
      if (e.type === 'session.update') send({ type: 'session.updated' });
      if (e.type === 'input_audio_buffer.commit') send({ type: 'input_audio_buffer.committed', item_id: 'the-child-audio' });
      if (e.type === 'conversation.item.retrieve') send({ type: 'conversation.item.retrieved', item: {
        id: e.item_id, content: [{ type: 'input_audio', audio: Buffer.alloc(48000).toString('base64') }],
      } });
      if (e.type === 'response.create') {
        inputs.push(e.response.input); modalities.push(e.response.output_modalities);
        send({ type: 'response.done', response: { id: 'r1', status: 'completed', metadata: e.response.metadata, output: [] } });
      }
    });
  });
  const address = server.address() as { port: number };
  const result = await runAudioTurn({ url: `ws://127.0.0.1:${address.port}`, apiKey: 'fake', model: 'test',
    pcm: Buffer.alloc(48000), cardId: 'cat', strategy: 'tool-first', inspectInput: true, referenceInput: true, assessmentAudio: true });
  expect(inputs).toEqual([[{ type: 'item_reference', id: 'the-child-audio' }]]);
  expect(modalities).toEqual([['audio']]);
  expect(result.inputEvidence).toMatchObject({ sentBytes: 48000, retrievedBytes: 48000, retrievedRms: 0 });
  expect(result.inputEvidence?.sentSha256).toBe(result.inputEvidence?.retrievedSha256);
});

it('ignores digital silence without opening a provider connection or recording an assessment', async () => {
  const result = await runAudioTurn({ url: 'ws://127.0.0.1:1', apiKey: 'unused', model: 'test',
    pcm: Buffer.alloc(48000), cardId: 'cat', strategy: 'tool-first', skipDigitalSilence: true });
  expect(result.kind).toBe('no-input');
  expect(result.assessments).toEqual([]);
  expect(result.usage).toEqual([]);
  expect(result.usageComplete).toBe(true);
  expect(result.eventTypes).toEqual(['input.digital_silence']);
});

it('retains sanitized failure reason and known usage when a provider response is incomplete', async () => {
  const server = new WebSocketServer({ port: 0 }); servers.push(server);
  await new Promise<void>((resolve) => server.on('listening', resolve));
  server.on('connection', (socket) => {
    const send = (e: object) => socket.send(JSON.stringify(e)); send({ type: 'session.created' });
    socket.on('message', (raw) => {
      const e = JSON.parse(String(raw));
      if (e.type === 'session.update') send({ type: 'session.updated' });
      if (e.type === 'input_audio_buffer.commit') send({ type: 'input_audio_buffer.committed', item_id: 'input' });
      if (e.type === 'response.create') send({ type: 'response.done', response: { id: 'incomplete', status: 'incomplete',
        status_details: { type: 'incomplete', reason: 'max_output_tokens' }, metadata: e.response.metadata,
        usage: { input_tokens: 50, output_tokens: 400 }, output: [] } });
    });
  });
  const address = server.address() as { port: number };
  await expect(runAudioTurn({ url: `ws://127.0.0.1:${address.port}`, apiKey: 'fake', model: 'test',
    pcm: Buffer.alloc(48000), cardId: 'cat', strategy: 'tool-first' })).rejects.toMatchObject({
      message: 'Realtime response incomplete: max_output_tokens', knownUsage: [{ input_tokens: 50, output_tokens: 400 }],
    });
});
