const express = require('express');
const router = express.Router();

// simple cookie parser
const parseCookies = (req) => {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, pair) => {
    const [key, ...v] = pair.trim().split('=');
    if (!key) return acc;
    acc[decodeURIComponent(key)] = decodeURIComponent(v.join('='));
    return acc;
  }, {});
};

const FAMILY_PASSWORD = process.env.FAMILY_PASSWORD || 'family';
const HOME_PASSWORD = process.env.HOME_PASSWORD || 'admin';

// get /family: login gate, then show family tree
router.get('/', (req, res) => {
  const cookies = parseCookies(req);
  const authed = cookies.familyAuth === 'ok';
  const hasError = req.query.error === '1';

  if (!authed) {
    return res.render('family-login', {
      title: 'Family Login',
      requirePassword: true,
      error: hasError,
      authed: false,
    });
  }

  return res.render('family-tree', {
    title: 'Family Tree',
    authed: false,
  });
});

// post /family/login: check family password only
router.post('/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
if (password === FAMILY_PASSWORD || password === HOME_PASSWORD) {
    res.setHeader('Set-Cookie', ['familyAuth=ok; Path=/family; HttpOnly; SameSite=Lax']);
    return res.redirect('/family');
  }
  return res.redirect('/family?error=1');
});

// post /family/logout: clear cookie and redirect back
router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', [
    'familyAuth=; Path=/family; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
  ]);
  return res.redirect('/family');
});

module.exports = router;
