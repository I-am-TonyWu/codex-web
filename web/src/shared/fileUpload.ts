// Leave room for multipart headers below Cloudflare's 100 MB request limit.
export const FILE_UPLOAD_MAX_BYTES = 90 * 1024 * 1024
export const FILE_UPLOAD_TIMEOUT_MS = 15 * 60_000
