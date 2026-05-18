const express = require('express');
const ejs = require('ejs');
const app = express();

// قراءة متغيرات البيئة من راندر (تلقائياً) أو من ملف .env محلياً إذا كان مثبت
require('dotenv').config({ silent: true }); 

// إعدادات قراءة البيانات القادمة من الواجهة
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 1. البيانات الوهمية للرومات (تتحكم بها من الداش بورد)
let rooms = [
    { id: "room_1", name: "العامة (General)", messagesEnabled: true, timeoutsEnabled: true },
    { id: "room_2", name: "الألعاب (Gaming)", messagesEnabled: false, timeoutsEnabled: true },
    { id: "room_3", name: "البرمجة (Coding)", messagesEnabled: true, timeoutsEnabled: false },
    { id: "room_4", name: "الدعم الفني (Support)", messagesEnabled: false, timeoutsEnabled: false }
];

// 2. سجلات الحذف والتعديل
let messageLogs = [
    { type: 'حذف', room: 'room_1', actor: 'أحمد', content: 'رسالة مخالفة للشروط', timestamp: '2026-05-18 10:00' },
    { type: 'تعديل', room: 'room_3', actor: 'خالد', content: 'تم تغيير النص من (مرحبا) إلى (أهلاً بالجميع)', timestamp: '2026-05-18 10:15' },
    { type: 'حذف', room: 'room_2', actor: 'سعيد', content: 'رابط خارجي غير مسموح', timestamp: '2026-05-18 10:30' }
];

// 3. سجلات التايم أوت
let timeoutLogs = [
    { room: 'room_1', actor: 'عمر (مشرف)', target: 'يوسف', duration: '10 دقائق', timestamp: '2026-05-18 10:05' },
    { room: 'room_2', actor: 'زياد (إدارة)', target: 'محمد', duration: '1 ساعة', timestamp: '2026-05-18 10:45' }
];

// التوجيه التلقائي لصفحة اللوق
app.get('/', (req, res) => {
    res.redirect('/dashboard/logs');
});

// مسار صفحة اللوق والداش بورد الرئيسي
app.get('/dashboard/logs', (req, res) => {
    // تصفية السجلات بناءً على الرومات المفعلة (التي بجانبها صح)
    const activeMessageRoomIds = rooms.filter(r => r.messagesEnabled).map(r => r.id);
    const activeTimeoutRoomIds = rooms.filter(r => r.timeoutsEnabled).map(r => r.id);

    const filteredMessageLogs = messageLogs.filter(log => activeMessageRoomIds.includes(log.room));
    const filteredTimeoutLogs = timeoutLogs.filter(log => activeTimeoutRoomIds.includes(log.room));

    // رندر لواجهة HTML المخزنة بالأسفل كـ String
    res.send(ejs.render(htmlTemplate, {
        rooms: rooms,
        messageLogs: filteredMessageLogs,
        timeoutLogs: filteredTimeoutLogs
    }));
});

// استقبال تحديثات التشيك بوكس (الـ صح) من الواجهة
app.post('/dashboard/update-rooms', (req, res) => {
    const { enabledMessageRooms, enabledTimeoutRooms } = req.body;

    const msgRooms = Array.isArray(enabledMessageRooms) ? enabledMessageRooms : (enabledMessageRooms ? [enabledMessageRooms] : []);
    const timeRooms = Array.isArray(enabledTimeoutRooms) ? enabledTimeoutRooms : (enabledTimeoutRooms ? [enabledTimeoutRooms] : []);

    // تحديث الحالة في الذاكرة فوراً
    rooms.forEach(room => {
        room.messagesEnabled = msgRooms.includes(room.id);
        room.timeoutsEnabled = timeRooms.includes(room.id);
    });

    res.redirect('/dashboard/logs');
});

