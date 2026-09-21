# Simple Blog CTF

## التشغيل

```text
npm install
npm start
```

افتح `http://localhost:3000`.

حسابات الـseed:

- `admin@example.test` / `AdminPass123!`
- `alice@example.test` / `AlicePass123!`
- `bob@example.test` / `BobPass123!`
- `charlie@example.test` / `CharliePass123!`

المشروع Monolith صغير: Express + EJS + SQLite.

في الاستضافة، اجعل `DATA_DIR` يشير إلى Persistent Disk حتى لا تختفي قاعدة البيانات بعد إعادة التشغيل.

## Black-box API flow

الواجهة تستخدم JSON APIs من خلال `public/app.js`، لذلك يمكن اختبار التحدي من Burp Suite:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/posts
GET  /api/posts/:postId
POST /api/posts/:postId/comments
PATCH /api/comments/:commentId
DELETE /api/comments/:commentId
GET  /api/comments/:commentId/history
```

زر `View History` يظهر في الواجهة فقط عندما يكون المستخدم صاحب التعليق. الـendpoint الأخير يتأكد من تسجيل الدخول لكنه يحتوي على خطأ الـAuthorization المقصود: لا يتحقق من ملكية التعليق.
