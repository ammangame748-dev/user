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

// إعدادات الـ OAuth2 (تأكد من مطابقتها في Discord Developer Portal)
const CLIENT_ID = process.env.CLIENT_ID || "1501846584961532004";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "lKyk-Mjv8FYAQMCXhPw0kd2A0-RoqX2W";
// تم تصحيح الرابط هنا ليتطابق مع رابط Render الفعلي الخاص بك لمنع حلقة التوجيه
const REDIRECT_URI = process.env.REDIRECT_URI || "https://user-q5p3.onrender.com/auth/callback";

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

// --- مسارات تسجيل الدخول (OAuth2) الصحيحة ---
app.get('/login', (req, res) => {
    // تم إصلاح الرابط بالكامل وإضافة مسار ديسكورد الصحيح وعلامة الـ $
    const authorizeUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(authorizeUrl);
});

app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("لم يتم إتمام تسجيل الدخول.");

    try {
        // تم تصحيح رابط ديسكورد لتبديل الكود بـ Access Token
        const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
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

        if (!tokenData.access_token) {
            return res.send("فشل الحصول على رمز الدخول من ديسكورد. تأكد من إعدادات الرابط في تطبيق المطورين.");
        }

        // تم تصحيح رابط جلب سيرفرات المستخدم
        const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
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

// --- صفحة اختيار السيرفرات ---
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
            // تم إصلاح رابط دعوة البوت هنا أيضاً بإضافة الـ $ والمصطلح الصحيح
            const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot&guild_id=${guild.id}&disable_guild_select=true`;
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

// توجيه الزائر تلقائياً لصفحة تسجيل الدخول
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
    const config = db[guildId] || { logChannelId: "", ignoredChannels: [], timeoutChannelId: "", timeoutDuration: "1" };
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
            <meta charset="UTF-8">
            <title>لوحة التحكم - ${guild.name}</title>
            <style>
                body { font-family: sans-serif; background: #2f3136; color: white; margin: 0; padding: 0; display: flex; height: 100vh; }
                /* تصميم المنيو على اليمين */
                .sidebar { width: 250px; background: #202225; padding: 20px; display: flex; flex-direction: column; border-left: 1px solid #202225; box-sizing: border-box; }
                .sidebar h3 { margin-bottom: 20px; text-align: center; color: #5865f2; }
                .sidebar a { color: #b9bbbe; text-decoration: none; padding: 12px; margin-bottom: 10px; border-radius: 5px; font-weight: bold; cursor: pointer; transition: 0.2s; }
                .sidebar a:hover, .sidebar a.active { background: #36393f; color: white; }
                .sidebar .back-btn { background: #e74c3c; color: white; text-align: center; margin-top: auto; }
                
                /* تصميم المحتوى الرئيسي على اليسار */
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

            <!-- المنيو على اليمين -->
            <div class="sidebar">
                <h3>${guild.name}</h3>
                <a onclick="switchTab('log-settings')" id="btn-log-settings" class="active">📝 إعدادات اللوق</a>
                <a onclick="switchTab('timeout-settings')" id="btn-timeout-settings">⏳ اختصار الخنق</a>
                <a href="/dashboard/servers" class="back-btn">⬅️ السيرفرات</a>
            </div>

            <!-- المحتوى الرئيسي على اليسار -->
            <div class="main-content">
                
                <!-- الصفحة الأولى: إعدادات اللوق -->
                <div id="log-settings" class="tab-content active">
                    <h2>📝 إعدادات اللوق الرئيسية</h2>
                    <form action="/dashboard/save/${guildId}" method="POST">
                        <input type="hidden" name="formType" value="logs">
                        <label>روم إرسال اللوق الرئيسية:</label>
                        <select name="logChannelId"><option value="">-- اختر روم --</option>${channelOptions}</select>
                        <h3>الرومات المراد مراقبتها:</h3>
                        ${channelCheckboxes}
                        <button type="submit">حفظ التغييرات</button>
                    </form>
                </div>

                <!-- الصفحة الثانية: إعدادات أمر اختصار الخنق -->
                <div id="timeout-settings" class="tab-content">
                    <h2>⏳ إعدادات أمر اختصار الخنق</h2>
                    <p style="color: #b9bbbe; font-size: 14px;">عند كتابة الأمر !خنق في السيرفر، سيقوم البوت بتطبيق التايم آوت وإرسال إمبيد العقوبة في الروم المحددة.</p>
                    <form action="/dashboard/save/${guildId}" method="POST">
                        <input type="hidden" name="formType" value="timeout">
                        
                        <label>روم إرسال إمبيد التايم آوت:</label>
                        <select name="timeoutChannelId">
                            <option value="">-- اختر روم --</option>
                            ${allChannels.map(ch => `<option value="${ch.id}" ${config.timeoutChannelId === ch.id ? 'selected' : ''}>#${ch.name}</option>`).join('')}
                        </select>

                        <label>مدة الخنق الافتراضية (بالدقائق):</label>
                        <input type="number" name="timeoutDuration" min="1" max="40320" value="${config.timeoutDuration || '1'}" placeholder="مثال: 1">

                        <button type="submit" style="background: #43b581;">حفظ إعدادات الخنق</button>
                    </form>
                </div>

            </div>

            <!-- كود جافاسكريبت لتبديل الصفحات داخل لوحة التحكم بدون إعادة تحميل -->
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

app.post('/dashboard/save/:guildId', (req, res) => {
    if (!req.session.userGuilds) return res.redirect('/login');
    const guildId = req.params.guildId;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.send("السيرفر غير موجود");

    const db = loadConfig();
    if (!db[guildId]) db[guildId] = {};

    const { formType } = req.body;

    if (formType === "logs") {
        // حفظ بيانات صفحة اللوق
        const { logChannelId, monitoredChannels } = req.body;
        const allTextChannels = guild.channels.cache.filter(ch => ch.type === 0).map(ch => ch.id);
        const submittedChannels = Array.isArray(monitoredChannels) ? monitoredChannels : (monitoredChannels ? [monitoredChannels] : []);
        db[guildId].logChannelId = logChannelId;
        db[guildId].ignoredChannels = allTextChannels.filter(id => !submittedChannels.includes(id));
    } else if (formType === "timeout") {
        // حفظ بيانات صفحة اختصار الخنق
        const { timeoutChannelId, timeoutDuration } = req.body;
        db[guildId].timeoutChannelId = timeoutChannelId;
        db[guildId].timeoutDuration = timeoutDuration;
    }

    saveConfig(db);
    res.send(`<script>alert('تم الحفظ بنجاح!'); window.location='/dashboard/manage/${guildId}';</script>`);
});

// --- نظام الأحداث للوق (معدل بدون منشن) ---
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.author?.bot || oldMessage.content === newMessage.content || !oldMessage.guild) return;
    const db = loadConfig(); const config = db[oldMessage.guild.id];
    if (!config || !config.logChannelId || config.ignoredChannels.includes(oldMessage.channel.id)) return;

    const logChannel = oldMessage.guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
        const embed = new EmbedBuilder().setAuthor({ name: ' رسالة معدلة' }).setColor('#f1c40f')
            .addFields(
                { name: ' الشخص:', value: `<@${oldMessage.author.id}>`, inline: true },
                { name: ' في روم:', value: `<#${oldMessage.channel.id}>`, inline: true },

                { name: ' قبل:', value: oldMessage.content || '*ميديا*' },
                { name: ' بعد:', value: newMessage.content || '*ميديا*' }
            ).setTimestamp();
        logChannel.send({ embeds: [embed] });
    }
});

