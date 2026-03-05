const WebSocket = require('ws');

// تشغيل سيرفر ويب سوكيت على البورت المتاح
const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`🥷 NINJA MAESTRO Server is running on port ${PORT}`);
});

wss.on('connection', (ws) => {
    console.log('🟢 New Ninja Device Connected!');

    // عندما يرد الجهاز على إشارة السيرفر
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        if (data.type === 'pong') {
            const t4 = Date.now(); // T4: لحظة استلام السيرفر لرد الجهاز
            const t1 = data.t1;    // وقت خروج الإشارة من السيرفر
            const t2 = data.t2;    // وقت وصولها للجهاز
            const t3 = data.t3;    // وقت خروج الرد من الجهاز

            // خوارزمية التزامن العالمية (NTP Formula) لحساب فرق الوقت الدقيق
            // تحسب التأخير وتخصمه لتجد الفرق الحقيقي بين ساعة السيرفر وساعة الجهاز
            const offset = ((t2 - t1) + (t3 - t4)) / 2;
            
            // الوقت الدقيق الآن + تعويض التأخير
            const exactTimeMs = Date.now() + offset;

            // إرسال الوقت الدقيق ليقوم الجهاز بضبط ساعته عليه فوراً
            ws.send(JSON.stringify({
                type: 'sync',
                exact_time_ms: exactTimeMs
            }));
        }
    });

    ws.on('close', () => {
        console.log('🔴 Ninja Device Disconnected');
    });
});

// المايسترو: كل 60 ثانية، السيرفر يوقظ جميع الأجهزة ويطلب منها التزامن
setInterval(() => {
    const t1 = Date.now(); // T1: لحظة إرسال الإشارة من السيرفر
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'ping', t1: t1 }));
        }
    });
    console.log(`⏱️ Broadcasted Sync Signal to ${wss.clients.size} devices.`);
}, 60000); // 60,000 ملي ثانية = 1 دقيقة
