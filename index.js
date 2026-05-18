const { Client, GatewayIntentBits, AuditLogEvent, EmbedBuilder } = require('discord.js');
const express = require('express');
require('dotenv').config({ silent: true });

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ==========================================
// 1. متغيرات الإعدادات والذاكرة (حفظ الرومات المختارة)
// ==========================================
let rooms = [];              // قنوات السيرفر لجداول الصح والخطأ
let messageLogChannelId = ""; // الروم التي سيرسل إليها البوت إمبيد الحذف والتعديل
let timeoutLogChannelId = ""; // الروم التي سيرسل إليها البوت إمبيد التايم أوت

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMembers
    ]
});

// عند تشغيل البوت بنجاح
client.once('ready', async () => {
    console.log(`Bot connected: ${client.user.tag}`);
    refreshRoomsList();
});

// دالة لتحديث قائمة الرومات المتاحة للبوت
function refreshRoomsList() {
    let tempRooms = [];
    client.guilds.cache.forEach(guild => {
        const textChannels = guild.channels.cache.filter(c => c.type === 0);
        textChannels.forEach(channel => {
            // المحافظة على الحالات السابقة للصح إن وجدت
            const existing = rooms.find(r => r.id === channel.id);
            tempRooms.push({
                id: channel.id,
                name: `${guild.name} ➔ #${channel.name}`,
                messagesEnabled: existing ? existing.messagesEnabled : true
            });
        });
    });
    rooms = tempRooms;
}

// ==========================================
// 2. أحداث الديسكورد (Discord Events) وإرسال الإمبيدات
// ==========================================

// [حدث حذف الرسالة]
client.on('messageDelete', async (message) => {
    if (message.partial || message.author?.bot) return;

    // التأكد هل الروم التي تم الحذف فيها مفعلة (عليها صح) بالداش بورد؟
    const roomConfig = rooms.find(r => r.id === message.channel.id);
    if (!roomConfig || !roomConfig.messagesEnabled) return;

    // التأكد من تحديد روم لإرسال اللوق إليها
    const targetLogChannel = client.channels.cache.get(messageLogChannelId);
    if (!targetLogChannel) return;

    let executor = "غير معروف (حذف ذاتي غالباً)";
    let executorTarget = message.author;

    try {
        const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
        const deletionLog = fetchedLogs.entries.first();
        if (deletionLog && deletionLog.target.id === message.author.id && (Date.now() - deletionLog.createdTimestamp) < 5000) {
            executor = `<@${deletionLog.executor.id}>`;
            executorTarget = deletionLog.executor;
        } else {
            executor = `<@${message.author.id}>`;
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🗑️ لوق حذف رسالة جديد')
        .setColor('#ef4444')
        .setDescription(`تم حذف رسالة في الروم: <#${message.channel.id}>`)
        .addFields(
            { name: '👤 المسؤول عن الحذف:', value: executor, inline: true },
            { name: '✉️ صاحب الرسالة الأصلية:', value: `<@${message.author.id}>`, inline: true },
            { name: '📄 نص الرسالة المحذوفة:', value: `\`\`\`${message.content || 'محتوى ميديا أو إيموجي فقط'}\`\`\`` }
        )
        .setThumbnail(executorTarget.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    targetLogChannel.send({ embeds: [embed] }).catch(err => console.error("Error sending delete log:", err.message));
});

// [حدث تعديل الرسالة]
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.partial || oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // لضمان عدم تكرار اللوق عند إضافة منشن تلقائي أو ميديا

    const roomConfig = rooms.find(r => r.id === oldMessage.channel.id);
    if (!roomConfig || !roomConfig.messagesEnabled) return;

    const targetLogChannel = client.channels.cache.get(messageLogChannelId);
    if (!targetLogChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📝 لوق تعديل رسالة جديد')
        .setColor('#ca8a04')
        .setDescription(`تم تعديل رسالة في الروم: <#${oldMessage.channel.id}>`)
        .addFields(
            { name: '👤 صاحب الرسالة (المعدِّل):', value: `<@${oldMessage.author.id}>`, inline: false },
            { name: '⬅️ المحتوى قبل التعديل:', value: `\`\`\`${oldMessage.content || 'فارغ'}\`\`\`` },
            { name: '➡️ المحتوى بعد التعديل:', value: `\`\`\`${newMessage.content || 'فارغ'}\`\`\`` }
        )
        .setThumbnail(oldMessage.author.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    targetLogChannel.send({ embeds: [embed] }).catch(err => console.error("Error sending update log:", err.message));
});

// [حدث التايم أوت العام - أي شخص بأي مكان]
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    if (!oldTimeout && newTimeout && newTimeout > Date.now()) {
        const targetLogChannel = client.channels.cache.get(timeoutLogChannelId);
        if (!targetLogChannel) return;

        let executor = 'مشرف مجهول';
        let executorUser = null;
        
        try {
            const fetchedLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
            const auditEntry = fetchedLogs.entries.first();
            if (auditEntry && auditEntry.target.id === newMember.id) {
                executor = `<@${auditEntry.executor.id}>`;
                executorUser = auditEntry.executor;
            }
        } catch (e) {}

        const durationMinutes = Math.round((newTimeout - Date.now()) / 60000);

        const embed = new EmbedBuilder()
            .setTitle(' لوق عقوبة تايم أوت (عام)')
            .setColor('#38bdf8')
            .setDescription(` تطبيق عقوبة  زمنيّة على أحد الأعضاء`)
            .addFields(
                { name: ' من قام بإعطاء التايم أوت:', value: executor, inline: true },
                { name: ' العضو المعاقب (لمين):', value: `<@${newMember.id}>`, inline: true },
                { name: ' مدة العقوبة الزمنيّة:', value: `\`${durationMinutes} دقيقة\``, inline: false }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        if (executorUser) {
            embed.setFooter({ text: `بواسطة: ${executorUser.tag}`, iconURL: executorUser.displayAvatarURL() });
        }

        targetLogChannel.send({ embeds: [embed] }).catch(err => console.error("Error sending timeout log:", err.message));
    }
});

// تشغيل البوت بالتوكن المتوافق مع ملفك
if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN).catch(err => console.error("Discord Login Error: ", err.message));
}

