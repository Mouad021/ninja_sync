const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/api/sync', (req, res) => {
    // T1: لحظة دخول الطلب للسيرفر
    const hrTimeIn = process.hrtime();
    const t1 = Date.now(); 

    // محاكاة معالجة خفيفة (تجهيز الرد)
    const utcMs = Date.now();
    
    // T2: لحظة خروج الرد من السيرفر
    const hrTimeOut = process.hrtime(hrTimeIn);
    const processingTimeMs = (hrTimeOut[0] * 1000) + (hrTimeOut[1] / 1000000);

    res.json({
        t1_receive_ms: t1,
        t2_send_ms: t1 + processingTimeMs,
        processing_time_ms: processingTimeMs,
        utcMs: utcMs
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`NINJA Time Server running on port ${PORT}`);
});
