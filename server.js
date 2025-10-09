import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import 'dotenv/config';
import initializeSocketManager from './socket/socketManager.js';

const app = express();
app.use(cors());

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.status(200).send('Touch World Server is running!');
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // In production, restrict this to your app's domain
    methods: ["GET", "POST"]
  }
});

initializeSocketManager(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is live and listening on port ${PORT}`);
});
