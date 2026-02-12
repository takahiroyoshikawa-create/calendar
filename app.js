// ========================================
// グローバル変数
// ========================================

let calendar;
let currentEditingEvent = null;
let currentFilter = 'all';

// ストレージキー
const STORAGE_KEY = 'kidsCalendarEvents';
const ICAL_URLS_KEY = 'icalUrls';
const AUTO_SYNC_ENABLED_KEY = 'autoSyncEnabled';
const AUTO_SYNC_INTERVAL_KEY = 'autoSyncInterval';
const LAST_SYNC_TIME_KEY = 'lastSyncTime';
const DATA_VERSION_KEY = 'dataVersion';

// データバージョン管理
const CURRENT_DATA_VERSION = '1.0';

// 自動同期タイマー
let autoSyncTimer = null;

// 子供の色設定
const KID_COLORS = {
    kid1: '#FF6B6B',
    kid2: '#4ECDC4',
    kid3: '#95E1D3'
};

const KID_NAMES = {
    kid1: '尚貴',
    kid2: '豪貴',
    kid3: '光貴'
};

// ========================================
// 初期化
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📱 DOMContentLoaded - User Agent:', navigator.userAgent);
    console.log('📱 画面サイズ:', window.innerWidth, 'x', window.innerHeight);
    
    // データのクリーンアップとマイグレーション
    migrateData();
    
    // イベントリスナーを先に設定
    initEventListeners();
    loadIcalUrls();
    
    // 認証チェック
    if (isSessionValid()) {
        console.log('✅ セッション有効');
        
        // モバイルの場合は少し待つ
        const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const delay = isMobile ? 800 : 200; // モバイルは800ms待つ
        
        console.log(`⏱️ ${delay}ms後にカレンダーを初期化します`);
        
        setTimeout(() => {
            const calendarEl = document.getElementById('calendar');
            if (calendarEl) {
                console.log('✅ カレンダー要素が見つかりました');
                console.log('カレンダー要素のサイズ:', calendarEl.offsetWidth, 'x', calendarEl.offsetHeight);
                initCalendar();
            } else {
                console.error('❌ カレンダー要素が見つかりません');
                // 再試行
                setTimeout(() => {
                    const retryEl = document.getElementById('calendar');
                    if (retryEl) {
                        console.log('✅ 再試行成功');
                        initCalendar();
                    } else {
                        console.error('❌ 再試行失敗');
                        alert('カレンダーの読み込みに失敗しました。ページを再読み込みしてください。');
                    }
                }, 1000);
            }
        }, delay);
    } else {
        console.log('❌ セッション無効');
    }
});

// ページ完全読み込み後の確認
window.addEventListener('load', function() {
    console.log('📱 Window load イベント発火');
    
    if (isSessionValid() && !calendar) {
        console.log('⚠️ カレンダー未初期化 - 再初期化します');
        setTimeout(() => {
            const calendarEl = document.getElementById('calendar');
            if (calendarEl && !calendar) {
                console.log('🔄 再初期化を実行');
                initCalendar();
            }
        }, 1000);
    }
});

// ========================================
// データ管理
// ========================================

// データのマイグレーション
function migrateData() {
    const currentVersion = localStorage.getItem(DATA_VERSION_KEY);
    
    if (!currentVersion) {
        console.log('初回起動: データバージョンを設定');
        localStorage.setItem(DATA_VERSION_KEY, CURRENT_DATA_VERSION);
    }
    
    // 古いデータ形式のクリーンアップ
    const events = loadEvents();
    const cleanedEvents = events.filter(event => {
        return event.title && event.start && event.extendedProps && event.extendedProps.kid;
    });
    
    if (cleanedEvents.length !== events.length) {
        console.log(`データクリーンアップ: ${events.length - cleanedEvents.length}件の不正なイベントを削除`);
        saveEvents(cleanedEvents);
    }
}

// イベント読み込み
function loadEvents() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('イベント読み込みエラー:', error);
        return [];
    }
}

// イベント保存
function saveEvents(events) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
        
        // クラウド同期が有効な場合、アップロード
        if (typeof uploadToCloud === 'function' && typeof cloudSyncEnabled !== 'undefined' && cloudSyncEnabled) {
            uploadToCloud();
        }
    } catch (error) {
        console.error('イベント保存エラー:', error);
        alert('データの保存に失敗しました。ストレージ容量を確認してください。');
    }
}

