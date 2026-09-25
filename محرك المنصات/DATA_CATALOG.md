# كتالوج البيانات

هذا الملف يوضح ما يجمعه محرك Bybit الافتراضي لـ Linear/ETHUSDT.

| البيانات | REST | WebSocket | التخزين |
|---|---|---|---|
| Last-price candles | نعم | نعم | market_candles |
| Mark-price candles | نعم | لا | market_candles |
| Index-price candles | نعم | لا | market_candles |
| Premium-index candles | نعم | لا | market_candles |
| Public trades | recent-trade | publicTrade | market_trades |
| Order book | snapshot | snapshot/delta | state + updates |
| Ticker | نعم | snapshot/delta | market_ticker_state |
| Liquidations | لا للتدفق الحي | allLiquidation | market_liquidations |
| Funding | funding/history | — | market_funding |
| Open interest | open-interest | — | market_open_interest |
| Long/short ratio | account-ratio | — | market_account_ratio |
| Instrument metadata | instruments-info | — | market_instruments |
| Price limits | price-limit | — | market_reference |
| Risk limits | risk-limit | — | market_reference |
| Delivery prices | delivery-price | — | market_reference |
| Insurance pool | insurance | — | market_reference |
| Bybit server time | market/time | — | market_reference |

## الشموع

الافتراضي:
- 1 minute
- 5 minutes
- 15 minutes
- 1 hour
- 4 hours
- 1 day

حد bootstrap هو 1000 صف لكل سلسلة وإطار، وهو الحد الأقصى الموثق لطلب kline V5 لهذا المنتج.

## دفتر الأوامر

يمكن تغيير ORDERBOOK_DEPTH ضمن الحدود التي يدعمها Bybit. الوضع الافتراضي 50 مستوى لكل جانب.
PERSIST_ORDERBOOK_UPDATES=true يحفظ التحديثات الخام، بينما market_orderbook_state يحفظ أحدث حالة مكتملة.

## ملاحظة عن "كل بيانات Bybit"

Bybit V5 يحتوي أيضًا على منتجات ومجالات أخرى مثل Spot وInverse وOptions وEvent Contracts وخدمات الحساب والتنفيذ. هذه النسخة موجهة إلى سوق Linear/ETHUSDT العامة، مع تصميم قابل لتوسيع category/process مستقل لكل سوق.
