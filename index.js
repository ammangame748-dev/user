const { Client, GatewayIntentBits, AuditLogEvent } = require('discord.js');
const express = require('express');
require('dotenv').config({ silent: true });

const app = express();

// إعدادات قراءة بيانات طلبات الواجهة (الداش بورد)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ==========================================
// 1. إعدادات تخزين الرومات واللوقات في الذاكرة
// ==========================================
let rooms = [];       // سيتم تعبئتها تلقائياً بالرومات الحقيقية من البوت
let messageLogs = []; // سجلات الحذف والتعديل الحية
let timeoutLogs = []; // سجلات التايم أوت الحية

// ==========================================
// 2. إعداد وتشغيل بوت ديسكورد (Discord Bot)
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ]
});

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    
    // جلب الرومات النصية من كل السيرفرات المتواجد بها البوت لتظهر بالداش بورد
    rooms = [];
    client.guilds.cache.forEach(guild => {
        const textChannels = guild.channels.cache.filter(c => c.type === 0); // 0 يعني روم نصي (Text Channel)
        textChannels.forEach(channel => {
            rooms.push({
                id: channel.id,
                name: `${guild.name} ➔ #${channel.name}`,
                messagesEnabled: true, // تفعيل افتراضي لسهولة المراقبة
                timeoutsEnabled: true
            });
        });
    });
});

// [حدث تعديل الرسالة]
client.on('messageUpdate', (oldMessage, newMessage) => {
    if (oldMessage.partial) return;
    if (oldMessage.author?.bot) return;

    // التحقق هل الروم مفعلة بالداش بورد للوق التعديل؟
    const roomConfig = rooms.find(r => r.id === oldMessage.channel.id);
    if (!roomConfig || !roomConfig.messagesEnabled) return;

    messageLogs.unshift({
        type: 'تعديل',
        room: oldMessage.channel.id,
        actor: oldMessage.author ? oldMessage.author.tag : 'غير معروف',
        content: `تم تعديل النص من: (${oldMessage.content || 'محتوى فارغ/إيموجي'}) إلى: (${newMessage.content || 'محتوى فارغ/إيموجي'})`,
        timestamp: new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })
    });

    // تقليص حجم المصفوفة لعدم استهلاك الذاكرة (آخر 100 سجل)
    if (messageLogs.length > 100) messageLogs.pop();
});

// [حدث حذف الرسالة]
client.on('messageDelete', async (message) => {
    if (message.partial) return;
    if (message.author?.bot) return;

    const roomConfig = rooms.find(r => r.id === message.channel.id);
    if (!roomConfig || !roomConfig.messagesEnabled) return;

    let executor = message.author ? message.author.tag : 'غير معروف';

    // محاولة جلب الشخص الذي قام بالحذف من سجلات التدقيق (Audit Logs)
    try {
        const fetchedLogs = await message.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageDelete,
        });
        const deletionLog = fetchedLogs.entries.first();
        if (deletionLog && deletionLog.target.id === message.author.id && (Date.now() - deletionLog.createdTimestamp) < 5000) {
            executor = deletionLog.executor.tag;
        }
    } catch (e) {
        // في حال عدم توفر صلاحيات للمشاهدة
    }

    messageLogs.unshift({
        type: 'حذف',
        room: message.channel.id,
        actor: executor,
        content: `صاحب الرسالة: (${message.author ? message.author.tag : 'مجهول'}) | النص المحذوف: (${message.content || 'محتوى ميديا/إيموجي'})`,
        timestamp: new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })
    });

    if (messageLogs.length > 100) messageLogs.pop();
});

