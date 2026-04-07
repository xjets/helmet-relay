const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const http = require('http');

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

// ── State ─────────────────────────────────────────────────────────────────────
let currentShell         = null;
let currentCrumple       = null;
let currentHeadform      = null;
let currentHead          = null;
let currentCurves        = null;
let currentCrumpleCurves = null;
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
  broadcast({ type: 'shell', data: currentShell });
  console.log(`Shell pushed: ${currentShell.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Crumple
app.post('/upload-crumple', (req, res) => {
  currentCrumple = req.body;
  broadcast({ type: 'crumple', data: currentCrumple });
  console.log(`Crumple pushed: ${currentCrumple.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Headform
app.post('/upload-headform', (req, res) => {
  currentHeadform = req.body;
  broadcast({ type: 'headform', data: currentHeadform });
  console.log(`Headform pushed: ${currentHeadform.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Head (rarely changes — default loaded client-side from /mesh/AngularHead.obj)
app.post('/upload-head', (req, res) => {
  currentHead = req.body;
  broadcast({ type: 'head', data: currentHead });
  console.log(`Head pushed: ${currentHead.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Curves
app.post('/upload-curves', (req, res) => {
  currentCurves = req.body;
  broadcast({ type: 'curves', data: currentCurves });
  console.log(`Curves pushed: ${JSON.stringify(currentCurves).length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Crumple curves
app.post('/upload-crumple-curves', (req, res) => {
  currentCrumpleCurves = req.body;
  broadcast({ type: 'crumple-curves', data: currentCrumpleCurves });
  console.log(`Crumple curves pushed: ${JSON.stringify(currentCrumpleCurves).length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Serve viewer
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/viewer.html');
});

// Send full state to newly connected browser
wss.on('connection', ws => {
  console.log('Viewer connected');
  if (currentShell)    ws.send(JSON.stringify({ type: 'shell',    data: currentShell }));
  if (currentCrumple)  ws.send(JSON.stringify({ type: 'crumple',  data: currentCrumple }));
  if (currentHeadform) ws.send(JSON.stringify({ type: 'headform', data: currentHeadform }));
  if (currentHead)     ws.send(JSON.stringify({ type: 'head',     data: currentHead }));
  if (currentCurves)        ws.send(JSON.stringify({ type: 'curves',         data: currentCurves }));
  if (currentCrumpleCurves) ws.send(JSON.stringify({ type: 'crumple-curves', data: currentCrumpleCurves }));
  ws.on('close', () => console.log('Viewer disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Relay running on port ${PORT}`));
