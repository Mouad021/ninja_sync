const express = require('express');
const cors = require('cors');

const app = express();

// السماح لجميع الطلبات (لكي لا تواجه مشكلة CORS في إضافتك)
app.use(cors());

// نقطة النهاية للحصول على الوقت
app.get('/api/time', (req, res) => {
    const now = new Date();
    
    // استخدام hrtime للحصول على دقة النانوثانية ثم تحويلها للمايكروثانية
    const hrTime = process.hrtime();
    const microseconds = Math.floor(hrTime[1] / 1000) % 1000;

    // التوقيت العالمي UTC
    const utcMs = now.getTime();
    
    res.json({
        ok: true,
        utcMs: utcMs,
        iso: now.toISOString(),
        microseconds: microseconds,
        // شكل جاهز للاستخدام: ثانية.ميلي.مايكرو
        formatted: `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')}.${now.getUTCMilliseconds().toString().padStart(3, '0')}${microseconds.toString().padStart(3, '0')}`
    });
});

// مسار لفحص سرعة الاتصال (Ping)
app.get('/ping', (req, res) => {
    res.send('pong');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`NINJA Time Server running on port ${PORT}`);
});