// [حدث التايم أوت للمستخدمين]
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // التحقق من تفعيل التايم أوت (العقوبة الزمنيّة)
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    // إذا تم إضافة تايم أوت جديد ولم يكن موجوداً من قبل
    if (!oldTimeout && newTimeout && newTimeout > Date.now()) {
        let executor = 'مشرف مجهول';
        
        // جلب من قام بإعطاء التايم أوت
        try {
            const fetchedLogs = await newMember.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MemberUpdate,
            });
            const auditEntry = fetchedLogs.entries.first();
            if (auditEntry && auditEntry.target.id === newMember.id) {
                executor = auditEntry.executor.tag;
            }
        } catch (e) {}

        const durationMinutes = Math.round((newTimeout - Date.now()) / 60000);

        // نسجل التايم أوت تحت رومات السيرفر
        // نقوم بالبحث عن أي روم نصية في هذا السيرفر مفعل فيها التايم أوت لنربط الإجراء بها
        const guildChannels = newMember.guild.channels.cache.filter(c => c.type === 0).map(c => c.id);
        const activeTimeoutChannel = rooms.find(r => guildChannels.includes(r.id) && r.timeoutsEnabled);

        // إذا كانت رومات السيرفر لا يوجد عليها صح للتايم أوت، نرفض تسجيل اللوق
        if (!activeTimeoutChannel) return;

        timeoutLogs.unshift({
            room: activeTimeoutChannel.id,
            actor: executor,
            target: newMember.user.tag,
            duration: `${durationMinutes} دقيقة`,
            timestamp: new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })
        });

        if (timeoutLogs.length > 100) timeoutLogs.pop();
    }
});

// تشغيل البوت باستخدام التوكن المخزن بـ .env
if (process.env.TOKEN) {
    client.login(process.env.TOKEN).catch(err => console.error("Discord Bot Login Error: ", err.message));
} else {
    console.error("خطأ: لم يتم العثور على متغير البيئة TOKEN في ملف .env الخاص بك!");
}

// ==========================================
// 3. مسارات الداش بورد (Express Routes)
// ==========================================

app.get('/', (req, res) => res.redirect('/dashboard/logs'));

app.get('/dashboard/logs', (req, res) => {
    // تصفية المصفوفات بحسب التشيك بوكس (الصح) المفعل حالياً
    const activeMessageRoomIds = rooms.filter(r => r.messagesEnabled).map(r => r.id);
    const activeTimeoutRoomIds = rooms.filter(r => r.timeoutsEnabled).map(r => r.id);

    const filteredMessageLogs = messageLogs.filter(log => activeMessageRoomIds.includes(log.room));
    const filteredTimeoutLogs = timeoutLogs.filter(log => activeTimeoutRoomIds.includes(log.room));

    res.send(getHtmlTemplate(rooms, filteredMessageLogs, filteredTimeoutLogs));
});

app.post('/dashboard/update-rooms', (req, res) => {
    const { enabledMessageRooms, enabledTimeoutRooms } = req.body;

    const msgRooms = Array.isArray(enabledMessageRooms) ? enabledMessageRooms : (enabledMessageRooms ? [enabledMessageRooms] : []);
    const timeRooms = Array.isArray(enabledTimeoutRooms) ? enabledTimeoutRooms : (enabledTimeoutRooms ? [enabledTimeoutRooms] : []);

    rooms.forEach(room => {
        room.messagesEnabled = msgRooms.includes(room.id);
        room.timeoutsEnabled = timeRooms.includes(room.id);
    });

    res.redirect('/dashboard/logs');
});

