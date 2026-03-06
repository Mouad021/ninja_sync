const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// 🗄️ [ذاكرة السيرفر الفولاذية] - تحتفظ بآخر 100 عملية صيد
const MAX_LOGS = 100;
const hunterLogs = [];

// 1. خادم HTTP (مقاوم للأخطاء لتقديم الواجهة)
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

// 2. خادم السيمفونية (مقاوم للسقوط والتخريب)
const wss = new WebSocket.Server({ server });
const connectedDevices = new Map();
let deviceCounter = 0; 

wss.on('connection', (ws) => {
    ws.isAlive = true; 

    // معالجة أخطاء الاتصال الفردية لمنع السيرفر من السقوط
    ws.on('error', (err) => {
        console.error(`[WS Error] Device dropped connection silently.`);
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 🟢 [تسجيل الأجهزة والمزامنة الفورية]
            if (data.type === 'register') {
                deviceCounter++;
                const isDashboard = data.fingerprint === 'NINJA-DASHBOARD';
                const deviceName = isDashboard ? 'Web-Dashboard' : `Ninja-${deviceCounter}`;
                
                connectedDevices.set(ws, {
                    id: deviceCounter,
                    name: deviceName,
                    fingerprint: data.fingerprint
                });

                console.log(`🟢 Registered: ${deviceName}`);
                ws.send(JSON.stringify({ type: 'welcome', assigned_name: deviceName }));

                // 🚀 [الترقية الجديدة: إرسال السجل القديم فوراً للداشبورد]
                if (isDashboard && hunterLogs.length > 0) {
                    ws.send(JSON.stringify({
                        type: 'history_sync',
                        logs: hunterLogs
                    }));
                    console.log(`📜 Sent history (${hunterLogs.length} logs) to ${deviceName}`);
                }

                // المزامنة الفورية بمجرد الدخول
                setTimeout(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        const t1_hr = process.hrtime.bigint().toString();
                        ws.send(JSON.stringify({ type: 'ping', t1_hr: t1_hr }));
                    }
                }, 500);
            }
            
            // 🔥 [استقبال طلبات الصيد الناجحة وتخزينها وبثها]
            else if (data.type === 'success_booking') {
                const device = connectedDevices.get(ws);
                const hunterName = device ? device.name : "Unknown Ninja";
                
                console.log(`🔥 [BULLSEYE] ${hunterName} Caught a slot! City: ${data.city} | Time: ${data.time}`);
                
                // 1. تسجيل الضربة في ذاكرة السيرفر
                const newLog = {
                    city: data.city.trim().toUpperCase(),
                    time: data.time,
                    hunter: hunterName,
                    timestamp: Date.now()
                };
                
                hunterLogs.unshift(newLog); // إضافة في البداية
                if (hunterLogs.length > MAX_LOGS) {
                    hunterLogs.pop(); // حذف الأقدم إذا تجاوزنا 100
                }

                // 2. تجهيز رسالة البث
                const broadcastMsg = JSON.stringify({
                    type: 'success_broadcast',
                    city: data.city,
                    time: data.time,
                    hunter: hunterName
                });

                // 3. بث الرسالة لجميع المتصلين (Live Update)
                for (let [client, info] of connectedDevices.entries()) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(broadcastMsg);
                    }
                }
            }

            // ⏱️ [خوارزمية السيمفونية المطلقة بالنانوثانية]
            else if (data.type === 'pong') {
                const t4_hr = process.hrtime.bigint(); 
                const t1_hr = BigInt(data.t1_hr); 

                const rtt_ns = t4_hr - t1_hr;
                const rtt_ms = Number(rtt_ns) / 1_000_000;

                let clientProcessingTime = data.t3 - data.t2; 

                if (clientProcessingTime < 0) clientProcessingTime = 0;
                if (clientProcessingTime > rtt_ms) clientProcessingTime = rtt_ms;

                const netLatency = rtt_ms - clientProcessingTime;
                const oneWayLatency = netLatency > 0 ? netLatency / 2 : 0;

                if (oneWayLatency > 3000) {
                    console.log(`⚠️ Ignored ${connectedDevices.get(ws)?.name} due to extreme lag (${oneWayLatency.toFixed(0)}ms)`);
                    return;
                }

                const exactTimeMs = Date.now() + oneWayLatency;

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'sync',
                        exact_time_ms: exactTimeMs
                    }));
                }
            }
        } catch (e) {
            console.error(`[Data Error] Received malformed message:`, e.message);
        }
    });

    ws.on('close', () => {
        const device = connectedDevices.get(ws);
        if (device) {
            console.log(`🔴 Disconnected: ${device.name}`);
            connectedDevices.delete(ws);
        }
    });
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🛡️ المايسترو الخارق: الصيانة الدورية كل 60 ثانية للحفاظ على الدقة
setInterval(async () => {
    if (connectedDevices.size === 0) return;
    
    for (let [ws, device] of connectedDevices.entries()) {
        if (ws.readyState !== WebSocket.OPEN) {
            connectedDevices.delete(ws);
            continue;
        }

        const t1_hr = process.hrtime.bigint().toString();
        
        ws.send(JSON.stringify({ 
            type: 'ping', 
            t1_hr: t1_hr 
        }));
        
        await delay(50); 
    }
}, 60000);

// 🛡️ حماية السيرفر من أي خطأ مفاجئ
process.on('uncaughtException', (error) => {
    console.error('🔥 [CRITICAL] Uncaught Exception preventing crash:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [CRITICAL] Unhandled Rejection preventing crash:', reason);
});

// تشغيل الخادم
server.listen(PORT, () => {
    console.log(`🥷 NINJA COMMAND CENTER IS LIVE ON PORT ${PORT} [Memory Vault Edition]`);
});
