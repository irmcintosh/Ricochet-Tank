(() => {
  'use strict';

  // =========================================================================
  // Compact Pure-JS QR Code Encoder (Byte Mode, ECC Level L, Versions 1-20)
  // =========================================================================
  const QR = (() => {
    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

    function gfMul(a, b) {
      return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
    }

    function rsPoly(deg) {
      let poly = [1];
      for (let i = 0; i < deg; i++) {
        const next = new Array(poly.length + 1).fill(0);
        const factor = EXP[i];
        for (let j = 0; j < poly.length; j++) {
          next[j] ^= poly[j];
          next[j + 1] ^= gfMul(poly[j], factor);
        }
        poly = next;
      }
      return poly;
    }

    function rsEncode(data, ecCount) {
      const gen = rsPoly(ecCount);
      const res = new Uint8Array(data.length + ecCount);
      res.set(data);
      for (let i = 0; i < data.length; i++) {
        const coef = res[i];
        if (coef !== 0) {
          for (let j = 1; j < gen.length; j++) {
            res[i + j] ^= gfMul(gen[j], coef);
          }
        }
      }
      return res.slice(data.length);
    }

    // Version 1..20 Level L tables: [totalCodewords, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data]
    const VER_L = [
      null,
      [26, 7, 1, 19, 0, 0],
      [44, 10, 1, 34, 0, 0],
      [70, 15, 1, 55, 0, 0],
      [100, 20, 1, 80, 0, 0],
      [134, 26, 1, 108, 0, 0],
      [172, 18, 2, 68, 0, 0],
      [196, 20, 2, 78, 0, 0],
      [242, 24, 2, 97, 0, 0],
      [292, 30, 2, 116, 0, 0],
      [346, 18, 2, 68, 2, 69],
      [404, 20, 4, 81, 0, 0],
      [466, 24, 2, 92, 2, 93],
      [532, 26, 4, 107, 0, 0],
      [581, 30, 3, 115, 1, 116],
      [655, 22, 5, 87, 1, 88],
      [733, 24, 5, 98, 1, 99],
      [815, 28, 1, 107, 5, 108],
      [901, 30, 5, 120, 1, 121],
      [991, 28, 3, 113, 4, 114],
      [1085, 28, 3, 107, 5, 108],
    ];

    const ALIGN = [
      [],
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
    ];

    function bchFormat(val) {
      let d = val << 10;
      for (let i = 4; i >= 0; i--) {
        if (d & (1 << (i + 10))) d ^= 0x537 << i;
      }
      return ((val << 10) | d) ^ 0x5412;
    }

    function bchVersion(ver) {
      let d = ver << 12;
      for (let i = 5; i >= 0; i--) {
        if (d & (1 << (i + 12))) d ^= 0x1f25 << i;
      }
      return (ver << 12) | d;
    }

    function encode(text) {
      const bytes = new TextEncoder().encode(text);
      let ver = 1;
      for (; ver < VER_L.length; ver++) {
        const [, , b1, d1, b2, d2] = VER_L[ver];
        const capBytes = b1 * d1 + b2 * d2;
        const countBits = ver <= 9 ? 8 : 16;
        const neededBits = 4 + countBits + bytes.length * 8;
        if (neededBits <= capBytes * 8) break;
      }
      if (ver >= VER_L.length) return null;

      const [, ecPer, b1, d1, b2, d2] = VER_L[ver];
      const totalDataBytes = b1 * d1 + b2 * d2;
      const bits = [];
      const pushBits = (val, n) => {
        for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
      };

      pushBits(0b0100, 4); // Byte mode
      pushBits(bytes.length, ver <= 9 ? 8 : 16);
      for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);
      for (let i = 0; i < 4 && bits.length < totalDataBytes * 8; i++) bits.push(0);
      while (bits.length % 8 !== 0) bits.push(0);

      const dataBytes = [];
      for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
        dataBytes.push(byte);
      }
      const pads = [0xec, 0x11];
      let pi = 0;
      while (dataBytes.length < totalDataBytes) {
        dataBytes.push(pads[pi++ % 2]);
      }

      // Split into blocks & interleave
      const blocks = [];
      const ecBlocks = [];
      let offset = 0;
      for (let i = 0; i < b1; i++) {
        const blk = dataBytes.slice(offset, offset + d1);
        offset += d1;
        blocks.push(blk);
        ecBlocks.push(rsEncode(blk, ecPer));
      }
      for (let i = 0; i < b2; i++) {
        const blk = dataBytes.slice(offset, offset + d2);
        offset += d2;
        blocks.push(blk);
        ecBlocks.push(rsEncode(blk, ecPer));
      }

      const finalBytes = [];
      const maxDataLen = Math.max(d1, d2);
      for (let i = 0; i < maxDataLen; i++) {
        for (let j = 0; j < blocks.length; j++) {
          if (i < blocks[j].length) finalBytes.push(blocks[j][i]);
        }
      }
      for (let i = 0; i < ecPer; i++) {
        for (let j = 0; j < ecBlocks.length; j++) {
          finalBytes.push(ecBlocks[j][i]);
        }
      }

      const size = ver * 4 + 17;
      const mod = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
      const func = Array.from({ length: size }, () => new Uint8Array(size));

      const setFunc = (r, c, v) => {
        if (r < 0 || r >= size || c < 0 || c >= size) return;
        mod[r][c] = v ? 1 : 0;
        func[r][c] = 1;
      };

      const placeFinder = (row, col) => {
        for (let dr = -1; dr <= 7; dr++) {
          for (let dc = -1; dc <= 7; dc++) {
            const rr = row + dr;
            const cc = col + dc;
            if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
            const onBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
            const outer = dr === 0 || dr === 6 || dc === 0 || dc === 6;
            const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
            setFunc(rr, cc, !onBorder && (outer || inner));
          }
        }
      };

      placeFinder(0, 0);
      placeFinder(0, size - 7);
      placeFinder(size - 7, 0);

      // Alignment patterns
      const ap = ALIGN[ver];
      for (let i = 0; i < ap.length; i++) {
        for (let j = 0; j < ap.length; j++) {
          const r = ap[i];
          const c = ap[j];
          if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const v = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
              setFunc(r + dr, c + dc, v);
            }
          }
        }
      }

      // Timing patterns
      for (let i = 8; i < size - 8; i++) {
        if (!func[6][i]) setFunc(6, i, i % 2 === 0);
        if (!func[i][6]) setFunc(i, 6, i % 2 === 0);
      }

      // Dark module & reserve format info
      setFunc(size - 8, 8, true);
      for (let i = 0; i < 9; i++) {
        if (!func[8][i]) setFunc(8, i, false);
        if (!func[i][8]) setFunc(i, 8, false);
      }
      for (let i = 0; i < 8; i++) {
        if (!func[8][size - 1 - i]) setFunc(8, size - 1 - i, false);
        if (!func[size - 1 - i][8]) setFunc(size - 1 - i, 8, false);
      }

      // Version info for ver >= 7
      if (ver >= 7) {
        const vb = bchVersion(ver);
        for (let i = 0; i < 18; i++) {
          const bit = ((vb >> i) & 1) === 1;
          const a = Math.floor(i / 3);
          const b = (i % 3) + size - 11;
          setFunc(a, b, bit);
          setFunc(b, a, bit);
        }
      }

      // Place data bits in zig-zag
      let byteIdx = 0;
      let bitIdx = 7;
      let dir = -1;
      for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        for (let step = 0; step < size; step++) {
          const row = dir < 0 ? size - 1 - step : step;
          for (let dx = 0; dx < 2; dx++) {
            const c = col - dx;
            if (func[row][c]) continue;
            let bit = 0;
            if (byteIdx < finalBytes.length) {
              bit = (finalBytes[byteIdx] >> bitIdx) & 1;
              bitIdx--;
              if (bitIdx < 0) {
                bitIdx = 7;
                byteIdx++;
              }
            }
            // Apply mask 0: (row + col) % 2 === 0
            if ((row + c) % 2 === 0) bit ^= 1;
            mod[row][c] = bit;
          }
        }
        dir = -dir;
      }

      // Format info: ECC Level L (0b01) + Mask 0 (0b000) => 0b01000
      const fmt = bchFormat(0b01000);
      for (let i = 0; i < 15; i++) {
        const bit = ((fmt >> i) & 1) === 1 ? 1 : 0;
        if (i < 6) mod[8][i] = bit;
        else if (i < 8) mod[8][i + 1] = bit;
        else mod[8][size - 15 + i] = bit;

        if (i < 8) mod[size - 1 - i][8] = bit;
        else if (i === 8) mod[7][8] = bit;
        else mod[14 - i][8] = bit;
      }

      return { size, mod };
    }

    function renderToCanvas(canvas, text) {
      if (!canvas) return false;
      const qr = encode(text);
      const ctx = canvas.getContext('2d');
      if (!qr || !ctx) return false;

      const quiet = 3;
      const cells = qr.size + quiet * 2;
      const w = canvas.width;
      const h = canvas.height;
      const cellSize = Math.floor(Math.min(w, h) / cells);
      const totalPx = cellSize * cells;
      const offX = Math.floor((w - totalPx) * 0.5);
      const offY = Math.floor((h - totalPx) * 0.5);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#0f172a';
      for (let r = 0; r < qr.size; r++) {
        for (let c = 0; c < qr.size; c++) {
          if (qr.mod[r][c] === 1) {
            ctx.fillRect(offX + (c + quiet) * cellSize, offY + (r + quiet) * cellSize, cellSize, cellSize);
          }
        }
      }
      return true;
    }

    return { encode, renderToCanvas };
  })();

  // =========================================================================
  // Compact Deflate-Raw + Base64url SDP Serialization
  // =========================================================================
  function bytesToBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function trimDataChannelSdp(sdp) {
    const lines = sdp.split(/\r?\n/);
    const kept = [];
    let candCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('a=candidate:')) {
        // Keep UDP/host/srflx candidates, prefer IPv4 host candidates first, cap total to keep code short
        if (candCount >= 6) continue;
        if (line.includes(' tcptype ') && !line.includes(' typ host')) continue;
        candCount++;
        kept.push(line);
      } else if (
        line.startsWith('v=') ||
        line.startsWith('o=') ||
        line.startsWith('s=') ||
        line.startsWith('t=') ||
        line.startsWith('c=') ||
        line.startsWith('m=') ||
        line.startsWith('a=group:') ||
        line.startsWith('a=ice-ufrag:') ||
        line.startsWith('a=ice-pwd:') ||
        line.startsWith('a=ice-options:') ||
        line.startsWith('a=fingerprint:') ||
        line.startsWith('a=setup:') ||
        line.startsWith('a=mid:') ||
        line.startsWith('a=sctp-port:') ||
        line.startsWith('a=max-message-size:')
      ) {
        kept.push(line);
      }
    }
    return kept.join('\r\n') + '\r\n';
  }

  async function encodeSignal(desc) {
    const payload = JSON.stringify({
      t: desc.type === 'offer' ? 'o' : 'a',
      s: trimDataChannelSdp(desc.sdp || ''),
    });
    const rawBytes = new TextEncoder().encode(payload);
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const writer = cs.writable.getWriter();
        writer.write(rawBytes);
        writer.close();
        const buf = await new Response(cs.readable).arrayBuffer();
        return 'RT2:' + bytesToBase64Url(new Uint8Array(buf));
      } catch (_) {
        // Fall through to uncompressed base64url
      }
    }
    return 'RT1:' + bytesToBase64Url(rawBytes);
  }

  async function decodeSignal(code) {
    const clean = String(code || '').trim();
    if (!clean) throw new Error('Empty session code');
    let jsonStr = '';
    if (clean.startsWith('RT2:')) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Device WebView does not support compressed signal format');
      }
      const compressed = base64UrlToBytes(clean.slice(4));
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compressed);
      writer.close();
      const buf = await new Response(ds.readable).arrayBuffer();
      jsonStr = new TextDecoder().decode(buf);
    } else if (clean.startsWith('RT1:')) {
      const raw = base64UrlToBytes(clean.slice(4));
      jsonStr = new TextDecoder().decode(raw);
    } else {
      // Allow raw JSON paste fallback
      jsonStr = clean;
    }
    const parsed = JSON.parse(jsonStr);
    const type = parsed.t === 'o' || parsed.type === 'offer' ? 'offer' : 'answer';
    const sdp = parsed.s || parsed.sdp;
    if (!sdp) throw new Error('Malformed session code');
    return { type, sdp };
  }

  // =========================================================================
  // Serverless WebRTC Peer-to-Peer Session (State + Event DataChannels)
  // =========================================================================
  class PeerComms {
    constructor(handlers = {}) {
      this.handlers = handlers;
      this.pc = null;
      this.stateChannel = null;
      this.eventChannel = null;
      this.role = null; // 'host' | 'client'
      this.connected = false;
      this.pingTimer = null;
      this.lastPingSent = 0;
    }

    emitStatus(code, text) {
      if (this.handlers.onStatus) this.handlers.onStatus(code, text);
    }

    createPeerConnection() {
      this.close();
      const RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (!RTCPeer) {
        throw new Error('WebRTC RTCPeerConnection unavailable on this device');
      }
      // Empty iceServers ensures instant host local Wi-Fi/Hotspot gathering without requiring internet,
      // while optional STUN fallback helps across complex NATs if internet is reachable.
      const pc = new RTCPeer({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        iceCandidatePoolSize: 0,
      });

      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        if (st === 'checking') {
          this.emitStatus('searching', 'SEARCHING LOCAL PEER...');
        } else if (st === 'connected' || st === 'completed') {
          this.checkReady();
        } else if (st === 'disconnected' || st === 'failed' || st === 'closed') {
          if (this.connected) {
            this.connected = false;
            this.emitStatus('disconnected', 'P2P LINK LOST');
          }
        }
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') {
          this.checkReady();
        } else if (st === 'failed' || st === 'closed') {
          if (this.connected) {
            this.connected = false;
            this.emitStatus('disconnected', 'P2P LINK CLOSED');
          }
        }
      };

      this.pc = pc;
      return pc;
    }

    bindChannel(ch, kind) {
      if (kind === 'state') this.stateChannel = ch;
      if (kind === 'events') this.eventChannel = ch;

      ch.onopen = () => this.checkReady();
      ch.onclose = () => {
        if (this.connected) {
          this.connected = false;
          this.emitStatus('disconnected', 'P2P CHANNEL CLOSED');
        }
      };
      ch.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.t === 'ping') {
            this.sendEvent({ t: 'pong', ts: msg.ts });
            return;
          }
          if (msg.t === 'pong') {
            const rtt = Math.max(1, Math.round(performance.now() - msg.ts));
            if (this.handlers.onRtt) this.handlers.onRtt(rtt);
            return;
          }
          if (kind === 'state' && this.handlers.onStateMessage) {
            this.handlers.onStateMessage(msg);
          } else if (kind === 'events' && this.handlers.onEventMessage) {
            this.handlers.onEventMessage(msg);
          }
        } catch (_) {
          // Ignore malformed transient packets
        }
      };
    }

    checkReady() {
      const stateOpen = this.stateChannel && this.stateChannel.readyState === 'open';
      const eventOpen = this.eventChannel && this.eventChannel.readyState === 'open';
      if (stateOpen && eventOpen && !this.connected) {
        this.connected = true;
        this.emitStatus('connected', 'P2P LINK ESTABLISHED');
        if (this.pingTimer === null) {
          this.pingTimer = window.setInterval(() => {
            if (this.connected) {
              this.sendEvent({ t: 'ping', ts: performance.now() });
            }
          }, 1500);
        }
      }
    }

    waitForIceGathering(pc) {
      return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve(pc.localDescription);
          return;
        }
        let hasHostCandidate = false;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          pc.removeEventListener('icegatheringstatechange', onState);
          pc.removeEventListener('icecandidate', onCand);
          resolve(pc.localDescription);
        };
        const onState = () => {
          if (pc.iceGatheringState === 'complete') finish();
        };
        const onCand = (ev) => {
          if (!ev.candidate) {
            finish();
          } else if (ev.candidate.candidate && ev.candidate.candidate.includes(' typ host')) {
            if (!hasHostCandidate) {
              hasHostCandidate = true;
              // Allow brief window for extra local/STUN candidates, then finalize fast on offline hotspots
              window.setTimeout(finish, 900);
            }
          }
        };
        pc.addEventListener('icegatheringstatechange', onState);
        pc.addEventListener('icecandidate', onCand);
        window.setTimeout(finish, 2400);
      });
    }

    async hostCreateOffer() {
      this.role = 'host';
      this.emitStatus('gathering', 'GENERATING HOST CODE...');
      const pc = this.createPeerConnection();
      const sCh = pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
      const eCh = pc.createDataChannel('events', { ordered: true });
      this.bindChannel(sCh, 'state');
      this.bindChannel(eCh, 'events');

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const gathered = await this.waitForIceGathering(pc);
      const code = await encodeSignal(gathered);
      this.emitStatus('waiting_answer', 'SHARE CODE & AWAIT P2 RESPONSE');
      return { code };
    }

    async hostAcceptAnswer(answerCode) {
      if (!this.pc || this.role !== 'host') {
        throw new Error('Generate Host Code first');
      }
      this.emitStatus('searching', 'SEARCHING LOCAL PEER...');
      const desc = await decodeSignal(answerCode);
      if (desc.type !== 'answer') {
        throw new Error('Expected Joiner Response Code');
      }
      await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
    }

    async joinCreateAnswer(offerCode) {
      this.role = 'client';
      this.emitStatus('gathering', 'READING HOST CODE...');
      const pc = this.createPeerConnection();
      pc.ondatachannel = (ev) => {
        if (ev.channel.label === 'state') this.bindChannel(ev.channel, 'state');
        else if (ev.channel.label === 'events') this.bindChannel(ev.channel, 'events');
      };

      const desc = await decodeSignal(offerCode);
      if (desc.type !== 'offer') {
        throw new Error('Expected Host Session Code');
      }
      await pc.setRemoteDescription(new RTCSessionDescription(desc));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const gathered = await this.waitForIceGathering(pc);
      const code = await encodeSignal(gathered);
      this.emitStatus('searching', 'SEARCHING LOCAL PEER...');
      return { code };
    }

    sendState(obj) {
      if (!this.stateChannel || this.stateChannel.readyState !== 'open') return;
      try {
        this.stateChannel.send(JSON.stringify(obj));
      } catch (_) {}
    }

    sendEvent(obj) {
      if (!this.eventChannel || this.eventChannel.readyState !== 'open') return;
      try {
        this.eventChannel.send(JSON.stringify(obj));
      } catch (_) {}
    }

    close() {
      this.connected = false;
      if (this.pingTimer !== null) {
        window.clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (this.stateChannel) {
        try { this.stateChannel.close(); } catch (_) {}
        this.stateChannel = null;
      }
      if (this.eventChannel) {
        try { this.eventChannel.close(); } catch (_) {}
        this.eventChannel = null;
      }
      if (this.pc) {
        try { this.pc.close(); } catch (_) {}
        this.pc = null;
      }
    }
  }

  window.RicochetComms = {
    PeerComms,
    renderQrToCanvas: QR.renderToCanvas,
  };
})();
