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
 * Unity WebGL lives at repo root (sibling to `client/`), not under `public/`.
 * Tracked folder is `KangarooGamebb/Build/`; local clones may use `kangarooGame/` or `KangarooGame/`.
 * Optional override: KANGAROO_BUILD_DIR=/absolute/path/to/Build
 */
const LEGACY_FILE_ALIASES: Record<string, string[]> = {
  'Kangaroo_Build.loader.js': ['kangaroofinal.loader.js', 'Kangaroo_Build.loader.js'],
  'Kangaroo_Build.data.br': ['kangaroofinal.data.br', 'Kangaroo_Build.data.br'],
  'Kangaroo_Build.framework.js.br': ['kangaroofinal.framework.js.br', 'Kangaroo_Build.framework.js.br'],
  'Kangaroo_Build.wasm.br': ['kangaroofinal.wasm.br', 'Kangaroo_Build.wasm.br'],
  'Kangaroo_Build.data': ['kangaroofinal.data', 'Kangaroo_Build.data'],
  'Kangaroo_Build.framework.js': ['kangaroofinal.framework.js', 'Kangaroo_Build.framework.js'],
  'Kangaroo_Build.wasm': ['kangaroofinal.wasm', 'Kangaroo_Build.wasm'],
};

const BUILD_DIR_CANDIDATES = [
  'KangarooGamebb/Build',
  'KangarooGame/Build',
  'kangarooGame/Build',
];

function isDirectory(dirPath: string): boolean {
  if (!existsSync(dirPath)) return false;
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveBuildDir(): string | null {
  const fromEnv = process.env.KANGAROO_BUILD_DIR?.trim();
  if (fromEnv) {
    const envPath = path.resolve(fromEnv);
    if (isDirectory(envPath)) return envPath;
  }

  const roots = [process.cwd(), path.resolve(process.cwd(), '..')];
  for (const root of roots) {
    for (const relative of BUILD_DIR_CANDIDATES) {
      const candidate = path.resolve(root, relative);
      if (isDirectory(candidate)) return candidate;
    }
  }

  return null;
}

function resolveBuildFile(buildDir: string, requestedName: string): string | null {
  const candidates = LEGACY_FILE_ALIASES[requestedName] ?? [requestedName];

  for (const name of candidates) {
    const filePath = path.resolve(buildDir, name);
    const rel = path.relative(buildDir, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    try {
      if (statSync(filePath).isFile()) return filePath;
    } catch {
      // try next alias
    }
  }

  return null;
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

function contentEncodingFor(filePath: string): 'gzip' | 'br' | null {
  const lower = filePath.toLowerCase();
  if (!lower.endsWith('.br')) return null;

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
  if (segments.length !== slug.length || segments.length !== 1) {
    return new NextResponse('Bad request', { status: 400 });
  }

  const buildDir = resolveBuildDir();
  if (!buildDir) {
    return new NextResponse('Kangaroo build directory not found', { status: 404 });
  }

  const filePath = resolveBuildFile(buildDir, segments[0]!);
  if (!filePath) {
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
