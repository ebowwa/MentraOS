import { setTimeout as delay } from 'timers/promises';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

function parseWav(wavData: Buffer): { sampleRate: number; channels: number; bits: number; pcm: Buffer } {
  if (wavData.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Not RIFF');
  if (wavData.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not WAVE');
  const fmtIndex = wavData.indexOf(Buffer.from('fmt '), 12);
  if (fmtIndex < 0) throw new Error('fmt chunk missing');
  const audioFormat = wavData.readUInt16LE(fmtIndex + 8);
  const channels = wavData.readUInt16LE(fmtIndex + 10);
  const sampleRate = wavData.readUInt32LE(fmtIndex + 12);
  const bitsPerSample = wavData.readUInt16LE(fmtIndex + 22);
  const dataIndex = wavData.indexOf(Buffer.from('data'), fmtIndex + 24);
  if (dataIndex < 0) throw new Error('data chunk missing');
  const dataSize = wavData.readUInt32LE(dataIndex + 4);
  const pcmStart = dataIndex + 8;
  const pcm = wavData.subarray(pcmStart, pcmStart + dataSize);
  if (audioFormat !== 1 || bitsPerSample !== 16) throw new Error('Expected PCM16');
  return { sampleRate, channels, bits: bitsPerSample, pcm };
}

function stereoToMono(pcm: Buffer): Buffer {
  const mono = Buffer.allocUnsafe(pcm.length / 2);
  for (let i = 0, j = 0; i < pcm.length; i += 4, j += 2) {
    const left = pcm.readInt16LE(i);
    const right = pcm.readInt16LE(i + 2);
    mono.writeInt16LE(((left + right) / 2) | 0, j);
  }
  return mono;
}

function resampleLinear(pcm: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return pcm;
  const ratio = fromRate / toRate;
  const inSamples = pcm.length / 2;
  const outSamples = Math.round(inSamples / ratio);
  const out = Buffer.allocUnsafe(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const srcIndex = i * ratio;
    const i1 = Math.floor(srcIndex);
    const i2 = Math.min(i1 + 1, inSamples - 1);
    const s1 = pcm.readInt16LE(i1 * 2);
    const s2 = pcm.readInt16LE(i2 * 2);
    const frac = srcIndex - Math.floor(srcIndex);
    const val = Math.round(s1 + (s2 - s1) * frac);
    out.writeInt16LE(val, i * 2);
  }
  return out;
}

function buildWavFile(pcm16: Buffer, sampleRate: number, channels: number): Buffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16.length;
  const headerSize = 44;
  const fileSize = headerSize - 8 + dataSize;
  const header = Buffer.alloc(headerSize);
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm16]);
}

async function mint(serverHttp: string, identity: string, roomName: string, mode: 'publish' | 'subscribe') {
  const res = await fetch(`${serverHttp}/api/livekit/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, roomName, mode, ttlSeconds: 1800 }),
  });
  if (!res.ok) throw new Error(`Token mint failed: ${res.status}`);
  return res.json() as Promise<{ url: string; token: string }>;
}

async function run() {
  const server = process.env.SERVER_URL || 'http://localhost:8002';
  const email = process.env.TEST_EMAIL || 'user@example.com';
  const serverHttp = server.replace(/^ws/, 'http');
  const bridgeUrl = process.env.BRIDGE_URL || 'ws://localhost:8080/ws';
  const inputRel = process.env.INPUT_WAV || 'src/audio/short-test-16khz.wav';
  const outputRel = process.env.OUT_WAV || 'bridge-roundtrip-subscriber.wav';

  console.log('🎬 Go-Bridge File Roundtrip (pub+sub via bridge)');
  console.log('- Server:', serverHttp);
  console.log('- Room  :', email);
  console.log('- Bridge:', bridgeUrl);
  console.log('- InWAV :', inputRel);
  console.log('- OutWAV:', outputRel);

  const pubIdentity = `file-publisher:${email}`;
  const subIdentity = `file-subscriber:${email}`;
  const [{ url, token: pubToken }, { token: subToken }] = await Promise.all([
    mint(serverHttp, pubIdentity, email, 'publish'),
    mint(serverHttp, subIdentity, email, 'subscribe'),
  ]);

  // Prep input as 16 kHz mono
  const inputPath = path.resolve(process.cwd(), inputRel);
  const wavBuf = fs.readFileSync(inputPath);
  const parsed = parseWav(wavBuf);
  let mono = parsed.channels === 1 ? parsed.pcm : stereoToMono(parsed.pcm);
  const pcm16 = parsed.sampleRate === 16000 ? mono : resampleLinear(mono, parsed.sampleRate, 16000);
  const totalSamples = Math.floor(pcm16.length / 2);
  console.log(`InWAV parsed: ${parsed.sampleRate} Hz, ch=${parsed.channels}, samples=${totalSamples}`);

  // Subscriber WS (enable subscribe and capture binary frames)
  const subWS = new WebSocket(`${bridgeUrl}?userId=${encodeURIComponent(subIdentity)}`);
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('sub ws timeout')), 5000);
    subWS.once('open', () => { clearTimeout(to); resolve(); });
    subWS.once('error', (e) => { clearTimeout(to); reject(e as any); });
  });
  // Join and enable subscribe to the pub identity
  subWS.send(JSON.stringify({ action: 'join_room', roomName: email, token: subToken, url }));
  // Small wait to ensure joined
  await delay(500);
  subWS.send(JSON.stringify({ action: 'subscribe_enable', targetIdentity: pubIdentity }));

  const captured: Buffer[] = [];
  let recvBytes = 0;
  subWS.on('message', (data) => {
    if (data instanceof Buffer) {
      captured.push(data);
      recvBytes += data.length;
    } else {
      // JSON event
      try {
        const evt = JSON.parse((data as Buffer).toString());
        if (evt?.type && evt?.type !== 'connected') {
          console.log('[Sub EVT]', evt);
        }
      } catch {}
    }
  });

  // Publisher WS: join and stream 10ms frames at 16 kHz
  const pubWS = new WebSocket(`${bridgeUrl}?userId=${encodeURIComponent(pubIdentity)}`);
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('pub ws timeout')), 5000);
    pubWS.once('open', () => { clearTimeout(to); resolve(); });
    pubWS.once('error', (e) => { clearTimeout(to); reject(e as any); });
  });
  pubWS.send(JSON.stringify({ action: 'join_room', roomName: email, token: pubToken, url }));

  const samplesPer10ms = 160; // 10ms @ 16 kHz
  let offset = 0;
  while (offset < pcm16.length) {
    const end = Math.min(offset + samplesPer10ms * 2, pcm16.length);
    const frame = pcm16.subarray(offset, end);
    offset = end;
    pubWS.send(frame);
    await delay(10);
  }
  console.log('✅ Publisher finished streaming');

  // Allow some tail to arrive
  await delay(1500);
  try { pubWS.close(); } catch {}
  // Disable and close subscriber
  try { subWS.send(JSON.stringify({ action: 'subscribe_disable' })); } catch {}
  await delay(200);
  try { subWS.close(); } catch {}

  const outPcm = Buffer.concat(captured);
  const outPath = path.resolve(process.cwd(), outputRel);
  // The bridge downsample path sends 16 kHz PCM
  const outWav = buildWavFile(outPcm, 16000, 1);
  fs.writeFileSync(outPath, outWav);
  console.log(`💾 Wrote roundtrip WAV: ${outPath} (${outPcm.length} bytes)`);
}

run().catch((err) => { console.error('Bridge roundtrip failed:', err); process.exit(1); });
