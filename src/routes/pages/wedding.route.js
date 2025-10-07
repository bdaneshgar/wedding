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

// home: password gate, redirect to admin when authed
router.get('/', (req, res) => {
  const cookies = parseCookies(req);
  const authed = cookies.auth === 'ok';
  const hasError = req.query.error === '1';

  if (authed) return res.redirect('/admin');

  res.render('index', {
    title: 'Sign In',
    requirePassword: true,
    error: hasError,
    active: 'home',
  });
});

// handle login
router.post('/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  if (password === HOME_PASSWORD) {
    res.setHeader(
      'Set-Cookie',
      ['auth=ok; Path=/; HttpOnly; SameSite=Lax'] // add Secure in prod
    );
    return res.redirect('/admin');
  }
  return res.redirect('/?error=1');
});

// handle logout (post only)
router.post('/logout', (req, res) => {
  res.setHeader(
    'Set-Cookie',
    ['auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax']
  );
  return res.redirect('/');
});

// wedding
router.get('/invitation', (req, res) => {
  const cookies = parseCookies(req);
  const authed = cookies.auth === 'ok';
  if (!authed) return res.redirect('/?error=1');

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
  } catch (err) {
    galleryPhotos = [];
  }

  res.render('wedding', {
    title: 'Brian & Hannah',
    active: 'wedding',
    authed: true,
    galleryPhotos,
  });
});

// projects list page (sample data)
router.get('/projects', (req, res) => {
  const cookies = parseCookies(req);
  const authed = cookies.auth === 'ok';
  if (!authed) return res.redirect('/?error=1');

  const projects = [
    { id: 'fax', name: 'marketing site refresh', owner: 'alice', status: 'in progress', updated: 'today' },
    { id: 'project2', name: 'mobile app v2', owner: 'bob', status: 'planning', updated: 'yesterday' },
    { id: 'project3', name: 'data pipeline revamp', owner: 'carol', status: 'blocked', updated: '3 days ago' },
  ];

  res.render('projects', {
    title: 'Projects',
    active: 'projects',
    authed: true,
    projects,
  });
});

module.exports = router;
