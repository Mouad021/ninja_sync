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
let deviceCounter = 0;

// 1. خادم HTTP
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

// 2. خادم WebSocket مع حماية على مستوى الـ Upgrade (Edge Security)
const wss = new WebSocket.Server({ noServer: true });

// 🛡️ [حارس البوابة] لا أحد يدخل بدون المفتاح السري!
server.on('upgrade', (request, socket, head) => {
    // التحقق من المفتاح السري القادم في الهيدر أو الرابط
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token') || request.headers['x-ninja-token'];

    if (token !== MASTER_SECRET) {
        console.log(`❌ [SECURITY] Blocked unauthorized intrusion attempt from ${request.socket.remoteAddress}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws, request) => {
    deviceCounter++;
    
    // التمييز بين الداشبورد والصياد العادي عبر هيدر إضافي
    const isDashboard = request.headers['x-role'] === 'maestro';
    const deviceName = isDashboard ? 'Web-Dashboard' : `Ninja-${deviceCounter}`;
    
    const device = {
        id: deviceCounter,
        name: deviceName,
        isDashboard: isDashboard,
        msgCount: 0 // لحساب معدل الرسائل (Rate Limiting)
    };

    connectedDevices.set(ws, device);
    console.log(`🟢 [SECURE] Connected: ${deviceName}`);

    ws.on('message', (message) => {
        // 🛡️ [Anti-Spam] نظام Rate Limiting بسيط
        device.msgCount++;
        if (device.msgCount > 50) { // أقصى حد 50 رسالة في الثانية
            console.warn(`⚠️ [RATE LIMIT] Kicking ${deviceName} for spamming!`);
            ws.terminate();
            return;
        }

        try {
            const data = JSON.parse(message);

            // ⏱️ [المزامنة الدقيقة - NTP Style]
            // العميل يطلب الوقت ليحسب الفارق بنفسه
            if (data.type === 'time_sync') {
                ws.send(JSON.stringify({
                    type: 'time_sync_reply',
                    cTime: data.cTime, // إرجاع وقت العميل ليحسب RTT
                    sTime: Date.now()  // وقت السيرفر المطلق
                }));
            }

            // 🎯 أوامر المايسترو (الداشبورد فقط)
            else if (isDashboard) {
                if (data.type === 'EXECUTE_ATTACK') {
                    // السيرفر لا ينفذ، بل يخبر الجميع بـ "متى" ينفذون
                    // الداشبورد يرسل targetTime في المستقبل (مثلاً بعد 5 ثواني)
                    const targetTime = data.targetTime; 
                    console.log(`🚀 [MAESTRO] Ordered execution at exact UNIX MS: ${targetTime}`);
                    
                    const payload = JSON.stringify({
                        type: 'EXECUTE_NOW',
                        targetTime: targetTime
                    });

                    // بث الأمر لجميع الصيادين (لا حاجة لـ delay، البث يتم فوراً)
                    for (let [client, info] of connectedDevices.entries()) {
                        if (!info.isDashboard && client.readyState === WebSocket.OPEN) {
                            client.send(payload);
                        }
                    }
                }
            }

            // 🔥 تسجيل الصيد الناجح
            else if (data.type === 'success_booking') {
                console.log(`🔥 [BULLSEYE] ${deviceName} Hit! Time: ${data.time}`);
                
                const newLog = {
                    city: (data.city || 'UNK').trim().toUpperCase(),
                    time: data.time,
                    hunter: deviceName,
                    timestamp: Date.now()
                };
                
                hunterLogs.unshift(newLog);
                if (hunterLogs.length > MAX_LOGS) hunterLogs.length = MAX_LOGS;

                const broadcastMsg = JSON.stringify({
                    type: 'success_broadcast',
                    ...newLog
                });

                for (let [client, info] of connectedDevices.entries()) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(broadcastMsg);
                    }
                }
            }

        } catch (e) {
            // تجاهل الرسائل المشوهة بصمت لمنع تعطل السيرفر
        }
    });

    ws.on('close', () => {
        connectedDevices.delete(ws);
        console.log(`🔴 Disconnected: ${deviceName}`);
    });
});

// 🛡️ تصفير عداد الـ Spam كل ثانية
setInterval(() => {
    for (let device of connectedDevices.values()) {
        device.msgCount = 0;
    }
}, 1000);

server.listen(PORT, () => {
    console.log(`🥷 C2 SECURE SERVER LIVE ON PORT ${PORT}`);
    console.log(`🔑 Master Secret Key is active. Unauthorized access will be dropped at TCP level.`);
});
