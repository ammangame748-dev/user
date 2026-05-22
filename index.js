const { Client, GatewayIntentBits, AuditLogEvent, EmbedBuilder, Partials } = require('discord.js');
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
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});

// التعامل مع تحديث اسم الحدث في الإصدارات الجديدة من ديسكورد
const readyEventName = client.on ? (client.on('clientReady', () => {}) ? 'clientReady' : 'ready') : 'ready';
client.once(readyEventName, () => {
    console.log(`Bot initialized as: ${client.user.tag}`);
});

function initGuildSettings(guildId) {
    if (!guildSettings[guildId]) {
        guildSettings[guildId] = {
            messageLogChannelId: "",
            timeoutLogChannelId: "",
            reactionLogChannelId: "",
            monitoredRooms: {},
            monitoredReactions: {},
            monitoredKhnqRooms: {}
        };
    }

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

            if (guildSettings[guildId].monitoredKhnqRooms[channel.id] === undefined) {
                guildSettings[guildId].monitoredKhnqRooms[channel.id] = false;
            }

        });
    }

    saveSettingsToFile();
}

// ==========================================
// أحداث ديسكورد لإرسال اللوق
// ==========================================

// 1. رصد كلمة "خنق" والمنشن
client.on('messageCreate', async (message) => {

    if (message.author.bot || !message.guild) return;

    const settings = guildSettings[message.guild.id];

    if (
        !settings ||
        !settings.timeoutLogChannelId ||
        !settings.monitoredKhnqRooms[message.channel.id]
    ) return;

    if (message.content.includes('خنق') && message.mentions.members.size > 0) {

        const logChannel = message.guild.channels.cache.get(settings.timeoutLogChannelId);
        if (!logChannel) return;

        const targetMember = message.mentions.members.first();
        if (!targetMember) return;

        const secureContent = message.content && message.content.trim()
            ? message.content.slice(0, 1000)
            : 'لا يوجد نص';

        const embed = new EmbedBuilder()
            .setTitle('🔍 بلاغ رصد كلمة خنق')
            .setColor('#eab308')
            .setDescription(`تم رصد استخدام كلمة خنق مع منشن في الروم: <#${message.channel.id}>`)
            .addFields(
                { name: 'بواسطة الشخص:', value: `<@${message.author.id}>`, inline: true },
                { name: 'الشخص المستهدف (المنشن):', value: `<@${targetMember.id}>`, inline: true },
                { name: 'نص الرسالة كاملاً:', value: `\`\`\`${secureContent}\`\`\`` }
            )
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => { });
    }
});

// 2. سجل حذف الرسائل
client.on('messageDelete', async (message) => {
    if (message.partial || message.author?.bot || !message.guild) return;

    const settings = guildSettings[message.guild.id];

    if (!settings || !settings.monitoredRooms[message.channel.id]) return;

    const logChannel = message.guild.channels.cache.get(settings.messageLogChannelId);
    if (!logChannel) return;

    let executor = `<@${message.author.id}>`;
    let executorTarget = message.author;

    try {
        const fetchedLogs = await message.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageDelete
        });

        const deletionLog = fetchedLogs.entries.first();

        if (
            deletionLog &&
            deletionLog.target.id === message.author.id &&
            (Date.now() - deletionLog.createdTimestamp) < 5000
        ) {
            executor = `<@${deletionLog.executor.id}>`;
            executorTarget = deletionLog.executor;
        }

    } catch (e) {}

    const hasAttachment = message.attachments.size > 0;
    const firstAttachment = hasAttachment ? message.attachments.first() : null;

    let rawContent = (message.content && message.content.trim())
        ? message.content
        : (
            hasAttachment
                ? 'تحتوي الرسالة على ملف مرفق (مرفق أدناه)'
                : (
                    message.embeds && message.embeds.length > 0
                        ? 'الرسالة عبارة عن إيمبد (Embed) فقط'
                        : 'محتوى ميديا أو إيموجي فقط'
                )
        );

    if (rawContent.length > 1000) {
        rawContent = rawContent.slice(0, 1000) + '... (تم اختصار النص لطوله)';
    }

    const finalContent = rawContent.trim()
        ? `\`\`\`\n${rawContent}\n\`\`\``
        : '\`\`\`محتوى ميديا فارغ\`\`\`';

    const logEmbed = new EmbedBuilder()
        .setTitle('🗑️ سجل حذف رسالة')
        .setColor('#ef4444')
        .setDescription(`تم حذف رسالة في الروم: <#${message.channel.id}>`)
        .addFields(
            { name: 'المسؤول عن الحذف:', value: executor || 'غير معروف', inline: true },
            { name: 'صاحب الرسالة الأصلية:', value: `<@${message.author.id}>`, inline: true },
            { name: 'نص الرسالة المحذوفة:', value: finalContent }
        )
        .setTimestamp();

    if (executorTarget) {
        logEmbed.setThumbnail(executorTarget.displayAvatarURL({ dynamic: true }));
    }

    const sendOptions = { embeds: [logEmbed] };

    if (hasAttachment && firstAttachment) {

        sendOptions.files = [{
            attachment: firstAttachment.url,
            name: firstAttachment.name
        }];

        if (firstAttachment.contentType?.startsWith('image/')) {
            logEmbed.setImage(`attachment://${firstAttachment.name}`);
        }
    }

    logChannel.send(sendOptions).catch(() => {});
});

