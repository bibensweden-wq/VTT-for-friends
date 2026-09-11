import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Code/build artifacts always resolve from the checked-out application root.
export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

// Runtime state can live on a persistent cloud volume without moving the built client.
// Railway exposes its attached volume mount path automatically; VTT_DATA_ROOT remains
// available as a provider-agnostic override for other hosts/self-hosting setups.
const runtimeRoot = process.env.VTT_DATA_ROOT || process.env.RAILWAY_VOLUME_MOUNT_PATH;
export const RUNTIME_ROOT = runtimeRoot ? path.resolve(runtimeRoot) : PROJECT_ROOT;

export const DATA_DIR = path.join(RUNTIME_ROOT, 'data');
export const UPLOADS_DIR = path.join(RUNTIME_ROOT, 'uploads');
export const MAPS_DIR = path.join(UPLOADS_DIR, 'maps');
export const TOKENS_DIR = path.join(UPLOADS_DIR, 'tokens');
export const CLIENT_DIST_DIR = path.join(PROJECT_ROOT, 'apps', 'client', 'dist');
