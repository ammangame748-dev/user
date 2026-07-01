// ==========================================
// ملف واجهات المستخدم وتصميم لوحة التحكم الاحترافية الشاملة
// ==========================================

function getGuildSelectorHtml(client, guildsList) {
    const botInviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user ? client.user.id : ''}&permissions=8&scope=bot%20applications.commands`;

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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة الإدارة المركزية | LoggerBot</title>
        <style>
            :root { --bg-p: #0b0f1a; --bg-s: #161b2c; --bg-a: #232a3d; --text: #f3f4f6; --text-m: #9ca3af; --blue: #38bdf8; --glow: rgba(56, 189, 248, 0.2); }
            * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }
            body { background: var(--bg-p); color: var(--text); min-height: 100vh; padding: 20px; }
            .container { max-width: 1200px; margin: 40px auto; padding: 40px; background: var(--bg-s); border-radius: 24px; border: 1px solid var(--bg-a); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
            header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; border-bottom: 1px solid var(--bg-a); padding-bottom: 25px; flex-wrap: wrap; gap: 20px; }
            h1 { font-size: 32px; font-weight: 800; background: linear-gradient(90deg, #fff, var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .invite-btn { background: #5865F2; color: #fff; padding: 14px 28px; border-radius: 14px; text-decoration: none; font-weight: bold; font-size: 15px; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 15px rgba(88, 101, 242, 0.4); }
            .invite-btn:hover { background: #4752c4; transform: translateY(-3px); box-shadow: 0 8px 25px rgba(88, 101, 242, 0.5); }
            .server-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 25px; }
            .server-card { background: var(--bg-a); border: 1px solid transparent; border-radius: 20px; padding: 25px; display: flex; align-items: center; gap: 20px; transition: 0.3s; cursor: default; }
            .server-card:hover { border-color: var(--blue); box-shadow: 0 0 30px var(--glow); transform: translateY(-5px); }
            .server-icon { width: 70px; height: 70px; border-radius: 20px; background: #000; object-fit: cover; border: 2px solid var(--bg-s); }
            .server-details { flex-grow: 1; }
            .server-details h3 { font-size: 18px; margin-bottom: 8px; color: #fff; }
            .status-tag { font-size: 12px; font-weight: 600; color: #10b981; display: flex; align-items: center; gap: 5px; }
            .ctrl-btn { padding: 12px 20px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: bold; background: var(--bg-s); color: var(--text); transition: 0.3s; border: 1px solid var(--bg-a); }
            .server-card:hover .ctrl-btn { background: var(--blue); color: var(--bg-p); border-color: var(--blue); }
            @media (max-width: 600px) { .container { padding: 20px; } header { text-align: center; justify-content: center; } }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <div>
                    <h1>لوحة التحكم المركزية</h1>
                    <p style="color: var(--text-m); margin-top: 8px; font-size: 15px;">إدارة نظام LoggerBot المتقدم لجميع سيرفراتك.</p>
                </div>
                <a href="${botInviteUrl}" target="_blank" class="invite-btn">➕ إضافة البوت لسيرفر</a>
            </header>
            <div class="server-grid">${cardsHtml}</div>
        </div>
    </body>
    </html>`;
}

