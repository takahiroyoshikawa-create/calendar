// 子供の設定
const kidsConfig = {
    kid1: { name: '太郎', color: '#FF6B6B' },
    kid2: { name: '花子', color: '#4ECDC4' },
    kid3: { name: '次郎', color: '#95E1D3' }
};

// グローバル変数
let calendar;
let currentFilter = 'all';
let currentEvent = null;

// ローカルストレージのキー
const STORAGE_KEY = 'kidsCalendarEvents';
const ICAL_URLS_KEY = 'kidsCalendarIcalUrls';

// 初期化（修正版）
document.addEventListener('DOMContentLoaded', function() {
    // 認証チェックは auth.js で行われるため、ここでは条件付きで初期化
    if (isSessionValid()) {
        initCalendar();
    }
    initEventListeners();
    loadIcalUrls();
});

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
        document.getElementById('eventTitle').value = event.title;
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
    const start = document.getElementById('eventStart').value;
    const end = document.getElementById('eventEnd').value;
    const description = document.getElementById('eventDescription').value;
    
    const eventData = {
        id: currentEvent ? currentEvent.id : Date.now().toString(),
        title: `${kidsConfig[kid].name}: ${title}`,
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
        kid1: document.getElementById('icalUrl1').value,
        kid2: document.getElementById('icalUrl2').value,
        kid3: document.getElementById('icalUrl3').value
    };
    localStorage.setItem(ICAL_URLS_KEY, JSON.stringify(urls));
}

// iCal URL読み込み
function loadIcalUrls() {
    const stored = localStorage.getItem(ICAL_URLS_KEY);
    if (stored) {
        const urls = JSON.parse(stored);
        document.getElementById('icalUrl1').value = urls.kid1 || '';
        document.getElementById('icalUrl2').value = urls.kid2 || '';
        document.getElementById('icalUrl3').value = urls.kid3 || '';
    }
}