// 3. سجل تعديل الرسائل
client.on('messageUpdate', async (oldMessage, newMessage) => {

    if (oldMessage.partial || oldMessage.author?.bot || !oldMessage.guild) return;

    if (oldMessage.content === newMessage.content) return;

    const settings = guildSettings[oldMessage.guild.id];

    if (!settings || !settings.monitoredRooms[oldMessage.channel.id]) return;

    const logChannel = oldMessage.guild.channels.cache.get(settings.messageLogChannelId);

    if (!logChannel) return;

    const oldContent = oldMessage.content?.trim()
        ? oldMessage.content.slice(0, 1000)
        : 'فارغ أو ميديا';

    const newContent = newMessage.content?.trim()
        ? newMessage.content.slice(0, 1000)
        : 'فارغ أو ميديا';

    const embed = new EmbedBuilder()
        .setTitle('✏️ سجل تعديل رسالة')
        .setColor('#ca8a04')
        .setDescription(`تم تعديل رسالة في الروم: <#${oldMessage.channel.id}>`)
        .addFields(
            { name: 'صاحب الرسالة المعدل:', value: `<@${oldMessage.author.id}>` },
            { name: 'المحتوى قبل التعديل:', value: `\`\`\`${oldContent}\`\`\`` },
            { name: 'المحتوى بعد التعديل:', value: `\`\`\`${newContent}\`\`\`` }
        )
        .setThumbnail(oldMessage.author.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 4. سجل التايم أوت
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

            const fetchedLogs = await newMember.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MemberUpdate
            });

            const auditEntry = fetchedLogs.entries.first();

            if (auditEntry && auditEntry.target.id === newMember.id) {
                executor = `<@${auditEntry.executor.id}>`;
            }

        } catch (e) {}

        const totalSeconds = Math.round((newTimeout - Date.now()) / 1000);

        const durationText = totalSeconds < 60
            ? `${totalSeconds} ثانية`
            : `${Math.round(totalSeconds / 60)} دقيقة`;

        const embed = new EmbedBuilder()
            .setTitle('🚫 سجل عقوبة تايم أوت')
            .setColor('#38bdf8')
            .addFields(
                { name: 'من قام بإعطاء التايم أوت:', value: executor, inline: true },
                { name: 'العضو المعاقب:', value: `<@${newMember.id}>`, inline: true },
                { name: 'مدة العقوبة الزمنية:', value: `\`${durationText}\`` }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
});

// ==========================================
// لوحة التحكم
// ==========================================

app.get('/', (req, res) => {

    if (!client.user) {
        return res.send('جاري تشغيل البوت...');
    }

    let botGuilds = client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL()
            ? g.iconURL()
            : 'https://discordapp.com'
    }));

    res.send(getGuildSelectorHtml(botGuilds));
});

app.get('/manage/:guildId', (req, res) => {

    const guildId = req.params.guildId;

    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
        return res.send('البوت ليس داخل السيرفر');
    }

    initGuildSettings(guildId);

    const settings = guildSettings[guildId];

    const textChannels = guild.channels.cache
        .filter(c => c.type === 0)
        .map(c => ({
            id: c.id,
            name: c.name
        }));

    res.send(getManageServerHtml(guild, textChannels, settings));
});

app.post('/update/:guildId', (req, res) => {

    const guildId = req.params.guildId;

    const {
        enabledMessageRooms,
        enabledReactionRooms,
        enabledKhnqRooms,
        mainMessageChannel,
        mainTimeoutChannel,
        mainReactionChannel
    } = req.body;

    if (!guildSettings[guildId]) {
        initGuildSettings(guildId);
    }

    guildSettings[guildId].messageLogChannelId = mainMessageChannel || "";
    guildSettings[guildId].timeoutLogChannelId = mainTimeoutChannel || "";
    guildSettings[guildId].reactionLogChannelId = mainReactionChannel || "";

    const msgRooms = Array.isArray(enabledMessageRooms)
        ? enabledMessageRooms
        : (enabledMessageRooms ? [enabledMessageRooms] : []);

    const reactRooms = Array.isArray(enabledReactionRooms)
        ? enabledReactionRooms
        : (enabledReactionRooms ? [enabledReactionRooms] : []);

    const khnqRooms = Array.isArray(enabledKhnqRooms)
        ? enabledKhnqRooms
        : (enabledKhnqRooms ? [enabledKhnqRooms] : []);

    for (let roomId in guildSettings[guildId].monitoredRooms) {
        guildSettings[guildId].monitoredRooms[roomId] = msgRooms.includes(roomId);
    }

    for (let roomId in guildSettings[guildId].monitoredReactions) {
        guildSettings[guildId].monitoredReactions[roomId] = reactRooms.includes(roomId);
    }

    for (let roomId in guildSettings[guildId].monitoredKhnqRooms) {
        guildSettings[guildId].monitoredKhnqRooms[roomId] = khnqRooms.includes(roomId);
    }

    saveSettingsToFile();

    res.redirect(`/manage/${guildId}`);
});

if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN)
        .catch(err => console.error(err.message));
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dashboard Server live on port ${PORT}`);
});
