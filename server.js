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

// ── State ─────────────────────────────────────────────────────────────────────
let currentMesh   = null;
let currentCurves = null;
// ─────────────────────────────────────────────────────────────────────────────

// Mesh upload — Processing POSTs OBJ text here
app.post('/upload', (req, res) => {
  currentMesh = req.body;
  const payload = JSON.stringify({ type: 'mesh', data: currentMesh });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
  console.log(`Mesh pushed: ${currentMesh.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Curve upload — Rhino GhPython POSTs JSON array of curves here
app.post('/upload-curves', (req, res) => {
  currentCurves = req.body;
  const payload = JSON.stringify({ type: 'curves', data: currentCurves });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
  console.log(`Curves pushed: ${JSON.stringify(currentCurves).length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

// Serve viewer
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/viewer.html');
});

// WebSocket: send current state to newly connected browser
wss.on('connection', ws => {
  console.log('Viewer connected');
  if (currentMesh)   ws.send(JSON.stringify({ type: 'mesh',   data: currentMesh }));
  if (currentCurves) ws.send(JSON.stringify({ type: 'curves', data: currentCurves }));
  ws.on('close', () => console.log('Viewer disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Relay running on port ${PORT}`));
