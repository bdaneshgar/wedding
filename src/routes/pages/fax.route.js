// routes/pages/fax.route.js
const express = require('express');
const hbs = require('hbs');
const axios = require('axios');
const FaxScript = require('../../models/faxScript.model');
const Fax = require('../../models/fax.model'); // (optional; not used directly here)
const mqtt = require('mqtt');

const router = express.Router();
const ESP_SECRET_KEY = process.env.ESP_SECRET_KEY || null;

// --- MQTT ---
const mqttClient = mqtt.connect('mqtt://briandaneshgar.com');
mqttClient.on('connect', () => {
  console.log('[mqtt] Connected to broker');
});
mqttClient.on('error', (err) => {
  console.error('[mqtt] error:', err.message);
});

// --- helpers ---
function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, pair) => {
    const [key, ...v] = pair.trim().split('=');
    if (!key) return acc;
    acc[decodeURIComponent(key)] = decodeURIComponent(v.join('='));
    return acc;
  }, {});
}

function requireAuth(req, res) {
  const cookies = parseCookies(req);
  const authed = cookies.auth === 'ok';
  if (!authed) {
    res.redirect('/?error=1');
    return false;
  }
  return true;
}

// pacific time
function nowInPT() {
  const tz = 'America/Los_Angeles';
  const d = new Date();
  const date = new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'full' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  return { date, time };
}

// --- single expansion pipeline used by both routes ---
async function expandCommands(commands) {
  const { date, time } = nowInPT();

  // 1) Replace {{date}} / {{time}} placeholders
  commands = (commands || []).map((cmd) => {
    if (cmd && typeof cmd.value === 'string') {
      return {
        ...cmd,
        value: cmd.value.replace('{{date}}', date).replace('{{time}}', time),
      };
    }
    return cmd;
  });

  // 2) Expand groceries → fetch meal + print ingredients & instructions
  const hasGroceries = commands.some((c) => c && c.action === 'groceries');
  if (hasGroceries) {
    try {
      console.log('[groceries] fetching random meal from TheMealDB…');
      const r = await axios.get('https://www.themealdb.com/api/json/v1/1/random.php', { timeout: 7000 });
      console.log('[groceries] API status:', r.status);
      const meal = r.data?.meals?.[0];

      if (!meal) {
        console.warn('[groceries] No meal returned from API');
      } else {
        const groceryCmds = [];

        // title
        groceryCmds.push({ action: 'boldOn' });
        groceryCmds.push({ action: 'justify', value: 'C' });
        groceryCmds.push({ action: 'print', value: meal.strMeal });
        groceryCmds.push({ action: 'boldOff' });
        groceryCmds.push({ action: 'justify', value: 'L' });
        groceryCmds.push({ action: 'feed', value: 1 });

        // ingredients
        groceryCmds.push({ action: 'print', value: 'Ingredients:' });
        for (let i = 1; i <= 20; i++) {
          const ing = meal[`strIngredient${i}`];
          const measure = meal[`strMeasure${i}`];
          if (ing && String(ing).trim()) {
            const line = `- ${String(measure || '').trim()} ${String(ing).trim()}`.trim();
            groceryCmds.push({ action: 'print', value: line });
          }
        }
        groceryCmds.push({ action: 'feed', value: 1 });

        // divider
        groceryCmds.push({ action: 'line' });
        groceryCmds.push({ action: 'feed', value: 1 });

        // instructions
        if (meal.strInstructions) {
          groceryCmds.push({ action: 'print', value: 'Instructions:' });
          const steps = String(meal.strInstructions)
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          steps.forEach((step, idx) => {
            groceryCmds.push({ action: 'print', value: `${idx + 1}. ${step}` });
          });
          groceryCmds.push({ action: 'feed', value: 2 });
        }

        // replace each {action:"groceries"} with expanded list
        commands = commands.flatMap((cmd) => (cmd.action === 'groceries' ? groceryCmds : cmd));
      }
    } catch (err) {
      console.error('[groceries] expansion failed:', err.message);
      // Optionally replace with a friendly fallback:
      commands = commands.flatMap((cmd) =>
        cmd.action === 'groceries'
          ? [
              { action: 'boldOn' },
              { action: 'print', value: 'Recipe unavailable' },
              { action: 'boldOff' },
              { action: 'feed', value: 1 },
            ]
          : cmd
      );
    }
  }

  return commands;
}

