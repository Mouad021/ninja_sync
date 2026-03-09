const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const MASTER_SECRET = process.env.MASTER_SECRET || 'M&H2019'; 

const MAX_LOGS = 100;
const hunterLogs = [];
const connectedDevices = new Map();

// 1. خادم HTTP للداشبورد
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Dashboard not found');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

// 2. خادم WebSocket المحصن
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token') || request.headers['x-ninja-token'];

    if (token !== MASTER_SECRET) {
        console.log(`❌ [SECURITY] Blocked intrusion from ${request.socket.remoteAddress}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws, request) => {
    const isDashboard = request.headers['x-role'] === 'maestro';
    
    // إعداد الهيكل المبدئي للجهاز
    const device = {
        id: isDashboard ? 'Web-Dashboard' : 'Pending-Ninja',
        name: isDashboard ? 'Web-Dashboard' : 'Pending-Ninja',
        isDashboard: isDashboard,
        isReady: false, // 📍 هذا المتغير يحدد ما إذا كان التامبرمونكي في الصفحة الصحيحة
        msgCount: 0 
    };

    connectedDevices.set(ws, device);

    ws.on('message', (message) => {
        device.msgCount++;
        if (device.msgCount > 50) { 
            console.warn(`⚠️ [RATE LIMIT] Kicking ${device.name} for spamming!`);
            ws.terminate();
            return;
        }

        try {
            const data = JSON.parse(message);

            // 🟢 [1. التسجيل وكشف الاستنساخ (Clone Detection)]
            if (data.type === 'register') {
                const incomingId = data.client_id;
                
                // البحث إذا كان هذا الـ ID متصل مسبقاً (جهاز مستنسخ)
                for (let [existingWs, existingDevice] of connectedDevices.entries()) {
                    if (existingDevice.id === incomingId && existingWs.readyState === WebSocket.OPEN && existingWs !== ws) {
                        console.log(`⚠️ [CLONE DETECTED] Forcing ${incomingId} to reset identity!`);
                        ws.send(JSON.stringify({ type: 'RESET_IDENTITY' }));
                        return; 
                    }
                }

                // تسجيل الجهاز بشكل رسمي
                device.id = incomingId;
                device.name = incomingId;
                console.log(`🟢 [REGISTERED] Hunter joined: ${incomingId}`);
                ws.send(JSON.stringify({ type: 'welcome', assigned_name: incomingId }));
            }

            // 📍 [2. الرادار: استقبال حالة التامبرمونكي (هل هو في الصفحة؟)]
            else if (data.type === 'status_update') {
                device.isReady = data.on_target_page === true;
                // يمكن تفعيل هذا السطر لاحقاً لتتبع من دخل الصفحة ومن خرج
                // console.log(`📍 [RADAR] ${device.name} Ready Status: ${device.isReady}`);
            }

            // ⏱️ [3. المزامنة المطلقة (تحديث لتطابق بايثون)]
            else if (data.type === 'time_sync') {
                ws.send(JSON.stringify({
                    type: 'time_sync_reply',
                    client_time: data.client_time, 
                    server_time: Date.now()  
                }));
            }

            // 🎯 [4. أوامر الداشبورد: مدفعية التوزيع العشوائي (Scramble)]
            else if (isDashboard) {
                if (data.type === 'SCRAMBLE_ATTACK') {
                    // الداشبورد يرسل الوقت الدقيق لبداية ونهاية المدى بالملي ثانية
                    const startTimeMs = data.startTimeMs; 
                    const endTimeMs = data.endTimeMs;

                    // تصفية الأجهزة: استخراج الصيادين الجاهزين (في الصفحة الصحيحة) فقط
                    let eligibleHunters = [];
                    for (let [clientWs, info] of connectedDevices.entries()) {
                        if (!info.isDashboard && info.isReady && clientWs.readyState === WebSocket.OPEN) {
                            eligibleHunters.push(clientWs);
                        }
                    }

                    const count = eligibleHunters.length;
                    if (count === 0) {
                        console.log("⚠️ [SCRAMBLE] Aborted! No hunters are currently on the target page.");
                        // إرسال تنبيه للداشبورد
                        ws.send(JSON.stringify({ type: 'alert', msg: 'No hunters ready on the target page!' }));
                        return;
                    }

                    console.log(`🎲 [SCRAMBLE] Distributing targets across ${count} ready hunters...`);

                    // حساب الأوقات لتغطية المساحة بالكامل
                    const spanMs = endTimeMs - startTimeMs;
                    let targetTimes = [];

                    if (count === 1) {
                        // إذا كان هناك جهاز واحد، نعطيه المنتصف
                        targetTimes.push(startTimeMs + Math.floor(spanMs / 2));
                    } else {
                        // تقسيم المسافة بالتساوي (مثلاً بين 8.000 و 12.000)
                        const stepMs = spanMs / (count - 1); 
                        for (let i = 0; i < count; i++) {
                            targetTimes.push(Math.floor(startTimeMs + (i * stepMs)));
                        }
                    }

                    // خلط الأوقات (Shuffle) حتى لا يأخذ الجهاز رقم 1 دائماً الثواني الأولى
                    for (let i = targetTimes.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [targetTimes[i], targetTimes[j]] = [targetTimes[j], targetTimes[i]];
                    }

                    // إرسال وقت محدد لكل جهاز
                    eligibleHunters.forEach((clientWs, index) => {
                        const preciseTime = targetTimes[index];
                        clientWs.send(JSON.stringify({
                            type: 'EXECUTE_ATTACK_AT',
                            target_time: preciseTime
                        }));
                    });

                    console.log(`✅ [SCRAMBLE COMPLETE] Grid completely covered!`);
                }
            }

            // 🔥 [5. استقبال وتسجيل الصيد الناجح]
            else if (data.type === 'success_booking') {
                console.log(`🔥 [BULLSEYE] ${device.name} Hit! Time: ${data.time}`);
                
                const newLog = {
                    city: (data.city || 'UNK').trim().toUpperCase(),
                    time: data.time,
                    hunter: device.name,
                    timestamp: Date.now()
                };
                
                hunterLogs.unshift(newLog);
                if (hunterLogs.length > MAX_LOGS) hunterLogs.length = MAX_LOGS;

                const broadcastMsg = JSON.stringify({
                    type: 'success_broadcast',
                    ...newLog
                });

                for (let [clientWs, info] of connectedDevices.entries()) {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(broadcastMsg);
                    }
                }
            }

        } catch (e) {
            // تجاهل الرسائل المشوهة
        }
    });

    ws.on('close', () => {
        connectedDevices.delete(ws);
        if (!isDashboard) {
            console.log(`🔴 Disconnected: ${device.name}`);
        }
    });
});

setInterval(() => {
    for (let device of connectedDevices.values()) {
        device.msgCount = 0;
    }
}, 1000);

server.listen(PORT, () => {
    console.log(`🥷 C2 SECURE SERVER LIVE ON PORT ${PORT}`);
    console.log(`🔑 Master Secret Key is active.`);
});
