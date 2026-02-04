// 子供の設定（名前を変更）
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
const CURRENT_DATA_VERSION = '2.0'; // データバージョン

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
        
        // 古いイベントデータを取得
        const events = loadEvents();
        
        if (events && events.length > 0) {
            // タイトルから名前を削除
            const migratedEvents = events.map(event => {
                // タイトルから「太郎:」「花子:」「次郎:」などを削除
                let newTitle = event.title;
                
                // 古い名前パターンを削除
                const oldNames = ['太郎', '花子', '次郎', '尚貴', '豪貴', '光貴'];
                oldNames.forEach(name => {
                    const pattern = new RegExp(`^${name}:\\s*`, 'g');
                    newTitle = newTitle.replace(pattern, '');
                });
                
                // originalTitleも更新
                if (event.extendedProps && event.extendedProps.originalTitle) {
                    event.extendedProps.originalTitle = newTitle;
                }
                
                return {
                    ...event,
                    title: newTitle
                };
            });
            
            // マイグレーション済みデータを保存
            saveEvents(migratedEvents);
            console.log(`${migratedEvents.length}件のイベントをマイグレーションしました`);
        }
        
        // バージョンを更新
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

    // データクリア機能（新規追加）
    const clearDataBtn = document.getElementById('clearDataBtn');
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', clearAllData);
    }

    // モーダルクローズ
    document.querySelector('.close').addEventListener('click', closeModal);
    
    // モーダル外クリックで閉じる
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('eventModal');
        if (e.target === modal) {
            closeModal();
        }
    });

    // フォーム送信
    document.getElementById('eventForm').addEventListener('submit', handleFormSubmit);

    // 削除ボタン
    document.getElementById('deleteEventBtn').addEventListener('click', deleteEvent);
}

// 全データをクリア（新規追加）
function clearAllData() {
    if (confirm('⚠️ 警告：全てのデータ（予定、URL設定）を削除します。\nこの操作は取り消せません。本当に削除しますか？')) {
        if (confirm('本当によろしいですか？削除されたデータは復元できません。')) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(ICAL_URLS_KEY);
            localStorage.removeItem(DATA_VERSION_KEY);
            
            // カレンダーをリフレッシュ
            if (calendar) {
                calendar.removeAllEvents();
            }
            
            // URL入力欄をリセット
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
        
        // タイトルから名前を除去して表示
        let displayTitle = event.title;
        const kidName = kidsConfig[event.extendedProps.kid].name;
        const pattern = new RegExp(`^${kidName}:\\s*`, 'g');
        displayTitle = displayTitle.replace(pattern, '');
        
        document.getElementById('eventTitle').value = displayTitle;
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

// フォーム送信処理（名前を含めない）
function handleFormSubmit(e) {
    e.preventDefault();
    
    const kid = document.getElementById('eventKid').value;
    const title = document.getElementById('eventTitle').value; // 名前を付けない
    const start = document.getElementById('eventStart').value;
    const end = document.getElementById('eventEnd').value;
    const description = document.getElementById('eventDescription').value;
    
    const eventData = {
        id: currentEvent ? currentEvent.id : Date.now().toString(),
        title: title, // 名前なしでそのまま保存
        start: start,
        end: end,
        backgroundColor: kidsConfig[kid].color,
        borderColor: kidsConfig[kid].color,
        extendedProps: {
            kid: kid,
            description: description,
            originalTitle: title
        }
    };
    
    const events = loadEvents();
    
    if (currentEvent) {
        // 更新
        const index = events.findIndex(e => e.id === currentEvent.id);
        if (index !== -1) {
            events[index] = eventData;
        }
    } else {
        // 新規追加
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
    // iCal同期イベントは編集不可
    if (info.event.extendedProps.fromIcal) {
        alert('iCalから同期されたイベントは編集できません。');
        return;
    }
    openModal(info.event);
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
    
    // 各子供のURL入力欄から値を取得
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
        
        // 各子供のURLを復元
        ['kid1', 'kid2', 'kid3'].forEach(kidId => {
            const urlList = urls[kidId] || [];
            const container = document.getElementById(`${kidId}-urls`);
            
            // 既存の入力欄をクリア
            container.innerHTML = '';
            
            // URLがない場合は1つだけ入力欄を表示
            if (urlList.length === 0) {
                addUrlInput(kidId);
            } else {
                // 保存されたURLを復元
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
    
    // 最後の1つは削除しない
    if (inputGroups.length <= 1) {
        alert('最低1つのURL入力欄は必要です。');
        return;
    }
    
    inputGroups[index].remove();
    
    // インデックスを振り直し
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