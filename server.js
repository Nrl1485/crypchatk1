const express = require('express');
const path = require('path'); // WAJIB: Module Path untuk routing file statis
const app = express();
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// ===============================================
// SETUP SERVER (EXPRESS & SOCKET.IO)
// ===============================================

// Middleware
app.use(cors());
app.use(express.json());

// Express akan menyajikan file statis (index.html, dll.) dari root directory
// Ini memperbaiki error "Cannot GET /index.html"
app.use(express.static(path.join(__dirname, '')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// ===============================================
// DATABASE SIMULASI (DEMO)
// ===============================================

const users = {}; 
const chatHistory = []; 

function generateKeys() {
    // Kunci RSA Sederhana untuk Demo
    return { n: 55, e: 3, d: 27 }; 
}


// ===============================================
// ENDPOINT REST API & ROUTING
// ===============================================

// 1. Root Endpoint (Menyajikan Frontend)
app.get('/', (req, res) => {
    // Sekarang, route utama menyajikan file index.html Anda
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Endpoint Registrasi
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users[username]) {
        return res.status(400).json({ message: "Username sudah terdaftar." });
    }
    
    const keys = generateKeys();
    users[username] = { password, ...keys, socketId: null };
    
    return res.status(200).json({ message: "Registrasi berhasil! Silakan Login." });
});

// 3. Endpoint Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    
    if (!user || user.password !== password) {
        return res.status(401).json({ message: "Username atau password salah." });
    }

    return res.status(200).json({ 
        message: "Login berhasil!",
        pubKey: { n: user.n, e: user.e, d: user.d } 
    });
});

// 4. Endpoint Ambil Public Key
app.get('/key/:username', (req, res) => {
    const username = req.params.username;
    const user = users[username];
    
    if (!user) {
        return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    return res.status(200).json({ 
        message: "Public Key ditemukan.",
        pubKey: { n: user.n, e: user.e } 
    });
});


// ===============================================
// SOCKET.IO LOGIC
// ===============================================

io.on('connection', (socket) => {
    let currentUsername = null;

    // A. Pengguna Login dan Online
    socket.on('user_online', (username) => {
        currentUsername = username;
        if (users[username]) {
            users[username].socketId = socket.id;
        }
    });

    // B. Kirim Pesan
    socket.on('send_message', (msgData) => {
        chatHistory.push(msgData); 
        
        const receiver = users[msgData.to];
        if (receiver && receiver.socketId) {
            io.to(receiver.socketId).emit('new_message', msgData);
        }
        
        io.to(socket.id).emit('new_message', msgData); 
    });

    // C. Minta Riwayat Chat
    socket.on('request_chat_history', ({ currentUser, currentFriend }) => {
        const history = chatHistory.filter(msg => 
            (msg.from === currentUser && msg.to === currentFriend) ||
            (msg.from === currentFriend && msg.to === currentUser)
        );
        socket.emit('chat_history', history);
    });

    // D. Pengguna Disconnect
    socket.on('disconnect', () => {
        if (currentUsername && users[currentUsername]) {
            users[currentUsername].socketId = null;
        }
    });
});


// ===============================================
// EKSPOR UNTUK VERCEL (WAJIB)
// ===============================================

module.exports = server;