// ==========================================
// 3. مسارات التحكم للداش بورد الفخم (Express)
// ==========================================
app.get('/', (req, res) => res.redirect('/dashboard/logs'));

app.get('/dashboard/logs', (req, res) => {
    refreshRoomsList(); // لتحديث أي قنوات جديدة تمت إضافتها للسيرفرات
    res.send(getModernHtmlTemplate(rooms, messageLogChannelId, timeoutLogChannelId));
});

app.post('/dashboard/update-settings', (req, res) => {
    const { enabledMessageRooms, mainMessageChannel, mainTimeoutChannel } = req.body;

    // حفظ الرومات المستهدفة لإرسال اللوق إليها
    messageLogChannelId = mainMessageChannel || "";
    timeoutLogChannelId = mainTimeoutChannel || "";

    // تحديث كبسات الصح للرومات المستهدفة للمراقبة (الحذف والتعديل)
    const msgRooms = Array.isArray(enabledMessageRooms) ? enabledMessageRooms : (enabledMessageRooms ? [enabledMessageRooms] : []);
    rooms.forEach(room => {
        room.messagesEnabled = msgRooms.includes(room.id);
    });

    res.redirect('/dashboard/logs');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Fabulous Dashboard live on port ${PORT}`));

// ==========================================
// 4. دالة توليد قالب الـ HTML بالتصميم المودرن والغامق
// ==========================================
function getModernHtmlTemplate(roomsList, currentMsgTarget, currentTimeTarget) {
    // بناء خيارات القوائم المنسدلة لاختيار رومات الإرسال
    let channelOptions = roomsList.map(r => `
        <option value="${r.id}" ${currentMsgTarget === r.id || currentTimeTarget === r.id ? 'style="color:#38bdf8;"' : ''}>
            ${r.name}
        </option>
    `).join('');

    // بناء جدول الرومات المراقبة
    let roomsRows = roomsList.map(room => `
        <tr>
            <td>
                <div class="room-info">
                    <span class="room-icon">#</span>
                    <strong>${room.name}</strong>
                </div>
            </td>
            <td>
                <label class="switch">
                    <input type="checkbox" name="enabledMessageRooms" value="${room.id}" ${room.messagesEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة القيادة الذكية | ديسكورد</title>
        <style>
            :root {
                --bg-primary: #0f172a;
                --bg-secondary: #1e293b;
                --bg-accent: #334155;
                --text-main: #f8fafc;
                --text-muted: #94a3b8;
                --color-blue: #38bdf8;
                --color-green: #22c55e;
            }
            * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; }
            body { display: flex; background-color: var(--bg-primary); color: var(--text-main); min-height: 100vh; }
            
            /* القائمة الجانبية الأنيقة */
            .sidebar { width: 280px; background-color: var(--bg-secondary); border-left: 1px solid var(--bg-accent); position: fixed; right: 0; top: 0; bottom: 0; padding: 30px 20px; }
            .sidebar h2 { font-size: 24px; font-weight: 800; color: var(--color-blue); text-align: center; margin-bottom: 40px; letter-spacing: 0.5px; }
            .sidebar ul { list-style: none; }
            .sidebar ul li a { display: flex; align-items: center; padding: 14px 18px; color: var(--text-main); text-decoration: none; border-radius: 8px; background-color: var(--bg-accent); font-weight: 600; transition: 0.3s ease; }
            .sidebar ul li a:hover { background-color: var(--color-blue); color: var(--bg-primary); }

            /* منطقة المحتوى */
            .main-content { margin-right: 280px; padding: 40px; width: calc(100% - 280px); }
            header { margin-bottom: 35px; }
            header h1 { font-size: 28px; font-weight: 800; margin-bottom: 5px; }
            header p { color: var(--text-muted); font-size: 15px; }
            
            /* كروت الإعدادات المودرن */
            .grid-selectors { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .card { background: var(--bg-secondary); border: 1px solid var(--bg-accent); padding: 25px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); }
            .card h3 { font-size: 18px; margin-bottom: 15px; color: var(--color-blue); border-bottom: 1px solid var(--bg-accent); padding-bottom: 10px; }
            
            label.block-label { display: block; margin-bottom: 8px; color: var(--text-muted); font-size: 14px; font-weight: 600; }
            select { width: 100%; padding: 12px; background: var(--bg-primary); border: 1px solid var(--bg-accent); color: var(--text-main); border-radius: 8px; outline: none; font-size: 15px; cursor: pointer; }
            
            /* الجداول المفخمة */
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 14px 20px; text-align: right; }
            th { background-color: var(--bg-primary); color: var(--text-muted); font-size: 14px; text-transform: uppercase; font-weight: 700; border-bottom: 2px solid var(--bg-accent); }
            td { border-bottom: 1px solid var(--bg-accent); font-size: 15px; }
            tr:hover td { background-color: rgba(255,255,255,0.02); }

            .room-info { display: flex; align-items: center; gap: 10px; }
            .room-icon { background: var(--bg-accent); color: var(--color-blue); padding: 4px 8px; border-radius: 6px; font-family: monospace; }

            /* زر الحفظ الكبير */
            .btn-save { background-color: var(--color-green); color: white; border: none; padding: 14px 35px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 20px; width: 100%; transition: 0.2s; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2); }
            .btn-save:hover { transform: translateY(-2px); filter: brightness(1.1); }

            /* سويتشات الـ Toggle الجميلة بدلاً من التشيك بوكس التقليدي */
            .switch { position: relative; display: inline-block; width: 45px; height: 24px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--bg-accent); transition: .4s; border-radius: 24px; }
            .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--color-blue); }
            input:checked + .slider:before { transform: translateX(-21px); }
        </style>
    </head>
    <body>

        <!-- القائمة الجانبية اليمنى الثابتة -->
        <div class="sidebar">
            <h2>لوحة التحكم</h2>
            <ul>
                <li><a href="/dashboard/logs">🌐 غرف التوجيه واللوق</a></li>
            </ul>
        </div>

        <!-- المحتوى الرئيسي المتجاوب -->
        <div class="main-content">
            <header>
                <h1>توجيه وإدارة السجلات الذكية</h1>
                <p>قم بتحديد قنوات ديسكورد المستهدفة لتلقي الإمبيدات (Embeds) والتحكم بفلاتر المراقبة الحية.</p>
            </header>

            <form action="/dashboard/update-settings" method="POST">
                
                <!-- كروت التحديد العلوي لقنوات الإرسال المباشر -->
                <div class="grid-selectors">
                    <div class="card">
                        <h3>📥 لوق الرسائل (حذف + تعديل)</h3>
                        <label class="block-label">اختر الروم التي سيرسل إليها البوت الإمبيدات:</label>
                        <select name="mainMessageChannel">
                            <option value="">-- لم يتم التحديد (تعطيل الإرسال) --</option>
                            ${channelOptions}
                        </select>
                    </div>

                    <div class="card">
                        <h3>⏱️ لوق التايم أوت (العام لكافة الأعضاء)</h3>
                        <label class="block-label">اختر الروم التي سيرسل إليها البوت لوق التايم أوت فورا:</label>
                        <select name="mainTimeoutChannel">
                            <option value="">-- لم يتم التحديد (تعطيل الإرسال) --</option>
                            ${channelOptions}
                        </select>
                    </div>
                </div>

                <!-- جدول اختيار قنوات المراقبة للحذف والتعديل -->
                <div class="card">
                    <h3>🎯 فلاتر مراقبة قنوات الشات (حذف وتعديل)</h3>
                    <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 10px;">شغل المفتاح أمام الروم لتفعيل صيد الحذف والتعديل منها، الرومات المعطلة سيتم تجاهلها بالكامل.</p>
                    <table>
                        <thead>
                            <tr>
                                <th>اسم السيرفر والروم النصية</th>
                                <th style="width: 150px;">حالة المراقبة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${roomsRows || '<tr><td colspan="2" style="text-align:center; color:var(--text-muted);">جاري جلب القنوات، تأكد من تشغيل البوت...</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <button type="submit" class="btn-save">حفظ الإعدادات وتطبيق التوجيه الفوري 💾</button>
            </form>
        </div>

    </body>
    </html>`;
}
