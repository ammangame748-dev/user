const { Client, GatewayIntentBits, AuditLogEvent, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
require('dotenv').config({ silent: true });

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SETTINGS_FILE = './guildSettings.json';

// قراءة ملف الإعدادات أو البدء بكائن فارغ
let guildSettings = fs.existsSync(SETTINGS_FILE)
    ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    : {};

// دالة حفظ التعديلات فوراً في الملف
function saveSettingsToFile() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(guildSettings, null, 4), 'utf8');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', () => {
    console.log(`Bot initialized as: ${client.user.tag}`);
});

function initGuildSettings(guildId) {
    if (!guildSettings[guildId]) {
        guildSettings[guildId] = {
            messageLogChannelId: "",
            timeoutLogChannelId: "",
            monitoredRooms: {}
        };
    }
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
        const textChannels = guild.channels.cache.filter(c => c.type === 0);
        textChannels.forEach(channel => {
            if (guildSettings[guildId].monitoredRooms[channel.id] === undefined) {
                guildSettings[guildId].monitoredRooms[channel.id] = true;
            }
        });
    }
    saveSettingsToFile();
}

// ==========================================
// أحداث ديسكورد لإرسال اللوق
// ==========================================

// 1. رصد كلمة "خنق" والمنشن وإرسالها لروم التايم أوت
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content.includes('خنق') && message.mentions.members.size > 0) {
        const settings = guildSettings[message.guild.id];
        if (!settings || !settings.timeoutLogChannelId) return;

        const logChannel = message.guild.channels.cache.get(settings.timeoutLogChannelId);
        if (!logChannel) return;

        const targetMember = message.mentions.members.first();

        const embed = new EmbedBuilder()
            .setTitle('بلاغ رصد كلمة خنق')
            .setColor('#eab308')
            .setDescription(`تم رصد استخدام كلمة خنق مع منشن في الروم: <#${message.channel.id}>`)
            .addFields(
                { name: 'بواسطة الشخص:', value: `<@${message.author.id}>`, inline: true },
                { name: 'الشخص المستهدف (المنشن):', value: `<@${targetMember.id}>`, inline: true },
                { name: 'نص الرسالة كاملاً:', value: `\`\`\`${message.content}\`\`\`` }
            )
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => { });
    }
});