// ========================================
// カレンダー初期化
// ========================================

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    if (!calendarEl) {
        console.error('❌ カレンダー要素が見つかりません');
        return;
    }
    
    console.log('📅 カレンダー要素:', calendarEl);
    console.log('📅 カレンダー要素のサイズ:', calendarEl.offsetWidth, 'x', calendarEl.offsetHeight);
    
    // 既存のカレンダーを破棄
    if (calendar) {
        console.log('🗑️ 既存のカレンダーを破棄します');
        try {
            calendar.destroy();
        } catch (e) {
            console.warn('カレンダー破棄時の警告:', e);
        }
    }
    
    try {
        console.log('🔧 カレンダーを初期化中...');
        
        // モバイル判定
        const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
        console.log('📱 モバイルデバイス:', isMobile);
        
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: isMobile ? 'timeGridDay' : 'dayGridMonth', // モバイルは日表示
            firstDay: 1,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: isMobile ? 'dayGridMonth,timeGridDay' : 'dayGridMonth,timeGridWeek,timeGridDay'
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
            
            // モバイル対応の設定
            height: isMobile ? 'auto' : 'auto',
            contentHeight: isMobile ? 'auto' : 'auto',
            aspectRatio: isMobile ? 1.2 : 1.5,
            handleWindowResize: true,
            windowResizeDelay: 100,
            
            // タッチ操作対応
            longPressDelay: 500,
            eventLongPressDelay: 500,
            selectLongPressDelay: 500,
            
            // イベントハンドラ
            viewDidMount: function(info) {
                console.log('✅ ビューがマウントされました:', info.view.type);
                console.log('ビューの高さ:', info.el.offsetHeight);
            },
            
            eventDidMount: function(info) {
                console.log('📌 イベントマウント:', info.event.title);
            },
            
            // レンダリング完了
            datesSet: function(info) {
                console.log('📅 日付セット完了:', info.start, '~', info.end);
            }
        });
        
        console.log('🎨 カレンダーをレンダリング中...');
        calendar.render();
        console.log('✅ カレンダーのレンダリング完了');
        
        // レンダリング後の確認
        setTimeout(() => {
            const fcEl = calendarEl.querySelector('.fc');
            if (fcEl) {
                console.log('✅ FullCalendar DOM確認:', fcEl.offsetHeight, 'px');
            } else {
                console.error('❌ FullCalendar DOMが見つかりません');
            }
        }, 100);
        
        // イベントを再読み込み
        setTimeout(() => {
            if (calendar) {
                const events = loadEvents();
                console.log(`📊 ${events.length}件のイベントを読み込みます`);
                calendar.removeAllEvents();
                calendar.addEventSource(events);
                filterEvents();
                console.log('✅ イベント読み込み完了');
            }
        }, 300);
        
    } catch (error) {
        console.error('❌ カレンダー初期化エラー:', error);
        console.error('エラースタック:', error.stack);
        alert('カレンダーの初期化に失敗しました:\n' + error.message + '\n\nページを再読み込みしてください。');
    }
}

// ========================================
// イベントリスナー初期化
// ========================================

function initEventListeners() {
    // 予定追加ボタン
    const addEventBtn = document.getElementById('addEventBtn');
    if (addEventBtn) {
        addEventBtn.addEventListener('click', () => {
            currentEditingEvent = null;
            openModal();
        });
    }
    
    // カレンダー再読み込みボタン
    const refreshBtn = document.getElementById('refreshCalendarBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (calendar) {
                calendar.destroy();
            }
            initCalendar();
            alert('✅ カレンダーを再読み込みしました');
        });
    }
    
    // モーダル閉じるボタン
    const closeButtons = document.querySelectorAll('.close');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
    
    // モーダル外クリックで閉じる
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('eventModal');
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // イベントフォーム送信
    const eventForm = document.getElementById('eventForm');
    if (eventForm) {
        eventForm.addEventListener('submit', handleEventSubmit);
    }
    
    // イベント削除ボタン
    const deleteBtn = document.getElementById('deleteEventBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleEventDelete);
    }
    
    // 子供タブ
    const kidTabs = document.querySelectorAll('.kid-tab');
    kidTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            kidTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.kid;
            filterEvents();
        });
    });
    
    // 同期パネル切り替え
    const toggleSyncBtn = document.getElementById('toggleSync');
    if (toggleSyncBtn) {
        toggleSyncBtn.addEventListener('click', () => {
            const panel = document.getElementById('syncPanel');
            panel.classList.toggle('hidden');
        });
    }
    
    // 全データ削除
    const clearDataBtn = document.getElementById('clearDataBtn');
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', () => {
            if (confirm('⚠️ 本当に全てのデータを削除しますか？\n\nこの操作は取り消せません。')) {
                if (confirm('最終確認: 全ての予定とURL設定が削除されます。\n\n続行しますか？')) {
                    localStorage.removeItem(STORAGE_KEY);
                    localStorage.removeItem(ICAL_URLS_KEY);
                    localStorage.removeItem(LAST_SYNC_TIME_KEY);
                    alert('✅ 全てのデータを削除しました。ページを再読み込みします。');
                    location.reload();
                }
            }
        });
    }
    
    // 自動同期設定
    initAutoSync();
}