function getManageServerHtml(guild, textChannels, settings) {
    const logTypes = [
        { key: 'ticketLogChannelId', label: '🎫 لوق التكتات (Tickets)' },
        { key: 'roleLogChannelId', label: '🏷️ لوق الرتب (Roles)' },
        { key: 'roomLogChannelId', label: '🏗️ لوق القنوات (Channels)' },
        { key: 'memberLogChannelId', label: '👥 لوق الأعضاء والرسائل' },
        { key: 'timeoutLogChannelId', label: '⏱️ لوق التايم أوت والخنق' },
        { key: 'kickLogChannelId', label: '🥾 لوق الطرد (Kicks)' },
        { key: 'banLogChannelId', label: '🔨 لوق الحظر (Bans)' },
        { key: 'serverLogChannelId', label: '⚙️ لوق إعدادات السيرفر' },
        { key: 'prisonLogChannelId', label: '⛓️ لوق السجن والمخالفات' },
        { key: 'joinLeaveLogChannelId', label: '🚪 لوق الدخول والخروج' },
        { key: 'threadLogChannelId', label: '🧵 لوق الثريدات (Threads)' },
        { key: 'adminLogChannelId', label: '🛠️ لوق الأوامر الإدارية' },
        { key: 'reactionLogChannelId', label: '😀 لوق التفاعلات (Reactions)' }
    ];

    let formsHtml = logTypes.map(type => {
        let options = textChannels.map(c => `
            <option value="${c.id}" ${settings[type.key] === c.id ? 'selected' : ''}># ${c.name}</option>
        `).join('');

        return `
        <div class="form-group">
            <label>${type.label}</label>
            <select name="${type.key}">
                <option value="">-- معطل --</option>
                ${options}
            </select>
        </div>`;
    }).join('');

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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إعدادات ${guild.name} | LoggerBot</title>
        <style>
            :root { --bg-p: #0b0f1a; --bg-s: #161b2c; --bg-a: #232a3d; --text: #f3f4f6; --text-m: #9ca3af; --blue: #38bdf8; --success: #10b981; }
            * { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }
            body { background: var(--bg-p); color: var(--text); padding: 20px; }
            .container { max-width: 1000px; margin: 20px auto; background: var(--bg-s); border: 1px solid var(--bg-a); padding: 40px; border-radius: 24px; box-shadow: 0 25px 50px rgba(0,0,0,0.5); position: relative; }
            h2 { font-size: 26px; margin-bottom: 30px; border-bottom: 2px solid var(--bg-a); padding-bottom: 15px; color: #fff; display: flex; align-items: center; gap: 12px; }
            .success-msg { background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success); color: var(--success); padding: 15px; border-radius: 12px; margin-bottom: 25px; text-align: center; font-weight: bold; display: none; }
            .log-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .form-group { margin-bottom: 20px; background: var(--bg-a); padding: 15px; border-radius: 15px; border: 1px solid transparent; transition: 0.3s; }
            .form-group:focus-within { border-color: var(--blue); }
            label { display: block; margin-bottom: 10px; font-weight: 600; font-size: 14px; color: #e5e7eb; }
            select { width: 100%; padding: 12px; border-radius: 10px; background: var(--bg-p); color: #fff; border: 1px solid var(--bg-a); font-size: 14px; outline: none; cursor: pointer; }
            .grid-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-top: 30px; border-top: 2px solid var(--bg-a); padding-top: 30px; }
            .rooms-list { background: var(--bg-p); border: 1px solid var(--bg-a); padding: 20px; border-radius: 15px; max-height: 250px; overflow-y: auto; }
            .room-checkbox-label { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; cursor: pointer; font-size: 14px; color: var(--text-m); transition: 0.2s; }
            .room-checkbox-label input { width: 18px; height: 18px; accent-color: var(--blue); cursor: pointer; }
            .room-checkbox-label:hover { color: #fff; }
            .save-btn { width: 100%; padding: 18px; background: var(--blue); color: var(--bg-p); font-weight: 800; border: none; border-radius: 15px; cursor: pointer; font-size: 16px; transition: 0.3s; margin-top: 40px; box-shadow: 0 10px 20px rgba(56, 189, 248, 0.2); }
            .save-btn:hover { transform: translateY(-3px); box-shadow: 0 15px 30px rgba(56, 189, 248, 0.3); filter: brightness(1.1); }
            .back-btn { display: inline-flex; align-items: center; margin-bottom: 25px; color: var(--blue); text-decoration: none; font-size: 15px; font-weight: 600; gap: 8px; transition: 0.2s; }
            .back-btn:hover { transform: translateX(5px); }
            @media (max-width: 768px) { .grid-sections { grid-template-columns: 1fr; } }
        </style>
    </head>
    <body>
        <div class="container">
            <a href="/" class="back-btn">← العودة للقائمة</a>
            <div id="success" class="success-msg">✅ تم حفظ جميع الإعدادات بنجاح!</div>
            <h2>🛡️ إعدادات الرقابة | ${guild.name}</h2>
            <form action="/update/${guild.id}" method="POST">
                <div class="log-grid">
                    ${formsHtml}
                </div>
                <div class="grid-sections">
                    <div class="form-group">
                        <label>🔒 مراقبة الرسائل (حذف وتعديل):</label>
                        <div class="rooms-list">${checkboxesHtml}</div>
                    </div>
                    <div class="form-group">
                        <label>🔔 مراقبة التفاعلات (ريأكشنات):</label>
                        <div class="rooms-list">${reactionCheckboxesHtml}</div>
                    </div>
                </div>
                <button type="submit" class="save-btn">💾 حفظ التغييرات الآن</button>
            </form>
        </div>
        <script>
            if(new URLSearchParams(window.location.search).get('success')) {
                document.getElementById('success').style.display = 'block';
                setTimeout(() => {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }, 3000);
            }
        </script>
    </body>
    </html>`;
}

module.exports = {
    getGuildSelectorHtml,
    getManageServerHtml
};
