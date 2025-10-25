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
const SECRET = process.env.JWT_SECRET; // JWT secret from environment

// ===== Middleware =====
app.use(cors({
  origin: "https://linkapp-2.onrender.com", // set your frontend URL in Render env
  credentials: true,
}));
app.use(express.json());

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected ✅'))
  .catch(err => console.log('MongoDB Connection Error ❌', err));

// ===== User Schema =====
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
});
const User = mongoose.model('User', userSchema);

// ===== Health Check =====
app.get('/', (req, res) => res.send('Backend is running! 🚀'));

// ===== Signup =====
app.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashed });
    await user.save();

    res.json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== Login =====
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    const token = jwt.sign({ username: user.username, email: user.email }, SECRET, { expiresIn: '1h' });
    res.json({ token, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== Socket.IO Setup =====
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://linkapp-2.onrender.com", // frontend URL from env
    methods: ["GET", "POST"],
  }
});

const onlineUsers = new Map();

// ===== Socket Authentication =====
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

  // Emit online users list
  io.emit('online_users', Array.from(onlineUsers.keys()));

  // Private message
  socket.on('send_private_message', ({ to, text }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_private_message', {
        from: username,
        text,
      });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    onlineUsers.delete(username);
    io.emit('online_users', Array.from(onlineUsers.keys()));
    console.log(`${username} disconnected`);
  });
});

// ===== Start Server =====
server.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
