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
    
    // إعداد الهيكل المبدئي للجهاز
    const device = {
        id: 'Pending-Ninja',
        name: 'Pending-Ninja',
        isDashboard: false,
        isReady: false, 
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
                
                if (incomingId === 'NINJA-DASHBOARD') {
                    device.isDashboard = true;
                    console.log(`👑 [MAESTRO] Dashboard Commander Online!`);
                    ws.send(JSON.stringify({ type: 'history_sync', logs: hunterLogs }));
                } else {
                    console.log(`🟢 [REGISTERED] Hunter joined: ${incomingId}`);
                }

                ws.send(JSON.stringify({ type: 'welcome', assigned_name: incomingId }));
            }

            // 📍 [2. الرادار: حالة السكريبت]
            else if (data.type === 'status_update') {
                device.isReady = data.on_target_page === true;
            }

            // 🎯 [3. أوامر القيادة والسيطرة (خاص بالداشبورد فقط)]
            else if (device.isDashboard) {
                
                // أمر توزيع الثواني العشوائية بين نطاق محدد
                if (data.type === 'SCRAMBLE_ATTACK') {
                    // استقبال الحد الأدنى والأقصى من الداشبورد بالملي ثانية
                    const minDelayMs = data.minDelayMs || 0; 
                    const maxDelayMs = data.maxDelayMs || 0;

                    let eligibleHunters = [];
                    for (let [clientWs, info] of connectedDevices.entries()) {
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

                    console.log(`🎲 [SCRAMBLE] Assigning random delays between ${minDelayMs}ms and ${maxDelayMs}ms to ${count} hunters...`);

                    eligibleHunters.forEach((clientWs) => {
                        // توليد وقت تأخير عشوائي لكل جهاز ضمن النطاق المحدد
                        const randomDelay = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;

                        clientWs.send(JSON.stringify({
                            type: 'EXECUTE_WITH_DELAY',
                            delay_ms: randomDelay
                        }));
                    });

                    ws.send(JSON.stringify({ type: 'scramble_complete', count: count }));
                }
                
                // أمر الإطلاق الفوري (0 ثانية تأخير)
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
                    ws.send(JSON.stringify({ type: 'alert', msg: `LAUNCHED ${count} HUNTERS NOW!` }));
                }

                // أمر الإجهاض
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

            // 🔥 [4. استقبال وتسجيل الصيد الناجح]
            else if (data.type === 'success_booking') {
                console.log(`🔥 [BULLSEYE] ${device.name} Hit! Delay used: ${data.delay_used || 'Unknown'}ms`);
                
                const newLog = {
                    city: (data.city || 'UNK').trim().toUpperCase(),
                    time: data.time || new Date().toLocaleTimeString(),
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
        if (device.isDashboard) {
            console.log(`🔴 [MAESTRO] Dashboard Disconnected.`);
        } else {
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
