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

// ── OBJ parsing & merging (for accumulating ISO HF meshes) ──────────────────
function parseOBJ(objString) {
  const lines = objString.split('\n');
  const vertices = [], normals = [], faces = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0]) continue;
    if (parts[0] === 'v' && parts.length >= 4) {
      vertices.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (parts[0] === 'vn' && parts.length >= 4) {
      normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (parts[0] === 'f' && parts.length >= 4) {
      const face = [];
      for (let i = 1; i < parts.length; i++) {
        const indices = parts[i].split('//');
        face.push({
          vi: parseInt(indices[0]) - 1,
          ni: indices[1] ? parseInt(indices[1]) - 1 : -1
        });
      }
      faces.push(face);
    }
  }
  return { vertices, normals, faces };
}

function mergeOBJs(currentOBJ, newOBJ) {
  if (!currentOBJ || currentOBJ.trim() === '') return newOBJ;
  const current = parseOBJ(currentOBJ);
  const incoming = parseOBJ(newOBJ);

  const vertexOffset = current.vertices.length;
  const normalOffset = current.normals.length;

  // Append vertices and normals
  current.vertices.push(...incoming.vertices);
  current.normals.push(...incoming.normals);

  // Append faces with offset indices
  for (const face of incoming.faces) {
    const offsetFace = face.map(v => ({
      vi: v.vi + vertexOffset,
      ni: v.ni >= 0 ? v.ni + normalOffset : -1
    }));
    current.faces.push(offsetFace);
  }

  // Reconstruct OBJ
  let output = '# Combined ISO Headform mesh\n';
  for (const v of current.vertices) {
    output += `v ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}\n`;
  }
  for (const n of current.normals) {
    output += `vn ${n[0].toFixed(6)} ${n[1].toFixed(6)} ${n[2].toFixed(6)}\n`;
  }
  for (const face of current.faces) {
    const faceStr = face.map(v =>
      v.ni >= 0 ? `${v.vi + 1}//${v.ni + 1}` : `${v.vi + 1}`
    ).join(' ');
    output += `f ${faceStr}\n`;
  }
  return output;
}

// Shell
app.post('/upload', (req, res) => {
  currentShell = req.body;
  saveCache('shell', currentShell);
  broadcast({ type: 'shell', data: currentShell });
  console.log(`Shell pushed: ${currentShell.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Crumple
app.post('/upload-crumple', (req, res) => {
  currentCrumple = req.body;
  saveCache('crumple', currentCrumple);
  broadcast({ type: 'crumple', data: currentCrumple });
  console.log(`Crumple pushed: ${currentCrumple.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Headform
app.post('/upload-headform', (req, res) => {
  currentHeadform = req.body;
  saveCache('headform', currentHeadform);
  broadcast({ type: 'headform', data: currentHeadform });
  console.log(`Headform pushed: ${currentHeadform.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Head
app.post('/upload-head', (req, res) => {
  currentHead = req.body;
  saveCache('head', currentHead);
  broadcast({ type: 'head', data: currentHead });
  console.log(`Head pushed: ${currentHead.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// ISO Headform A — merge with existing (accumulate all uploads)
app.post('/upload-iso-hf-a', (req, res) => {
  currentIsoHfA = mergeOBJs(currentIsoHfA, req.body);
  saveCache('iso-hf-a', currentIsoHfA);
  broadcast({ type: 'iso-hf-a', data: currentIsoHfA });
  console.log(`ISO HF A merged: ${currentIsoHfA.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// ISO Headform B — merge with existing (accumulate all uploads)
app.post('/upload-iso-hf-b', (req, res) => {
  currentIsoHfB = mergeOBJs(currentIsoHfB, req.body);
  saveCache('iso-hf-b', currentIsoHfB);
  broadcast({ type: 'iso-hf-b', data: currentIsoHfB });
  console.log(`ISO HF B merged: ${currentIsoHfB.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Curves
app.post('/upload-curves', (req, res) => {
  currentCurves = req.body;
  saveCache('curves', currentCurves);
  broadcast({ type: 'curves', data: currentCurves });
  console.log(`Curves pushed: ${JSON.stringify(currentCurves).length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Crumple curves
app.post('/upload-crumple-curves', (req, res) => {
  currentCrumpleCurves = req.body;
  saveCache('crumple-curves', currentCrumpleCurves);
  broadcast({ type: 'crumple-curves', data: currentCrumpleCurves });
  console.log(`Crumple curves pushed: ${JSON.stringify(currentCrumpleCurves).length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Session info
app.post('/upload-session-info', (req, res) => {
  currentSessionInfo = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  saveCache('session-info', currentSessionInfo);
  broadcast({ type: 'session-info', data: currentSessionInfo });
  console.log(`Session info updated (${currentSessionInfo.length} chars)`);
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

// Send full state to newly connected browser
wss.on('connection', ws => {
  console.log('Viewer connected');
  // Notify Processing listener that a new viewer has joined
  broadcast({ type: 'new-viewer' });
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
