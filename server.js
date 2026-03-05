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

// 2. دمج خادم WebSocket مع خادم HTTP
const wss = new WebSocket.Server({ server });

const connectedDevices = new Map();
let deviceCounter = 0; 

wss.on('connection', (ws) => {
    console.log('🟡 New connection attempt...');

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'register') {
            deviceCounter++;
            // تمييز الواجهة عن باقي الأجهزة
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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

setInterval(async () => {
    if (connectedDevices.size === 0) return;
    console.log(`\n--- ⏳ Starting Sequential Sync for ${connectedDevices.size} devices ---`);
    
    for (let [ws, device] of connectedDevices.entries()) {
        if (ws.readyState === WebSocket.OPEN) {
            const t1 = Date.now();
            ws.send(JSON.stringify({ type: 'ping', t1: t1 }));
            await delay(100); 
        }
    }
    console.log(`--- ✅ Sequential Sync Cycle Completed ---`);
}, 60000);

// 3. تشغيل الخادم المدمج
server.listen(PORT, () => {
    console.log(`🥷 NINJA MAESTRO Server is running on port ${PORT}`);
});
