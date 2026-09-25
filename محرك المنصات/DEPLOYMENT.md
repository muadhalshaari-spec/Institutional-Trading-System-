# نشر محرك المنصات على Oracle Cloud

## 1. قاعدة Supabase

طبّق ملف:
محرك المنصات/sql/schema.sql

بعد نجاحه، لا تضع service-role key داخل GitHub.

## 2. Oracle

في Ubuntu:
```bash
git clone https://github.com/muadhalshaari-spec/Institutional-Trading-System-.git /opt/institutional-trading-system
cd /opt/institutional-trading-system
npm install
npm run build
```

## 3. أسرار البيئة

أنشئ:
`/etc/institutional-trading-system/collector.env`

وانسخ القيم من:
`محرك المنصات/deploy/systemd/collector.env.example`

يجب وضع:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- API_READ_TOKEN

ولا تُسجل في Git.

## 4. تشغيل دائم

```bash
sudo cp "/opt/institutional-trading-system/محرك المنصات/deploy/systemd/collector.service" /etc/systemd/system/institutional-trading-system.service
sudo systemctl daemon-reload
sudo systemctl enable --now institutional-trading-system.service
sudo systemctl status institutional-trading-system.service
```

السجلات:
```bash
sudo journalctl -u institutional-trading-system.service -f
```

اختبار الصحة محليًا:
```bash
curl http://127.0.0.1:8787/health
```

## 5. تحديث الإصدار

بعد Push إلى main:
```bash
cd /opt/institutional-trading-system
sudo -u its git fetch origin main
sudo -u its git reset --hard origin/main
sudo -u its npm install
sudo -u its npm run build
sudo systemctl restart institutional-trading-system.service
```

## 6. التشغيل المستمر

systemd يعيد تشغيل العملية عند خروجها. والـ WebSocket نفسه يعيد الاتصال مع exponential backoff عند انقطاعه. وبعد الاتصال يستخدم REST للمطابقة.

## 7. بيانات Bybit

لا تحتاج مفاتيح Bybit الخاصة لقراءة بيانات السوق العامة المستخدمة هنا. لا تضف مفاتيح تداول إلى هذا المحرك ما لم يُطلب لاحقًا إدخال طبقة خاصة منفصلة مع صلاحيات محدودة.
