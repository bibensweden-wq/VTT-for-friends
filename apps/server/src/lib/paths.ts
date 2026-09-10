import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PROJECT_ROOT = process.env.VTT_ROOT
  ? path.resolve(process.env.VTT_ROOT)
  : path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const UPLOADS_DIR = path.join(PROJECT_ROOT, 'uploads');
export const MAPS_DIR = path.join(UPLOADS_DIR, 'maps');
export const TOKENS_DIR = path.join(UPLOADS_DIR, 'tokens');
export const CLIENT_DIST_DIR = path.join(PROJECT_ROOT, 'apps', 'client', 'dist');
