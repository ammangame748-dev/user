// ==========================================
// الجزء الأول: الإعدادات، الربط، ونظام حفظ البيانات
// ==========================================

const { Client, GatewayIntentBits, AuditLogEvent, EmbedBuilder, Partials, Events } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ silent: true });

// استدعاء ملف القوالب المحدث
const { getGuildSelectorHtml, getManageServerHtml } = require('./dashboardTemplates.js');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// مسار ملف الإعدادات - يفضل استخدام مسار مطلق لضمان الوصول
const SETTINGS_FILE = path.join(__dirname, 'guildSettings.json');

let guildSettings = {};

// دالة لتحميل الإعدادات بأمان
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            guildSettings = JSON.parse(data);
            console.log('[SYSTEM] Settings loaded successfully.');
        } else {
            guildSettings = {};
            saveSettingsToFile();
        }
    } catch (error) {
        console.error('[ERROR] Failed to load settings:', error);
        guildSettings = {};
    }
}

// دالة لحفظ الإعدادات بأمان
function saveSettingsToFile() {
    try {
        const data = JSON.stringify(guildSettings, null, 4);
        fs.writeFileSync(SETTINGS_FILE, data, 'utf8');
    } catch (error) {
        console.error('[ERROR] Failed to save settings:', error);
    }
}

// تحميل الإعدادات عند بدء التشغيل
loadSettings();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember]
});

client.once(Events.ClientReady, () => {
    console.log(`[PRO BOT] Started successfully as: ${client.user.tag}`);
});

// تهيئة مفاتيح الـ 13 لوق كاملة في ملف الـ JSON
function initGuildSettings(guildId) {
    if (!guildSettings[guildId]) {
        guildSettings[guildId] = {
            ticketLogChannelId: "",
            roleLogChannelId: "",
            roomLogChannelId: "",
            memberLogChannelId: "",
            timeoutLogChannelId: "",
            kickLogChannelId: "",
            banLogChannelId: "",
            serverLogChannelId: "",
            prisonLogChannelId: "",
            joinLeaveLogChannelId: "",
            threadLogChannelId: "",
            adminLogChannelId: "",
            reactionLogChannelId: "",
            monitoredRooms: {},
            monitoredReactions: {}
        };
    }
    
    const keys = [
        'ticketLogChannelId', 'roleLogChannelId', 'roomLogChannelId', 'memberLogChannelId',
        'timeoutLogChannelId', 'kickLogChannelId', 'banLogChannelId', 'serverLogChannelId',
        'prisonLogChannelId', 'joinLeaveLogChannelId', 'threadLogChannelId', 'adminLogChannelId', 'reactionLogChannelId'
    ];
    
    keys.forEach(k => {
        if (guildSettings[guildId][k] === undefined) guildSettings[guildId][k] = "";
    });

    if (!guildSettings[guildId].monitoredRooms) guildSettings[guildId].monitoredRooms = {};
    if (!guildSettings[guildId].monitoredReactions) guildSettings[guildId].monitoredReactions = {};

    const guild = client.guilds.cache.get(guildId);
    if (guild) {
        guild.channels.cache.filter(c => c.type === 0).forEach(channel => {
            if (guildSettings[guildId].monitoredRooms[channel.id] === undefined) {
                guildSettings[guildId].monitoredRooms[channel.id] = true;
            }
            if (guildSettings[guildId].monitoredReactions[channel.id] === undefined) {
                guildSettings[guildId].monitoredReactions[channel.id] = true;
            }
        });
    }
    saveSettingsToFile();
}

// ==========================================
// الجزء الثاني: أحداث اللوق (Logs Events)
// ==========================================

