// 子供の設定
const kidsConfig = {
    kid1: { name: '尚貴', color: '#FF6B6B' },
    kid2: { name: '豪貴', color: '#4ECDC4' },
    kid3: { name: '光貴', color: '#95E1D3' }
};

// グローバル変数
let calendar;
let currentFilter = 'all';
let currentEvent = null;

// ローカルストレージのキー
const STORAGE_KEY = 'kidsCalendarEvents';
const ICAL_URLS_KEY = 'kidsCalendarIcalUrls';
const DATA_VERSION_KEY = 'kidsCalendarDataVersion';
const CURRENT_DATA_VERSION = '2.0';

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    // データのクリーンアップとマイグレーション
    migrateData();
    
    // 認証チェックは auth.js で行われるため、ここでは条件付きで初期化
    if (isSessionValid()) {
        initCalendar();
    }
    initEventListeners();
    loadIcalUrls();
});

// データのマイグレーション
function migrateData() {
    const currentVersion = localStorage.getItem(DATA_VERSION_KEY);
    
    if (currentVersion !== CURRENT_DATA_VERSION) {
        console.log('データをマイグレーション中...');
        
        const events = loadEvents();
        
        if (events && events.length > 0) {
            const migratedEvents = events.map(event => {
                let newTitle = event.title;
                
                // 古い名前パターンを削除
                const oldNames = ['太郎', '花子', '次郎', '尚貴', '豪貴', '光貴'];
                oldNames.forEach(name => {
                    const pattern = new RegExp(`^${name}:\\s*`, 'g');
                    newTitle = newTitle.replace(pattern, '');
                });
                
                // 場所アイコンも削除（再生成のため）
                newTitle = newTitle.replace(/\s*📍.*$/, '');
                
                if (event.extendedProps && event.extendedProps.originalTitle) {
                    event.extendedProps.originalTitle = newTitle;
                }
                
                // 場所情報がある場合は再追加
                if (event.extendedProps && event.extendedProps.location) {
                    newTitle = `${newTitle} 📍${event.extendedProps.location}`;
                }
                
                return {
                    ...event,
                    title: newTitle
                };
            });
            
            saveEvents(migratedEvents);
            console.log(`${migratedEvents.length}件のイベントをマイグレーションしました`);
        }
        
        localStorage.setItem(DATA_VERSION_KEY, CURRENT_DATA_VERSION);
        console.log('マイグレーション完了');
    }
}

// カレンダー初期化
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        locale: 'ja',
        buttonText: {
            today: '今日',
            month: '月',
            week: '週',
            day: '日'
        },
        events: loadEvents(),
        eventClick: handleEventClick,
        dateClick: handleDateClick,
        editable: true,
        eventDrop: handleEventDrop,
        eventResize: handleEventResize,
        height: 'auto'
    });
    
    calendar.render();
}

// イベントリスナー設定
function initEventListeners() {
    // 子供タブ
    document.querySelectorAll('.kid-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.kid-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.kid;
            filterEvents();
        });
    });

    // 予定追加ボタン
    document.getElementById('addEventBtn').addEventListener('click', () => {
        openModal();
    });

    // 同期設定トグル
    document.getElementById('toggleSync').addEventListener('click', () => {
        document.getElementById('syncPanel').classList.toggle('hidden');
    });

    // データクリア機能
    const clearDataBtn = document.getElementById('clearDataBtn');
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', clearAllData);
    }

    // モーダルクローズ
    document.querySelector('#eventModal .close').addEventListener('click', closeModal);
    
    // モーダル外クリックで閉じる
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('eventModal');
        const detailsModal = document.getElementById('eventDetailsModal');
        if (e.target === modal) {
            closeModal();
        }
        if (e.target === detailsModal) {
            closeEventDetailsModal();
        }
    });

    // フォーム送信
    document.getElementById('eventForm').addEventListener('submit', handleFormSubmit);

    // 削除ボタン
    document.getElementById('deleteEventBtn').addEventListener('click', deleteEvent);
}

// 全データをクリア
function clearAllData() {
    if (confirm('⚠️ 警告：全てのデータ（予定、URL設定）を削除します。\nこの操作は取り消せません。本当に削除しますか？')) {
        if (confirm('本当によろしいですか？削除されたデータは復元できません。')) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(ICAL_URLS_KEY);
            localStorage.removeItem(DATA_VERSION_KEY);
            
            if (calendar) {
                calendar.removeAllEvents();
            }
            
            ['kid1', 'kid2', 'kid3'].forEach(kidId => {
                const container = document.getElementById(`${kidId}-urls`);
                container.innerHTML = '';
                addUrlInput(kidId);
            });
            
            alert('全てのデータを削除しました。');
            location.reload();
        }
    }
}

// イベント読み込み
function loadEvents() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
}

// イベント保存
function saveEvents(events) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

