/**
 * Profile avatar routes — Cloudinary-backed.
 */
import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware, adminMiddleware } from '../auth.js';
import { cloudinaryConfigured, getSignedUploadParams, uploadImage } from '../cloudinary.js';

const router = Router();

const MAX_DATA_URI_CHARS = 6_500_000; // ~5MB base64

function validateDataUri(image) {
  const s = String(image || '');
  if (!s.startsWith('data:image/')) {
    return { ok: false, error: 'Image must be a JPEG, PNG, or WebP data URI' };
  }
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(s)) {
    return { ok: false, error: 'Only JPEG, PNG, and WebP images are allowed' };
  }
  if (s.length > MAX_DATA_URI_CHARS) {
    return { ok: false, error: 'Image is too large (max about 5 MB)' };
  }
  return { ok: true };
}

/** GET signed params for direct client upload (optional advanced flow). */
router.get('/api/profile/avatar/sign', authMiddleware, async (req, res) => {
  try {
    if (!cloudinaryConfigured()) {
      return res.status(503).json({
        error: 'Photo uploads are not available yet. Contact support.',
        configured: false,
      });
    }
    const publicId = `user_${req.user.id}`;
    const params = getSignedUploadParams({ folder: 'rubicon/avatars', publicId });
    res.json({ ...params, configured: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not prepare upload' });
  }
});

/** Customer: upload avatar (base64 data URI) → Cloudinary → save URL. */
router.patch('/api/profile/avatar', authMiddleware, async (req, res) => {
  try {
    const image = req.body?.image;
    // Empty string = remove avatar
    if (image === '' || image === null) {
      await query(`UPDATE profiles SET avatar_url = NULL WHERE id = $1`, [req.user.id]);
      return res.json({ success: true, avatar_url: null });
    }

    // Already a Cloudinary / https URL from client-side upload
    if (typeof image === 'string' && /^https:\/\//i.test(image)) {
      if (!/res\.cloudinary\.com|cloudinary/i.test(image) && !process.env.ALLOW_ANY_AVATAR_URL) {
        return res.status(400).json({ error: 'Avatar URL must come from our media service' });
      }
      const { rows } = await query(
        `UPDATE profiles SET avatar_url = $1 WHERE id = $2 RETURNING id, avatar_url`,
        [image, req.user.id]
      );
      return res.json({ success: true, avatar_url: rows[0]?.avatar_url });
    }

    const check = validateDataUri(image);
    if (!check.ok) return res.status(400).json({ error: check.error });

    if (!cloudinaryConfigured()) {
      // Fallback: store data URI only if under 200KB (dev without Cloudinary)
      if (String(image).length > 200_000) {
        return res.status(503).json({
          error: 'Photo service is not configured. Please try again later or contact support.',
        });
      }
      const { rows } = await query(
        `UPDATE profiles SET avatar_url = $1 WHERE id = $2 RETURNING id, avatar_url`,
        [image, req.user.id]
      );
      return res.json({ success: true, avatar_url: rows[0]?.avatar_url, warning: 'stored_inline' });
    }

    const uploaded = await uploadImage(image, {
      folder: 'rubicon/avatars',
      publicId: `user_${req.user.id}`,
    });

    const { rows } = await query(
      `UPDATE profiles SET avatar_url = $1 WHERE id = $2 RETURNING id, avatar_url, full_name`,
      [uploaded.secure_url, req.user.id]
    );

    res.json({
      success: true,
      avatar_url: rows[0]?.avatar_url,
      public_id: uploaded.public_id,
    });
  } catch (err) {
    console.error('avatar upload:', err);
    res.status(err.status || 500).json({ error: err.message || 'Could not update profile photo' });
  }
});

/** Admin: set any user avatar the same way. */
router.patch('/api/admin/users/:id/avatar', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const image = String(req.body?.image || req.body?.avatar_url || '');
    if (image === '') {
      await query(`UPDATE profiles SET avatar_url = NULL WHERE id = $1`, [req.params.id]);
      return res.json({ success: true, avatar_url: null });
    }

    let url = image;
    if (image.startsWith('data:image/')) {
      const check = validateDataUri(image);
      if (!check.ok) return res.status(400).json({ error: check.error });
      if (cloudinaryConfigured()) {
        const uploaded = await uploadImage(image, {
          folder: 'rubicon/avatars',
          publicId: `user_${req.params.id}`,
        });
        url = uploaded.secure_url;
      }
    }

    const { rows } = await query(
      `UPDATE profiles SET avatar_url = $1 WHERE id = $2 RETURNING id, full_name, avatar_url`,
      [url, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('admin avatar:', err);
    res.status(err.status || 500).json({ error: err.message || 'Avatar update failed' });
  }
});

router.get('/api/media/status', (_req, res) => {
  res.json({ cloudinary: cloudinaryConfigured() });
});

export default router;
