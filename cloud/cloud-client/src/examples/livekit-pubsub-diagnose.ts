import { setTimeout as delay } from 'timers/promises';
import WebSocket from 'ws';
// Node: file system for writing WAV output
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

async function mintToken(serverHttp: string, identity: string, roomName: string, mode: 'publish' | 'subscribe') {
  const res = await fetch(`${serverHttp}/api/livekit/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, roomName, mode }),
  });
  if (!res.ok) throw new Error(`Token mint failed: ${res.status}`);
  const json = await res.json();
  if (!json?.url || !json?.token) throw new Error('Invalid token response');
  return json as { url: string; token: string };
}

async function run() {
  const server = process.env.SERVER_URL || 'http://localhost:8002';
  const email = process.env.TEST_EMAIL || 'user@example.com';
  const serverHttp = server.replace(/^ws/, 'http');
  const bridgeUrl = process.env.BRIDGE_URL || 'ws://localhost:8080/ws';
  const toneMs = parseInt(process.env.DIAG_TONE_MS || '10000', 10);
  const gain = process.env.PUBLISH_GAIN || '1';
  const outWav = process.env.DIAG_WAV || 'diagnose-subscriber.wav';

  console.log('🔎 LiveKit Pub/Sub Diagnose (single script)');
  console.log('- Server:', serverHttp);
  console.log('- Room  :', email);
  console.log('- Bridge:', bridgeUrl);
  console.log('- Tone  :', toneMs, 'ms');
  console.log('- Gain  :', gain);

  // Mint tokens
  // Use distinct identities to avoid collision in the same room
  const pubIdentity = `diagnostic-publisher:${email}`;
  const subIdentity = `diagnostic-subscriber:${email}`;
  // Request longer TTL to avoid expiry during ICE/connection
  async function mint(mode: 'publish' | 'subscribe', identity: string) {
    const res = await fetch(`${serverHttp}/api/livekit/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity, roomName: email, mode, ttlSeconds: 1800 }),
    });
    if (!res.ok) throw new Error(`Token mint failed: ${res.status}`);
    return res.json();
  }
  const [{ url, token: pubToken }, { token: subToken }] = await Promise.all([
    mint('publish', pubIdentity),
    mint('subscribe', subIdentity),
  ]);

  // Start subscriber (rtc-node)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Room, AudioStream, RoomEvent, TrackKind } = require('@livekit/rtc-node');
  const room = new Room();
  await room.connect(url, subToken, { autoSubscribe: true, timeout: 15000 });
  console.log('🎧 Subscriber connected');

  let frames = 0;
  let samples = 0;
  let sumAbs = 0;
  let sumSq = 0;
  // Initialize with sane defaults to avoid undefined type warnings
  let sr: number = 48000;
  let ch: number = 1;
  let sampleType: 'int16' | 'float32' | 'unknown' = 'unknown';
  const capturedChunks: Buffer[] = [];

  const subReady = new Promise<void>((resolve) => {
    room.on(RoomEvent.TrackSubscribed, async (track: any, _pub: any, participant: any) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      console.log('🎙️  Subscribed to audio from', participant.identity);
      const stream = new AudioStream(track);
      for await (const frame of stream) {
        frames++;
        sr = (frame as any).sampleRate ?? 48000;
        ch = (frame as any).channels ?? (frame as any).channelCount ?? 1;
        const dataAny: any = (frame as any).data ?? frame.data;
        let monoInt16: Int16Array;
        if (dataAny instanceof Int16Array) {
          sampleType = 'int16';
          if (ch === 1) monoInt16 = dataAny;
          else {
            const totalFrames = Math.floor(dataAny.length / ch);
            monoInt16 = new Int16Array(totalFrames);
            for (let i = 0; i < totalFrames; i++) {
              let acc = 0;
              for (let c = 0; c < ch; c++) acc += dataAny[i * ch + c];
              monoInt16[i] = Math.max(-32768, Math.min(32767, Math.round(acc / ch)));
            }
          }
        } else if (dataAny instanceof Float32Array) {
          sampleType = 'float32';
          const totalFrames = Math.floor(dataAny.length / ch);
          monoInt16 = new Int16Array(totalFrames);
          for (let i = 0; i < totalFrames; i++) {
            let acc = 0;
            for (let c = 0; c < ch; c++) acc += dataAny[i * ch + c];
            const avg = acc / ch;
            monoInt16[i] = Math.max(-32768, Math.min(32767, Math.round(avg * 32767)));
          }
        } else {
          sampleType = 'unknown';
          const bufView = new Int16Array((dataAny?.buffer as ArrayBuffer) || frame.data.buffer);
          monoInt16 = bufView;
        }
        // Capture raw PCM16 mono bytes for WAV writing later
        const bytes = Buffer.from(
          (monoInt16.buffer as ArrayBuffer).slice(
            monoInt16.byteOffset,
            monoInt16.byteOffset + monoInt16.byteLength,
          ),
        );
        capturedChunks.push(bytes);
        samples += monoInt16.length;
        for (let i = 0; i < monoInt16.length; i++) {
          const v = monoInt16[i];
          sumAbs += Math.abs(v);
          sumSq += v * v;
        }
        if (samples > sr * 5) {
          resolve(); // after ~5 seconds received
        }
      }
    });
  });

  // Trigger bridge publisher join & tone
  let ws: WebSocket | null = new WebSocket(`${bridgeUrl}?userId=${encodeURIComponent(pubIdentity)}`);
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('bridge timeout')), 5000);
    ws.once('open', () => { clearTimeout(to); resolve(); });
    ws.once('error', (e) => { clearTimeout(to); reject(e); });
  });
  console.log('🔌 Bridge connected');

  // Also pass URL so bridge uses same as server
  ws.send(JSON.stringify({ action: 'join_room', roomName: email, token: pubToken, url }));

  // Wait for room_joined then track_published from bridge to ensure track is ready
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('bridge room_join timeout')), 15000);
    ws!.on('message', (data) => {
      try {
        const evt = JSON.parse((data as Buffer).toString());
        if (evt?.type && evt?.type !== 'connected') {
          console.log('[Bridge EVT]', evt);
        }
        if (evt?.type === 'error') {
          clearTimeout(to);
          return reject(new Error(`bridge error: ${evt?.error || evt?.message || 'unknown'}`));
        }
        if (evt?.type === 'room_joined') {
          console.log('🚪 Bridge joined room:', evt.roomName, 'participant:', evt.participantId);
        }
        if (evt?.type === 'track_published') {
          clearTimeout(to);
          console.log('📡 Bridge track published');
          resolve();
        }
      } catch {}
    });
  });

  // Start tone from bridge (ensure environment PUBLISH_GAIN is set on bridge process)
  ws!.send(JSON.stringify({ action: 'publish_tone', freq: 440, ms: toneMs }));
  console.log('📣 Bridge publishing tone for', toneMs, 'ms');

  // Global watchdog to force exit if anything stalls
  const watchdog = setTimeout(() => {
    console.error('Global diagnose timeout');
    try { room.disconnect(); } catch {}
    try { ws?.close(); } catch {}
    process.exit(4);
  }, toneMs + 30000);

  // Wait for subscriber to collect
  await Promise.race([subReady, delay(toneMs + 3000)]);

  // Finish & report
  try { room.disconnect(); } catch {}
  try { ws?.close(); } catch {}
  clearTimeout(watchdog);

  const meanAbs = samples ? sumAbs / samples : 0;
  const rms = samples ? Math.sqrt(sumSq / samples) : 0;

  console.log('\n—— Diagnose Results ——');
  console.log('Frames     :', frames);
  console.log('SampleRate :', sr);
  console.log('Channels   :', ch);
  console.log('Samples    :', samples);
  console.log('MeanAbs    :', meanAbs.toFixed(1));
  console.log('RMS        :', rms.toFixed(1));
  console.log('SampleType :', sampleType);

  // Write captured audio to WAV (16-bit PCM, mono, sr Hz)
  try {
    const pcm = Buffer.concat(capturedChunks);
    const wav = buildWavFile(pcm, sr, ch);
    fs.writeFileSync(outWav, wav);
    console.log(`💾 Wrote WAV: ${outWav} (${pcm.length} bytes PCM16, ${sr} Hz, ${ch} ch)`);
  } catch (e) {
    console.error('Failed to write WAV:', (e as Error)?.message || e);
  }

  if (frames === 0 || samples === 0) {
    console.error('❌ No audio frames received');
    process.exit(2);
  }
  if (rms < 50 && meanAbs < 25) {
    console.error('⚠️ Audio energy very low (near-silence)');
    process.exit(3);
  }
  console.log('✅ Audio present with non-trivial energy');
  process.exit(0);
}

// Build a minimal PCM16 WAV buffer
function buildWavFile(pcm16: Buffer, sampleRate: number, channels: number): Buffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16.length;
  const headerSize = 44;
  const fileSize = headerSize - 8 + dataSize;
  const header = Buffer.alloc(headerSize);

  // RIFF header
  header.write('RIFF', 0); // ChunkID
  header.writeUInt32LE(fileSize, 4); // ChunkSize
  header.write('WAVE', 8); // Format

  // fmt subchunk
  header.write('fmt ', 12); // Subchunk1ID
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1=PCM)
  header.writeUInt16LE(channels, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(byteRate, 28); // ByteRate
  header.writeUInt16LE(blockAlign, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  header.write('data', 36); // Subchunk2ID
  header.writeUInt32LE(dataSize, 40); // Subchunk2Size

  return Buffer.concat([header, pcm16]);
}

run().catch((err) => {
  console.error('Diagnose failed:', err);
  process.exit(1);
});
