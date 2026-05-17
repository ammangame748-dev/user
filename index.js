const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, AuditLogEvent, PermissionsBitField, Partials } = require('discord.js');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'secret-key-dashboard',
    resave: false,
    saveUninitialized: false
}));

const CONFIG_FILE = path.join(__dirname, 'progress.json');

const CLIENT_ID = process.env.CLIENT_ID || "1501846584961532004";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "lKyk-Mjv8FYAQMCXhPw0kd2A0-RoqX2W";
const REDIRECT_URI = process.env.REDIRECT_URI || "https://onrender.com";

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({}));
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { return {}; }
}

function saveConfig(data) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 4));
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMembers // تم تصحيح الخطأ الإملائي هنا وحذف الحقل الخاطئ
    ],
    partials: [Partials.Message, Partials.Channel] 
});


app.get('/login', (req, res) => {
    const authorizeUrl = `https://discord.com{CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(authorizeUrl);
});

app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("لم يتم إتمام تسجيل الدخول.");

    try {
        const tokenResponse = await fetch('https://discord.com', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) return res.send("فشل الحصول على رمز الدخول من ديسكورد.");

        const guildsResponse = await fetch('https://discord.com', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const guilds = await guildsResponse.json();

        req.session.userGuilds = guilds;
        res.redirect('/dashboard/servers');
    } catch (error) {
        console.error(error);
        res.send("حدث خطأ أثناء الاتصال بديسكورد.");
    }
});

app.get('/dashboard/servers', (req, res) => {
    if (!req.session.userGuilds) return res.redirect('/login');

    let serverCards = '';
    req.session.userGuilds.forEach(guild => {
        const isAdmin = (BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0x8);
        if (!isAdmin) return;

        const isBotInGuild = client.guilds.cache.has(guild.id);

        if (isBotInGuild) {
            serverCards += `
                <div style="background: #36393f; padding: 20px; margin: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span>🟢 <b>${guild.name}</b></span>
                    <a href="/dashboard/manage/${guild.id}" style="background: #5865f2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">تحكم بالسيرفر</a>
                </div>`;
        } else {
            const inviteUrl = `https://discord.com{CLIENT_ID}&permissions=8&scope=bot&guild_id=${guild.id}&disable_guild_select=true`;
            serverCards += `
                <div style="background: #2f3136; padding: 20px; margin: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px dashed #4f545c;">
                    <span style="color: #b9bbbe;">🔴 ${guild.name}</span>
                    <a href="${inviteUrl}" target="_blank" style="background: #43b581; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">إضافة البوت</a>
                </div>`;
        }
    });

    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head><meta charset="UTF-8"><title>سيرفراتك</title></head>
        <body style="font-family: sans-serif; background: #2f3136; color: white; padding: 40px;">
            <div style="max-width: 800px; margin: 0 auto;">
                <h2>إختر السيرفر المراد إدارته:</h2>
                <div style="margin-top: 20px;">${serverCards || 'لا توجد سيرفرات تمتلك فيها صلاحية إدارة.'}</div>
            </div>
        </body>
        </html>
    `);
});

// صفحة البداية الرئيسية: تعرض زر تسجيل دخول فخم بدلاً من التحويل التلقائي لتفادي خطأ المتصفح
app.get('/', (req, res) => {
    const authorizeUrl = `https://discord.com{CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>لوحة تحكم البوت</title>
            <style>
                body { font-family: sans-serif; background: #2f3136; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .login-container { text-align: center; background: #202225; padding: 40px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); max-width: 400px; width: 100%; }
                h2 { margin-bottom: 20px; color: #fff; }
                p { color: #b9bbbe; margin-bottom: 30px; font-size: 14px; }
                .login-btn { display: inline-block; background: #5865f2; color: white; text-decoration: none; padding: 14px 30px; font-size: 16px; font-weight: bold; border-radius: 5px; transition: background 0.2s; }
                .login-btn:hover { background: #4752c4; }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h2>لوحة تحكم البوت الرسمية</h2>
                <p>يرجى تسجيل الدخول باستخدام حسابك في ديسكورد لإدارة سيرفراتك وتعديل إعدادات اللوق والتايم آوت.</p>
                <a href="${authorizeUrl}" class="login-btn">تسجيل الدخول بواسطة Discord</a>
            </div>
        </body>
        </html>
    `);
});

// مسار الـ /login الاحتياطي في حال تم طلبه مباشرة، ليقوم بنقل المستخدم فوراً لصفحة البداية
app.get('/login', (req, res) => {
    res.redirect('/');
});


// --- صفحة التحكم المحدثة بالنظامين اللوق والتايم آوت ---
app.get('/dashboard/manage/:guildId', (req, res) => {
    if (!req.session.userGuilds) return res.redirect('/login');

    const guildId = req.params.guildId;
    const userGuild = req.session.userGuilds.find(g => g.id === guildId);
    if (!userGuild || (BigInt(userGuild.permissions) & BigInt(0x8)) !== BigInt(0x8)) return res.send("غير مصرح لك.");

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.send("البوت غادر السيرفر.");

    const db = loadConfig();
    if (!db[guildId]) db[guildId] = { logChannelId: "", ignoredChannels: [], timeoutChannelId: "" };
    const config = db[guildId];
    if (!config.ignoredChannels) config.ignoredChannels = [];

    const allChannels = guild.channels.cache.filter(ch => ch.type === 0);

    let channelOptionsLogs = '';
    let channelOptionsTimeout = '';
    let channelCheckboxes = '';

    allChannels.forEach(ch => {
        channelOptionsLogs += `<option value="${ch.id}" ${config.logChannelId === ch.id ? 'selected' : ''}>#${ch.name}</option>`;
        channelOptionsTimeout += `<option value="${ch.id}" ${config.timeoutChannelId === ch.id ? 'selected' : ''}>#${ch.name}</option>`;
        channelCheckboxes += `
            <div style="display: flex; align-items: center; margin: 10px 0; background: #36393f; padding: 10px; border-radius: 5px;">
                <input type="checkbox" name="monitoredChannels" value="${ch.id}" ${!config.ignoredChannels.includes(ch.id) ? 'checked' : ''} style="margin-left: 10px; transform: scale(1.3);">
                <label>#${ch.name}</label>
            </div>`;
    });

    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>لوحة التحكم - ${guild.name}</title>
            <style>
                body { font-family: sans-serif; background: #2f3136; color: white; margin: 0; padding: 0; display: flex; height: 100vh; }
                .sidebar { width: 250px; background: #202225; padding: 20px; display: flex; flex-direction: column; border-left: 1px solid #202225; box-sizing: border-box; }
                .sidebar h3 { margin-bottom: 20px; text-align: center; color: #5865f2; }
                .sidebar a { color: #b9bbbe; text-decoration: none; padding: 12px; margin-bottom: 10px; border-radius: 5px; font-weight: bold; cursor: pointer; }
                .sidebar a:hover, .sidebar a.active { background: #36393f; color: white; }
                .sidebar .back-btn { background: #e74c3c; color: white; text-align: center; margin-top: auto; }
                
                .main-content { flex: 1; padding: 40px; overflow-y: auto; background: #36393f; box-sizing: border-box; }
                .tab-content { display: none; max-width: 600px; background: #202225; padding: 30px; border-radius: 8px; box-sizing: border-box; }
                .tab-content.active { display: block; }
                
                select, input, button { padding: 10px; border-radius: 5px; border: none; width: 100%; box-sizing: border-box; margin-top: 5px; margin-bottom: 15px; }
                select, input { background: #40444b; color: white; }
                button { background: #5865f2; color: white; font-weight: bold; cursor: pointer; margin-top: 10px; }
                label { font-weight: bold; display: block; margin-top: 10px; }
            </style>
        </head>
        <body>

            <div class="sidebar">
                <h3>${guild.name}</h3>
                <a onclick="switchTab('log-settings')" id="btn-log-settings" class="active">إعدادات اللوق</a>
                <a onclick="switchTab('timeout-settings')" id="btn-timeout-settings">إعدادات التايم آوت</a>
                <a href="/dashboard/servers" class="back-btn">السيرفرات</a>
            </div>

            <div class="main-content">
                
                <!-- صفحة إعدادات اللوق -->
                <div id="log-settings" class="tab-content active">
                    <h2>إعدادات اللوق الرئيسية</h2>
                    <form action="/dashboard/save/${guildId}" method="POST">
                        <input type="hidden" name="formType" value="logs">
                        <label>روم إرسال اللوق الرئيسية:</label>
                        <select name="logChannelId"><option value="">-- اختر روم --</option>${channelOptionsLogs}</select>
                        <h3>الرومات المراد مراقبتها:</h3>
                        ${channelCheckboxes}
                        <button type="submit">حفظ تغييرات اللوق</button>
                    </form>
                </div>

                <!-- صفحة إعدادات التايم آوت الجديدة -->
                <div id="timeout-settings" class="tab-content">
                    <h2>إعدادات لوق التايم آوت</h2>
                    <form action="/dashboard/save/${guildId}" method="POST">
                        <input type="hidden" name="formType" value="timeout">
                        <label>روم سجل التايم آوت المخصص:</label>
                        <select name="timeoutChannelId"><option value="">-- اختر روم --</option>${channelOptionsTimeout}</select>
                        <button type="submit">حفظ تغييرات التايم آوت</button>
                    </form>
                </div>

            </div>

            <script>
                function switchTab(tabId) {
                    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
                    document.querySelectorAll('.sidebar a').forEach(btn => btn.classList.remove('active'));
                    
                    document.getElementById(tabId).classList.add('active');
                    document.getElementById('btn-' + tabId).classList.add('active');
                }
            </script>
        </body>
        </html>
    `);
});

// --- تعديل مسار الحفظ ليدعم تحديث نظام اللوق ونظام التايم آوت بشكل منفصل وآمن ---
app.post('/dashboard/save/:guildId', (req, res) => {
    if (!req.session.userGuilds) return res.redirect('/login');
    const guildId = req.params.guildId;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.send("السيرفر غير موجود");

    const userGuild = req.session.userGuilds.find(g => g.id === guildId);
    if (!userGuild || (BigInt(userGuild.permissions) & BigInt(0x8)) !== BigInt(0x8)) {
        return res.status(403).send("غير مصرح لك بتعديل إعدادات هذا السيرفر.");
    }

    const db = loadConfig();
    if (!db[guildId]) db[guildId] = { logChannelId: "", ignoredChannels: [], timeoutChannelId: "" };

    const { formType } = req.body;

    if (formType === 'logs') {
        const { logChannelId, monitoredChannels } = req.body;
        const allTextChannels = guild.channels.cache.filter(ch => ch.type === 0).map(ch => ch.id);
        const submittedChannels = Array.isArray(monitoredChannels) ? monitoredChannels : (monitoredChannels ? [monitoredChannels] : []);
        db[guildId].logChannelId = logChannelId || "";
        db[guildId].ignoredChannels = allTextChannels.filter(id => !submittedChannels.includes(id));
    } else if (formType === 'timeout') {
        db[guildId].timeoutChannelId = req.body.timeoutChannelId || "";
    }

    saveConfig(db);
    res.send(`<script>alert('تم الحفظ بنجاح!'); window.location='/dashboard/manage/${guildId}';</script>`);
});

// --- أحداث اللوق السابقة ---
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.author?.id === client.user.id || oldMessage.content === newMessage.content || !oldMessage.guild) return;
    const db = loadConfig(); const config = db[oldMessage.guild.id];
    if (!config || !config.logChannelId || config.ignoredChannels.includes(oldMessage.channel.id)) return;

    const logChannel = oldMessage.guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
        const embed = new EmbedBuilder().setAuthor({ name: 'رسالة معدلة' }).setColor('#f1c40f')
            .addFields(
                { name: 'الشخص:', value: `<@${oldMessage.author.id}>`, inline: true },
                { name: 'في روم:', value: `<#${oldMessage.channel.id}>`, inline: true },
                { name: 'قبل:', value: oldMessage.content || '*ميديا*' },
                { name: 'بعد:', value: newMessage.content || '*ميديا*' }
            ).setTimestamp();
        logChannel.send({ embeds: [embed] });
    }
});

client.on('messageDelete', async (message) => {
    if (message.partial) { try { await message.fetch(); } catch (e) {} }
    if (message.author && message.author.id === client.user.id) return;
    if (!message.guild) return;

    const db = loadConfig(); const config = db[message.guild.id];
    if (!config || !config.logChannelId || config.ignoredChannels.includes(message.channel.id)) return;

    const logChannel = message.guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
        let executor = "غير معروف";
        try {
            const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
            const deletionLog = fetchedLogs.entries.first();
            if (deletionLog && message.author && deletionLog.target.id === message.author.id && (Date.now() - deletionLog.createdTimestamp) < 5000) {
                executor = `<@${deletionLog.executor.id}>`;
            } else { executor = message.author ? `<@${message.author.id}>` : "صاحب الرسالة"; }
        } catch (e) {}

        let messageContent = '*ميديا/ملف أو رسالة قديمة*';
        if (message.content) messageContent = message.content.length > 1000 ? message.content.slice(0, 1000) + '...' : message.content;
        const authorMention = message.author ? `<@${message.author.id}>` : "حساب غير مخزن";

        const embed = new EmbedBuilder().setAuthor({ name: 'رسالة محذوفة' }).setColor('#e74c3c')
            .addFields(
                { name: 'صاحب الرسالة:', value: authorMention, inline: true },
                { name: 'حذفت بواسطة:', value: executor, inline: true },
                { name: 'في روم:', value: `<#${message.channel.id}>`, inline: true },
                { name: 'المحتوى:', value: messageContent }
            ).setTimestamp();
        logChannel.send({ embeds: [embed] });
    }
});


// --- الحدث الجديد لـ (التايم آوت): مرتب، فخم، وبدون أي إيموجي بالـ Embed ---
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // التحقق من حالة التايم آوت (إذا تغير حقل communicationDisabledUntilTimestamp)
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    if (oldTimeout === newTimeout) return; // لم يتغير شيء بخصوص التايم آوت

    const db = loadConfig();
    const config = db[newMember.guild.id];
    if (!config || !config.timeoutChannelId) return;

    const logChannel = newMember.guild.channels.cache.get(config.timeoutChannelId);
    if (!logChannel) return;

    // حالة إعطاء تايم آوت جديد
    if (newTimeout && newTimeout > Date.now()) {
        let executor = "غير معروف";
        let reason = "لم يتم تحديد سبب";

        try {
            // جلب سجلات التدقيق الخاصة بالـ Member Update للتعرف على المشرف والسبب
            const fetchedLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
            const auditLog = fetchedLogs.entries.first();

            if (auditLog && auditLog.target.id === newMember.id && (Date.now() - auditLog.createdTimestamp) < 5000) {
                executor = `<@${auditLog.executor.id}>`;
                if (auditLog.reason) reason = auditLog.reason;
            }
        } catch (e) {
            console.error("فشل جلب الأوديت لوق الخاص بالتايم آوت:", e);
        }

        // حساب المدة المتبقية بدقائق تقريبية وتنسيق الوقت المستهدف بالديسكورد
        const durationMs = newTimeout - Date.now();
        const durationMinutes = Math.round(durationMs / 60000);
        
        let durationText = `${durationMinutes} دقيقة`;
        if (durationMinutes >= 60) {
            const hours = Math.round(durationMinutes / 60);
            durationText = `${hours} ساعة`;
            if (hours >= 24) {
                durationText = `${Math.round(hours / 24)} يوم`;
            }
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'تطبيق عقوبة التايم آوت' })
            .setColor('#e67e22') // لون برتقالي مميز ومرتب
            .addFields(
                { name: 'العضو المستهدف:', value: `<@${newMember.id}>`, inline: true },
                { name: 'بواسطة المشرف:', value: executor, inline: true },
                { name: 'مدة العقوبة:', value: durationText, inline: true },
                { name: 'ينتهي الوقت في:', value: `<t:${Math.floor(newTimeout / 1000)}:F>`, inline: false },
                { name: 'السبب:', value: reason, inline: false }
            )
            .setTimestamp();

        logChannel.send({ embeds: [embed] });
    } 
    // حالة فك التايم آوت (إذا كان يملك تايم آوت سابق والآن تم إزالته قبل وقته)
    else if (oldTimeout && !newTimeout) {
        let executor = "غير معروف";

        try {
            const fetchedLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
            const auditLog = fetchedLogs.entries.first();
            if (auditLog && auditLog.target.id === newMember.id && (Date.now() - auditLog.createdTimestamp) < 5000) {
                executor = `<@${auditLog.executor.id}>`;
            }
        } catch (e) {}

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'إزالة عقوبة التايم آوت' })
            .setColor('#2ecc71') // لون أخضر هادئ ومرتب للفك
            .addFields(
                { name: 'العضو المعفي عنه:', value: `<@${newMember.id}>`, inline: true },
                { name: 'أزيلت بواسطة:', value: executor, inline: true }
            )
            .setTimestamp();

        logChannel.send({ embeds: [embed] });
    }
});


client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Dashboard listening on port ${PORT}`);
});
