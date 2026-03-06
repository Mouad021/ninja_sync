const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

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

            // [تسجيل الأجهزة والمزامنة الفورية]
            if (data.type === 'register') {
                deviceCounter++;
                const deviceName = data.fingerprint === 'NINJA-DASHBOARD' ? 'Web-Dashboard' : `Ninja-${deviceCounter}`;
                
                connectedDevices.set(ws, {
                    id: deviceCounter,
                    name: deviceName,
                    fingerprint: data.fingerprint
                });

                console.log(`🟢 Registered: ${deviceName}`);
                ws.send(JSON.stringify({ type: 'welcome', assigned_name: deviceName }));

                // 🚀 المزامنة الفورية بمجرد الدخول (بدون انتظار الدقيقة الأولى)
                setTimeout(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        const t1_hr = process.hrtime.bigint().toString();
                        ws.send(JSON.stringify({ type: 'ping', t1_hr: t1_hr }));
                    }
                }, 500); // إعطاء نصف ثانية للواجهة لترتيب أمورها قبل إرسال التزامن
            }
            
            // 🚀 [خوارزمية السيمفونية المطلقة بالنانوثانية]
            else if (data.type === 'pong') {
                const t4_hr = process.hrtime.bigint(); 
                const t1_hr = BigInt(data.t1_hr); 

                const rtt_ns = t4_hr - t1_hr;
                const rtt_ms = Number(rtt_ns) / 1_000_000;

                let clientProcessingTime = data.t3 - data.t2; 

                // دروع الحماية لتصحيح الأخطاء الواردة من الأجهزة
                if (clientProcessingTime < 0) clientProcessingTime = 0;
                if (clientProcessingTime > rtt_ms) clientProcessingTime = rtt_ms;

                const netLatency = rtt_ms - clientProcessingTime;
                const oneWayLatency = netLatency > 0 ? netLatency / 2 : 0;

                // رفض الأجهزة ذات الإنترنت الكارثي
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
                
                const device = connectedDevices.get(ws);
                const devName = device ? device.name : "Unknown";
                console.log(`✅ Synced ${devName} | Latency: ${oneWayLatency.toFixed(2)}ms | Proc: ${clientProcessingTime.toFixed(2)}ms`);
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
    console.log(`\n--- ⏳ Starting Symphony Sync for ${connectedDevices.size} devices ---`);
    
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
    console.log(`--- ✅ Symphony Cycle Completed ---`);
}, 60000);

// 🛡️ حماية السيرفر من أي خطأ مفاجئ خارج الـ WebSocket
process.on('uncaughtException', (error) => {
    console.error('🔥 [CRITICAL] Uncaught Exception preventing crash:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [CRITICAL] Unhandled Rejection preventing crash:', reason);
});

// تشغيل الخادم
server.listen(PORT, () => {
    console.log(`🥷 NINJA MAESTRO SERVER IS LIVE ON PORT ${PORT} [Bulletproof Edition]`);
});
