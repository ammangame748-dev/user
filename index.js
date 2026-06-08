// ==========================================
// الجزء الأول: الإعدادات الموسعة، غرف اللوق الـ 13، ولوق الرسائل والدخول
// ==========================================

const { Client, GatewayIntentBits, AuditLogEvent, EmbedBuilder, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
require('dotenv').config({ silent: true });

// استدعاء ملف القوالب المحدث
const { getGuildSelectorHtml, getManageServerHtml } = require('./dashboardTemplates.js');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SETTINGS_FILE = './guildSettings.json';

let guildSettings = fs.existsSync(SETTINGS_FILE)
    ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    : {};

function saveSettingsToFile() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(guildSettings, null, 4), 'utf8');
}

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

const readyEventName = client.on ? (client.on('clientReady', () => {}) ? 'clientReady' : 'ready') : 'ready';
client.once(readyEventName, () => {
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
    
    // سد النقص للمفاتيح القديمة إذا كانت مفقودة
    const keys = [
        'ticketLogChannelId', 'roleLogChannelId', 'roomLogChannelId', 'memberLogChannelId',
        'timeoutLogChannelId', 'kickLogChannelId', 'banLogChannelId', 'serverLogChannelId',
        'prisonLogChannelId', 'joinLeaveLogChannelId', 'threadLogChannelId', 'adminLogChannelId', 'reactionLogChannelId'
    ];
    keys.forEach(k => {
        if (guildSettings[guildId][k] === undefined) guildSettings[guildId][k] = "";
    });

    const guild = client.guilds.cache.get(guildId);
    if (guild) {
        const textChannels = guild.channels.cache.filter(c => c.type === 0);
        textChannels.forEach(channel => {
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

// 1. لوق الدخول والخروج للأعضاء (Join / Leave)
client.on('guildMemberAdd', async (member) => {
    const settings = guildSettings[member.guild.id];
    if (!settings || !settings.joinLeaveLogChannelId) return;
    const logChannel = member.guild.channels.cache.get(settings.joinLeaveLogChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📥 عضو جديد دخل السيرفر')
        .setColor('#22c55e')
        .setDescription(`مرحباً بك في السيرفر العضو: <@${member.id}>`)
        .addFields(
            { name: 'حساب العضو:', value: `<@${member.id}> (\`${member.user.id}\`)`, inline: true },
            { name: 'عمر الحساب القديم:', value: `<t:${Math.round(member.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'إجمالي عدد الأعضاء الآن:', value: `\`${member.guild.memberCount}\``, inline: false }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on('guildMemberRemove', async (member) => {
    const settings = guildSettings[member.guild.id];
    if (!settings || !settings.joinLeaveLogChannelId) return;
    const logChannel = member.guild.channels.cache.get(settings.joinLeaveLogChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📤 عضو غادر السيرفر')
        .setColor('#ef4444')
        .setDescription(`خرج أو طرد العضو: <@${member.id}>`)
        .addFields(
            { name: 'العضو:', value: `<@${member.id}> (\`${member.user.id}\`)`, inline: true },
            { name: 'إجمالي عدد الأعضاء المتبقي:', value: `\`${member.guild.memberCount}\``, inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 2. لوق حذف الرسائل الاحترافي (إرسال إلى memberLogChannelId)
client.on('messageDelete', async (message) => {
    if (message.partial || message.author?.bot || !message.guild) return;
    const settings = guildSettings[message.guild.id];
    if (!settings || !settings.monitoredRooms[message.channel.id] || !settings.memberLogChannelId) return;

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
        .setTitle('🗑️ رسالة محذوفة بالتفصيل')
        .setColor('#ef4444')
        .addFields(
            { name: 'صاحب الرسالة:', value: `<@${message.author.id}>`, inline: true },
            { name: 'حذفها المشرف:', value: executor, inline: true },
            { name: 'في الروم:', value: `<#${message.channel.id}>`, inline: true },
            { name: 'المحتوى المحذوف:', value: `\`\`\`${rawContent}\`\`\`` }
        )
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});
// ==========================================
// الجزء الثاني: أنظمة العقوبات (الحظر، الطرد، التايم أوت، وبلاغات الخنق)
// ==========================================

// 3. لوق الحظر (Ban Add)
client.on('guildBanAdd', async (ban) => {
    const settings = guildSettings[ban.guild.id];
    if (!settings || !settings.banLogChannelId) return;
    const logChannel = ban.guild.channels.cache.get(settings.banLogChannelId);
    if (!logChannel) return;

    let executor = 'غير معروف';
    let reason = ban.reason || 'لا يوجد سبب مكتوب';

    try {
        const fetchedLogs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
        const banLog = fetchedLogs.entries.first();
        if (banLog && banLog.target.id === ban.user.id) {
            executor = `<@${banLog.executor.id}>`;
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🔨 عقوبة حظر جديدة (BAN)')
        .setColor('#ef4444')
        .addFields(
            { name: '👤 العضو المحظور:', value: `<@${ban.user.id}> (\`${ban.user.id}\`)`, inline: true },
            { name: '🛠️ بواسطة المشرف:', value: executor, inline: true },
            { name: '📝 السبب المكتوب:', value: `\`\`\`${reason}\`\`\``, inline: false }
        )
        .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 4. لوق فك الحظر (Ban Remove)
client.on('guildBanRemove', async (ban) => {
    const settings = guildSettings[ban.guild.id];
    if (!settings || !settings.banLogChannelId) return;
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
        .setTitle('✅ تم فك الحظر عن عضو')
        .setColor('#22c55e')
        .addFields(
            { name: '👤 العضو:', value: `<@${ban.user.id}> (\`${ban.user.id}\`)`, inline: true },
            { name: '🛠️ بواسطة المشرف:', value: executor, inline: true }
        )
        .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 5. لوق الطرد الإداري (Kick)
client.on('guildMemberRemove', async (member) => {
    const settings = guildSettings[member.guild.id];
    if (!settings || !settings.kickLogChannelId) return;
    const logChannel = member.guild.channels.cache.get(settings.kickLogChannelId);
    if (!logChannel) return;

    try {
        // ننتظر ثانية لضمان تسجيل السجل في الـ Audit Logs
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
        const kickLog = fetchedLogs.entries.first();

        if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 8000) {
            const executor = `<@${kickLog.executor.id}>`;
            const reason = kickLog.reason || 'لا يوجد سبب مكتوب';

            const embed = new EmbedBuilder()
                .setTitle('🥾 طرد عضو من السيرفر (KICK)')
                .setColor('#f97316')
                .addFields(
                    { name: '👤 العضو المطرود:', value: `<@${member.id}> (\`${member.id}\`)`, inline: true },
                    { name: '🛠️ بواسطة المشرف:', value: executor, inline: true },
                    { name: '📝 السبب:', value: `\`\`\`${reason}\`\`\``, inline: false }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (e) {}
});

// 6. رصد كلمة "خنق" والمنشن (إرسال إلى timeoutLogChannelId)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content.includes('خنق') && message.mentions.members.size > 0) {
        const settings = guildSettings[message.guild.id];
        if (!settings || !settings.timeoutLogChannelId) return;

        const logChannel = message.guild.channels.cache.get(settings.timeoutLogChannelId);
        if (!logChannel) return;

        const targetMember = message.mentions.members.first();
        if (!targetMember) return;

        const secureContent = message.content?.trim() ? message.content.slice(0, 1000) : 'لا يوجد نص';

        const embed = new EmbedBuilder()
            .setTitle('🔍 بلاغ رصد كلمة خنق واحتواء منشن')
            .setColor('#eab308')
            .addFields(
                { name: '👤 بواسطة العضو:', value: `<@${message.author.id}>`, inline: true },
                { name: '🎯 العضو المستهدف:', value: `<@${targetMember.id}>`, inline: true },
                { name: '📍 في الروم:', value: `<#${message.channel.id}>`, inline: true },
                { name: '💬 نص الرسالة الكامل:', value: `\`\`\`${secureContent}\`\`\``, inline: false }
            )
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
});

// 7. سجل عقوبات التايم أوت وفكها (إرسال إلى timeoutLogChannelId)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.guild) return;
    const settings = guildSettings[oldMember.guild.id];
    if (!settings || !settings.timeoutLogChannelId) return;

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
                reason = auditEntry.reason || 'لا يوجد سبب مكتوب';
            }
        } catch (e) {}

        const totalSeconds = Math.round((newTimeout - Date.now()) / 1000);
        const durationText = totalSeconds < 60 ? `${totalSeconds} ثانية` : `${Math.round(totalSeconds / 60)} دقيقة`;

        const embed = new EmbedBuilder()
            .setTitle('⏱️ عقوبة تايم أوت جديدة')
            .setColor('#38bdf8')
            .addFields(
                { name: '👤 العضو المعاقب:', value: `<@${newMember.id}>`, inline: true },
                { name: '🛠️ بواسطة المشرف:', value: executor, inline: true },
                { name: '⏳ مدة العقوبة:', value: `\`${durationText}\``, inline: true },
                { name: '📝 السبب:', value: `\`\`\`${reason}\`\`\``, inline: false }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (oldTimeout && oldTimeout > Date.now() && (!newTimeout || newTimeout <= Date.now())) {
        let executor = 'تلقائي (انتهاء المدة)';
        try {
            const fetchedLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate });
            const auditEntry = fetchedLogs.entries.first();
            if (auditEntry && auditEntry.target.id === newMember.id) {
                const change = auditEntry.changes.find(c => c.key === 'communication_disabled_until');
                if (change && change.old && !change.new) executor = `<@${auditEntry.executor.id}>`;
            }
        } catch (e) {}

        const embed = new EmbedBuilder()
            .setTitle('✅ تم فك عقوبة التايم أوت')
            .setColor('#22c55e')
            .addFields(
                { name: '👤 العضو:', value: `<@${newMember.id}>`, inline: true },
                { name: '🛠️ المسؤول عن الفك:', value: executor, inline: true }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
});
// ==========================================
// الجزء الثالث: رصد الرومات، الرتب، والثريدات (Channels, Roles, Threads)
// ==========================================

// 8. لوق إنشاء القنوات والرومات (Channel Create)
client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    const settings = guildSettings[channel.guild.id];
    if (!settings || !settings.roomLogChannelId) return;
    const logChannel = channel.guild.channels.cache.get(settings.roomLogChannelId);
    if (!logChannel) return;

    let executor = 'مشرف مجهول';
    try {
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate });
        const auditEntry = fetchedLogs.entries.first();
        if (auditEntry && auditEntry.target.id === channel.id) {
            executor = `<@${auditEntry.executor.id}>`;
        }
    } catch (e) {}

    const typeText = channel.type === 4 ? 'فئة (Category)' : (channel.type === 2 ? 'روم صوتي (Voice)' : 'روم كتابي (Text)');

    const embed = new EmbedBuilder()
        .setTitle('🏗️ تم إنشاء روم جديد')
        .setColor('#22c55e')
        .addFields(
            { name: 'اسم الروم:', value: `<#${channel.id}> | \`#${channel.name}\``, inline: true },
            { name: 'بواسطة المشرف:', value: executor, inline: true },
            { name: 'نوع الروم:', value: `\`${typeText}\``, inline: true }
        )
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 9. لوق حذف القنوات والرومات (Channel Delete)
client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const settings = guildSettings[channel.guild.id];
    if (!settings || !settings.roomLogChannelId) return;
    const logChannel = channel.guild.channels.cache.get(settings.roomLogChannelId);
    if (!logChannel) return;

    let executor = 'مشرف مجهول';
    try {
        const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
        const auditEntry = fetchedLogs.entries.first();
        if (auditEntry && auditEntry.target.id === channel.id) {
            executor = `<@${auditEntry.executor.id}>`;
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🗑️ تم حذف روم بالكامل')
        .setColor('#ef4444')
        .addFields(
            { name: 'اسم الروم المحذوف:', value: `\`#${channel.name}\``, inline: true },
            { name: 'حذفه المشرف:', value: executor, inline: true }
        )
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 10. لوق تعديل وإعطاء وسحب الرتب للأعضاء (Role Updates & Assignments)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const settings = guildSettings[oldMember.guild.id];
    if (!settings || !settings.roleLogChannelId) return;
    const logChannel = oldMember.guild.channels.cache.get(settings.roleLogChannelId);
    if (!logChannel) return;

    // حساب الرتب المضافة والمحذوفة
    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    let executor = 'مشرف مجهول';
    try {
        const fetchedLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberRoleUpdate });
        const auditEntry = fetchedLogs.entries.first();
        if (auditEntry && auditEntry.target.id === newMember.id) {
            executor = `<@${auditEntry.executor.id}>`;
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🏷️ تحديث في رتب عضو')
        .setColor('#5865f2')
        .addFields(
            { name: '👤 العضو المستهدف:', value: `<@${newMember.id}>`, inline: true },
            { name: '🛠️ المسؤول عن التغيير:', value: executor, inline: true }
        )
        .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    if (addedRoles.size > 0) {
        embed.addFields({ name: '➕ رتب تم إعطاؤها:', value: addedRoles.map(r => `<@&${r.id}>`).join(', ') });
    }
    if (removedRoles.size > 0) {
        embed.addFields({ name: '➖ رتب تم سحبها:', value: removedRoles.map(r => `<@&${r.id}>`).join(', ') });
    }

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 11. لوق إنشاء وحذف الثريدات (Threads Monitor)
client.on('threadCreate', async (thread) => {
    const settings = guildSettings[thread.guild.id];
    if (!settings || !settings.threadLogChannelId) return;
    const logChannel = thread.guild.channels.cache.get(settings.threadLogChannelId);
    if (!logChannel) return;

    let executor = 'غير معروف';
    try {
        const fetchedLogs = await thread.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ThreadCreate });
        const auditEntry = fetchedLogs.entries.first();
        if (auditEntry && auditEntry.target.id === thread.id) {
            executor = `<@${auditEntry.executor.id}>`;
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🧵 تم إنشاء ثريد (Thread) جديد')
        .setColor('#38bdf8')
        .addFields(
            { name: 'اسم الثريد:', value: `<#${thread.id}> | \`${thread.name}\``, inline: true },
            { name: 'بواسطة الشخص:', value: executor, inline: true },
            { name: 'في روم رئيسي:', value: `<#${thread.parentId}>`, inline: true }
        )
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on('threadDelete', async (thread) => {
    const settings = guildSettings[thread.guild.id];
    if (!settings || !settings.threadLogChannelId) return;
    const logChannel = thread.guild.channels.cache.get(settings.threadLogChannelId);
    if (!logChannel) return;

    let executor = 'غير معروف';
    try {
        const fetchedLogs = await thread.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ThreadDelete });
        const auditEntry = fetchedLogs.entries.first();
        if (auditEntry && auditEntry.target.id === thread.id) {
            executor = `<@${auditEntry.executor.id}>`;
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('🗑️ تم حذف ثريد (Thread)')
        .setColor('#ef4444')
        .addFields(
            { name: 'اسم الثريد المحذوف:', value: `\`${thread.name}\``, inline: true },
            { name: 'حذفه المسؤول:', value: executor, inline: true }
        )
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});
// ==========================================
// الجزء الرابع: لوق التفاعلات، تعديلات السيرفر، مسارات لوحة التحكم وتشغيل البوت
// ==========================================

// 12. حدث رصد إضافة تفاعلات الإيموجي (Reaction Add)
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot || !reaction.message.guild) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch (e) { return; } }

    const settings = guildSettings[reaction.message.guild.id];
    if (!settings || !settings.reactionLogChannelId || !settings.monitoredReactions[reaction.message.channel.id]) return;

    const logChannel = reaction.message.guild.channels.cache.get(settings.reactionLogChannelId);
    if (!logChannel) return;

    const emojiDisplay = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;

    const embed = new EmbedBuilder()
        .setTitle('😀 إضافة تفاعل إيموجي')
        .setColor('#22c55e')
        .addFields(
            { name: 'بواسطة العضو:', value: `<@${user.id}>`, inline: true },
            { name: 'الإيموجي المستخدم:', value: `${emojiDisplay} (\`${reaction.emoji.name}\`)`, inline: true },
            { name: 'في الروم:', value: `<#${reaction.message.channel.id}>`, inline: true },
            { name: 'صاحب الرسالة الأصلية:', value: `<@${reaction.message.author?.id || 'غير معروف'}>`, inline: true },
            { name: 'رابط الرسالة التفاعلية:', value: `[اضغط هنا للانتقال](${reaction.message.url})`, inline: false }
        )
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 13. حدث رصد إزالة تفاعلات الإيموجي (Reaction Remove)
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot || !reaction.message.guild) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch (e) { return; } }

    const settings = guildSettings[reaction.message.guild.id];
    if (!settings || !settings.reactionLogChannelId || !settings.monitoredReactions[reaction.message.channel.id]) return;

    const logChannel = reaction.message.guild.channels.cache.get(settings.reactionLogChannelId);
    if (!logChannel) return;

    const emojiDisplay = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;

    const embed = new EmbedBuilder()
        .setTitle('❌ إزالة تفاعل إيموجي')
        .setColor('#ef4444')
        .addFields(
            { name: 'بواسطة العضو:', value: `<@${user.id}>`, inline: true },
            { name: 'الإيموجي المحذوف:', value: `${emojiDisplay} (\`${reaction.emoji.name}\`)`, inline: true },
            { name: 'من الروم:', value: `<#${reaction.message.channel.id}>`, inline: true },
            { name: 'صاحب الرسالة الأصلية:', value: `<@${reaction.message.author?.id || 'غير معروف'}>`, inline: true },
            { name: 'رابط الرسالة التفاعلية:', value: `[اضغط هنا للانتقال](${reaction.message.url})`, inline: false }
        )
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 14. لوق تعديل إعدادات وتغييرات السيرفر (Guild Update)
client.on('guildUpdate', async (oldGuild, newGuild) => {
    const settings = guildSettings[newGuild.id];
    if (!settings || !settings.serverLogChannelId) return;
    const logChannel = newGuild.channels.cache.get(settings.serverLogChannelId);
    if (!logChannel) return;

    let executor = 'مشرف مجهول';
    try {
        const fetchedLogs = await newGuild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.GuildUpdate });
        const auditEntry = fetchedLogs.entries.first();
        if (auditEntry) executor = `<@${auditEntry.executor.id}>`;
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setTitle('⚙️ تحديث في إعدادات السيرفر')
        .setColor('#eab308')
        .addFields({ name: '🛠️ المسؤول عن التعديل:', value: executor, inline: false })
        .setTimestamp();

    if (oldGuild.name !== newGuild.name) {
        embed.addFields(
            { name: 'اسم السيرفر القديم:', value: `\`${oldGuild.name}\``, inline: true },
            { name: 'اسم السيرفر الجديد:', value: `\`${newGuild.name}\``, inline: true }
        );
    }
    if (oldGuild.icon !== newGuild.icon) {
        embed.addFields({ name: '🖼️ أيقونة السيرفر:', value: 'تم تغيير الصورة الرمزية للسيرفر.', inline: false });
    }

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// ==========================================
// مسارات واجهة المستخدم ولوحة التحكم المباشرة Express Routes
// ==========================================

app.get('/', (req, res) => {
    if (!client.user) return res.send('جاري تشغيل البوت، انتظر ثواني واعمل تحديث للصفحة.');
    let botGuilds = client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL() ? g.iconURL() : 'https://discordapp.com'
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

    // استقبال وحفظ المتغيرات الـ 13 الجديدة بالكامل من صفحة الويب
    const logKeys = [
        'ticketLogChannelId', 'roleLogChannelId', 'roomLogChannelId', 'memberLogChannelId',
        'timeoutLogChannelId', 'kickLogChannelId', 'banLogChannelId', 'serverLogChannelId',
        'prisonLogChannelId', 'joinLeaveLogChannelId', 'threadLogChannelId', 'adminLogChannelId', 'reactionLogChannelId'
    ];

    logKeys.forEach(key => {
        guildSettings[guildId][key] = req.body[key] || "";
    });

    const { enabledMessageRooms, enabledReactionRooms } = req.body;
    const msgRooms = Array.isArray(enabledMessageRooms) ? enabledMessageRooms : (enabledMessageRooms ? [enabledMessageRooms] : []);
    const reactRooms = Array.isArray(enabledReactionRooms) ? enabledReactionRooms : (enabledReactionRooms ? [enabledReactionRooms] : []);

    for (let roomId in guildSettings[guildId].monitoredRooms) {
        guildSettings[guildId].monitoredRooms[roomId] = msgRooms.includes(roomId);
    }
    for (let roomId in guildSettings[guildId].monitoredReactions) {
        guildSettings[guildId].monitoredReactions[roomId] = reactRooms.includes(roomId);
    }

    saveSettingsToFile();
    res.redirect(`/manage/${guildId}`);
});

if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN).catch(err => console.error(err.message));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Dashboard Server live on port ${PORT}`));
