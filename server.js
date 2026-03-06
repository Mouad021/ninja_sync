const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// 1. إنشاء خادم HTTP لتقديم واجهة المستخدم (Dashboard)
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading dashboard');
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

// 2. دمج خادم WebSocket مع خادم HTTP للسيمفونية
const wss = new WebSocket.Server({ server });

const connectedDevices = new Map();
let deviceCounter = 0; 

wss.on('connection', (ws) => {
    console.log('🟡 New connection attempt...');

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // تسجيل الأجهزة والواجهة
        if (data.type === 'register') {
            deviceCounter++;
            const deviceName = data.fingerprint === 'NINJA-DASHBOARD' ? 'Web-Dashboard' : `Ninja-${deviceCounter}`;
            
            connectedDevices.set(ws, {
                id: deviceCounter,
                name: deviceName,
                fingerprint: data.fingerprint,
                connectedAt: new Date().toISOString()
            });

            console.log(`🟢 Registered: ${deviceName} | Fingerprint: ${data.fingerprint}`);

            ws.send(JSON.stringify({
                type: 'welcome',
                assigned_name: deviceName
            }));
        }
        
        // 🚀 خوارزمية السيمفونية لحساب التأخير بدقة المايكروثانية
        else if (data.type === 'pong') {
            const t4 = Date.now(); // لحظة استلام السيرفر للرد
            const t1 = data.t1;    // لحظة خروج الإشارة من السيرفر
            const t2 = data.t2;    // لحظة وصول الإشارة للجهاز
            const t3 = data.t3;    // لحظة خروج الرد من الجهاز
            
            // الوقت الذي استغرقه جهازك في معالجة الرد (نطرحه لكي نحصل على وقت الشبكة الصافي)
            const clientProcessingTime = t3 - t2; 

            // حساب وقت الرحلة الصافي في كابلات الإنترنت (ذهاب وإياب)
            const rtt = (t4 - t1) - clientProcessingTime;
            
            // حساب وقت الطريق في اتجاه واحد (من السيرفر لجهازك)
            const latency = rtt > 0 ? rtt / 2 : 0;

            // السيرفر يعطي الجهاز وقتاً مستقبلياً يمثل (وقت السيرفر الحالي + وقت الطريق)
            const exactTimeMs = Date.now() + latency;

            ws.send(JSON.stringify({
                type: 'sync',
                exact_time_ms: exactTimeMs
            }));
            
            const device = connectedDevices.get(ws);
            const devName = device ? device.name : "Unknown";
            console.log(`✅ Synced ${devName} | Network Latency: ${latency.toFixed(2)}ms`);
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

// أداة مساعدة لإراحة المعالج بين كل جهاز والآخر
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// المايسترو: كل 60 ثانية، ينادي الأجهزة بالترتيب الدقيق
setInterval(async () => {
    if (connectedDevices.size === 0) return;
    console.log(`\n--- ⏳ Starting Symphony Sync for ${connectedDevices.size} devices ---`);
    
    // مناداة الأجهزة بالترتيب لكي لا يحصل ضغط ويختل البينج (Ping)
    for (let [ws, device] of connectedDevices.entries()) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', t1: Date.now() }));
            
            // ننتظر 50 ميلي ثانية (وقت كافٍ جداً لإنهاء التزامن للجهاز والانتقال للتالي)
            // إذا كان لديك 300 جهاز، ستنتهي العملية كلها بسلاسة تامة في 15 ثانية فقط!
            await delay(50); 
        }
    }
    console.log(`--- ✅ Symphony Cycle Completed ---`);
}, 60000);

// 3. تشغيل الخادم المدمج
server.listen(PORT, () => {
    console.log(`🥷 NINJA MAESTRO Server is running on port ${PORT}`);
});
