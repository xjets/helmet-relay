const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const http = require('http');
const fs   = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.text({ type: '*/*', limit: '50mb' }));
app.use(express.json({ limit: '10mb' }));
app.use('/matcaps', express.static(__dirname + '/matcaps'));
app.use('/mesh',    express.static(__dirname + '/mesh'));
app.use('/fonts',   express.static(__dirname + '/fonts'));
app.use('/images',  express.static(__dirname + '/images'));

// ── Persistent cache ──────────────────────────────────────────────────────────
// Railway Volume should be mounted at /data.
// Falls back to a local ./cache directory when running without a Volume
// (e.g. local dev, or before the Volume is attached).
const CACHE_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function cachePath(key) {
  return path.join(CACHE_DIR, key + '.cache');
}

function saveCache(key, value) {
  try {
    // JSON-serialise objects/arrays; strings written as-is
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    fs.writeFileSync(cachePath(key), data, 'utf8');
  } catch (e) {
    console.warn(`Cache write failed for ${key}:`, e.message);
  }
}

function loadCache(key) {
  try {
    const p = cachePath(key);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.warn(`Cache read failed for ${key}:`, e.message);
    return null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// ── State — restored from cache on startup ────────────────────────────────────
let currentShell         = loadCache('shell');
let currentCrumple       = loadCache('crumple');
let currentHeadform      = loadCache('headform');
let currentHead          = loadCache('head');
let currentCurves        = loadCache('curves');
let currentCrumpleCurves = loadCache('crumple-curves');
let currentSessionInfo   = loadCache('session-info');
let currentIsoHfA        = loadCache('iso-hf-a');
let currentIsoHfB        = loadCache('iso-hf-b');

// ── Last-modified timestamps (used by viewer polling fallback) ────────────────
const lastUpdated = {
  shell:          currentShell         ? Date.now() : 0,
  crumple:        currentCrumple       ? Date.now() : 0,
  headform:       currentHeadform      ? Date.now() : 0,
  head:           currentHead          ? Date.now() : 0,
  curves:         currentCurves        ? Date.now() : 0,
  'crumple-curves': currentCrumpleCurves ? Date.now() : 0,
  'iso-hf-a':     currentIsoHfA        ? Date.now() : 0,
  'iso-hf-b':     currentIsoHfB        ? Date.now() : 0,
  'session-info': currentSessionInfo   ? Date.now() : 0,
};

console.log(`Cache restored from ${CACHE_DIR}:`,
  ['shell','crumple','headform','head','curves','crumple-curves','iso-hf-a','iso-hf-b','session-info']
    .filter(k => loadCache(k) !== null).join(', ') || 'none');
// ─────────────────────────────────────────────────────────────────────────────

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// Shell
app.post('/upload', (req, res) => {
  currentShell = req.body;
  saveCache('shell', currentShell);
  lastUpdated.shell = Date.now();
  broadcast({ type: 'shell', data: currentShell });
  console.log(`Shell pushed: ${currentShell.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});
app.get('/upload', (req, res) => {
  if (currentShell) res.type('text/plain').send(currentShell); else res.sendStatus(204);
});

// Crumple
app.post('/upload-crumple', (req, res) => {
  currentCrumple = req.body;
  saveCache('crumple', currentCrumple);
  lastUpdated.crumple = Date.now();
  broadcast({ type: 'crumple', data: currentCrumple });
  console.log(`Crumple pushed: ${currentCrumple.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});
app.get('/upload-crumple', (req, res) => {
  if (currentCrumple) res.type('text/plain').send(currentCrumple); else res.sendStatus(204);
});

// Headform
app.post('/upload-headform', (req, res) => {
  currentHeadform = req.body;
  saveCache('headform', currentHeadform);
  lastUpdated.headform = Date.now();
  broadcast({ type: 'headform', data: currentHeadform });
  console.log(`Headform pushed: ${currentHeadform.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});
app.get('/upload-headform', (req, res) => {
  if (currentHeadform) res.type('text/plain').send(currentHeadform); else res.sendStatus(204);
});

// Head
app.post('/upload-head', (req, res) => {
  currentHead = req.body;
  saveCache('head', currentHead);
  lastUpdated.head = Date.now();
  broadcast({ type: 'head', data: currentHead });
  console.log(`Head pushed: ${currentHead.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});
app.get('/upload-head', (req, res) => {
  if (currentHead) res.type('text/plain').send(currentHead); else res.sendStatus(204);
});

// ISO Headform A
app.post('/upload-iso-hf-a', (req, res) => {
  currentIsoHfA = req.body;
  saveCache('iso-hf-a', currentIsoHfA);
  lastUpdated['iso-hf-a'] = Date.now();
  broadcast({ type: 'iso-hf-a', data: currentIsoHfA });
  console.log(`ISO HF A pushed: ${currentIsoHfA.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});
app.get('/upload-iso-hf-a', (req, res) => {
  if (currentIsoHfA) res.type('text/plain').send(currentIsoHfA); else res.sendStatus(204);
});

// ISO Headform B
app.post('/upload-iso-hf-b', (req, res) => {
  currentIsoHfB = req.body;
  saveCache('iso-hf-b', currentIsoHfB);
  lastUpdated['iso-hf-b'] = Date.now();
  broadcast({ type: 'iso-hf-b', data: currentIsoHfB });
  console.log(`ISO HF B pushed: ${currentIsoHfB.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});
app.get('/upload-iso-hf-b', (req, res) => {
  if (currentIsoHfB) res.type('text/plain').send(currentIsoHfB); else res.sendStatus(204);
});

// Curves
app.post('/upload-curves', (req, res) => {
  currentCurves = req.body;
  saveCache('curves', currentCurves);
  lastUpdated.curves = Date.now();
  broadcast({ type: 'curves', data: currentCurves });
  console.log(`Curves pushed: ${JSON.stringify(currentCurves).length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});
app.get('/upload-curves', (req, res) => {
  if (currentCurves) res.type('application/json').send(currentCurves); else res.sendStatus(204);
});

// Crumple curves
app.post('/upload-crumple-curves', (req, res) => {
  currentCrumpleCurves = req.body;
  saveCache('crumple-curves', currentCrumpleCurves);
  lastUpdated['crumple-curves'] = Date.now();
  broadcast({ type: 'crumple-curves', data: currentCrumpleCurves });
  console.log(`Crumple curves pushed: ${JSON.stringify(currentCrumpleCurves).length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});
app.get('/upload-crumple-curves', (req, res) => {
  if (currentCrumpleCurves) res.type('application/json').send(currentCrumpleCurves); else res.sendStatus(204);
});

// Session info
app.post('/upload-session-info', (req, res) => {
  currentSessionInfo = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  saveCache('session-info', currentSessionInfo);
  lastUpdated['session-info'] = Date.now();
  broadcast({ type: 'session-info', data: currentSessionInfo });
  console.log(`Session info updated (${currentSessionInfo.length} chars)`);
  res.sendStatus(200);
});

// ── Polling endpoint — viewer checks this to detect updates ──────────────────
app.get('/state', (req, res) => {
  res.json(lastUpdated);
});

// ── Pick point — viewer POSTs picked mesh coordinate, relay to Processing ────
app.post('/pick-point', (req, res) => {
  const pt = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  console.log(`Pick point: X=${pt.x} Y=${pt.y} Z=${pt.z}`);
  broadcast({ type: 'pick-point', x: pt.x, y: pt.y, z: pt.z });
  res.sendStatus(200);
});

app.get('/session-info', (req, res) => {
  if (currentSessionInfo) {
    res.type('text/plain').send(currentSessionInfo);
  } else {
    res.sendStatus(204);
  }
});

// Serve viewer
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/viewer.html');
});

// Keepalive ping — prevents pong timeout on idle connections
const PING_INTERVAL_MS = 30000;
setInterval(() => {
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.ping();
  });
}, PING_INTERVAL_MS);

// Send full state to newly connected browser
wss.on('connection', ws => {
  console.log('Viewer connected');
  // Notify OTHER connected clients (e.g. Processing listener) that a new viewer joined.
  // Do NOT broadcast back to the connecting client itself — that would cause
  // Processing to trigger a full resend every time it reconnects.
  wss.clients.forEach(client => {
    if (client !== ws && client.readyState === 1) {
      client.send(JSON.stringify({ type: 'new-viewer' }));
    }
  });
  if (currentShell)         ws.send(JSON.stringify({ type: 'shell',         data: currentShell }));
  if (currentCrumple)       ws.send(JSON.stringify({ type: 'crumple',       data: currentCrumple }));
  if (currentHeadform)      ws.send(JSON.stringify({ type: 'headform',      data: currentHeadform }));
  if (currentHead)          ws.send(JSON.stringify({ type: 'head',          data: currentHead }));
  if (currentIsoHfA)        ws.send(JSON.stringify({ type: 'iso-hf-a',      data: currentIsoHfA }));
  if (currentIsoHfB)        ws.send(JSON.stringify({ type: 'iso-hf-b',      data: currentIsoHfB }));
  if (currentCurves)        ws.send(JSON.stringify({ type: 'curves',        data: currentCurves }));
  if (currentCrumpleCurves) ws.send(JSON.stringify({ type: 'crumple-curves',data: currentCrumpleCurves }));
  if (currentSessionInfo)   ws.send(JSON.stringify({ type: 'session-info',  data: currentSessionInfo }));
  ws.on('close', () => console.log('Viewer disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Relay running on port ${PORT}`));
