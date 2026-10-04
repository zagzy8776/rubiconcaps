/**
 * Cloudinary helpers — signed uploads for profile avatars.
 * Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
import crypto from 'crypto';

const cloud = () => (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const key = () => (process.env.CLOUDINARY_API_KEY || '').trim();
const secret = () => (process.env.CLOUDINARY_API_SECRET || '').trim();

export function cloudinaryConfigured() {
  return Boolean(cloud() && key() && secret());
}

function sign(params) {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(sorted + secret()).digest('hex');
}

/** Params for direct browser upload (unsigned preset optional) or signed. */
export function getSignedUploadParams({ folder = 'rubicon/avatars', publicId } = {}) {
  if (!cloudinaryConfigured()) {
    throw Object.assign(new Error('Cloudinary is not configured on the server'), { status: 503 });
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp,
    folder,
    overwrite: 'true',
    invalidate: 'true',
  };
  if (publicId) params.public_id = publicId;
  const signature = sign(params);
  return {
    cloud_name: cloud(),
    api_key: key(),
    timestamp,
    signature,
    folder: params.folder,
    public_id: publicId || undefined,
    upload_url: `https://api.cloudinary.com/v1_1/${cloud()}/image/upload`,
  };
}

/**
 * Upload a data-URI or remote URL from the server.
 * @param {string} file - data:image/...;base64,... or https URL
 */
export async function uploadImage(file, { folder = 'rubicon/avatars', publicId } = {}) {
  if (!cloudinaryConfigured()) {
    throw Object.assign(new Error('Cloudinary is not configured on the server'), { status: 503 });
  }
  if (!file || typeof file !== 'string') {
    throw Object.assign(new Error('Image file is required'), { status: 400 });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp,
    folder,
    overwrite: 'true',
    invalidate: 'true',
  };
  if (publicId) params.public_id = publicId;
  const signature = sign(params);

  const body = new URLSearchParams();
  body.set('file', file);
  body.set('api_key', key());
  body.set('timestamp', String(timestamp));
  body.set('signature', signature);
  body.set('folder', folder);
  body.set('overwrite', 'true');
  body.set('invalidate', 'true');
  if (publicId) body.set('public_id', publicId);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud()}/image/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || 'Cloudinary upload failed';
    throw Object.assign(new Error(msg), { status: 502 });
  }

  // Prefer face-cropped square delivery URL for avatars
  const public_id = data.public_id;
  const version = data.version;
  const secure_url =
    data.secure_url?.replace('/upload/', '/upload/c_fill,g_face,w_400,h_400,q_auto,f_auto/') ||
    data.secure_url;

  return {
    public_id,
    version,
    secure_url: secure_url || data.url,
    original_url: data.secure_url,
  };
}