client.on('messageDelete', async (message) => {
    if (message.partial || message.author?.bot || !message.guild) return;
    const settings = guildSettings[message.guild.id];
    if (!settings || !settings.monitoredRooms[message.channel.id]) return;

    const logChannel = message.guild.channels.cache.get(settings.messageLogChannelId);
    if (!logChannel) return;

    let executor = `<@${message.author.id}>`;
    let executorTarget = message.author;

    try {
        const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
        const deletionLog = fetchedLogs.entries.first();
        if (deletionLog && deletionLog.target.id === message.author.id && (Date.now() - deletionLog.createdTimestamp) < 5000) {
            executor = `<@${deletionLog.executor.id}>`;
            executorTarget = deletionLog.executor;
        }
    } catch (e) { }

    const hasAttachment = message.attachments.size > 0;
    const firstAttachment = hasAttachment ? message.attachments.first() : null;
    
    const embed = new EmbedBuilder()
        .setTitle('سجل حذف رسالة')
        .setColor('#ef4444')
        .setDescription(`تم حذف رسالة في الروم: <#${message.channel.id}>`)
        .addFields(
            { name: 'المسؤول عن الحذف:', value: executor || 'غير معروف (أو صاحب الرسالة)', inline: true },
            { name: 'صاحب الرسالة الأصلية:', value: `<@${message.author.id}>`, inline: true },
            { 
                name: 'نص الرسالة المحذوفة:', 
                value: `\`\`\`${(message.content && message.content.trim()) ? message.content : (hasAttachment ? 'تحتوي الرسالة على ملف مرفق (مرفق أدناه)' : 'محتوى ميديا أو إيموجي فقط')}\`\`\`` 
            }
        )
        .setThumbnail(executorTarget ? executorTarget.displayAvatarURL({ dynamic: true }) : message.guild.iconURL({ dynamic: true }))
        .setTimestamp();

    const sendOptions = { embeds: [embed] };

    if (hasAttachment && firstAttachment) {
        sendOptions.files = [{
            attachment: firstAttachment.url,
            name: firstAttachment.name
        }];
        
        if (firstAttachment.contentType?.startsWith('image/')) {
            embed.setImage(`attachment://${firstAttachment.name}`);
        }
    }

    logChannel.send(sendOptions).catch((err) => console.error("فشل إرسال سجل الحذف:", err));
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.partial || oldMessage.author?.bot || !oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    const settings = guildSettings[oldMessage.guild.id];
    if (!settings || !settings.monitoredRooms[oldMessage.channel.id]) return;

    const logChannel = oldMessage.guild.channels.cache.get(settings.messageLogChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('سجل تعديل رسالة')
        .setColor('#ca8a04')
        .setDescription(`تم تعديل رسالة في الروم: <#${oldMessage.channel.id}>`)
        .addFields(
            { name: 'صاحب الرسالة المعدل:', value: `<@${oldMessage.author.id}>`, inline: false },
            { name: 'المحتوى قبل التعديل:', value: `\`\`\`${oldMessage.content || 'فارغ'}\`\`\`` },
            { name: 'المحتوى بعد التعديل:', value: `\`\`\`${newMessage.content || 'فارغ'}\`\`\`` }
        )
        .setThumbnail(oldMessage.author.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => { });
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.guild) return;
    const settings = guildSettings[oldMember.guild.id];
    if (!settings) return;

    const logChannel = oldMember.guild.channels.cache.get(settings.timeoutLogChannelId);
    if (!logChannel) return;

    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    if (!oldTimeout && newTimeout && newTimeout > Date.now()) {
        let executor = 'مشرف مجهول';
        try {
            const fetchedLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
            const auditEntry = fetchedLogs.entries.first();
            if (auditEntry && auditEntry.target.id === newMember.id) {
                executor = `<@${auditEntry.executor.id}>`;
            }
        } catch (e) { }

        const totalSeconds = Math.round((newTimeout - Date.now()) / 1000);
        const durationText = totalSeconds < 60 ? `${totalSeconds} ثانية` : `${Math.round(totalSeconds / 60)} دقيقة`;

        const embed = new EmbedBuilder()
            .setTitle('سجل عقوبة تايم أوت')
            .setColor('#38bdf8')
            .addFields(
                { name: 'من قام بإعطاء التايم أوت:', value: executor, inline: true },
                { name: 'العضو المعاقب:', value: `<@${newMember.id}>`, inline: true },
                { name: 'مدة العقوبة الزمنية:', value: `\`${durationText}\``, inline: false }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => { });
    }
    else if (oldTimeout && oldTimeout > Date.now() && (!newTimeout || newTimeout <= Date.now())) {
        let executor = 'انتهاء مدة العقوبة التلقائي';
        try {
            const fetchedLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
            const auditEntry = fetchedLogs.entries.first();
            if (auditEntry && auditEntry.target.id === newMember.id) {
                const change = auditEntry.changes.find(c => c.key === 'communication_disabled_until');
                if (change && change.old && !change.new) executor = `<@${auditEntry.executor.id}>`;
            }
        } catch (e) {}

        const embed = new EmbedBuilder()
            .setTitle('سجل فك عقوبة التايم أوت')
            .setColor('#22c55e')
            .addFields(
                { name: 'المسؤول عن فك العقوبة:', value: executor, inline: true },
                { name: 'العضو الذي تم فك العقوبة عنه:', value: `<@${newMember.id}>`, inline: true }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => { });
    }
});

// ==========================================
// مسارات واجهة المستخدم المباشرة (Express App)
// ==========================================

