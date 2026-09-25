# معمارية محرك المنصات

## المسار الكامل

Bybit REST + Bybit WebSocket
→ Parser/Validation
→ Normalization
→ Deduplication
→ Buffered Storage
→ Supabase/PostgreSQL

والتشغيل:
GitHub → Oracle Cloud VM → Node.js process → systemd 24/7

## REST

يُستخدم REST في:
- bootstrap التاريخي.
- آخر 1000 شمعة لكل إطار مطلوب.
- mark/index/premium price candles.
- recent trades أثناء الإقلاع.
- funding.
- open interest.
- long/short account ratio.
- instruments.
- price/risk/delivery/insurance references.
- reconciliation الدوري.

## WebSocket

الاشتراكات الافتراضية:
- kline.1 / 5 / 15 / 60 / 240 / D
- publicTrade
- orderbook
- tickers
- allLiquidation

## حالة الذاكرة

المحرك يحتفظ محليًا بـ:
- آخر ticker مكتمل بعد دمج snapshot/delta.
- آخر شمعة لكل إطار.
- دفتر الأوامر المطبّق من snapshot/delta.
- health counters.

## التعافي

عند سقوط WebSocket:
1. onStatus(false)
2. exponential backoff
3. reconnect
4. إعادة الاشتراك
5. REST reconciliation

عند وجود فجوة update_id في دفتر الأوامر:
1. إيقاف تطبيق delta الحالي.
2. طلب REST snapshot.
3. إعادة بناء دفتر الأوامر.
4. حفظ الحالة الجديدة.
5. متابعة WebSocket.

## حدود الدقة

البرنامج يستطيع اكتشاف وحصر أخطاء النقل المحلية، لكنه لا يستطيع إنشاء بيانات لم تُرسل أصلًا من Bybit، ولا يضمن عدم تعطل الإنترنت أو Oracle أو Supabase.
