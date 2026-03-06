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

// 🎯 [دالة المزامنة الجبارة] تطلق رشقات من النبضات المتتالية
function startSyncSession(ws, device) {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    // تصفير العداد للبدء بجلسة فلترة إحصائية جديدة (5 نبضات)
    device.syncState = {
        active: true,
        results: [],
        maxPings: 5 
    };
    
    const t1_hr = process.hrtime.bigint().toString();
    ws.send(JSON.stringify({ type: 'ping', t1_hr: t1_hr }));
}

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
                
                // 🎲 توليد هدف عشوائي مبدئي للجهاز عند دخوله
                const initialTotalMs = Math.floor(Math.random() * 60000);

                const device = {
                    id: deviceCounter,
                    name: deviceName,
                    fingerprint: data.fingerprint,
                    syncState: null,
                    target: { // حفظ الهدف في ذاكرة السيرفر
                        sec: Math.floor(initialTotalMs / 1000),
                        ms: initialTotalMs % 1000
                    }
                };

                connectedDevices.set(ws, device);

                console.log(`🟢 Registered: ${deviceName}`);
                
                // إرسال الترحيب مع الهدف المبدئي (للأجهزة العادية)
                ws.send(JSON.stringify({ 
                    type: 'welcome', 
                    assigned_name: deviceName,
                    target_sec: device.target.sec,
                    target_ms: device.target.ms
                }));

                // 🚀 إرسال السجل القديم فوراً لأي جهاز يتصل
                if (hunterLogs.length > 0) {
                    ws.send(JSON.stringify({
                        type: 'history_sync',
                        logs: hunterLogs
                    }));
                    if (isDashboard) console.log(`📜 Sent history (${hunterLogs.length} logs) to ${deviceName}`);
                }

                // بدء جلسة المزامنة الخماسية (Multi-Ping) بمجرد الدخول
                setTimeout(() => {
                    startSyncSession(ws, device);
                }, 500);
            }

            // 🎲 [أمر بعثرة وتوزيع الأهداف من الداشبورد - The Masterstroke]
            else if (data.type === 'scramble_targets') {
                const sender = connectedDevices.get(ws);
                if (sender && sender.name.includes('Dashboard')) {
                    console.log('🎲 [COMMAND] Dashboard triggered Target Scramble!');
                    
                    let clients = [];
                    // استخراج الأجهزة (الصيادين فقط، بدون الداشبورد)
                    for (let [client, info] of connectedDevices.entries()) {
                        if (!info.name.includes('Dashboard')) {
                            clients.push({client, info});
                        }
                    }
                    
                    let count = clients.length;
                    if (count > 0) {
                        // 1. تقسيم 60 ثانية (60000 ملي ثانية) على عدد الأجهزة بالتساوي
                        let stepMs = Math.floor(60000 / count);
                        let times = [];
                        
                        for(let i = 0; i < count; i++) {
                            // إضافة تشويش عشوائي (Jitter) لكي لا تكون دقيقة بشكل مريب
                            let jitter = Math.floor(Math.random() * (stepMs * 0.8)); 
                            let totalMs = (i * stepMs) + jitter;
                            if (totalMs >= 60000) totalMs = 59999;
                            times.push(totalMs);
                        }
                        
                        // 2. خلط الأوقات خلطاً كاملاً (Fisher-Yates Shuffle)
                        for (let i = times.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [times[i], times[j]] = [times[j], times[i]];
                        }
                        
                        // 3. توزيع الأوقات المخلطة على الأجهزة وإرسالها
                        for(let i = 0; i < count; i++) {
                            let sec = Math.floor(times[i] / 1000);
                            let ms = times[i] % 1000;
                            
                            clients[i].info.target = { sec, ms };
                            
                            if (clients[i].client.readyState === WebSocket.OPEN) {
                                clients[i].client.send(JSON.stringify({
                                    type: 'new_target',
                                    sec: sec,
                                    ms: ms
                                }));
                            }
                        }
                        console.log(`✅ Distributed ${count} completely random & uniformly spread targets!`);
                        ws.send(JSON.stringify({ type: 'scramble_complete', count: count }));
                    }
                }
            }

            // 🚀 [أمر إطلاق الهجوم أو إيقافه للجميع]
            else if (data.type === 'start_all_hunters' || data.type === 'stop_all_hunters') {
                const sender = connectedDevices.get(ws);
                if (sender && sender.name.includes('Dashboard')) {
                    const actionName = data.type === 'start_all_hunters' ? 'START' : 'STOP';
                    console.log(`🚀 [COMMAND] Dashboard ordered: ${actionName} ALL HUNTERS!`);
                    
                    const cmd = JSON.stringify({ type: data.type });
                    for (let [client, info] of connectedDevices.entries()) {
                        if (!info.name.includes('Dashboard') && client.readyState === WebSocket.OPEN) {
                            client.send(cmd);
                        }
                    }
                }
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

            // ⏱️ [الترقية الجديدة: خوارزمية الفلترة الإحصائية المطلقة]
            else if (data.type === 'pong') {
                const device = connectedDevices.get(ws);
                if (!device || !device.syncState || !device.syncState.active) return;

                const t4_hr = process.hrtime.bigint(); 
                const t1_hr = BigInt(data.t1_hr); 

                const rtt_ns = t4_hr - t1_hr;
                const rtt_ms = Number(rtt_ns) / 1_000_000;

                let clientProcessingTime = data.t3 - data.t2; 
                if (clientProcessingTime < 0) clientProcessingTime = 0;
                if (clientProcessingTime > rtt_ms) clientProcessingTime = rtt_ms;

                const netLatency = rtt_ms - clientProcessingTime;
                const oneWayLatency = netLatency > 0 ? netLatency / 2 : 0;

                // تسجيل نتيجة هذه النبضة
                device.syncState.results.push(oneWayLatency);

                // إذا لم نصل إلى العدد المطلوب، أطلق النبضة التالية بسرعة البرق
                if (device.syncState.results.length < device.syncState.maxPings) {
                    const next_t1_hr = process.hrtime.bigint().toString();
                    ws.send(JSON.stringify({ type: 'ping', t1_hr: next_t1_hr }));
                } 
                // إذا اكتملت الخمس نبضات، قم بتحليلها لاختيار المسار الأنقى
                else {
                    const validResults = device.syncState.results.filter(l => l <= 3000); 
                    
                    if (validResults.length === 0) {
                        console.log(`⚠️ Ignored ${device.name} due to extreme lag in all pings.`);
                        device.syncState.active = false;
                        return;
                    }

                    // ⚡ السحر هنا: أخذ أقل تأخير (Best One-Way Latency) وتجاهل التشويش
                    const bestOneWayLatency = Math.min(...validResults);
                    const exactTimeMs = Date.now() + bestOneWayLatency;

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'sync',
                            exact_time_ms: exactTimeMs
                        }));
                        
                        // طباعة النتيجة للأجهزة العادية وليس للداشبورد لمنع الإزعاج
                        if (!device.name.includes('Dashboard')) {
                            console.log(`⏱️ [SYMPHONY TUNED] ${device.name} synchronized precisely! Best Latency: ${bestOneWayLatency.toFixed(2)}ms`);
                        }
                    }
                    device.syncState.active = false; // إنهاء الجلسة
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

// 🛡️ المايسترو الخارق: الصيانة الدورية كل 60 ثانية
setInterval(async () => {
    if (connectedDevices.size === 0) return;
    
    for (let [ws, device] of connectedDevices.entries()) {
        if (ws.readyState !== WebSocket.OPEN) {
            connectedDevices.delete(ws);
            continue;
        }

        // إطلاق جلسة المزامنة
        startSyncSession(ws, device);
        
        // 🛡️ تأخير 50 ملي ثانية بين كل جهاز وآخر 
        // لحماية معالج السيرفر من الانفجار عند استلام 1500 نبضة من 300 جهاز في نفس اللحظة
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
    console.log(`🥷 NINJA COMMAND CENTER IS LIVE ON PORT ${PORT} [C2 Command Edition]`);
});
