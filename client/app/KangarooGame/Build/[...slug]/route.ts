import { createReadStream } from 'node:fs';
import { closeSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { openSync } from 'node:fs';
import { readSync } from 'node:fs';
import { statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Unity WebGL lives at repo root `KangarooGame/Build/` (sibling to `client/`), not under `public/`.
 * Optional override: KANGAROO_BUILD_DIR=/absolute/path/to/Build
 */
function isDirectory(dirPath: string): boolean {
  if (!existsSync(dirPath)) return false;
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveBuildDir(): string {
  const fromEnv = process.env.KANGAROO_BUILD_DIR?.trim();
  if (fromEnv) {
    const envPath = path.resolve(fromEnv);
    if (isDirectory(envPath)) return envPath;
  }

  const candidates = [
    path.resolve(process.cwd(), 'KangarooGame', 'Build'),
    path.resolve(process.cwd(), '..', 'KangarooGame', 'Build'),
  ];

  for (const candidate of candidates) {
    if (isDirectory(candidate)) return candidate;
  }

  return candidates[0];
}

function mimeFor(filePath: string): string {
  const lower = filePath.toLowerCase().replace(/\.(br|br)$/i, '');
  if (lower.endsWith('.js') || lower.endsWith('.br')) {
    return 'application/javascript; charset=utf-8';
  }
  if (lower.endsWith('.wasm') || lower.endsWith('.wasm.br')) return 'application/wasm';
  if (lower.endsWith('.data') || lower.endsWith('.data.br')) return 'application/octet-stream';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.symbols.json')) return 'application/json';
  return 'application/octet-stream';
}

function contentEncodingFor(filePath: string): 'gzip' | 'br' | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.br')) return 'br';
  if (!lower.endsWith('.br')) return null;

  // Unity .unityweb may be gzip or brotli depending on build settings.
  // If it starts with gzip magic bytes (1f 8b), set gzip; otherwise default to br.
  try {
    const fd = openSync(filePath, 'r');
    const head = Buffer.allocUnsafe(2);
    const read = readSync(fd, head, 0, 2, 0);
    closeSync(fd);
    if (read === 2 && head[0] === 0x1f && head[1] === 0x8b) {
      return 'gzip';
    }
  } catch {
    // If sniffing fails, keep existing Unity convention default.
  }

  return 'br';
}

export async function GET(_request: Request, context: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await context.params;
  if (!slug.length) {
    return new NextResponse('Not found', { status: 404 });
  }

  const segments = slug
    .map((s) => decodeURIComponent(s))
    .filter((p) => p && p !== '.' && p !== '..');
  if (segments.length !== slug.length) {
    return new NextResponse('Bad request', { status: 400 });
  }

  const buildDir = resolveBuildDir();
  const filePath = path.resolve(buildDir, ...segments);
  const rel = path.relative(buildDir, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(filePath);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  if (!st.isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

  const headers = new Headers();
  headers.set('Content-Type', mimeFor(filePath));
  headers.set('Cache-Control', 'public, max-age=3600');
  const contentEncoding = contentEncodingFor(filePath);
  if (contentEncoding) headers.set('Content-Encoding', contentEncoding);

  return new NextResponse(webStream, { status: 200, headers });
}
