const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`🥷 NINJA MAESTRO Server is running on port ${PORT}`);
});

// سجل الأجهزة المتصلة
const connectedDevices = new Map();
let deviceCounter = 0; // عداد لإعطاء أسماء بالترتيب

wss.on('connection', (ws) => {
    console.log('🟡 New connection attempt...');

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // 1. تسجيل بصمة الجهاز فور اتصاله
        if (data.type === 'register') {
            deviceCounter++;
            const deviceName = `Ninja-${deviceCounter}`;
            
            connectedDevices.set(ws, {
                id: deviceCounter,
                name: deviceName,
                fingerprint: data.fingerprint,
                connectedAt: new Date().toISOString()
            });

            console.log(`🟢 Registered: ${deviceName} | Fingerprint: ${data.fingerprint}`);

            // إرسال رسالة ترحيب للجهاز باسمه الجديد
            ws.send(JSON.stringify({
                type: 'welcome',
                assigned_name: deviceName
            }));
        }
        
        // 2. حساب التأخير عند استلام الرد (Pong)
        else if (data.type === 'pong') {
            const t4 = Date.now(); 
            const t1 = data.t1;
            const t2 = data.t2;
            const t3 = data.t3;

            const offset = ((t2 - t1) + (t3 - t4)) / 2;
            const exactTimeMs = Date.now() + offset;

            ws.send(JSON.stringify({
                type: 'sync',
                exact_time_ms: exactTimeMs
            }));
            
            const device = connectedDevices.get(ws);
            const devName = device ? device.name : "Unknown";
            console.log(`✅ Synced ${devName} | Offset: ${offset.toFixed(2)}ms`);
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

// أداة مساعدة لتأخير التنفيذ
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// المايسترو: كل 60 ثانية، يقوم بالنداء على الأجهزة بالترتيب
setInterval(async () => {
    if (connectedDevices.size === 0) return;

    console.log(`\n--- ⏳ Starting Sequential Sync for ${connectedDevices.size} devices ---`);
    
    // المرور على الأجهزة واحداً تلو الآخر
    for (let [ws, device] of connectedDevices.entries()) {
        if (ws.readyState === WebSocket.OPEN) {
            const t1 = Date.now();
            ws.send(JSON.stringify({ type: 'ping', t1: t1 }));
            
            // ننتظر 100 ميلي ثانية قبل إرسال الإشارة للجهاز التالي
            // هذا يضمن أن السيرفر يتفرغ تماماً لحساب الوقت لهذا الجهاز فقط بدون أي تشويش
            await delay(100); 
        }
    }
    console.log(`--- ✅ Sequential Sync Cycle Completed ---`);
}, 60000);
