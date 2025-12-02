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

module.exports = router;