// تشغيل السيرفر على بورت راندر
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web Dashboard online on port ${PORT}`);
});

// ==========================================
// 4. دالة توليد الواجهة البرمجية HTML الهجينة
// ==========================================
function getHtmlTemplate(roomsList, msgLogs, timeLogs) {
    let roomsRows = roomsList.map(room => `
        <tr>
            <td><strong>${room.name}</strong></td>
            <td><input type="checkbox" name="enabledMessageRooms" value="${room.id}" ${room.messagesEnabled ? 'checked' : ''}></td>
            <td><input type="checkbox" name="enabledTimeoutRooms" value="${room.id}" ${room.timeoutsEnabled ? 'checked' : ''}></td>
        </tr>
    `).join('');

    let msgRows = msgLogs.length === 0 ? `<tr><td colspan="5" style="color: #64748b; text-align:center;">لا توجد سجلات حية حالياً للرومات المحددة.</td></tr>` : 
    msgLogs.map(log => {
        let currentRoom = roomsList.find(r => r.id === log.room);
        return `
        <tr>
            <td><span class="badge ${log.type === 'حذف' ? 'badge-delete' : 'badge-edit'}">${log.type}</span></td>
            <td>${currentRoom ? currentRoom.name : 'روم غير معرّف'}</td>
            <td><strong>${log.actor}</strong></td>
            <td>${log.content}</td>
            <td>${log.timestamp}</td>
        </tr>`;
    }).join('');

    let timeoutRows = timeLogs.length === 0 ? `<tr><td colspan="5" style="color: #64748b; text-align:center;">لا توجد سجلات تايم أوت حالياً للرومات المحددة.</td></tr>` :
    timeLogs.map(log => {
        let currentRoom = roomsList.find(r => r.id === log.room);
        return `
        <tr>
            <td>${currentRoom ? currentRoom.name : 'سيرفر عام'}</td>
            <td><strong>${log.actor}</strong></td>
            <td><span style="color: #ef4444; font-weight: bold;">${log.target}</span></td>
            <td>${log.duration}</td>
            <td>${log.timestamp}</td>
        </tr>`;
    }).join('');

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة التحكم - ديسكورد حقيقي</title>
        <style>
            * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }
            body { display: flex; background-color: #f4f6f9; color: #333; }
            .sidebar { width: 260px; height: 100vh; background-color: #1e293b; color: #fff; position: fixed; right: 0; top: 0; padding: 20px; }
            .sidebar h2 { text-align: center; margin-bottom: 30px; font-size: 22px; color: #38bdf8; }
            .sidebar ul { list-style: none; }
            .sidebar ul li a { display: block; padding: 12px 15px; color: #cbd5e1; text-decoration: none; border-radius: 6px; background-color: #334155; font-weight: bold; }
            .sidebar ul li a.active { background-color: #38bdf8; color: #1e293b; }
            .main-content { margin-right: 260px; padding: 40px; width: calc(100% - 260px); }
            h1 { margin-bottom: 25px; color: #0f172a; }
            .card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 30px; }
            .card h3 { margin-bottom: 15px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; background: #fff; border-radius: 8px; overflow: hidden; }
            th, td { padding: 12px 15px; text-align: right; border-bottom: 1px solid #e2e8f0; }
            th { background-color: #f8fafc; color: #64748b; font-weight: 600; }
            tr:hover { background-color: #f1f5f9; }
            .btn { background-color: #38bdf8; color: #1e293b; border: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; cursor: pointer; margin-top: 15px; }
            .btn:hover { background-color: #0ea5e9; }
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .badge-delete { background-color: #fee2e2; color: #ef4444; }
            .badge-edit { background-color: #fef9c3; color: #ca8a04; }
            input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="sidebar">
            <h2>لوحة التحكم</h2>
            <ul>
                <li><a href="/dashboard/logs" class="active">صفحة اللوق (Logs)</a></li>
            </ul>
        </div>
        <div class="main-content">
            <h1>سجلات ديسكورد الحية والتحكم بالرومات</h1>
            <div class="card">
                <h3>تحديد الرومات الفعالة للمراقبة</h3>
                <form action="/dashboard/update-rooms" method="POST">
                    <table>
                        <thead>
                            <tr>
                                <th>اسم السيرفر والروم</th>
                                <th>لوق الحذف والتعديل (صح)</th>
                                <th>لوق التايم أوت (صح)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${roomsRows || '<tr><td colspan="3" style="text-align:center;">جاري جلب قنوات البوت... تأكد من وجود البوت بسيرفر ما وتعيين الـ TOKEN بشكل صحيح.</td></tr>'}
                        </tbody>
                    </table>
                    <button type="submit" class="btn">حفظ وتحديث الفلاتر</button>
                </form>
            </div>
            <div class="card">
                <h3>لوق حذف وتعديل الرسائل (الحي)</h3>
                <table>
                    <thead>
                        <tr>
                            <th>النوع</th>
                            <th>الروم</th>
                            <th>المسؤول</th>
                            <th>التفاصيل</th>
                            <th>الوقت</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${msgRows}
                    </tbody>
                </table>
            </div>
            <div class="card">
                <h3>لوق التايم أوت (Timeouts الحقيقي)</h3>
                <table>
                    <thead>
                        <tr>
                            <th>الروم المرتبط</th>
                            <th>من أعطى التايم</th>
                            <th>العضو المعاقب</th>
                            <th>المدة</th>
                            <th>الوقت</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${timeoutRows}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>`;
}
