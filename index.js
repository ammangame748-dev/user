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

    // التحقق مما إذا كانت الرسالة تحتوي على كلمة "خنق" وتحتوي على منشن لعضو واحد على الأقل
    if (message.content.includes('خنق') && message.mentions.members.size > 0) {
        const settings = guildSettings[message.guild.id];
        if (!settings || !settings.timeoutLogChannelId) return;

        const logChannel = message.guild.channels.cache.get(settings.timeoutLogChannelId);
        if (!logChannel) return;

        // جلب العضو الممنشن الأول (باستثناء البوتات وصاحب الرسالة إن وجد)
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
    
    // 🛠️ معالجة نص الرسالة لضمان عدم بقائه فارغاً أو تجاوز الحد المسموح (1024 حرفاً)
    let rawContent = (message.content && message.content.trim()) 
        ? message.content 
        : (hasAttachment ? 'تحتوي الرسالة على ملف مرفق (مرفق أدناه)' : 'محتوى ميديا أو إيموجي فقط');

    // إذا كان النص طويلاً جداً نقوم بقصه حتى لا يتحطم البوت
    if (rawContent.length > 1000) {
        rawContent = rawContent.slice(0, 1000) + '... (تم اختصار النص لطوله)';
    }

    const finalContent = `\`\`\`\n${rawContent}\n\`\`\``;

    const embed = new EmbedBuilder()
        .setTitle('سجل حذف رسالة')
        .setColor('#ef4444')
        .setDescription(`تم حذف رسالة في الروم: <#${message.channel.id}>`)
        .addFields(
            { name: 'المسؤول عن الحذف:', value: String(executor || 'غير معروف'), inline: true },
            { name: 'صاحب الرسالة الأصلية:', value: String(`<@${message.author.id}>`), inline: true },
            { name: 'نص الرسالة المحذوفة:', value: finalContent }
        )
        .setTimestamp();

    // تأمين الصور الرمزية (Avatar) من القيمة الفارغة
    if (executorTarget) {
        embed.setThumbnail(executorTarget.displayAvatarURL({ dynamic: true }));
    } else if (message.guild.iconURL()) {
        embed.setThumbnail(message.guild.iconURL({ dynamic: true }));
    }

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
// مسارات واجهة المستخدم المباشرة
// ==========================================

app.get('/', (req, res) => {
    if (!client.user) return res.send('جاري تشغيل البوت، انتظر ثواني واعمل تحديث للصفحة.');

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Dashboard Server live on port ${PORT}`));

// ==========================================
// قوالب الـ HTML
// ==========================================

function getGuildSelectorHtml(guildsList) {
   const botInviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user ? client.user.id : ''}&permissions=8&scope=bot`;

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

    let roomsRows = textChannels.map(c => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid var(--bg-a);"><strong>#${c.name}</strong></td>
            <td style="padding: 12px; border-bottom: 1px solid var(--bg-a); text-align: left;">
                <label class="switch">
                    <input type="checkbox" name="enabledMessageRooms" value="${c.id}" ${settings.monitoredRooms[c.id] ? 'checked' : ''}>
                    <span class="slider font-toggle"></span>
                </label>
            </td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>إدارة سيرفر | ${guild.name}</title>
        <style>
            :root { --bg-p: #0f172a; --bg-s: #1e293b; --bg-a: #334155; --text: #f8fafc; --text-m: #94a3b8; --blue: #38bdf8; --green: #22c55e; }
            * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; }
            body { display: flex; background: var(--bg-p); color: var(--text); }
            .sidebar { width: 260px; background: var(--bg-s); border-left: 1px solid var(--bg-a); position: fixed; right: 0; top: 0; bottom: 0; padding: 30px 20px; }
            .sidebar h2 { font-size: 20px; color: var(--blue); margin-bottom: 30px; text-align: center; }
            .sidebar a { display: block; padding: 12px; color: var(--text); text-decoration: none; background: var(--bg-a); border-radius: 8px; font-weight: bold; text-align: center; }
            .main-content { margin-right: 260px; padding: 40px; width: calc(100% - 260px); }
            .card { background: var(--bg-s); border: 1px solid var(--bg-a); padding: 25px; border-radius: 12px; margin-bottom: 30px; }
            .card h3 { font-size: 18px; margin-bottom: 15px; color: var(--blue); border-bottom: 1px solid var(--bg-a); padding-bottom: 10px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
            select { width: 100%; padding: 12px; background: var(--bg-p); border: 1px solid var(--bg-a); color: var(--text); border-radius: 8px; outline: none; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .btn-save { background: var(--green); color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 15px; width: 100%; transition: 0.3s; }
            .btn-save:hover { opacity: 0.9; }
            
            /* تفعيل الـ Switch */
            .switch { position: relative; display: inline-block; width: 50px; height: 26px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--bg-a); transition: .4s; border-radius: 34px; }
            .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--blue); }
            input:checked + .slider:before { transform: translateX(-24px); }
        </style>
    </head>
    <body>
        <div class="sidebar">
            <h2>لوحة التحكم</h2>
            <a href="/">العودة للسيرفرات</a>
        </div>
        <div class="main-content">
            <h1 style="margin-bottom: 25px;">إعدادات سيرفر: ${guild.name}</h1>
            <form action="/update/${guild.id}" method="POST">
                <div class="card">
                    <h3>رومات السجلات المعتمدة (Logs)</h3>
                    <div class="grid">
                        <div>
                            <label style="display:block; margin-bottom:8px; font-size:14px; color:var(--text-m);">روم سجل الرسائل (حذف وتعديل):</label>
                            <select name="mainMessageChannel">
                                <option value="">تعطيل السجل</option>
                                ${selectMessageOptions}
                            </select>
                        </div>
                        <div>
                            <label style="display:block; margin-bottom:8px; font-size:14px; color:var(--text-m);">روم سجل العقوبات والتايم أوت:</label>
                            <select name="mainTimeoutChannel">
                                <option value="">تعطيل السجل</option>
                                ${selectTimeoutOptions}
                            </select>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <h3>مراقبة الغرف الفردية (الرسائل)</h3>
                    <p style="font-size:14px; color:var(--text-m);">حدد الرومات التي تريد من البوت رصد الحذف والتعديل بداخلها:</p>
                    <table>
                        <thead>
                            <tr>
                                <th style="text-align: right; padding: 12px; border-bottom: 2px solid var(--bg-a); color:var(--blue);">اسم الروم</th>
                                <th style="text-align: left; padding: 12px; border-bottom: 2px solid var(--bg-a); color:var(--blue);">حالة المراقبة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${roomsRows}
                        </tbody>
                    </table>
                </div>
                <button type="submit" class="btn-save">حفظ جميع الإعدادات فوراً</button>
            </form>
        </div>
    </body>
    </html>`;
}