// تعديل هام لـ Render: قراءة البورت الديناميكي الذي تحدده الاستضافة تلقائياً
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dashboard running smoothly on port ${PORT}`);
});

// =========================================================================
// واجهة الـ HTML والـ CSS (قالب EJS مدمج بملف واحد)
// =========================================================================
const htmlTemplate = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لوحة التحكم - السجلات</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }
        body { display: flex; background-color: #f4f6f9; color: #333; }
        
        /* المنيو على اليمين */
        .sidebar { width: 260px; height: 100vh; background-color: #1e293b; color: #fff; position: fixed; right: 0; top: 0; padding: 20px; }
        .sidebar h2 { text-align: center; margin-bottom: 30px; font-size: 22px; color: #38bdf8; }
        .sidebar ul { list-style: none; }
        .sidebar ul li a { display: block; padding: 12px 15px; color: #cbd5e1; text-decoration: none; border-radius: 6px; background-color: #334155; font-weight: bold; }
        .sidebar ul li a.active { background-color: #38bdf8; color: #1e293b; }

        /* المحتوى الرئيسي */
        .main-content { margin-right: 260px; padding: 40px; width: calc(100% - 260px); }
        h1 { margin-bottom: 25px; color: #0f172a; }
        
        /* الكروت والجداول */
        .card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 30px; }
        .card h3 { margin-bottom: 15px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; background: #fff; border-radius: 8px; overflow: hidden; }
        th, td { padding: 12px 15px; text-align: right; border-bottom: 1px solid #e2e8f0; }
        th { background-color: #f8fafc; color: #64748b; font-weight: 600; }
        tr:hover { background-color: #f1f5f9; }
        
        /* عناصر التصميم */
        .btn { background-color: #38bdf8; color: #1e293b; border: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; cursor: pointer; margin-top: 15px; }
        .btn:hover { background-color: #0ea5e9; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge-delete { background-color: #fee2e2; color: #ef4444; }
        .badge-edit { background-color: #fef9c3; color: #ca8a04; }
        input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
    </style>
</head>
<body>

    <!-- المنيو على اليمين وفيه صفحة اللوق -->
    <div class="sidebar">
        <h2>لوحة التحكم</h2>
        <ul>
            <li><a href="/dashboard/logs" class="active">صفحة اللوق (Logs)</a></li>
        </ul>
    </div>

    <!-- المحتوى واللوقات -->
    <div class="main-content">
        <h1>سجلات النظام والتحكم بالرومات</h1>

        <!-- جدول تحديد وتفعيل الرومات (الصح) -->
        <div class="card">
            <h3>تحديد الرومات المفعلة لجلب اللوق</h3>
            <form action="/dashboard/update-rooms" method="POST">
                <table>
                    <thead>
                        <tr>
                            <th>اسم الروم</th>
                            <th>لوق الحذف والتعديل (صح للمراقبة)</th>
                            <th>لوق التايم أوت (صح للمراقبة)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <%% rooms.forEach(room => { %>
                            <tr>
                                <td><strong><%%= room.name %></strong></td>
                                <td>
                                    <input type="checkbox" name="enabledMessageRooms" value="<%%= room.id %>" <%%= room.messagesEnabled ? 'checked' : '' %>>
                                </td>
                                <td>
                                    <input type="checkbox" name="enabledTimeoutRooms" value="<%%= room.id %>" <%%= room.timeoutsEnabled ? 'checked' : '' %>>
                                </td>
                            </tr>
                        <%% }) %>
                    </tbody>
                </table>
                <button type="submit" class="btn">حفظ الإعدادات وتحديث الجداول</button>
            </form>
        </div>

        <!-- لوق الحذف والتعديل -->
        <div class="card">
            <h3>لوق حذف وتعديل الرسائل</h3>
            <%% if(messageLogs.length === 0) { %>
                <p style="color: #64748b; margin-top: 10px;">لا توجد سجلات لعرضها (تأكد من وضع صح على الروم المطلوبة).</p>
            <%% } else { %>
                <table>
                    <thead>
                        <tr>
                            <th>النوع</th>
                            <th>الروم</th>
                            <th>مين حذف/عدل</th>
                            <th>المحتوى القديم / الإجراء</th>
                            <th>الوقت</th>
                        </tr>
                    </thead>
                    <tbody>
                        <%% messageLogs.forEach(log => { %>
                            <%% let currentRoom = rooms.find(r => r.id === log.room); %>
                            <tr>
                                <td>
                                    <span class="badge <%%= log.type === 'حذف' ? 'badge-delete' : 'badge-edit' %>">
                                        <%%= log.type %>
                                    </span>
                                </td>
                                <td><%%= currentRoom ? currentRoom.name : log.room %></td>
                                <td><strong><%%= log.actor %></strong></td>
                                <td><%%= log.content %></td>
                                <td><%%= log.timestamp %></td>
                            </tr>
                        <%% }) %>
                    </tbody>
                </table>
            <%% } %>
        </div>

        <!-- لوق التايم أوت -->
        <div class="card">
            <h3>لوق التايم أوت (Timeouts)</h3>
            <%% if(timeoutLogs.length === 0) { %>
                <p style="color: #64748b; margin-top: 10px;">لا توجد سجلات لعرضها (تأكد من وضع صح على الروم المطلوبة).</p>
            <%% } else { %>
                <table>
                    <thead>
                        <tr>
                            <th>الروم</th>
                            <th>مين أعطى التايم</th>
                            <th>لمين (المستهدف)</th>
                            <th>الوقت المحدد (المدة)</th>
                            <th>وقت الإجراء</th>
                        </tr>
                    </thead>
                    <tbody>
                        <%% timeoutLogs.forEach(log => { %>
                            <%% let currentRoom = rooms.find(r => r.id === log.room); %>
                            <tr>
                                <td><%%= currentRoom ? currentRoom.name : log.room %></td>
                                <td><strong><%%= log.actor %></strong></td>
                                <td><span style="color: #ef4444; font-weight: bold;"><%%= log.target %></span></td>
                                <td><%%= log.duration %></td>
                                <td><%%= log.timestamp %></td>
                            </tr>
                        <%% }) %>
                    </tbody>
                </table>
            <%% } %>
        </div>

    </div>

</body>
</html>
`.replace(/<%%/g, '<%');
