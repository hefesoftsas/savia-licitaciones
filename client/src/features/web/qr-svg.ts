// Minimal pure-TypeScript QR Code generator (Byte mode, EC Level L, Versions 1-10)
// for rendering local TOTP setup QR codes without external requests or dependencies.

type VersionSpec = {
  version: number;
  size: number;
  dataCodewords: number;
  ecPerBlock: number;
  g1Blocks: number;
  g1Data: number;
  g2Blocks: number;
  g2Data: number;
  align: number[];
};

const VERSIONS: VersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecPerBlock: 7, g1Blocks: 1, g1Data: 19, g2Blocks: 0, g2Data: 0, align: [] },
  { version: 2, size: 25, dataCodewords: 34, ecPerBlock: 10, g1Blocks: 1, g1Data: 34, g2Blocks: 0, g2Data: 0, align: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecPerBlock: 15, g1Blocks: 1, g1Data: 55, g2Blocks: 0, g2Data: 0, align: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecPerBlock: 20, g1Blocks: 1, g1Data: 80, g2Blocks: 0, g2Data: 0, align: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecPerBlock: 26, g1Blocks: 1, g1Data: 108, g2Blocks: 0, g2Data: 0, align: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecPerBlock: 18, g1Blocks: 2, g1Data: 68, g2Blocks: 0, g2Data: 0, align: [6, 34] },
  { version: 7, size: 45, dataCodewords: 156, ecPerBlock: 20, g1Blocks: 2, g1Data: 78, g2Blocks: 0, g2Data: 0, align: [6, 22, 38] },
  { version: 8, size: 49, dataCodewords: 194, ecPerBlock: 24, g1Blocks: 2, g1Data: 97, g2Blocks: 0, g2Data: 0, align: [6, 24, 42] },
  { version: 9, size: 53, dataCodewords: 232, ecPerBlock: 30, g1Blocks: 2, g1Data: 116, g2Blocks: 0, g2Data: 0, align: [6, 26, 46] },
  { version: 10, size: 57, dataCodewords: 274, ecPerBlock: 18, g1Blocks: 2, g1Data: 68, g2Blocks: 2, g2Data: 69, align: [6, 28, 50] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

function encodeBits(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  // Mode 0100 (byte)
  pushBits(0b0100, 4);
  pushBits(bytes.length, spec.version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);
  const totalBits = spec.dataCodewords * 8;
  const terminator = Math.min(4, totalBits - bits.length);
  pushBits(0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);
  const out = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
    out[i] = v;
  }
  let padIdx = 0;
  for (let i = bits.length / 8; i < spec.dataCodewords; i++) {
    out[i] = padIdx % 2 === 0 ? 0xec : 0x11;
    padIdx++;
  }
  return out;
}

function interleaveCodewords(data: Uint8Array, spec: VersionSpec): Uint8Array {
  const blocks: { data: Uint8Array; ec: Uint8Array }[] = [];
  let offset = 0;
  for (let i = 0; i < spec.g1Blocks; i++) {
    const slice = data.slice(offset, offset + spec.g1Data);
    offset += spec.g1Data;
    blocks.push({ data: slice, ec: rsComputeEc(slice, spec.ecPerBlock) });
  }
  for (let i = 0; i < spec.g2Blocks; i++) {
    const slice = data.slice(offset, offset + spec.g2Data);
    offset += spec.g2Data;
    blocks.push({ data: slice, ec: rsComputeEc(slice, spec.ecPerBlock) });
  }
  const maxDataLen = Math.max(spec.g1Data, spec.g2Data);
  const result: number[] = [];
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of blocks) {
      if (i < blk.data.length) result.push(blk.data[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const blk of blocks) {
      result.push(blk.ec[i]);
    }
  }
  return new Uint8Array(result);
}

function formatBits(mask: number): number {
  // EC Level L = 01
  const data = (0b01 << 3) | mask;
  let rem = data << 10;
  const poly = 0x537;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) rem ^= poly << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number): number {
  let rem = version << 12;
  const poly = 0x1f25;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) rem ^= poly << (i - 12);
  }
  return (version << 12) | rem;
}

