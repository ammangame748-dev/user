const { Client, GatewayIntentBits, EmbedBuilder, AuditLogEvent, PermissionsBitField } = require('discord.js');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: true }));

// إعداد الجلسات لحفظ تسجيل دخول المستخدم
app.use(session({
    secret: 'secret-key-dashboard',
    resave: false,
    saveUninitialized: false
}));

const CONFIG_FILE = path.join(__dirname, 'progress.json');

// إعدادات الـ OAuth2 (احصل عليها من Discord Developer Portal)
const CLIENT_ID = process.env.CLIENT_ID || "1501846584961532004";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "lKyk-Mjv8FYAQMCXhPw0kd2A0-RoqX2W";
const REDIRECT_URI = process.env.REDIRECT_URI || "https://user-bxik.onrender.com/auth/callback";

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
        GatewayIntentBits.GuildModeration
    ]
});

// --- مسارات تسجيل الدخول (OAuth2) ---

// --- مسارات تسجيل الدخول (OAuth2) الصحيحة ---
app.get('/login', (req, res) => {
    // تم إصلاح الرابط هنا وإضافة المسار وعلامة الاستفهام بشكل سليم
    const authorizeUrl = `https://discord.com{CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(authorizeUrl);
});


app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("لم يتم إتمام تسجيل الدخول.");

    try {
        // تبديل الكود بـ Access Token
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

        // جلب سيرفرات المستخدم
        const guildsResponse = await fetch('https://discord.com', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const guilds = await guildsResponse.json();

        req.session.userGuilds = guilds;
        res.redirect('/dashboard/servers');
    } catch (error) {
        res.send("حدث خطأ أثناء الاتصال بديسكورد.");
    }
});

// --- صفحة اختيار السيرفرات ---
app.get('/dashboard/servers', (req, res) => {
    if (!req.session.userGuilds) return res.redirect('/login');

    let serverCards = '';

    req.session.userGuilds.forEach(guild => {
        // التحقق من صلاحية الأدمن (Administrator) باستخدام الـ Permissions Bitwise
        const isAdmin = (BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0x8);
        if (!isAdmin) return; // تخطي السيرفر إذا لم يكن أدمن فيه

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
// توجيه الزائر تلقائياً لصفحة تسجيل الدخول بدلاً من إظهار خطأ
app.get('/', (req, res) => {
    res.redirect('/login');
});

// --- صفحة التحكم باللوق للسيرفر المحدد ---
app.get('/dashboard/manage/:guildId', (req, res) => {
    if (!req.session.userGuilds) return res.redirect('/login');

    const guildId = req.params.guildId;
    // التأكد أن المستخدم أدمن في السيرفر المطلوب لحماية الثغرات
    const userGuild = req.session.userGuilds.find(g => g.id === guildId);
    if (!userGuild || (BigInt(userGuild.permissions) & BigInt(0x8)) !== BigInt(0x8)) return res.send("غير مصرح لك.");

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.send("البوت غادر السيرفر.");

    const db = loadConfig();
    const config = db[guildId] || { logChannelId: "", ignoredChannels: [] };
    const allChannels = guild.channels.cache.filter(ch => ch.type === 0);

    let channelOptions = '';
    let channelCheckboxes = '';

    allChannels.forEach(ch => {
        channelOptions += `<option value="${ch.id}" ${config.logChannelId === ch.id ? 'selected' : ''}>#${ch.name}</option>`;
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
            <meta charset="UTF-8"><title>إعدادات اللوق - ${guild.name}</title>
            <style>
                body { font-family: sans-serif; background: #2f3136; color: white; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #202225; padding: 20px; border-radius: 8px; }
                select, button { padding: 10px; border-radius: 5px; border: none; width: 100%; box-sizing: border-box; }
                select { background: #40444b; color: white; }
                button { background: #5865f2; color: white; font-weight: bold; cursor: pointer; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <a href="/dashboard/servers" style="color: #b9bbbe; text-decoration: none;">⬅️ العودة للسيرفرات</a>
                <h2>إعدادات اللوق لـ ${guild.name}</h2>
                <form action="/dashboard/save/${guildId}" method="POST">
                    <label>روم إرسال اللوق الرئيسية:</label>
                    <select name="logChannelId"><option value="">-- اختر روم --</option>${channelOptions}</select>
                    <h3>الرومات المراد مراقبتها:</h3>
                    ${channelCheckboxes}
                    <button type="submit">حفظ التغييرات</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/dashboard/save/:guildId', (req, res) => {
    if (!req.session.userGuilds) return res.redirect('/login');
    const guildId = req.params.guildId;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.send("السيرفر غير موجود");

    const { logChannelId, monitoredChannels } = req.body;
    const allTextChannels = guild.channels.cache.filter(ch => ch.type === 0).map(ch => ch.id);
    const submittedChannels = Array.isArray(monitoredChannels) ? monitoredChannels : (monitoredChannels ? [monitoredChannels] : []);
    const ignoredChannels = allTextChannels.filter(id => !submittedChannels.includes(id));

    const db = loadConfig();
    db[guildId] = { logChannelId, ignoredChannels };
    saveConfig(db);

    res.send(`<script>alert('تم الحفظ!'); window.location='/dashboard/manage/${guildId}';</script>`);
});

// --- نظام الأحداث للوق (معدل بدون منشن) ---
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.author?.bot || oldMessage.content === newMessage.content || !oldMessage.guild) return;
    const db = loadConfig(); const config = db[oldMessage.guild.id];
    if (!config || !config.logChannelId || config.ignoredChannels.includes(oldMessage.channel.id)) return;

    const logChannel = oldMessage.guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
        const embed = new EmbedBuilder().setAuthor({ name: '📝 رسالة معدلة' }).setColor('#f1c40f')
            .addFields(
                { name: '👤 الشخص:', value: `${oldMessage.author.username}`, inline: true },
                { name: '📺 في روم:', value: `#${oldMessage.channel.name}`, inline: true },
                { name: '⬅️ قبل:', value: oldMessage.content || '*ميديا*' },
                { name: '➡️ بعد:', value: newMessage.content || '*ميديا*' }
            ).setTimestamp();
        logChannel.send({ embeds: [embed] });
    }
});

client.on('messageDelete', async (message) => {
    if (message.author?.bot || !message.guild) return;
    const db = loadConfig(); const config = db[message.guild.id];
    if (!config || !config.logChannelId || config.ignoredChannels.includes(message.channel.id)) return;

    const logChannel = message.guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
        let executor = "غير معروف";
        try {
            const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
            const deletionLog = fetchedLogs.entries.first();
            if (deletionLog && deletionLog.target.id === message.author.id && (Date.now() - deletionLog.createdTimestamp) < 5000) {
                executor = deletionLog.creator.username;
            }
        } catch (e) { }

        const embed = new EmbedBuilder().setAuthor({ name: '🗑️ رسالة محذوفة' }).setColor('#e74c3c')
            .addFields(
                { name: '👤 كاتب الرسالة:', value: `${message.author.username}`, inline: true },
                { name: '👮 الحاذف:', value: `${executor}`, inline: true },
                { name: '📺 في روم:', value: `#${message.channel.name}`, inline: true },
                { name: '📄 المحتوى:', value: message.content || '*ميديا*' }
            ).setTimestamp();
        logChannel.send({ embeds: [embed] });
    }
});

client.once('ready', () => console.log(`تم تشغيل البوت: ${client.user.tag}`));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`الداش بورد تعمل على المنفذ: ${port}`));
client.login(process.env.DISCORD_TOKEN);