// ------------------- PAGES -------------------

/**
 * GET /projects/fax
 * browser page with editor + previews
 */
router.get('/projects/fax', async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const latestScript = await FaxScript.findOne({ project: 'fax' }).sort({ createdAt: -1 });

    const sampleCode = `{
  "commands": [
    { "action": "boldOn" },
    { "action": "justify", "value": "C" },
    { "action": "print", "value": "Hello Brian!" },
    { "action": "newline" },
    { "action": "line" },
    { "action": "boldOff" },
    { "action": "feed", "value": 2 }
  ]
}`;

    res.render('fax', {
      title: 'fax',
      active: 'fax',
      authed: true,
      latestScript,
      sampleCode,
      ESP_KEY: ESP_SECRET_KEY || null,
    });
  } catch (err) {
    console.error('render /projects/fax error:', err.message);
    res.redirect('/?error=1');
  }
});

/**
 * POST /projects/:project/save-script
 * save new script to mongo
 */
router.post('/projects/:project/save-script', async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const { project } = req.params;
    const { script } = req.body;

    if (!script || typeof script !== 'string') {
      console.error('save script error: missing script in body');
      return res.status(400).send('missing "script" in body');
    }

    await FaxScript.create({ project, script });
    return res.redirect(`/projects/${project}`);
  } catch (err) {
    console.error('save script error:', err.message);
    return res.status(500).send('error saving script');
  }
});

// ------------------- DEVICE ENDPOINT -------------------

/**
 * GET /projects/:project/script.txt
 * device endpoint: compile script w/ live context → JSON commands
 */
router.get('/projects/:project/script.txt', async (req, res) => {
  try {
    if (ESP_SECRET_KEY && req.query.key !== ESP_SECRET_KEY) {
      return res.status(403).type('text/plain').send('forbidden');
    }

    const { project } = req.params;
    const doc = await FaxScript.findOne({ project }).sort({ createdAt: -1 });

    let commands = [];
    if (doc?.script) {
      try {
        const parsed = JSON.parse(doc.script);
        commands = parsed.commands || [];
      } catch (e) {
        console.error('script not valid JSON, using empty commands');
      }
    }

    const expanded = await expandCommands(commands);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ commands: expanded });
  } catch (err) {
    console.error('dynamic script render error:', err.message);
    return res.status(500).type('text/plain').send('PRINT error');
  }
});

// ------------------- BROADCAST -------------------

/**
 * POST /projects/fax/broadcast
 * Publishes the same expanded commands (as /script.txt) to MQTT topic fax/all
 * Expects the textarea JSON in `req.body.message`
 * Returns JSON so the page can show inline success.
 */
router.post('/projects/fax/broadcast', async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).send('Missing "message"');
    }

    // Parse textarea as JSON
    let commands = [];
    try {
      const parsed = JSON.parse(message);
      commands = parsed.commands || [];
    } catch (e) {
      console.error('[broadcast] invalid JSON from message:', e.message);
      return res.status(400).send('Invalid JSON');
    }

    // Run through the same expander
    const expanded = await expandCommands(commands);
    const payload = JSON.stringify({ commands: expanded });

    // Publish to MQTT
    mqttClient.publish('fax/all', payload, { qos: 1 }, (err) => {
      if (err) {
        console.error('[mqtt] publish error:', err);
        return res.status(500).send('Failed to publish');
      }
      console.log('[mqtt] published to fax/all:', payload);

      // Respond JSON so front-end can show a toast / inline banner
      return res.json({ ok: true, commands: expanded });
    });
  } catch (err) {
    console.error('Broadcast error:', err);
    return res.status(500).send('Broadcast error');
  }
});

module.exports = router;