// ========================================
// 自動同期機能
// ========================================

function initAutoSync() {
    const autoSyncToggle = document.getElementById('autoSyncToggle');
    const syncIntervalSelect = document.getElementById('syncInterval');
    
    if (!autoSyncToggle || !syncIntervalSelect) {
        return;
    }
    
    // 保存された設定を読み込み
    const isEnabled = localStorage.getItem(AUTO_SYNC_ENABLED_KEY) === 'true';
    const interval = localStorage.getItem(AUTO_SYNC_INTERVAL_KEY) || '60';
    
    autoSyncToggle.checked = isEnabled;
    syncIntervalSelect.value = interval;
    
    updateSyncStatus();
    
    if (isEnabled) {
        startAutoSync();
    }
    
    // トグル変更
    autoSyncToggle.addEventListener('change', function() {
        const enabled = this.checked;
        localStorage.setItem(AUTO_SYNC_ENABLED_KEY, enabled);
        
        if (enabled) {
            startAutoSync();
            syncAllCalendars();
        } else {
            stopAutoSync();
        }
        
        updateSyncStatus();
    });
    
    // 間隔変更
    syncIntervalSelect.addEventListener('change', function() {
        const interval = this.value;
        localStorage.setItem(AUTO_SYNC_INTERVAL_KEY, interval);
        
        if (autoSyncToggle.checked) {
            stopAutoSync();
            startAutoSync();
        }
    });
}

function startAutoSync() {
    stopAutoSync(); // 既存のタイマーをクリア
    
    const interval = parseInt(localStorage.getItem(AUTO_SYNC_INTERVAL_KEY) || '60');
    const milliseconds = interval * 60 * 1000;
    
    console.log(`自動同期を開始: ${interval}分間隔`);
    
    autoSyncTimer = setInterval(() => {
        console.log('自動同期を実行中...');
        syncAllCalendars();
    }, milliseconds);
}

function stopAutoSync() {
    if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
        autoSyncTimer = null;
        console.log('自動同期を停止');
    }
}

function updateSyncStatus() {
    const statusElement = document.getElementById('syncStatus');
    const lastSyncElement = document.getElementById('lastSyncTime');
    const isEnabled = localStorage.getItem(AUTO_SYNC_ENABLED_KEY) === 'true';
    
    if (statusElement) {
        statusElement.textContent = isEnabled ? 'オン' : 'オフ';
        statusElement.style.color = isEnabled ? '#4CAF50' : '#999';
    }
    
    if (lastSyncElement) {
        const lastSync = localStorage.getItem(LAST_SYNC_TIME_KEY);
        if (lastSync) {
            const date = new Date(parseInt(lastSync));
            lastSyncElement.textContent = `最終同期: ${date.toLocaleString('ja-JP')}`;
        } else {
            lastSyncElement.textContent = '';
        }
    }
}

// ========================================
// イベント処理
// ========================================

function handleEventClick(info) {
    const event = info.event;
    
    // iCalから同期されたイベントの場合
    if (event.extendedProps.isIcalEvent) {
        showEventDetails(event);
        return;
    }
    
    // 通常のイベント編集
    currentEditingEvent = event;
    
    document.getElementById('modalTitle').textContent = '予定を編集';
    document.getElementById('eventKid').value = event.extendedProps.kid;
    document.getElementById('eventTitle').value = event.title;
    document.getElementById('eventLocation').value = event.extendedProps.location || '';
    document.getElementById('eventStart').value = formatDateTimeLocal(event.start);
    document.getElementById('eventEnd').value = formatDateTimeLocal(event.end || event.start);
    document.getElementById('eventDescription').value = event.extendedProps.description || '';
    
    document.getElementById('deleteEventBtn').classList.remove('hidden');
    
    openModal();
}

