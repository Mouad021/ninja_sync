const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

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
    
    // إعداد الهيكل المبدئي للجهاز (بدون صلاحيات حتى يثبت هويته)
    const device = {
        id: 'Pending-Ninja',
        name: 'Pending-Ninja',
        isDashboard: false,
        isReady: false, // يحدد ما إذا كان في صفحة الحجز
        msgCount: 0 
    };

    connectedDevices.set(ws, device);

    ws.on('message', (message) => {
        device.msgCount++;
        if (device.msgCount > 60) { 
            console.warn(`⚠️ [RATE LIMIT] Kicking ${device.name} for spamming!`);
            ws.terminate();
            return;
        }

        try {
            const data = JSON.parse(message);

            // 🟢 [1. التسجيل والتعرف على الهوية]
            if (data.type === 'register') {
                const incomingId = data.client_id;
                
                // البحث عن مستنسخين (Clones) وطردهم (باستثناء الداشبورد)
                for (let [existingWs, existingDevice] of connectedDevices.entries()) {
                    if (existingDevice.id === incomingId && existingWs.readyState === WebSocket.OPEN && existingWs !== ws) {
                        if (incomingId !== 'NINJA-DASHBOARD') {
                            console.log(`⚠️ [CLONE DETECTED] Forcing ${incomingId} to reset identity!`);
                            ws.send(JSON.stringify({ type: 'RESET_IDENTITY' }));
                            return; 
                        }
                    }
                }

                device.id = incomingId;
                device.name = incomingId;
                
                // 👑 منح صلاحيات المايسترو للداشبورد
                if (incomingId === 'NINJA-DASHBOARD') {
                    device.isDashboard = true;
                    console.log(`👑 [MAESTRO] Dashboard Commander Online!`);
                    
                    // إرسال السجل القديم للداشبورد ليتم عرضه
                    ws.send(JSON.stringify({ type: 'history_sync', logs: hunterLogs }));
                } else {
                    console.log(`🟢 [REGISTERED] Hunter joined: ${incomingId}`);
                }

                ws.send(JSON.stringify({ type: 'welcome', assigned_name: incomingId }));
            }

            // 📍 [2. الرادار: حالة التامبرمونكي]
            else if (data.type === 'status_update') {
                device.isReady = data.on_target_page === true;
            }

            // ⏱️ [3. المزامنة المطلقة]
            else if (data.type === 'time_sync') {
                ws.send(JSON.stringify({
                    type: 'time_sync_reply',
                    client_time: data.client_time, 
                    server_time: Date.now()  
                }));
            }

            // 🎯 [4. أوامر القيادة والسيطرة (خاص بالداشبورد فقط!)]
            else if (device.isDashboard) {
                
                // أمر مدفعية التوزيع العشوائي (SCRAMBLE)
                if (data.type === 'SCRAMBLE_ATTACK') {
                    const startTimeMs = data.startTimeMs; 
                    const endTimeMs = data.endTimeMs;

                    let eligibleHunters = [];
                    for (let [clientWs, info] of connectedDevices.entries()) {
                        // نستهدف فقط الأجهزة العادية الجاهزة في الصفحة
                        if (!info.isDashboard && info.isReady && clientWs.readyState === WebSocket.OPEN) {
                            eligibleHunters.push(clientWs);
                        }
                    }

                    const count = eligibleHunters.length;
                    if (count === 0) {
                        console.log("⚠️ [SCRAMBLE] Aborted! No hunters are ready.");
                        ws.send(JSON.stringify({ type: 'alert', msg: 'NO HUNTERS ON TARGET PAGE!' }));
                        return;
                    }

                    console.log(`🎲 [SCRAMBLE] Distributing targets across ${count} ready hunters...`);
                    const spanMs = endTimeMs - startTimeMs;
                    let targetTimes = [];

                    if (count === 1) {
                        targetTimes.push(startTimeMs + Math.floor(spanMs / 2));
                    } else {
                        const stepMs = spanMs / (count - 1); 
                        for (let i = 0; i < count; i++) {
                            targetTimes.push(Math.floor(startTimeMs + (i * stepMs)));
                        }
                    }

                    // خلط الأوقات (Shuffle)
                    for (let i = targetTimes.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [targetTimes[i], targetTimes[j]] = [targetTimes[j], targetTimes[i]];
                    }

                    eligibleHunters.forEach((clientWs, index) => {
                        clientWs.send(JSON.stringify({
                            type: 'EXECUTE_ATTACK_AT',
                            target_time: targetTimes[index]
                        }));
                    });

                    ws.send(JSON.stringify({ type: 'scramble_complete', count: count }));
                }
                
                // أمر الإطلاق الفوري (LAUNCH ALL)
                else if (data.type === 'start_all_hunters') {
                    console.log(`🚀 [MAESTRO] Ordered IMMEDIATE LAUNCH!`);
                    let count = 0;
                    const payload = JSON.stringify({ type: 'EXECUTE_NOW' });
                    
                    for (let [clientWs, info] of connectedDevices.entries()) {
                        if (!info.isDashboard && info.isReady && clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(payload);
                            count++;
                        }
                    }
                    ws.send(JSON.stringify({ type: 'alert', msg: `LAUNCHED ${count} HUNTERS!` }));
                }

                // أمر الإجهاض وإيقاف الهجوم (ABORT ALL)
                else if (data.type === 'stop_all_hunters') {
                    console.log(`🛑 [MAESTRO] Ordered ABORT ALL!`);
                    const payload = JSON.stringify({ type: 'ABORT_ATTACK' });
                    
                    for (let [clientWs, info] of connectedDevices.entries()) {
                        if (!info.isDashboard && clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(payload);
                        }
                    }
                    ws.send(JSON.stringify({ type: 'alert', msg: 'ALL ATTACKS ABORTED!' }));
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

                // بث النتيجة للجميع (وأهمهم الداشبورد ليعرضها)
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
        if (device.isDashboard) {
            console.log(`🔴 [MAESTRO] Dashboard Disconnected.`);
        } else {
            console.log(`🔴 Disconnected: ${device.name}`);
        }
    });
});

// تصفير عداد الحماية من الإغراق كل ثانية
setInterval(() => {
    for (let device of connectedDevices.values()) {
        device.msgCount = 0;
    }
}, 1000);

server.listen(PORT, () => {
    console.log(`🥷 C2 SECURE SERVER LIVE ON PORT ${PORT}`);
    console.log(`🔑 Master Secret Key is active.`);
});