function buildMatrix(spec: VersionSpec, codewords: Uint8Array, mask: number): boolean[][] {
  const n = spec.size;
  const modules: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  const reserved: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false));

  const setFixed = (r: number, c: number, val: boolean) => {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      modules[r][c] = val;
      reserved[r][c] = true;
    }
  };

  const placeFinder = (row: number, col: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFixed(r, c, inOuter || inInner);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, n - 7);
  placeFinder(n - 7, 0);

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    setFixed(6, i, i % 2 === 0);
    setFixed(i, 6, i % 2 === 0);
  }

  // Dark module
  setFixed(4 * spec.version + 9, 8, true);

  // Alignment patterns
  for (const ar of spec.align) {
    for (const ac of spec.align) {
      if (reserved[ar][ac]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const val = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setFixed(ar + dr, ac + dc, val);
        }
      }
    }
  }

  // Reserve format info areas and write format bits
  const fmt = formatBits(mask);
  for (let i = 0; i <= 5; i++) {
    const bit = ((fmt >>> i) & 1) === 1;
    setFixed(8, i, bit);
    setFixed(n - 1 - i, 8, bit);
  }
  setFixed(8, 7, ((fmt >>> 6) & 1) === 1);
  setFixed(n - 7, 8, ((fmt >>> 6) & 1) === 1);
  setFixed(8, 8, ((fmt >>> 7) & 1) === 1);
  setFixed(8, n - 8, ((fmt >>> 7) & 1) === 1);
  setFixed(7, 8, ((fmt >>> 8) & 1) === 1);
  setFixed(8, n - 7, ((fmt >>> 8) & 1) === 1);
  for (let i = 9; i < 15; i++) {
    const bit = ((fmt >>> i) & 1) === 1;
    setFixed(14 - i, 8, bit);
    setFixed(8, n - 15 + i, bit);
  }

  // Version info for versions >= 7
  if (spec.version >= 7) {
    const vBits = versionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = n - 11 + (i % 3);
      setFixed(a, b, bit);
      setFixed(b, a, bit);
    }
  }

  // Place data bits
  const maskFn = (r: number, c: number): boolean => {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  };

  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < n; step++) {
      const row = upward ? n - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (reserved[row][c]) continue;
        let bit = false;
        if (bitIndex < totalBits) {
          bit = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
        modules[row][c] = bit !== maskFn(row, c);
      }
    }
    upward = !upward;
  }
  return modules;
}

function penaltyScore(modules: boolean[][]): number {
  const n = modules.length;
  let score = 0;
  // Rule 1: 5+ consecutive same-color modules
  for (let r = 0; r < n; r++) {
    let run = 1;
    for (let c = 1; c < n; c++) {
      if (modules[r][c] === modules[r][c - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let c = 0; c < n; c++) {
    let run = 1;
    for (let r = 1; r < n; r++) {
      if (modules[r][c] === modules[r - 1][c]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  // Rule 2: 2x2 blocks
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
    }
  }
  // Rule 4: dark ratio
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modules[r][c]) dark++;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

export function generateQrSvgPath(text: string, quietZone = 4): { viewBoxSize: number; path: string } | null {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSIONS.find((v) => {
    const headerBits = 4 + (v.version <= 9 ? 8 : 16);
    const neededBytes = Math.ceil((headerBits + bytes.length * 8) / 8);
    return neededBytes <= v.dataCodewords;
  });
  if (!spec) return null;

  const data = encodeBits(bytes, spec);
  const codewords = interleaveCodewords(data, spec);

  let bestModules = buildMatrix(spec, codewords, 0);
  let bestScore = penaltyScore(bestModules);
  for (let mask = 1; mask < 8; mask++) {
    const candidate = buildMatrix(spec, codewords, mask);
    const score = penaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestModules = candidate;
    }
  }

  const n = spec.size;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (bestModules[r][c]) parts.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
    }
  }
  return { viewBoxSize: n + quietZone * 2, path: parts.join('') };
}
