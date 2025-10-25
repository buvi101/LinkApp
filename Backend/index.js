require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// ===== User Schema =====
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
});
const User = mongoose.model('User', userSchema);

// ===== Signup =====
app.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ message: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ username, email, password: hashed });
  await user.save();

  res.json({ message: 'User registered successfully' });
});

// ===== Login =====
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: 'Invalid email or password' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ message: 'Invalid email or password' });

  const token = jwt.sign({ username: user.username, email: user.email }, SECRET, { expiresIn: '1h' });
  res.json({ token, username: user.username });
});

// ===== Socket Setup =====
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const onlineUsers = new Map();

// ===== Middleware for Socket Authentication =====
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return next(new Error('Invalid token'));
    socket.user = decoded;
    next();
  });
});

// ===== Socket Events =====
io.on('connection', (socket) => {
  const username = socket.user.username;
  onlineUsers.set(username, socket.id);

  console.log(`${username} connected`);
  io.emit('online_users', Array.from(onlineUsers.keys()));

  socket.on('send_private_message', ({ to, text }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_private_message', {
        from: username,
        text,
      });
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(username);
    io.emit('online_users', Array.from(onlineUsers.keys()));
    console.log(`${username} disconnected`);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
