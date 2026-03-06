const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// 1. خادم HTTP (مقاوم للأخطاء)
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
    ws.isAlive = true; // علامة لمعرفة ما إذا كان الجهاز متصلاً فعلاً

    // معالجة أخطاء الاتصال الفردية لمنع السيرفر من السقوط
    ws.on('error', (err) => {
        console.error(`[WS Error] Device dropped connection silently.`);
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // [تسجيل الأجهزة]
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
            }
            
            // 🚀 [خوارزمية السيمفونية المطلقة بالنانوثانية]
            else if (data.type === 'pong') {
                // استخدام ساعة المعالج فائقة الدقة بالنانوثانية لمعرفة متى وصل الرد
                const t4_hr = process.hrtime.bigint(); 
                const t1_hr = BigInt(data.t1_hr); // وقت خروج الإشارة من السيرفر بالنانوثانية

                // حساب وقت الرحلة الكلي بالنانوثانية ثم تحويله للميلي ثانية (بأجزاء عشرية)
                const rtt_ns = t4_hr - t1_hr;
                const rtt_ms = Number(rtt_ns) / 1_000_000;

                // وقت معالجة الجهاز (من استلامه حتى إرساله)
                let clientProcessingTime = data.t3 - data.t2; 

                // 🛡️ درع الحماية 1: منع الأرقام السالبة لو اختلت ساعة الجهاز العميل
                if (clientProcessingTime < 0) clientProcessingTime = 0;
                
                // 🛡️ درع الحماية 2: مستحيل أن يكون وقت المعالجة أكبر من وقت الرحلة كاملاً!
                if (clientProcessingTime > rtt_ms) clientProcessingTime = rtt_ms;

                // حساب وقت الطريق الصافي
                const netLatency = rtt_ms - clientProcessingTime;
                
                // الطريق في اتجاه واحد
                const oneWayLatency = netLatency > 0 ? netLatency / 2 : 0;

                // 🛡️ درع الحماية 3: إذا كان البينج كارثياً (أكثر من 3 ثوانٍ)، نرفض المزامنة لأنه غير موثوق
                if (oneWayLatency > 3000) {
                    console.log(`⚠️ Ignored ${connectedDevices.get(ws)?.name} due to extreme lag (${oneWayLatency.toFixed(0)}ms)`);
                    return;
                }

                // 🎯 الضربة القاضية: وقت السيرفر المرجعي + وقت الطريق الفعلي
                const exactTimeMs = Date.now() + oneWayLatency;

                // الإرسال للجهاز ليضبط ساعته
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
            // 🛡️ درع الحماية 4: منع السيرفر من السقوط لو استقبل بيانات تالفة
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

// أداة مساعدة لإراحة المعالج
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🛡️ المايسترو الخارق: كل 60 ثانية ينظم الأجهزة
setInterval(async () => {
    if (connectedDevices.size === 0) return;
    console.log(`\n--- ⏳ Starting Symphony Sync for ${connectedDevices.size} devices ---`);
    
    for (let [ws, device] of connectedDevices.entries()) {
        // تنظيف الأجهزة الميتة التي فقدت الاتصال (Dead Sockets)
        if (ws.readyState !== WebSocket.OPEN) {
            connectedDevices.delete(ws);
            continue;
        }

        // استخدام ساعة النانوثانية الثابتة جداً
        const t1_hr = process.hrtime.bigint().toString();
        
        ws.send(JSON.stringify({ 
            type: 'ping', 
            t1_hr: t1_hr 
        }));
        
        // إراحة السيرفر 50 ميلي ثانية (لضمان أن السيرفر متفرغ 100% للجهاز التالي)
        await delay(50); 
    }
    console.log(`--- ✅ Symphony Cycle Completed ---`);
}, 60000);

// 🛡️ درع الحماية 5: حماية السيرفر بالكامل من أي خطأ مفاجئ خارج الـ WebSocket
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
