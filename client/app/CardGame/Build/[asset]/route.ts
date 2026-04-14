import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const LEGACY_NAME_MAP: Record<string, string[]> = {
  'CardGame.loader.js': ['CardGame.loader.js', 'Card Shuffle.loader.js'],
  'CardGame.framework.js': ['CardGame.framework.js', 'Card Shuffle.framework.js'],
  'CardGame.data': ['CardGame.data', 'Card Shuffle.data'],
  'CardGame.wasm': ['CardGame.wasm', 'Card Shuffle.wasm'],
  'CardGame.framework.js.br': ['CardGame.framework.js.br', 'Card Shuffle.framework.js.br'],
  'CardGame.data.br': ['CardGame.data.br', 'Card Shuffle.data.br'],
  'CardGame.wasm.br': ['CardGame.wasm.br', 'Card Shuffle.wasm.br'],
};

const BUILD_DIR_CANDIDATES = [
  path.resolve(process.cwd(), 'CardGame', 'Build'),
  path.resolve(process.cwd(), '..', 'CardGame', 'Build'),
  path.resolve(process.cwd(), '..', '..', 'CardGame', 'Build'),
  path.resolve(process.cwd(), 'public', 'CardGame', 'Build'),
];

const getHeadersForAsset = (assetName: string) => {
  const headers = new Headers();
  headers.set('Cache-Control', 'no-store');

  if (assetName.endsWith('.js') || assetName.endsWith('.js.br')) {
    headers.set('Content-Type', 'application/javascript');
  } else if (assetName.endsWith('.wasm') || assetName.endsWith('.wasm.br')) {
    headers.set('Content-Type', 'application/wasm');
  } else if (assetName.endsWith('.data') || assetName.endsWith('.data.br')) {
    headers.set('Content-Type', 'application/octet-stream');
  }

  if (assetName.endsWith('.br')) {
    headers.set('Content-Encoding', 'br');
  }

  return headers;
};

const findAssetPath = async (assetName: string) => {
  const candidateNames = LEGACY_NAME_MAP[assetName] || [assetName];

  for (const buildDir of BUILD_DIR_CANDIDATES) {
    for (const candidateName of candidateNames) {
      const fullPath = path.join(buildDir, candidateName);
      try {
        await fs.access(fullPath);
        return { fullPath, resolvedName: candidateName };
      } catch {
        // Try next candidate.
      }
    }
  }

  return null;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ asset: string }> },
) {
  const { asset } = await context.params;
  const match = await findAssetPath(asset);

  if (!match) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const fileBuffer = await fs.readFile(match.fullPath);
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: getHeadersForAsset(match.resolvedName),
  });
}