function handleDateClick(info) {
    currentEditingEvent = null;
    
    document.getElementById('modalTitle').textContent = '予定を追加';
    document.getElementById('eventForm').reset();
    
    const startDate = new Date(info.date);
    startDate.setHours(9, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(10, 0, 0, 0);
    
    document.getElementById('eventStart').value = formatDateTimeLocal(startDate);
    document.getElementById('eventEnd').value = formatDateTimeLocal(endDate);
    document.getElementById('deleteEventBtn').classList.add('hidden');
    
    openModal();
}

function handleEventSubmit(e) {
    e.preventDefault();
    
    const kid = document.getElementById('eventKid').value;
    const title = document.getElementById('eventTitle').value;
    const location = document.getElementById('eventLocation').value;
    const start = document.getElementById('eventStart').value;
    const end = document.getElementById('eventEnd').value;
    const description = document.getElementById('eventDescription').value;
    
    if (!title || !start || !end) {
        alert('タイトル、開始日時、終了日時は必須です。');
        return;
    }
    
    const eventData = {
        id: currentEditingEvent ? currentEditingEvent.id : generateId(),
        title: title,
        start: start,
        end: end,
        backgroundColor: KID_COLORS[kid],
        borderColor: KID_COLORS[kid],
        extendedProps: {
            kid: kid,
            location: location,
            description: description,
            isIcalEvent: false
        }
    };
    
    const events = loadEvents();
    
    if (currentEditingEvent) {
        // 更新
        const index = events.findIndex(e => e.id === currentEditingEvent.id);
        if (index !== -1) {
            events[index] = eventData;
        }
    } else {
        // 新規追加
        events.push(eventData);
    }
    
    saveEvents(events);
    
    if (calendar) {
        calendar.removeAllEvents();
        calendar.addEventSource(events);
        filterEvents();
    }
    
    closeModal();
}

function handleEventDelete() {
    if (!currentEditingEvent) return;
    
    if (confirm(`「${currentEditingEvent.title}」を削除しますか？`)) {
        const events = loadEvents();
        const filteredEvents = events.filter(e => e.id !== currentEditingEvent.id);
        saveEvents(filteredEvents);
        
        if (calendar) {
            calendar.removeAllEvents();
            calendar.addEventSource(filteredEvents);
            filterEvents();
        }
        
        closeModal();
    }
}

function handleEventDrop(info) {
    updateEventTimes(info.event);
}

function handleEventResize(info) {
    updateEventTimes(info.event);
}

function updateEventTimes(event) {
    const events = loadEvents();
    const index = events.findIndex(e => e.id === event.id);
    
    if (index !== -1) {
        events[index].start = event.start.toISOString();
        events[index].end = event.end ? event.end.toISOString() : event.start.toISOString();
        saveEvents(events);
    }
}

// ========================================
// フィルタリング
// ========================================

function filterEvents() {
    if (!calendar) return;
    
    const allEvents = calendar.getEvents();
    
    allEvents.forEach(event => {
        if (currentFilter === 'all') {
            event.setProp('display', 'auto');
        } else {
            const shouldShow = event.extendedProps.kid === currentFilter;
            event.setProp('display', shouldShow ? 'auto' : 'none');
        }
    });
}

// ========================================
// モーダル操作
// ========================================

function openModal() {
    const modal = document.getElementById('eventModal');
    modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('eventModal');
    modal.classList.add('hidden');
    document.getElementById('eventForm').reset();
    currentEditingEvent = null;
}

function showEventDetails(event) {
    document.getElementById('detailTitle').textContent = event.title;
    document.getElementById('detailKid').textContent = KID_NAMES[event.extendedProps.kid] || event.extendedProps.kid;
    document.getElementById('detailStart').textContent = formatDateTime(event.start);
    document.getElementById('detailEnd').textContent = formatDateTime(event.end || event.start);
    
    const location = event.extendedProps.location;
    const locationRow = document.getElementById('detailLocationRow');
    if (location) {
        document.getElementById('detailLocation').textContent = location;
        const mapsLink = document.getElementById('detailMapsLink');
        mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
        locationRow.style.display = 'flex';
    } else {
        locationRow.style.display = 'none';
    }
    
    const description = event.extendedProps.description;
    const descriptionRow = document.getElementById('detailDescriptionRow');
    if (description) {
        document.getElementById('detailDescription').textContent = description;
        descriptionRow.style.display = 'flex';
    } else {
        descriptionRow.style.display = 'none';
    }
    
    const modal = document.getElementById('eventDetailsModal');
    modal.classList.remove('hidden');
}

function closeEventDetailsModal() {
    const modal = document.getElementById('eventDetailsModal');
    modal.classList.add('hidden');
}

// ========================================
// ユーティリティ関数
// ========================================

function generateId() {
    return 'event_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function formatDateTimeLocal(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ========================================
// データエクスポート/インポート機能
// ========================================

function exportAllData() {
    try {
        const exportData = {
            version: CURRENT_DATA_VERSION,
            exportDate: new Date().toISOString(),
            events: loadEvents(),
            icalUrls: JSON.parse(localStorage.getItem(ICAL_URLS_KEY) || '{}'),
            autoSyncEnabled: localStorage.getItem(AUTO_SYNC_ENABLED_KEY) === 'true',
            autoSyncInterval: localStorage.getItem(AUTO_SYNC_INTERVAL_KEY) || '60',
            lastSyncTime: localStorage.getItem(LAST_SYNC_TIME_KEY)
        };
        
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        link.download = `kids-calendar-backup-${dateStr}-${timeStr}.json`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        alert('✅ データをエクスポートしました！\n\nダウンロードしたファイルを他のデバイスでインポートしてください。');
        
    } catch (error) {
        console.error('エクスポートエラー:', error);
        alert('❌ データのエクスポートに失敗しました。');
    }
}

function importAllData(event) {
    const file = event.target.files[0];
    
    if (!file) {
        return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
        alert('ファイルサイズが大きすぎます。50MB以下のファイルを選択してください。');
        event.target.value = '';
        return;
    }
    
    if (!file.name.toLowerCase().endsWith('.json')) {
        alert('.jsonファイルを選択してください。');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            if (!importData.version || !importData.events) {
                throw new Error('無効なデータ形式です。');
            }
            
            const eventCount = importData.events.length;
            const exportDate = new Date(importData.exportDate).toLocaleString('ja-JP');
            
            const confirmMessage = `📥 データをインポートしますか？\n\n` +
                `エクスポート日時: ${exportDate}\n` +
                `予定の数: ${eventCount}件\n\n` +
                `⚠️ 現在のデータは上書きされます。\n` +
                `続行しますか？`;
            
            if (!confirm(confirmMessage)) {
                event.target.value = '';
                return;
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(importData.events));
            
            if (importData.icalUrls) {
                localStorage.setItem(ICAL_URLS_KEY, JSON.stringify(importData.icalUrls));
            }
            
            if (importData.autoSyncEnabled !== undefined) {
                localStorage.setItem(AUTO_SYNC_ENABLED_KEY, importData.autoSyncEnabled);
            }
            
            if (importData.autoSyncInterval) {
                localStorage.setItem(AUTO_SYNC_INTERVAL_KEY, importData.autoSyncInterval);
            }
            
            if (importData.lastSyncTime) {
                localStorage.setItem(LAST_SYNC_TIME_KEY, importData.lastSyncTime);
            }
            
            localStorage.setItem(DATA_VERSION_KEY, importData.version);
            
            alert(`✅ データをインポートしました！\n\n${eventCount}件の予定を読み込みました。\nページを再読み込みします。`);
            
            location.reload();
            
        } catch (error) {
            console.error('インポートエラー:', error);
            alert('❌ データのインポートに失敗しました。\n\n正しいバックアップファイルか確認してください。');
            event.target.value = '';
        }
    };
    
    reader.onerror = function() {
        alert('❌ ファイルの読み込みに失敗しました。');
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

// ========================================
// デバッグ用関数
// ========================================

function debugCalendar() {
    console.log('=== カレンダーデバッグ情報 ===');
    console.log('カレンダーオブジェクト:', calendar);
    console.log('カレンダー要素:', document.getElementById('calendar'));
    console.log('イベント数:', loadEvents().length);
    console.log('現在のフィルター:', currentFilter);
    console.log('User Agent:', navigator.userAgent);
    console.log('画面サイズ:', window.innerWidth, 'x', window.innerHeight);
    
    if (calendar) {
        console.log('カレンダービュー:', calendar.view.type);
        console.log('カレンダーイベント:', calendar.getEvents().length);
    } else {
        console.error('❌ カレンダーが初期化されていません');
    }
}

// コンソールから呼び出せるようにグローバルに公開
window.debugCalendar = debugCalendar;

// 5秒後に自動デバッグ
setTimeout(() => {
    if (isSessionValid()) {
        debugCalendar();
    }
}, 5000);