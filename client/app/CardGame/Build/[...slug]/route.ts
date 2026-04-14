import { createReadStream } from 'node:fs';
import { statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Unity WebGL lives at repo root `CardGame/Build/` (sibling to `client/`), not under `public/`.
 * Optional override: CARDGAME_BUILD_DIR=/absolute/path/to/Build
 */
function resolveBuildDir(): string {
  const fromEnv = process.env.CARDGAME_BUILD_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), '..', 'CardGame', 'Build');
}

function mimeFor(filePath: string): string {
  const lower = filePath.toLowerCase().replace(/\.br$/i, '');
  if (lower.endsWith('.js') || lower.endsWith('.framework.js')) {
    return 'application/javascript; charset=utf-8';
  }
  if (lower.endsWith('.wasm')) return 'application/wasm';
  if (lower.endsWith('.data')) return 'application/octet-stream';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.symbols.json')) return 'application/json';
  return 'application/octet-stream';
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug?: string[] }> },
) {
  const { slug = [] } = await context.params;
  if (!slug.length) {
    return new NextResponse('Not found', { status: 404 });
  }

  const segments = slug.map((s) => decodeURIComponent(s)).filter((p) => p && p !== '.' && p !== '..');
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
  if (filePath.toLowerCase().endsWith('.br')) {
    headers.set('Content-Encoding', 'br');
  }

  return new NextResponse(webStream, { status: 200, headers });
}