// イベントフィルタリング
function filterEvents() {
    const allEvents = loadEvents();
    
    if (currentFilter === 'all') {
        calendar.removeAllEvents();
        calendar.addEventSource(allEvents);
    } else {
        const filtered = allEvents.filter(event => event.extendedProps.kid === currentFilter);
        calendar.removeAllEvents();
        calendar.addEventSource(filtered);
    }
}

// モーダルを開く
function openModal(event = null) {
    const modal = document.getElementById('eventModal');
    const form = document.getElementById('eventForm');
    const deleteBtn = document.getElementById('deleteEventBtn');
    
    form.reset();
    currentEvent = event;
    
    if (event) {
        // 編集モード
        document.getElementById('modalTitle').textContent = '予定を編集';
        document.getElementById('eventKid').value = event.extendedProps.kid;
        
        // originalTitleを使用（場所アイコンなし）
        let displayTitle = event.extendedProps.originalTitle || event.title;
        displayTitle = displayTitle.replace(/\s*📍.*$/, '');
        
        document.getElementById('eventTitle').value = displayTitle;
        document.getElementById('eventLocation').value = event.extendedProps.location || '';
        document.getElementById('eventStart').value = formatDateTimeLocal(event.start);
        document.getElementById('eventEnd').value = formatDateTimeLocal(event.end || event.start);
        document.getElementById('eventDescription').value = event.extendedProps.description || '';
        deleteBtn.classList.remove('hidden');
    } else {
        // 新規作成モード
        document.getElementById('modalTitle').textContent = '予定を追加';
        deleteBtn.classList.add('hidden');
    }
    
    modal.classList.remove('hidden');
}

// モーダルを閉じる
function closeModal() {
    document.getElementById('eventModal').classList.add('hidden');
    currentEvent = null;
}

// フォーム送信処理
function handleFormSubmit(e) {
    e.preventDefault();
    
    const kid = document.getElementById('eventKid').value;
    const title = document.getElementById('eventTitle').value;
    const location = document.getElementById('eventLocation').value;
    const start = document.getElementById('eventStart').value;
    const end = document.getElementById('eventEnd').value;
    const description = document.getElementById('eventDescription').value;
    
    // タイトルに場所を追加
    let displayTitle = title;
    if (location) {
        displayTitle = `${title} 📍${location}`;
    }
    
    const eventData = {
        id: currentEvent ? currentEvent.id : Date.now().toString(),
        title: displayTitle,
        start: start,
        end: end,
        backgroundColor: kidsConfig[kid].color,
        borderColor: kidsConfig[kid].color,
        extendedProps: {
            kid: kid,
            description: description,
            location: location,
            originalTitle: title
        }
    };
    
    const events = loadEvents();
    
    if (currentEvent) {
        const index = events.findIndex(e => e.id === currentEvent.id);
        if (index !== -1) {
            events[index] = eventData;
        }
    } else {
        events.push(eventData);
    }
    
    saveEvents(events);
    calendar.removeAllEvents();
    calendar.addEventSource(events);
    filterEvents();
    closeModal();
}

// イベント削除
function deleteEvent() {
    if (!currentEvent || !confirm('この予定を削除しますか？')) {
        return;
    }
    
    const events = loadEvents();
    const filtered = events.filter(e => e.id !== currentEvent.id);
    saveEvents(filtered);
    
    calendar.removeAllEvents();
    calendar.addEventSource(filtered);
    filterEvents();
    closeModal();
}

// イベントクリック処理
function handleEventClick(info) {
    // iCal同期イベントは詳細表示
    if (info.event.extendedProps.fromIcal) {
        showEventDetails(info.event);
        return;
    }
    openModal(info.event);
}

// イベント詳細を表示
function showEventDetails(event) {
    const modal = document.getElementById('eventDetailsModal');
    
    // タイトル
    const title = event.extendedProps.originalTitle || event.title.replace(/\s*📍.*$/, '');
    document.getElementById('detailTitle').textContent = title;
    
    // 子供の名前
    const kidName = kidsConfig[event.extendedProps.kid].name;
    document.getElementById('detailKid').textContent = kidName;
    document.getElementById('detailKid').style.color = kidsConfig[event.extendedProps.kid].color;
    document.getElementById('detailKid').style.fontWeight = 'bold';
    
    // 開始日時
    const startDate = new Date(event.start);
    document.getElementById('detailStart').textContent = formatDateTime(startDate);
    
    // 終了日時
    const endDate = event.end ? new Date(event.end) : startDate;
    document.getElementById('detailEnd').textContent = formatDateTime(endDate);
    
    // 場所
    const locationElement = document.getElementById('detailLocation');
    const locationRow = document.getElementById('detailLocationRow');
    if (event.extendedProps.location) {
        locationElement.textContent = event.extendedProps.location;
        locationRow.style.display = 'flex';
        
        // Google Maps リンク
        const mapsLink = document.getElementById('detailMapsLink');
        const encodedLocation = encodeURIComponent(event.extendedProps.location);
        mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
    } else {
        locationRow.style.display = 'none';
    }
    
    // 説明
    const descriptionElement = document.getElementById('detailDescription');
    const descriptionRow = document.getElementById('detailDescriptionRow');
    if (event.extendedProps.description) {
        descriptionElement.textContent = event.extendedProps.description;
        descriptionRow.style.display = 'flex';
    } else {
        descriptionRow.style.display = 'none';
    }
    
    modal.classList.remove('hidden');
}

