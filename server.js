const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Auth routes
app.get('/api/auth/challenge', (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address required' });
  const nonce = auth.generateChallenge(address);
  res.json({ nonce });
});

app.post('/api/auth/verify', async (req, res) => {
  const { address, signature, publicKey } = req.body;
  if (!address || !signature || !publicKey) {
    return res.status(400).json({ error: 'address, signature, publicKey required' });
  }
  const valid = await auth.verifyChallenge(address, signature, publicKey);
  if (!valid) return res.status(401).json({ error: 'Invalid signature' });
  db.upsertUser(address);
  const token = auth.signToken(address);
  res.json({ token });
});

// Groove routes (authenticated)
app.get('/api/grooves', auth.requireAuth, (req, res) => {
  const grooves = db.listGrooves(req.address);
  res.json(grooves);
});

app.post('/api/grooves', auth.requireAuth, (req, res) => {
  const { name, svg } = req.body;
  if (!svg) return res.status(400).json({ error: 'svg required' });
  const id = uuidv4();
  const groove = db.saveGroove(id, req.address, name || 'Untitled Groove', svg);
  res.status(201).json(groove);
});

app.get('/api/grooves/:id', auth.requireAuth, (req, res) => {
  const groove = db.getGroove(req.params.id, req.address);
  if (!groove) return res.status(404).json({ error: 'Not found' });
  res.json(groove);
});

app.delete('/api/grooves/:id', auth.requireAuth, (req, res) => {
  const deleted = db.deleteGroove(req.params.id, req.address);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
