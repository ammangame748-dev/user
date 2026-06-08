// dashboardTemplates.js

function getGuildSelectorHtml(client, guildsList) {
    const botInviteUrl = `https://discord.com{client.user ? client.user.id : ''}&permissions=8&scope=bot`;

    let cardsHtml = guildsList.map(g => `
        <div class="server-card">
            <img class="server-icon" src="${g.icon}" alt="">
            <div class="server-details">
                <h3>${g.name}</h3>
                <span class="status-tag online">● متصل وجاهز</span>
            </div>
            <a href="/manage/${g.id}" class="ctrl-btn">تحكم بالسيرفر ←</a>
        </div>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>لوحة الإدارة المركزية</title>
        <style>
            :root { --bg-p: #090d16; --bg-s: #111827; --bg-a: #1f2937; --text: #f3f4f6; --text-m: #9ca3af; --blue: #38bdf8; --glow: rgba(56, 189, 248, 0.15); }
            * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; }
            body { background: var(--bg-p); color: var(--text); padding: 0; min-height: 100vh; display: flex; align-items: center; }
            .container { max-width: 1100px; width: 100%; margin: 40px auto; padding: 40px; background: var(--bg-s); border-radius: 24px; border: 1px solid var(--bg-a); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; border-bottom: 1px solid var(--bg-a); padding-bottom: 25px; }
            h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; background: linear-gradient(to left, #fff, var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .invite-btn { background: #5865F2; color: #fff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; transition: 0.3s ease; box-shadow: 0 4px 15px rgba(88, 101, 242, 0.3); }
            .invite-btn:hover { background: #4752c4; transform: translateY(-2px); }
            .server-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 25px; }
            .server-card { background: var(--bg-p); border: 1px solid var(--bg-a); border-radius: 16px; padding: 24px; display: flex; align-items: center; gap: 20px; transition: 0.3s ease; }
            .server-card:hover { border-color: var(--blue); box-shadow: 0 0 25px var(--glow); transform: translateY(-3px); }
            .server-icon { width: 64px; height: 64px; border-radius: 16px; background: var(--bg-a); object-fit: cover; }
            .server-details { flex-grow: 1; }
            .server-details h3 { font-size: 16px; margin-bottom: 6px; font-weight: 700; color: #fff; }
            .status-tag { font-size: 12px; font-weight: 600; color: #10b981; }
            .ctrl-btn { padding: 10px 16px; border-radius: 10px; text-decoration: none; font-size: 13px; font-weight: bold; background: var(--bg-a); color: var(--text); transition: 0.2s; border: 1px solid transparent; }
            .server-card:hover .ctrl-btn { background: var(--blue); color: var(--bg-p); }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <div>
                    <h1>لوحة الإدارة والمراقبة المركزية</h1>
                    <p style="color: var(--text-m); margin-top: 6px; font-size: 14px;">قم بإدارة وتخصيص قنوات السجلات وأنظمة الحماية الخاصة بالبوت.</p>
                </div>
                <a href="${botInviteUrl}" target="_blank" class="invite-btn">➕ دعوة البوت لسيرفر جديد</a>
            </header>
            <div class="server-grid">${cardsHtml}</div>
        </div>
    </body>
    </html>`;
}

function getManageServerHtml(guild, textChannels, settings) {
    let optionsHtml = textChannels.map(c => `<option value="${c.id}" ${settings.messageLogChannelId === c.id ? 'selected' : ''}># ${c.name}</option>`).join('');
    let timeoutOptionsHtml = textChannels.map(c => `<option value="${c.id}" ${settings.timeoutLogChannelId === c.id ? 'selected' : ''}># ${c.name}</option>`).join('');
    let reactionOptionsHtml = textChannels.map(c => `<option value="${c.id}" ${settings.reactionLogChannelId === c.id ? 'selected' : ''}># ${c.name}</option>`).join('');

    let checkboxesHtml = textChannels.map(c => `
        <label class="room-checkbox-label">
            <input type="checkbox" name="enabledMessageRooms" value="${c.id}" ${settings.monitoredRooms[c.id] !== false ? 'checked' : ''}>
            <span># ${c.name}</span>
        </label>
    `).join('');

    let reactionCheckboxesHtml = textChannels.map(c => `
        <label class="room-checkbox-label">
            <input type="checkbox" name="enabledReactionRooms" value="${c.id}" ${settings.monitoredReactions[c.id] !== false ? 'checked' : ''}>
            <span># ${c.name}</span>
        </label>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>إعدادات السيرفر | ${guild.name}</title>
        <style>
            :root { --bg-p: #090d16; --bg-s: #111827; --bg-a: #1f2937; --text: #f3f4f6; --text-m: #9ca3af; --blue: #38bdf8; }
            * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; }
            body { background: var(--bg-p); color: var(--text); padding: 40px 20px; }
            .container { max-width: 850px; margin: 0 auto; background: var(--bg-s); border: 1px solid var(--bg-a); padding: 40px; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
            h2 { font-size: 24px; margin-bottom: 30px; border-bottom: 1px solid var(--bg-a); padding-bottom: 15px; color: #fff; display: flex; align-items: center; gap: 10px; }
            .form-group { margin-bottom: 25px; }
            label { display: block; margin-bottom: 10px; font-weight: 600; font-size: 14px; color: #e5e7eb; }
            select { width: 100%; padding: 12px; border-radius: 8px; background: var(--bg-p); color: #fff; border: 1px solid var(--bg-a); font-size: 14px; outline: none; }
            select:focus { border-color: var(--blue); }
            .grid-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .rooms-list { background: var(--bg-p); border: 1px solid var(--bg-a); padding: 15px; border-radius: 10px; max-height: 200px; overflow-y: auto; }
            .room-checkbox-label { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer; font-size: 13px; color: var(--text-m); }
            .room-checkbox-label input { width: 16px; height: 16px; accent-color: var(--blue); }
            .room-checkbox-label:hover { color: #fff; }
            button[type="submit"] { width: 100%; padding: 14px; background: var(--blue); color: var(--bg-p); font-weight: 800; border: none; border-radius: 10px; cursor: pointer; font-size: 15px; transition: 0.2s ease; margin-top: 20px; }
            button[type="submit"]:hover { transform: translateY(-2px); filter: brightness(1.1); }
            .back-btn { display: inline-block; margin-bottom: 20px; color: var(--blue); text-decoration: none; font-size: 14px; font-weight: 600; }
        </style>
    </head>
    <body>
        <div class="container">
            <a href="/" class="back-btn">← العودة للرئيسية</a>
            <h2>⚙️ تهيئة رقابة سيرفر: ${guild.name}</h2>
            <form action="/update/${guild.id}" method="POST">
                
                <div class="form-group">
                    <label>🗂️ روم لوق الرسائل (الحذف والتعديل والإيمبدات):</label>
                    <select name="mainMessageChannel">
                        <option value="">-- اختر روم لوق الرسائل --</option>
                        ${optionsHtml}
                    </select>
                </div>

                <div class="form-group">
                    <label>⚖️ روم لوق العقوبات والتايم أوت وبلاغات الخنق:</label>
                    <select name="mainTimeoutChannel">
                        <option value="">-- اختر روم لوق العقوبات --</option>
                        ${timeoutOptionsHtml}
                    </select>
                </div>

                <div class="form-group">
                    <label>😀 روم لوق تفاعلات الإيموجي (Reaction Log):</label>
                    <select name="mainReactionChannel">
                        <option value="">-- اختر روم لوق التفاعلات --</option>
                        ${reactionOptionsHtml}
                    </select>
                </div>

                <div class="grid-sections">
                    <div class="form-group">
                        <label>🔒 رومات رقابة الرسائل المحذوفة والمعدلة:</label>
                        <div class="rooms-list">${checkboxesHtml}</div>
                    </div>
                    <div class="form-group">
                        <label>🔔 رومات رقابة تفاعلات الإيموجي:</label>
                        <div class="rooms-list">${reactionCheckboxesHtml}</div>
                    </div>
                </div>

                <button type="submit">💾 حفظ التغييرات وتحديث الإعدادات</button>
            </form>
        </div>
    </body>
    </html>`;
}

// تصدير الدوال لاستدعائها في الملف الرئيسي
module.exports = {
    getGuildSelectorHtml,
    getManageServerHtml
};
