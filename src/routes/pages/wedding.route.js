const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const HOME_PASSWORD = process.env.HOME_PASSWORD || 'changeme';
const GOOD_TIMES_DIR = path.join(__dirname, '..', '..', '..', 'public', 'img', 'good_times');
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);


const parseCookies = (req) => {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, pair) => {
    const [key, ...v] = pair.trim().split('=');
    if (!key) return acc;
    acc[decodeURIComponent(key)] = decodeURIComponent(v.join('='));
    return acc;
  }, {});
};

// --- PUBLIC RSVP PAGE (no password required) ---
// projects list page (sample data)
router.get('/rsvp', (req, res) => {
  res.render('rsvp', {
    title: 'Brian & Hannah - RSVP',
    active: 'rsvp'
  });
});


// home: password gate, redirect to invitation when authed
router.get('/', (req, res) => {
  const cookies = parseCookies(req);
  const authed = cookies.auth === 'ok';
  const hasError = req.query.error === '1';

  if (authed) return res.redirect('/invitation');

  res.render('index', {
    title: 'Brian & Hannah',
    requirePassword: true,
    error: hasError,
    active: 'home',
  });
});

// handle login
router.post('/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  console.log('[invitation] login attempt');
  if (password === HOME_PASSWORD) {
    res.setHeader(
      'Set-Cookie',
      ['auth=ok; Path=/; HttpOnly; SameSite=Lax'] // add Secure in prod
    );
    console.log('[invitation] login success, redirecting to /invitation');
    return res.redirect('/invitation');
  }
  console.warn('[invitation] login failed');
  return res.redirect('/?error=1');
});

// handle logout (post only)
router.post('/logout', (req, res) => {
  res.setHeader(
    'Set-Cookie',
    ['auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax']
  );
  console.log('[invitation] logout complete');
  return res.redirect('/');
});

// invitation
router.get('/invitation', (req, res) => {
  const cookies = parseCookies(req);
  const authed = cookies.auth === 'ok';
  if (!authed) {
    console.warn('[invitation] unauthorized access attempt');
    return res.redirect('/?error=1');
  }

  let galleryPhotos = [];
  try {
    const files = fs.readdirSync(GOOD_TIMES_DIR, { withFileTypes: true });
    galleryPhotos = files
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map((name) => {
        const base = name.replace(/\.[^.]+$/, '');
        const alt = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Gallery image';
        const webPath = encodeURI(`/img/good_times/${name}`);
        return { src: webPath, href: webPath, alt };
      });
    console.log(`[invitation] loaded ${galleryPhotos.length} gallery images`);
  } catch (err) {
    console.error('[invitation] failed to load gallery images', err);
    galleryPhotos = [];
  }

  res.render('wedding', {
    title: 'Brian & Hannah',
    active: 'wedding',
    authed: true,
    galleryPhotos,
  });
});


module.exports = router;