client.on('messageDelete', async (message) => {
    // جلب بيانات الرسالة كاملة إذا لم تكن مخزنة في الذاكرة المؤقتة للبوت
    if (message.partial) {
        try { await message.fetch(); } catch (e) { return; }
    }

    if (message.author?.bot || !message.guild) return;
    const db = loadConfig();
    const config = db[message.guild.id];
    if (!config || !config.logChannelId || config.ignoredChannels.includes(message.channel.id)) return;

    const logChannel = message.guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
        let executor = "غير معروف";
        try {
            // جلب سجل التدقيق لمعرفة المسؤول عن الحذف
            const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
            const deletionLog = fetchedLogs.entries.first();

            if (deletionLog && deletionLog.target.id === message.author.id && (Date.now() - deletionLog.createdTimestamp) < 5000) {
                // تحويل المسؤول عن الحذف إلى منشن حقيقي باستخدام المعرف ID
                executor = `<@${deletionLog.executor.id}>`;
            }
        } catch (e) {
            console.error("فشل جلب سجل التدقيق للحذف:", e);
        }

        // إذا قام كاتب الرسالة بحذف رسالته بنفسه، فلن يسجلها ديسكورد في الـ Audit Logs، لذا نضع منشن كاتب الرسالة كحاذف
        if (executor === "غير معروف") {
            // إذا مر الوقت أو لم يتم العثور على سجل، نفترض منطقياً أن الكاتب هو من حذفها
            executor = `<@${message.author.id}>`;
        }

        // حماية من النصوص الطويلة جداً التي قد تعطل إرسال الـ Embed
        const messageContent = message.content ? (message.content.length > 1000 ? message.content.slice(0, 1000) + '...' : message.content) : '*ميديا/ملف*';

        const embed = new EmbedBuilder()
            .setAuthor({ name: ' رسالة محذوفة' })
            .setColor('#e74c3c')
            .addFields(
                { name: ' كاتب الرسالة:', value: `<@${message.author.id}>`, inline: true }, // منشن الكاتب
                { name: ' الحاذف:', value: executor, inline: true },                     // منشن الحاذف
                { name: ' في روم:', value: `<#${message.channel.id}>`, inline: true },      // منشن الروم
                { name: ' المحتوى:', value: messageContent }
            ).setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(err => console.error("فشل إرسال لوق الحذف:", err));
    }
});
client.on('messageCreate', async (message) => {
    // التحقق من أن الرسالة ليست من بوت، وأنها داخل سيرفر، وتبدأ بكلمة !خنق
    if (message.author.bot || !message.guild || !message.content.startsWith('!خنق')) return;

    // التحقق من صلاحية الإدارة للأعضاء قبل تنفيذ التايم آوت
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('❌ ليس لديك صلاحية استخدام أمر الخنق.');
    }

    const args = message.content.split(' ');
    // جلب العضو الممنشن أو عبر الـ ID الخاص به
    const targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[1]);

    if (!targetMember) {
        return message.reply('❌ يرجى تحديد العضو. مثال: `!خنق @watan غلط على ادمن`');
    }

    const db = loadConfig();
    const config = db[message.guild.id];

    // التأكد من ضبط إعدادات صفحة الخنق في الداشبورد أولاً
    if (!config || !config.timeoutChannelId) {
        return message.reply('❌ لم يتم إعداد روم إرسال إمبيد الخنق من لوحة التحكم بعد.');
    }

    // أخذ المدة المحددة مسبقاً من الداشبورد افتراضياً
    const durationMinutes = parseInt(config.timeoutDuration) || 1;

    // جلب السبب المكتوب في الشات بعد المنشن (مثل: غلط على ادمن)
    // إذا لم يكتب الأدمن أي سبب، سيتم وضع الرقم '1' تلقائياً كسبب افتراضي مثل صورتك
    const reason = args.slice(2).join(' ') || '1';

    try {
        // تطبيق التايم آوت الفعلي على العضو (المدة بالملي ثانية)
        await targetMember.timeout(durationMinutes * 60 * 1000, reason);

        // جلب الروم المحددة من الداشبورد لإرسال الإمبيد
        const targetChannel = message.guild.channels.cache.get(config.timeoutChannelId);
        if (targetChannel) {
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'تم تطبيق التايم آوت ⏳' })
                .setColor('#2f3136') // لون الـ Embed الداكن المطابق للصورة
                .addFields(
                    { name: '👤 العضو', value: `<@${targetMember.id}>`, inline: true }, // منشن حقيقي للعضو
                    { name: '🛡️ المشرف', value: `<@${message.author.id}>`, inline: true }, // منشن حقيقي للأدمن
                    { name: '⏱️ المدة', value: `${durationMinutes} دقيقة`, inline: true },
                    { name: '📝 السبب', value: `\`\`\`\n${reason}\n\`\`\`` } // قالب السبب النصي
                )
                .setTimestamp();

            await targetChannel.send({ embeds: [embed] });

            // حذف رسالة الأمر الأصلية لتبدو اللوحة منظمة في الشات (اختياري)
            await message.delete().catch(() => { });
        } else {
            message.reply('❌ فشل العثور على الروم المحددة في الداشبورد لإرسال اللوق.');
        }

    } catch (err) {
        console.error(err);
        message.reply('❌ حدث خطأ أثناء محاولة إعطاء التايم آوت. تأكد من أن رتبة البوت أعلى من رتبة العضو المستهدف.');
    }
});


client.once('ready', () => console.log(`تم تشغيل البوت: ${client.user.tag}`));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`الداش بورد تعمل على المنفذ: ${port}`));
client.login(process.env.DISCORD_TOKEN);
