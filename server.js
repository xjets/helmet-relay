const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.text({ type: '*/*', limit: '50mb' }));
app.use('/matcaps', express.static(__dirname + '/matcaps'));
app.use('/mesh', express.static(__dirname + '/mesh'));
app.use('/images', express.static(__dirname + '/images'));

let currentMesh = null;

app.post('/upload', (req, res) => {
  currentMesh = req.body;
  const payload = JSON.stringify({ type: 'mesh', data: currentMesh });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
  console.log(`Mesh pushed: ${currentMesh.length} bytes, viewers: ${wss.clients.size}`);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/viewer.html');
});

wss.on('connection', ws => {
  console.log('Viewer connected');
  if (currentMesh) {
    ws.send(JSON.stringify({ type: 'mesh', data: currentMesh }));
  }
  ws.on('close', () => console.log('Viewer disconnected'));
});

// Railway assigns PORT via environment variable
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Relay running on port ${PORT}`));
