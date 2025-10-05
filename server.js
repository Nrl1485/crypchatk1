<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>CrypChat — RSA Real-Time</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js"></script>
    <style>
        /* ... Gaya CSS Anda tetap sama ... */
        body { font-family: Arial, sans-serif; background: #e3f2fd; text-align:center; }
        .card { background:#fff; border-radius:10px; box-shadow:0 2px 6px rgba(0,0,0,0.15);
                width:400px; margin:40px auto; padding:20px; }
        h2 { margin:0 0 10px; color:#1565c0; }
        input { padding:8px; width:80%; margin:6px 0; border:1px solid #ccc; border-radius:6px; }
        button { padding:8px 14px; margin:4px; background:#42a5f5; border:none; border-radius:6px; color:#fff; cursor:pointer; }
        button:hover { background:#1e88e5; }
        .logout { float:right; background:#ccc; color:#000; }
        .chat-box { height:300px; border:1px solid #ddd; border-radius:6px; overflow-y:auto; padding:10px; margin-bottom:10px; background:#fafafa; text-align:left; }
        .msg-me { background:#bbdefb; margin:6px; padding:8px; border-radius:12px; max-width:70%; float:right; clear:both; }
        .msg-other { background:#c8e6c9; margin:6px; padding:8px; border-radius:12px; max-width:70%; float:left; clear:both; }
        small { display:block; color:#555; margin-top:4px; font-size:12px; }
    </style>
</head>
<body>

<div class="card" id="loginCard">
    <h2>CrypChat — RSA Real-Time</h2>
    <input id="username" placeholder="Username unik" maxlength="12">
    <input id="password" type="password" placeholder="Password (min 4 karakter)" maxlength="6">
    <div>
        <button onclick="register()">Daftar</button>
        <button onclick="login()">Login</button>
    </div>
</div>

<div class="card" id="menuCard" style="display:none;">
    <h2 id="userTitle"></h2>
    <button class="logout" onclick="logout()">Logout</button>
    <p id="pubKey"></p>
    <h3>Mulai Chat</h3>
    <input id="friendName" placeholder="Nama teman">
    <button onclick="startChat()">Mulai Chat</button>
</div>

<div class="card" id="chatCard" style="display:none;">
    <h2 id="chatTitle"></h2>
    <button class="logout" onclick="backMenu()">Kembali</button>
    <div class="chat-box" id="chatBox"></div>
    <input id="msgInput" placeholder="Tulis pesan...">
    <button onclick="sendMsg()">Kirim</button>
</div>

<script>
    const SERVER_URL = 'http://localhost:3000';
    let socket; // Variabel untuk koneksi Socket.IO
    let currentUser = null;
    let currentFriend = null;
    let myKeys = {}; // Menyimpan n, e, dan d pengguna saat ini
    let friendPubKey = {}; // Menyimpan n, e Public Key teman
    
    // Fungsi RSA dan ModPow (tetap sama)
    function rsaEncrypt(msg, n, e){
        return msg.split("").map(ch => {
            let m = ch.charCodeAt(0);
            return modPow(m,e,n);
        });
    }
    function rsaDecrypt(cipher, n, d){
        return cipher.map(c => String.fromCharCode(modPow(c,d,n))).join("");
    }
    function modPow(base, exp, mod){
        let res = 1n;
        let b = BigInt(base), e = BigInt(exp), m = BigInt(mod);
        while(e > 0n){
            if(e & 1n) res = (res * b) % m;
            b = (b * b) % m;
            e >>= 1n;
        }
        return Number(res);
    }
    
    // --- START: KOMUNIKASI SERVER ---

    // Register
    async function register(){
        const uname = document.getElementById("username").value.trim();
        const pwd = document.getElementById("password").value.trim();
        if(!uname || pwd.length < 4){ alert("Isi username dan password minimal 4 karakter!"); return; }

        try {
            const response = await fetch(`${SERVER_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: uname, password: pwd })
            });
            const data = await response.json();
            alert(data.message);
        } catch (error) {
            alert("Terjadi kesalahan saat registrasi.");
        }
    }

    // Login
    async function login(){
        const uname = document.getElementById("username").value.trim();
        const pwd = document.getElementById("password").value.trim();
        if(!uname || !pwd){ alert("Isi username dan password!"); return; }

        try {
            const response = await fetch(`${SERVER_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: uname, password: pwd })
            });

            const data = await response.json();
            if(!response.ok){
                alert(data.message);
                return;
            }

            currentUser = uname;
            myKeys = { n: data.pubKey.n, e: data.pubKey.e, d: data.pubKey.d }; // 'd' dari server hanya untuk demo
            
            document.getElementById("loginCard").style.display="none";
            document.getElementById("menuCard").style.display="block";
            document.getElementById("userTitle").innerText = "Selamat datang, " + uname;
            document.getElementById("pubKey").innerText = "Public Key: n=" + myKeys.n + ", e=" + myKeys.e;

            // Inisialisasi Socket.IO dan kirim event user_online
            if (!socket) {
                socket = io(SERVER_URL);
                setupSocketListeners();
            }
            socket.emit('user_online', currentUser); // Beri tahu server user ini online
            
        } catch (error) {
            alert("Terjadi kesalahan koneksi ke server.");
        }
    }
    
    // Logout
    function logout(){
        if(socket) {
            socket.disconnect(); // Putus koneksi Socket.IO
            socket = null;
        }
        currentUser = null;
        currentFriend = null;
        document.getElementById("loginCard").style.display="block";
        document.getElementById("menuCard").style.display="none";
        document.getElementById("chatCard").style.display="none";
    }

    // Mulai chat
    async function startChat(){
        const fname = document.getElementById("friendName").value.trim();
        if(!fname){ alert("Masukkan nama teman!"); return; }
        if(fname === currentUser){ alert("Tidak bisa chat dengan diri sendiri."); return; }
        
        // Ambil Public Key teman dari server
        try {
            const response = await fetch(`${SERVER_URL}/key/${fname}`);
            const data = await response.json();
            if(!response.ok){
                alert(data.message);
                return;
            }
            friendPubKey = data.pubKey;
            currentFriend = fname;

            document.getElementById("menuCard").style.display="none";
            document.getElementById("chatCard").style.display="block";
            document.getElementById("chatTitle").innerText = "Chat dengan " + fname;
            
            // Minta riwayat chat ke server
            socket.emit('request_chat_history', { currentUser, currentFriend });

        } catch (error) {
            alert("Gagal mengambil Public Key teman.");
        }
    }

    // Kirim pesan
    async function sendMsg(){
        const msg = document.getElementById("msgInput").value.trim();
        if(!msg || !friendPubKey.n) return;

        // Pesan dienkripsi dengan Public Key teman
        const enc = rsaEncrypt(msg, friendPubKey.n, friendPubKey.e);
        
        const msgData = {
            from: currentUser,
            to: currentFriend,
            enc: enc
        };

        // Kirim pesan ke server via Socket.IO
        socket.emit('send_message', msgData);

        document.getElementById("msgInput").value = "";
    }

    // Render chat (membutuhkan semua pesan yang relevan)
    function renderChat(messages){
        const box = document.getElementById("chatBox");
        box.innerHTML="";

        messages.forEach(msg => {
            if (msg.from === currentUser) {
                // Pesan Saya (hanya tampilkan enkripsi & Public Key yang dipakai)
                box.innerHTML += `<div class="msg-me">${msg.from}: <b>[Encrypted]</b>
                    <small>Cipher: ${JSON.stringify(msg.enc)}</small></div>`;
            } else {
                // Pesan Teman (dekripsi menggunakan Private Key Saya)
                const dec = rsaDecrypt(msg.enc, myKeys.n, myKeys.d);
                box.innerHTML += `<div class="msg-other">${msg.from}: ${dec}
                    <small>Cipher: ${JSON.stringify(msg.enc)}</small></div>`;
            }
        });
        box.scrollTop = box.scrollHeight;
    }

    // Pengaturan Event Listener Socket.IO
    function setupSocketListeners() {
        if (!socket) return;
        
        // Menerima pesan baru dari siapapun
        socket.on('new_message', (msgData) => {
            // Cek apakah pesan ini relevan dengan chat yang sedang dibuka
            if ((msgData.from === currentUser && msgData.to === currentFriend) || 
                (msgData.from === currentFriend && msgData.to === currentUser)) {
                
                // Minta riwayat chat terbaru untuk update tampilan
                socket.emit('request_chat_history', { currentUser, currentFriend });
            }
        });

        // Menerima riwayat chat yang diminta
        socket.on('chat_history', (history) => {
            renderChat(history);
        });

        socket.on('disconnect', () => {
            console.log('Koneksi terputus dari server.');
        });
    }

    // Kembali ke menu
    function backMenu(){
        document.getElementById("chatCard").style.display="none";
        document.getElementById("menuCard").style.display="block";
    }

</script>
</body>
</html>