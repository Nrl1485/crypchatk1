const express = require('express');
const app = express();
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// ===============================================
// SETUP SERVER (EXPRESS & SOCKET.IO)
// ===============================================

// Middleware (Wajib untuk Express API di Vercel)
app.use(cors());
app.use(express.json());

// Untuk mengatasi masalah CORS/Socket.io di Vercel
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Izinkan semua origin
    methods: ["GET", "POST"]
  }
});

// ===============================================
// DATABASE SIMULASI (DEMO, HANYA DISIMPAN DI MEMORI SERVER)
// ===============================================

// Di lingkungan nyata, ini harusnya pakai MongoDB/PostgreSQL
const users = {}; // { username: { password, n, e, d, socketId } }
const chatHistory = []; // [{ from, to, enc }]

// Fungsi Sederhana untuk RSA Key Generation (Hanya untuk Demo Server)
function generateKeys() {
    // Sederhana: n=55, e=3, d=27 (p=5, q=11, phi=40)
    // Di aplikasi nyata, gunakan nilai yang JAUH lebih besar
    return { n: 55, e: 3, d: 27 };
}


// ===============================================
// ENDPOINT REST API (REGISTER & LOGIN)
// ===============================================

// 1. Endpoint Registrasi
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users[username]) {
        return res.status(400).json({ message: "Username sudah terdaftar." });
    }
    
    const keys = generateKeys();
    users[username] = { password, ...keys, socketId: null };
    
    return res.status(200).json({ message: "Registrasi berhasil! Silakan Login." });
});

// 2. Endpoint Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    
    if (!user || user.password !== password) {
        return res.status(401).json({ message: "Username atau password salah." });
    }

    // Kirim Public dan Private Key (untuk demo)
    return res.status(200).json({ 
        message: "Login berhasil!",
        pubKey: { n: user.n, e: user.e, d: user.d } 
    });
});

// 3. Endpoint Ambil Public Key
app.get('/key/:username', (req, res) => {
    const username = req.params.username;
    const user = users[username];
    
    if (!user) {
        return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    // Kirim Public Key saja
    return res.status(200).json({ 
        message: "Public Key ditemukan.",
        pubKey: { n: user.n, e: user.e } 
    });
});

// 4. Root Endpoint (Untuk Cek Status Vercel)
app.get('/', (req, res) => {
    res.status(200).send('CrypChat Backend Server is running on Vercel.');
});


// ===============================================
// SOCKET.IO LOGIC
// ===============================================

io.on('connection', (socket) => {
    console.log(`[Socket.IO] New connection: ${socket.id}`);
    let currentUsername = null;

    // A. Pengguna Login dan Online
    socket.on('user_online', (username) => {
        currentUsername = username;
        if (users[username]) {
            users[username].socketId = socket.id;
            console.log(`[Socket.IO] User ${username} is online.`);
        }
    });

    // B. Kirim Pesan
    socket.on('send_message', (msgData) => {
        // Simpan pesan terenkripsi ke history
        chatHistory.push(msgData); 
        
        // Cek apakah penerima online
        const receiver = users[msgData.to];
        if (receiver && receiver.socketId) {
            // Kirim ke penerima
            io.to(receiver.socketId).emit('new_message', msgData);
        }
        
        // Kirim balik ke pengirim (untuk update tampilan)
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
            console.log(`[Socket.IO] User ${currentUsername} disconnected.`);
        }
        console.log(`[Socket.IO] Disconnected: ${socket.id}`);
    });
});


// ===============================================
// EKSPOR UNTUK VERCEL (WAJIB)
// ===============================================

// Hapus/komentari app.listen(), lalu export server yang menaungi Socket.IO
module.exports = server;