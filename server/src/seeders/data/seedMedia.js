'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const SEED_MEDIA_DIR = path.join(__dirname, 'media');

/** Stable upload filenames — re-running seeders overwrites the same files. */
const SEED_MEDIA_FILES = {
  imageGeography: { file: 'seed_showdown_image_geography.png', type: 'image', source: 'seed-image-geography.png' },
  imageScience: { file: 'seed_showdown_image_science.png', type: 'image', source: 'seed-image-science.png' },
  imageHistory: { file: 'seed_showdown_image_history.jpeg', type: 'image', source: 'seed-image-history.jpeg' },
  imageTech: { file: 'seed_showdown_image_tech.png', type: 'image', source: 'seed-image-tech.png' },
  musicUplifting: { file: 'seed_showdown_music_uplifting.mp3', type: 'mp3', source: 'seed-music-uplifting.mp3' },
  musicOrchestral: { file: 'seed_showdown_music_orchestral.mp3', type: 'mp3', source: 'seed-music-orchestral.mp3' },
  videoObservation: { file: 'seed_showdown_video_observation.mp4', type: 'mp4', source: 'seed-video-observation.mp4' },
};

const MIME_BY_EXT = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
};

const loadEnv = () => {
  const root = path.resolve(__dirname, '../../../../');
  for (const file of ['.env.production', '.env.development', '.env']) {
    const envPath = path.join(root, file);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }
};

const resolveUploadDir = () => {
  const candidates = [
    path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    path.resolve(process.cwd(), 'server', 'uploads'),
    path.resolve(__dirname, '..', '..', '..', 'uploads'),
  ];
  const existing = candidates.find((dir) => fs.existsSync(dir));
  return existing || candidates[0];
};

/**
 * Copy bundled seed media into storage and return API/S3 paths keyed by SEED_MEDIA_FILES keys.
 */
async function ensureSeedMediaUrls() {
  loadEnv();
  const useS3 = process.env.STORAGE_BACKEND === 's3';

  if (useS3) {
    const storage = require('../../services/storage');
    const urls = {};
    for (const [key, meta] of Object.entries(SEED_MEDIA_FILES)) {
      const src = path.join(SEED_MEDIA_DIR, meta.source);
      if (!fs.existsSync(src)) {
        throw new Error(`Missing seed media file: ${src}`);
      }
      const buffer = fs.readFileSync(src);
      const ext = meta.source.split('.').pop()?.toLowerCase() || '';
      const result = await storage.saveFile({
        filename: meta.file,
        buffer,
        contentType: MIME_BY_EXT[ext] || 'application/octet-stream',
      });
      urls[key] = {
        mediaUrl: result.url,
        mediaType: meta.type,
      };
    }
    return urls;
  }

  const uploadDir = resolveUploadDir();
  fs.mkdirSync(uploadDir, { recursive: true });

  const urls = {};
  for (const [key, meta] of Object.entries(SEED_MEDIA_FILES)) {
    const src = path.join(SEED_MEDIA_DIR, meta.source);
    const dest = path.join(uploadDir, meta.file);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing seed media file: ${src}`);
    }
    fs.copyFileSync(src, dest);
    urls[key] = {
      mediaUrl: `/api/media/files/${meta.file}`,
      mediaType: meta.type,
    };
  }
  return urls;
}

module.exports = {
  SEED_MEDIA_FILES,
  ensureSeedMediaUrls,
};
