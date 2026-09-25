# محرك المنصات — Bybit V5

هذا هو محرك جمع بيانات منصة Bybit. الاسم العربي موجود كجزء فعلي من بنية المشروع، بينما الملفات الداخلية منظمة بحسب الوظيفة.

## ما الذي يجمعه؟

الافتراضي هو ETHUSDT على Linear:
- 1000 شمعة لكل 1m / 5m / 15m / 1h / 4h / 1D.
- تحديثات الشموع الحية عبر WebSocket.
- الصفقات العامة لحظة بلحظة.
- دفتر الأوامر Snapshot/Delta.
- Ticker حي.
- Liquidations.
- Funding history.
- Open interest.
- Long/short account ratio.
- Instrument metadata.
- Mark/index/premium price klines.
- Price limit / risk limit / delivery price / server time / insurance.
- إعادة مزامنة REST بعد الانقطاع بصورة دورية.

## قواعد الاستمرارية

1. WebSocket هو مصدر التدفق المستمر.
2. REST هو مصدر الإقلاع التاريخي وإعادة بناء ما قد يفوت.
3. كل مجموعة بيانات لها مفتاح فريد لمنع التكرار.
4. البيانات الرقمية تحفظ كسلاسل/NUMERIC ولا تعتمد على floating point للتخزين.
5. كل أخطاء الشبكة قابلة للرصد.
6. لا توجد مفاتيح سرية داخل المستودع.

## التشغيل على Oracle Cloud

الخدمة المقترحة هي systemd الموجودة في:
`deploy/systemd/collector.service`

## قاعدة البيانات

طبّق:
`sql/schema.sql`

ثم ضع:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

في بيئة Oracle فقط.

## API القراءة

عند تفعيل API:
- GET /health
- GET /live
- GET /candles?interval=15&limit=200
- GET /ticker

يجب أن يبقى API خلف شبكة خاصة أو reverse proxy مع مصادقة، ولا يُكشف service-role key للعميل.
