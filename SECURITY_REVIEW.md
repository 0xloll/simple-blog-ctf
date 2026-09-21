# Security Review — Simple Blog CTF

## Scope

مراجعة خفيفة مناسبة لتحدي Black-box محلي، مع الحفاظ على ثغرة واحدة مقصودة في Comment History.

## Fixed findings

### 1. Legacy authorization paths

تم حذف routes القديمة الخاصة بـHTML mutations وHTML History. العمليات الحساسة الآن تمر من JSON API فقط.

### 2. Authentication and sessions

- Login يعيد توليد session ID.
- Register وLogout يدمران session.
- Cookie باسم مخصص، HttpOnly، SameSite=Lax، ومدة صلاحية ساعتين.
- Secret عشوائي إذا لم يتم توفير `SESSION_SECRET`.
- API غير المسجل يرجع 401 JSON.

### 3. Object ownership

- Edit/Delete يتطلبان أن يكون المستخدم هو `author_id`.
- Likes مرتبطة بـ`user_id` و`post_id` مع compound primary key.
- UUID validation مفعّل للـpost/comment identifiers.

### 4. Input and output handling

- كل SQL parameterized.
- طول JSON body محدود.
- username/email/password/comment لها validation وحدود طول.
- الواجهة تستخدم escaping قبل إدخال بيانات المستخدم في HTML.
- CSP و`X-Content-Type-Options` و`X-Frame-Options` مفعلة.

### 5. Data consistency

- Edit يحفظ Revision وتحديث التعليق داخل transaction.
- Delete يحذف Revisions والتعليق داخل transaction.
- الموارد غير الموجودة ترجع 404 واضحًا.

### 6. Abuse controls

- Login/Register عليهما in-memory rate limit بسيط.
- لا يوجد file upload أو URL fetch أو redirect user-controlled.
- لا توجد dynamic SQL queries أو eval أو shell execution.

## Deliberate vulnerability

```text
GET /api/comments/:commentId/history
```

الـendpoint يتطلب Login لكنه لا يتحقق من ملكية التعليق. هذه هي الثغرة الوحيدة التي يجب أن تكشف النسخة القديمة التي تحتوي على الـFlag.

## Verification results

```text
Unauthenticated API              401
Invalid resource handling        404
Legacy History route             404
Edit own comment                 PASS
Delete edited comment            PASS
Edit another user's comment      403
History metadata hidden          PASS
Intended History bypass          PASS
SQL package audit                0 vulnerabilities
```
