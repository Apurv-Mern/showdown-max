'use strict';

const fs = require('fs');
const path = require('path');

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

function resolveUploadDir() {
  const candidates = [
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd(), 'server', 'uploads'),
    path.resolve(__dirname, '..', '..', '..', 'uploads'),
  ];
  const existing = candidates.find((dir) => fs.existsSync(dir));
  return existing || candidates[0];
}

/**
 * Copy bundled seed media into UPLOAD_DIR and return API paths keyed by SEED_MEDIA_FILES keys.
 */
function ensureSeedMediaUrls() {
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