app.get('/', (req, res) => {
    // تعديل ذكي: إضافة ميزة إعادة التحديث التلقائي إذا لم يكتمل إقلاع البوت بالكامل بعد
    if (!client.user) {
        return res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="refresh" content="4">
                <title>جاري تشغيل النظام</title>
                <style>
                    body { background: #0f172a; color: #94a3b8; font-family: sans-serif; text-align: center; padding-top: 100px; }
                    .loader { border: 4px solid #334155; border-top: 4px solid #38bdf8; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                </style>
            </head>
            <body>
                <div class="loader"></div>
                <h2>جاري تشغيل البوت والاتصال بقاعدة البيانات...</h2>
                <p>ستفتح لوحة التحكم تلقائياً خلال ثوانٍ، يرجى عدم إغلاق الصفحة.</p>
            </body>
            </html>
        `);
    }

    let botGuilds = client.guilds.cache.map(g => {
        return {
            id: g.id,
            name: g.name,
            icon: g.iconURL() ? g.iconURL() : 'https://discordapp.com'
        };
    });

    res.send(getGuildSelectorHtml(botGuilds));
});

app.get('/manage/:guildId', (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.send('البوت ليس متواجداً في هذا السيرفر.');

    initGuildSettings(guildId);
    const settings = guildSettings[guildId];
    const textChannels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));

    res.send(getManageServerHtml(guild, textChannels, settings));
});

app.post('/update/:guildId', (req, res) => {
    const guildId = req.params.guildId;
    const { enabledMessageRooms, mainMessageChannel, mainTimeoutChannel } = req.body;

    if (!guildSettings[guildId]) initGuildSettings(guildId);

    guildSettings[guildId].messageLogChannelId = mainMessageChannel || "";
    guildSettings[guildId].timeoutLogChannelId = mainTimeoutChannel || "";

    const msgRooms = Array.isArray(enabledMessageRooms) ? enabledMessageRooms : (enabledMessageRooms ? [enabledMessageRooms] : []);
    for (let roomId in guildSettings[guildId].monitoredRooms) {
        guildSettings[guildId].monitoredRooms[roomId] = msgRooms.includes(roomId);
    }

    saveSettingsToFile();
    res.redirect(`/manage/${guildId}`);
});

if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN).catch(err => console.error(err.message));
}

// البورت 10000 متوافق مباشرة مع إعدادات Render الافتراضية المكتوبة باللوق لديك
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Dashboard Server live on port ${PORT}`));

// ==========================================
// قوالب الـ HTML وعلاج انقطاع الكود
// ==========================================

function getGuildSelectorHtml(guildsList) {
    const botInviteUrl = `https://discord.com{client.user ? client.user.id : ''}&permissions=8&scope=bot`;

    let cardsHtml = guildsList.map(g => `
        <div class="server-card">
            <img class="server-icon" src="${g.icon}" alt="">
            <div class="server-details">
                <h3>${g.name}</h3>
                <span class="status-tag online">البوت متصل وجاهز</span>
            </div>
            <a href="/manage/${g.id}" class="ctrl-btn managed">تحكم بالسيرفر</a>
        </div>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>لوحة التحكم | اختيار السيرفر</title>
        <style>
            :root { --bg-p: #0f172a; --bg-s: #1e293b; --bg-a: #334155; --text: #f8fafc; --text-m: #94a3b8; --blue: #38bdf8; }
            * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; }
            body { background: var(--bg-p); color: var(--text); }
            .container { max-width: 1000px; margin: 60px auto; padding: 0 20px; }
            header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; border-bottom: 1px solid var(--bg-a); padding-bottom: 20px; }
            h1 { font-size: 26px; font-weight: 800; }
            .invite-btn { background: #5865F2; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; }
            .server-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            .server-card { background: var(--bg-s); border: 1px solid var(--bg-a); border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 15px; }
            .server-icon { width: 60px; height: 60px; border-radius: 50%; background: var(--bg-a); }
            .server-details { flex-grow: 1; }
            .server-details h3 { font-size: 16px; margin-bottom: 4px; }
            .status-tag { font-size: 12px; font-weight: bold; color: #22c55e; }
            .ctrl-btn { padding: 8px 14px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: bold; transition: 0.2s; }
            .ctrl-btn.managed { background: var(--bg-a); color: var(--text); }
            .ctrl-btn.managed:hover { background: var(--blue); color: var(--bg-p); }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <div>
                    <h1>لوحة الإدارة المركزية للبوت</h1>
                    <p style="color: var(--text-m); font-size:14px; margin-top:5px;">اختر السيرفر المتصل به البوت حالياً لتخصيص رومات اللوق والفلاتر فوراً.</p>
                </div>
                <a href="${botInviteUrl}" target="_blank" class="invite-btn">إضافة البوت لسيرفر جديد</a>
            </header>
            <div class="server-grid">
                ${cardsHtml || '<p style="color:var(--text-m);">جاري تحميل السيرفرات المشتركة...</p>'}
            </div>
        </div>
    </body>
    </html>`;
}

function getManageServerHtml(guild, textChannels, settings) {
    let selectMessageOptions = textChannels.map(c => `
        <option value="${c.id}" ${settings.messageLogChannelId === c.id ? 'selected' : ''}>#${c.name}</option>
    `).join('');

    let selectTimeoutOptions = textChannels.map(c => `
        <option value="${c.id}" ${settings.timeoutLogChannelId === c.id ? 'selected' : ''}>#${c.name}</option>
    `).join('');

    // إكمال كود استعراض الرومات وصندوق الـ Checkbox الذي قُطع في الرسالة الأخيرة
    let roomsRows = textChannels.map(c => {
        const isChecked = settings.monitoredRooms[c.id] !== false ? 'checked' : '';
        return `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid var(--bg-a);"><strong>#${c.name}</strong></td>
            <td style="padding: 12px; border-bottom: 1px solid var(--bg-a); text-align: left;">
                <input type="checkbox" name="enabledMessageRooms" value="${c.id}" ${isChecked} style="width:18px; height:18px; cursor:pointer;">
            </td>
        </tr>`;
    }).join('');

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>إدارة سيرفر | ${guild.name}</title>
        <style>
            :root { --bg-p: #0f172a; --bg-s: #1e293b; --bg-a: #334155; --text: #f8fafc; --text-m: #94a3b8; --blue: #38bdf8; --green: #22c55e; }
            * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; }
            body { background: var(--bg-p); color: var(--text); padding: 40px 20px; }
            .container { max-width: 700px; margin: 0 auto; background: var(--bg-s); border: 1px solid var(--bg-a); border-radius: 12px; padding: 30px; }
            h2 { margin-bottom: 25px; font-size: 22px; border-bottom: 1px solid var(--bg-a); padding-bottom: 15px; }
            .form-group { margin-bottom: 20px; }
            label { display: block; font-size: 14px; color: var(--text-m); margin-bottom: 8px; font-weight: 600; }
            select { width: 100%; padding: 10px; background: var(--bg-p); border: 1px solid var(--bg-a); color: #fff; border-radius: 6px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { text-align: right; color: var(--text-m); font-size: 13px; padding-bottom: 10px; border-bottom: 2px solid var(--bg-a); }
            .save-btn { background: var(--blue); color: var(--bg-p); border: none; padding: 12px 20px; width: 100%; font-weight: bold; font-size: 15px; border-radius: 6px; cursor: pointer; margin-top: 25px; transition: 0.2s; }
            .save-btn:hover { background: #0ea5e9; }
            .back-link { display: inline-block; margin-top: 15px; color: var(--text-m); text-decoration: none; font-size: 13px; }
            .back-link:hover { color: #fff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>⚙️ إعدادات سيرفر: ${guild.name}</h2>
            <form action="/update/${guild.id}" method="POST">
                <div class="form-group">
                    <label>روم تسجيل الرسائل المحذوفة والمعدلة:</label>
                    <select name="mainMessageChannel">
                        <option value="">-- لم يتم الاختيار --</option>
                        ${selectMessageOptions}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>روم تسجيل عقوبات التايم أوت (وبلاغات كلمة خنق):</label>
                    <select name="mainTimeoutChannel">
                        <option value="">-- لم يتم الاختيار --</option>
                        ${selectTimeoutOptions}
                    </select>
                </div>

                <h3 style="font-size:16px; margin: 30px 0 10px 0; color:var(--blue);">🔒 الرومات المشمولة بالرقابة والمتابعة:</h3>
                <table>
                    <thead>
                        <tr>
                            <th>اسم الروم</th>
                            <th style="text-align: left;">تفعيل المراقبة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${roomsRows}
                    </tbody>
                </table>

                <button type="submit" class="save-btn">حفظ وتطبيق الإعدادات الحالية ✨</button>
            </form>
            <a href="/" class="back-link">⬅️ العودة لقائمة السيرفرات</a>
        </div>
    </body>
    </html>`;
}