// イベント詳細モーダルを閉じる
function closeEventDetailsModal() {
    document.getElementById('eventDetailsModal').classList.add('hidden');
}

// 日時フォーマット（詳細表示用）
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    
    return `${year}年${month}月${day}日（${weekday}） ${hours}:${minutes}`;
}

// 日付クリック処理
function handleDateClick(info) {
    openModal();
    document.getElementById('eventStart').value = formatDateTimeLocal(info.date);
    const endDate = new Date(info.date);
    endDate.setHours(endDate.getHours() + 1);
    document.getElementById('eventEnd').value = formatDateTimeLocal(endDate);
}

// イベントドロップ処理
function handleEventDrop(info) {
    if (info.event.extendedProps.fromIcal) {
        info.revert();
        alert('iCalから同期されたイベントは編集できません。');
        return;
    }
    updateEventDateTime(info.event);
}

// イベントリサイズ処理
function handleEventResize(info) {
    if (info.event.extendedProps.fromIcal) {
        info.revert();
        alert('iCalから同期されたイベントは編集できません。');
        return;
    }
    updateEventDateTime(info.event);
}

// イベント日時更新
function updateEventDateTime(event) {
    const events = loadEvents();
    const index = events.findIndex(e => e.id === event.id);
    
    if (index !== -1) {
        events[index].start = event.start.toISOString();
        events[index].end = event.end ? event.end.toISOString() : event.start.toISOString();
        saveEvents(events);
    }
}

// 日時フォーマット（datetime-local用）
function formatDateTimeLocal(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// iCal URL保存
function saveIcalUrls() {
    const urls = {
        kid1: [],
        kid2: [],
        kid3: []
    };
    
    ['kid1', 'kid2', 'kid3'].forEach(kidId => {
        const inputs = document.querySelectorAll(`#${kidId}-urls .ical-url-input`);
        inputs.forEach(input => {
            const url = input.value.trim();
            if (url) {
                urls[kidId].push(url);
            }
        });
    });
    
    localStorage.setItem(ICAL_URLS_KEY, JSON.stringify(urls));
}

// iCal URL読み込み
function loadIcalUrls() {
    const stored = localStorage.getItem(ICAL_URLS_KEY);
    if (stored) {
        const urls = JSON.parse(stored);
        
        ['kid1', 'kid2', 'kid3'].forEach(kidId => {
            const urlList = urls[kidId] || [];
            const container = document.getElementById(`${kidId}-urls`);
            
            container.innerHTML = '';
            
            if (urlList.length === 0) {
                addUrlInput(kidId);
            } else {
                urlList.forEach((url, index) => {
                    addUrlInput(kidId, url, index);
                });
            }
        });
    }
}

// URL入力欄を追加
function addUrlInput(kidId, url = '', index = null) {
    const container = document.getElementById(`${kidId}-urls`);
    const currentInputs = container.querySelectorAll('.sync-input-group');
    const newIndex = index !== null ? index : currentInputs.length;
    
    const inputGroup = document.createElement('div');
    inputGroup.className = 'sync-input-group';
    inputGroup.innerHTML = `
        <input type="text" class="ical-url-input" data-kid="${kidId}" data-index="${newIndex}" 
               placeholder="webcal://... または https://..." value="${url}">
        <button onclick="syncSingleUrl('${kidId}', ${newIndex})">同期</button>
        <button class="btn-remove" onclick="removeUrl('${kidId}', ${newIndex})">✕</button>
    `;
    
    container.appendChild(inputGroup);
}

// URL入力欄を削除
function removeUrl(kidId, index) {
    const container = document.getElementById(`${kidId}-urls`);
    const inputGroups = container.querySelectorAll('.sync-input-group');
    
    if (inputGroups.length <= 1) {
        alert('最低1つのURL入力欄は必要です。');
        return;
    }
    
    inputGroups[index].remove();
    
    const remainingGroups = container.querySelectorAll('.sync-input-group');
    remainingGroups.forEach((group, newIndex) => {
        const input = group.querySelector('.ical-url-input');
        const syncBtn = group.querySelector('button:not(.btn-remove)');
        const removeBtn = group.querySelector('.btn-remove');
        
        input.dataset.index = newIndex;
        syncBtn.setAttribute('onclick', `syncSingleUrl('${kidId}', ${newIndex})`);
        removeBtn.setAttribute('onclick', `removeUrl('${kidId}', ${newIndex})`);
    });
    
    saveIcalUrls();
}