// 1. لوق الدخول والخروج للأعضاء
client.on(Events.GuildMemberAdd, async (member) => {
    const settings = guildSettings[member.guild.id];
    if (!settings?.joinLeaveLogChannelId) return;
    const logChannel = member.guild.channels.cache.get(settings.joinLeaveLogChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📥 عضو جديد دخل السيرفر')
        .setColor('#22c55e')
        .setDescription(`مرحباً بك في السيرفر العضو: <@${member.id}>`)
        .addFields(
            { name: 'حساب العضو:', value: `<@${member.id}> (\`${member.user.id}\`)`, inline: true },
            { name: 'عمر الحساب:', value: `<t:${Math.round(member.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'إجمالي الأعضاء:', value: `\`${member.guild.memberCount}\``, inline: false }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on(Events.GuildMemberRemove, async (member) => {
    const settings = guildSettings[member.guild.id];
    if (!settings?.joinLeaveLogChannelId) return;
    const logChannel = member.guild.channels.cache.get(settings.joinLeaveLogChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📤 عضو غادر السيرفر')
        .setColor('#ef4444')
        .setDescription(`خرج أو طرد العضو: <@${member.id}>`)
        .addFields(
            { name: 'العضو:', value: `<@${member.id}> (\`${member.user.id}\`)`, inline: true },
            { name: 'المتبقي:', value: `\`${member.guild.memberCount}\``, inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 2. لوق حذف الرسائل
client.on(Events.MessageDelete, async (message) => {
    if (message.partial || message.author?.bot || !message.guild) return;
    const settings = guildSettings[message.guild.id];
    if (!settings?.memberLogChannelId || !settings.monitoredRooms[message.channel.id]) return;

    const logChannel = message.guild.channels.cache.get(settings.memberLogChannelId);
    if (!logChannel) return;

    let executor = `<@${message.author.id}>`;
    try {
        const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
        const deletionLog = fetchedLogs.entries.first();
        if (deletionLog && deletionLog.target.id === message.author.id && (Date.now() - deletionLog.createdTimestamp) < 5000) {
            executor = `<@${deletionLog.executor.id}>`;
        }
    } catch (e) {}

    let rawContent = message.content?.trim() ? message.content : 'محتوى ميديا أو ملف';
    if (rawContent.length > 1000) rawContent = rawContent.slice(0, 1000) + '...';

    const embed = new EmbedBuilder()
        .setTitle('🗑️ رسالة محذوفة')
        .setColor('#ef4444')
        .addFields(
            { name: 'الكاتب:', value: `<@${message.author.id}>`, inline: true },
            { name: 'الحاذف:', value: executor, inline: true },
            { name: 'القناة:', value: `<#${message.channel.id}>`, inline: true },
            { name: 'المحتوى:', value: `\`\`\`${rawContent}\`\`\`` }
        )
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 3. لوق الحظر
client.on(Events.GuildBanAdd, async (ban) => {
    const settings = guildSettings[ban.guild.id];
    if (!settings?.banLogChannelId) return;
    const logChannel = ban.guild.channels.cache.get(settings.banLogChannelId);
    if (!logChannel) return;

    let executor = 'غير معروف';
    let reason = ban.reason || 'لا يوجد سبب';

    try {
        const fetchedLogs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
        const banLog = fetchedLogs.entries.first();
        if (banLog && banLog.target.id === ban.user.id) {
            executor = `<@${banLog.executor.id}>`;
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🔨 عقوبة حظر (BAN)')
        .setColor('#ef4444')
        .addFields(
            { name: '👤 المحظور:', value: `<@${ban.user.id}>`, inline: true },
            { name: '🛠️ المشرف:', value: executor, inline: true },
            { name: '📝 السبب:', value: `\`\`\`${reason}\`\`\``, inline: false }
        )
        .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 4. لوق فك الحظر
client.on(Events.GuildBanRemove, async (ban) => {
    const settings = guildSettings[ban.guild.id];
    if (!settings?.banLogChannelId) return;
    const logChannel = ban.guild.channels.cache.get(settings.banLogChannelId);
    if (!logChannel) return;

    let executor = 'غير معروف';
    try {
        const fetchedLogs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanRemove });
        const unbanLog = fetchedLogs.entries.first();
        if (unbanLog && unbanLog.target.id === ban.user.id) {
            executor = `<@${unbanLog.executor.id}>`;
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('✅ فك حظر')
        .setColor('#22c55e')
        .addFields(
            { name: '👤 العضو:', value: `<@${ban.user.id}>`, inline: true },
            { name: '🛠️ المشرف:', value: executor, inline: true }
        )
        .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 5. لوق الطرد
client.on(Events.GuildMemberRemove, async (member) => {
    const settings = guildSettings[member.guild.id];
    if (!settings?.kickLogChannelId) return;
    const logChannel = member.guild.channels.cache.get(settings.kickLogChannelId);
    if (!logChannel) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
        const kickLog = fetchedLogs.entries.first();

        if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 8000) {
            const embed = new EmbedBuilder()
                .setTitle('🥾 طرد عضو (KICK)')
                .setColor('#f97316')
                .addFields(
                    { name: '👤 المطرود:', value: `<@${member.id}>`, inline: true },
                    { name: '🛠️ المشرف:', value: `<@${kickLog.executor.id}>`, inline: true },
                    { name: '📝 السبب:', value: `\`\`\`${kickLog.reason || 'لا يوجد سبب'}\`\`\``, inline: false }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (e) {}
});

// 6. رصد كلمة "خنق"
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content.includes('خنق') && message.mentions.members.size > 0) {
        const settings = guildSettings[message.guild.id];
        if (!settings?.timeoutLogChannelId) return;

        const logChannel = message.guild.channels.cache.get(settings.timeoutLogChannelId);
        if (!logChannel) return;

        const targetMember = message.mentions.members.first();
        const secureContent = message.content.slice(0, 1000);

        const embed = new EmbedBuilder()
            .setTitle('🔍 بلاغ رصد كلمة خنق')
            .setColor('#eab308')
            .addFields(
                { name: '👤 الكاتب:', value: `<@${message.author.id}>`, inline: true },
                { name: '🎯 المستهدف:', value: `<@${targetMember.id}>`, inline: true },
                { name: '📍 القناة:', value: `<#${message.channel.id}>`, inline: true },
                { name: '💬 النص:', value: `\`\`\`${secureContent}\`\`\``, inline: false }
            )
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
});

// 7. لوق التايم أوت
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const settings = guildSettings[oldMember.guild.id];
    if (!settings?.timeoutLogChannelId) return;
    const logChannel = oldMember.guild.channels.cache.get(settings.timeoutLogChannelId);
    if (!logChannel) return;

    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    if (!oldTimeout && newTimeout && newTimeout > Date.now()) {
        let executor = 'مشرف مجهول';
        let reason = 'غير محدد';
        try {
            const fetchedLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
            const auditEntry = fetchedLogs.entries.first();
            if (auditEntry && auditEntry.target.id === newMember.id) {
                executor = `<@${auditEntry.executor.id}>`;
                reason = auditEntry.reason || 'لا يوجد سبب';
            }
        } catch (e) {}

        const duration = Math.round((newTimeout - Date.now()) / 60000);
        const embed = new EmbedBuilder()
            .setTitle('⏱️ عقوبة تايم أوت')
            .setColor('#38bdf8')
            .addFields(
                { name: '👤 المعاقب:', value: `<@${newMember.id}>`, inline: true },
                { name: '🛠️ المشرف:', value: executor, inline: true },
                { name: '⏳ المدة:', value: `\`${duration} دقيقة\``, inline: true },
                { name: '📝 السبب:', value: `\`\`\`${reason}\`\`\``, inline: false }
            )
            .setTimestamp();
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
});

// 8. لوق القنوات
client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.guild) return;
    const settings = guildSettings[channel.guild.id];
    if (!settings?.roomLogChannelId) return;
    const logChannel = channel.guild.channels.cache.get(settings.roomLogChannelId);
    if (!logChannel) return;

    let executor = 'مشرف مجهول';
    try {
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate });
        const auditEntry = fetchedLogs.entries.first();
        if (auditEntry && auditEntry.target.id === channel.id) executor = `<@${auditEntry.executor.id}>`;
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🏗️ إنشاء قناة')
        .setColor('#22c55e')
        .addFields(
            { name: 'القناة:', value: `<#${channel.id}>`, inline: true },
            { name: 'المشرف:', value: executor, inline: true }
        )
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on(Events.ChannelDelete, async (channel) => {
    if (!channel.guild) return;
    const settings = guildSettings[channel.guild.id];
    if (!settings?.roomLogChannelId) return;
    const logChannel = channel.guild.channels.cache.get(settings.roomLogChannelId);
    if (!logChannel) return;

    let executor = 'مشرف مجهول';
    try {
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
        const auditEntry = fetchedLogs.entries.first();
        if (auditEntry && auditEntry.target.id === channel.id) executor = `<@${auditEntry.executor.id}>`;
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🗑️ حذف قناة')
        .setColor('#ef4444')
        .addFields(
            { name: 'الاسم:', value: `\`#${channel.name}\``, inline: true },
            { name: 'المشرف:', value: executor, inline: true }
        )
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 9. لوق الرتب
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const settings = guildSettings[oldMember.guild.id];
    if (!settings?.roleLogChannelId) return;
    const logChannel = oldMember.guild.channels.cache.get(settings.roleLogChannelId);
    if (!logChannel) return;

    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    let executor = 'مشرف مجهول';
    try {
        const fetchedLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberRoleUpdate });
        const auditEntry = fetchedLogs.entries.first();
        if (auditEntry && auditEntry.target.id === newMember.id) executor = `<@${auditEntry.executor.id}>`;
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🏷️ تحديث رتب')
        .setColor('#5865f2')
        .addFields(
            { name: '👤 العضو:', value: `<@${newMember.id}>`, inline: true },
            { name: '🛠️ المشرف:', value: executor, inline: true }
        )
        .setTimestamp();

    if (addedRoles.size > 0) embed.addFields({ name: '➕ رتب مضافة:', value: addedRoles.map(r => `<@&${r.id}>`).join(', ') });
    if (removedRoles.size > 0) embed.addFields({ name: '➖ رتب مسحوبة:', value: removedRoles.map(r => `<@&${r.id}>`).join(', ') });

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 10. لوق الثريدات
client.on(Events.ThreadCreate, async (thread) => {
    const settings = guildSettings[thread.guild.id];
    if (!settings?.threadLogChannelId) return;
    const logChannel = thread.guild.channels.cache.get(settings.threadLogChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('🧵 إنشاء ثريد')
        .setColor('#38bdf8')
        .addFields({ name: 'الثريد:', value: `<#${thread.id}>`, inline: true })
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 11. لوق التفاعلات
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot || !reaction.message.guild) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});

    const settings = guildSettings[reaction.message.guild.id];
    if (!settings?.reactionLogChannelId || !settings.monitoredReactions[reaction.message.channel.id]) return;

    const logChannel = reaction.message.guild.channels.cache.get(settings.reactionLogChannelId);
    if (!logChannel) return;

    const emoji = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const embed = new EmbedBuilder()
        .setTitle('😀 إضافة تفاعل')
        .setColor('#22c55e')
        .addFields(
            { name: 'العضو:', value: `<@${user.id}>`, inline: true },
            { name: 'الإيموجي:', value: emoji, inline: true },
            { name: 'القناة:', value: `<#${reaction.message.channel.id}>`, inline: true }
        )
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 12. لوق تعديل السيرفر
client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    const settings = guildSettings[newGuild.id];
    if (!settings?.serverLogChannelId) return;
    const logChannel = newGuild.channels.cache.get(settings.serverLogChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('⚙️ تحديث إعدادات السيرفر')
        .setColor('#eab308')
        .setTimestamp();

    if (oldGuild.name !== newGuild.name) {
        embed.addFields(
            { name: 'الاسم القديم:', value: `\`${oldGuild.name}\``, inline: true },
            { name: 'الاسم الجديد:', value: `\`${newGuild.name}\``, inline: true }
        );
    }
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// ==========================================
// الجزء الثالث: مسارات لوحة التحكم (Express Routes)
// ==========================================

app.get('/', (req, res) => {
    if (!client.isReady()) return res.send('جاري تشغيل البوت، يرجى تحديث الصفحة بعد قليل.');
    const botGuilds = client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL() || 'https://discordapp.com/assets/1f0ac53a83592880c5d6d611ba2a7e70.svg'
    }));
    res.send(getGuildSelectorHtml(client, botGuilds));
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
    if (!guildSettings[guildId]) initGuildSettings(guildId);

    const logKeys = [
        'ticketLogChannelId', 'roleLogChannelId', 'roomLogChannelId', 'memberLogChannelId',
        'timeoutLogChannelId', 'kickLogChannelId', 'banLogChannelId', 'serverLogChannelId',
        'prisonLogChannelId', 'joinLeaveLogChannelId', 'threadLogChannelId', 'adminLogChannelId', 'reactionLogChannelId'
    ];

    logKeys.forEach(key => {
        guildSettings[guildId][key] = req.body[key] || "";
    });

    // معالجة مربعات الاختيار (Checkboxes)
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
        const textChannels = guild.channels.cache.filter(c => c.type === 0);
        const msgRooms = Array.isArray(req.body.enabledMessageRooms) ? req.body.enabledMessageRooms : (req.body.enabledMessageRooms ? [req.body.enabledMessageRooms] : []);
        const reactRooms = Array.isArray(req.body.enabledReactionRooms) ? req.body.enabledReactionRooms : (req.body.enabledReactionRooms ? [req.body.enabledReactionRooms] : []);

        textChannels.forEach(channel => {
            guildSettings[guildId].monitoredRooms[channel.id] = msgRooms.includes(channel.id);
            guildSettings[guildId].monitoredReactions[channel.id] = reactRooms.includes(channel.id);
        });
    }

    saveSettingsToFile();
    res.redirect(`/manage/${guildId}?success=true`);
});

// تشغيل البوت
if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN).catch(err => console.error('[LOGIN ERROR]', err.message));
} else {
    console.error('[ERROR] DISCORD_TOKEN is missing in .env file');
}

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`[DASHBOARD] Live on port ${PORT}`));
