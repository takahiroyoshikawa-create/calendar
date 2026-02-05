// iCalカレンダー同期機能

// 自動同期タイマー
let autoSyncTimer = null;
const AUTO_SYNC_ENABLED_KEY = 'autoSyncEnabled';
const AUTO_SYNC_INTERVAL_KEY = 'autoSyncInterval';
const LAST_SYNC_TIME_KEY = 'lastSyncTime';

// 自動同期の初期化
document.addEventListener('DOMContentLoaded', function() {
    if (typeof isSessionValid !== 'undefined' && isSessionValid()) {
        initAutoSync();
    }
});

// 自動同期の初期化
function initAutoSync() {
    const autoSyncToggle = document.getElementById('autoSyncToggle');
    const syncIntervalSelect = document.getElementById('syncInterval');
    
    const isEnabled = localStorage.getItem(AUTO_SYNC_ENABLED_KEY) === 'true';
    const interval = localStorage.getItem(AUTO_SYNC_INTERVAL_KEY) || '60';
    
    autoSyncToggle.checked = isEnabled;
    syncIntervalSelect.value = interval;
    
    autoSyncToggle.addEventListener('change', function() {
        const enabled = this.checked;
        localStorage.setItem(AUTO_SYNC_ENABLED_KEY, enabled);
        
        if (enabled) {
            startAutoSync();
        } else {
            stopAutoSync();
        }
        
        updateSyncStatus();
    });
    
    syncIntervalSelect.addEventListener('change', function() {
        localStorage.setItem(AUTO_SYNC_INTERVAL_KEY, this.value);
        
        if (autoSyncToggle.checked) {
            stopAutoSync();
            startAutoSync();
        }
    });
    
    if (isEnabled) {
        startAutoSync();
    }
    
    updateLastSyncTime();
    updateSyncStatus();
}

// 自動同期を開始
function startAutoSync() {
    const interval = parseInt(localStorage.getItem(AUTO_SYNC_INTERVAL_KEY) || '60');
    const intervalMs = interval * 60 * 1000;
    
    if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
    }
    
    autoSyncTimer = setInterval(() => {
        console.log('自動同期を実行中...');
        syncAllCalendars(true);
    }, intervalMs);
    
    console.log(`自動同期を開始しました（${interval}分間隔）`);
}

// 自動同期を停止
function stopAutoSync() {
    if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
        autoSyncTimer = null;
        console.log('自動同期を停止しました');
    }
}

// 同期ステータスを更新
function updateSyncStatus() {
    const statusElement = document.getElementById('syncStatus');
    const indicator = document.getElementById('autoSyncIndicator');
    const isEnabled = localStorage.getItem(AUTO_SYNC_ENABLED_KEY) === 'true';
    const interval = localStorage.getItem(AUTO_SYNC_INTERVAL_KEY) || '60';
    
    if (isEnabled) {
        statusElement.textContent = `オン（${interval}分間隔）`;
        statusElement.style.color = '#4CAF50';
        indicator.style.opacity = '1';
    } else {
        statusElement.textContent = 'オフ';
        statusElement.style.color = '#999';
        indicator.style.opacity = '0.6';
    }
}

// 最終同期時刻を更新
function updateLastSyncTime() {
    const lastSyncTime = localStorage.getItem(LAST_SYNC_TIME_KEY);
    const element = document.getElementById('lastSyncTime');
    
    if (lastSyncTime) {
        const date = new Date(parseInt(lastSyncTime));
        const now = new Date();
        const diffMinutes = Math.floor((now - date) / 60000);
        
        let timeText;
        if (diffMinutes < 1) {
            timeText = 'たった今';
        } else if (diffMinutes < 60) {
            timeText = `${diffMinutes}分前`;
        } else if (diffMinutes < 1440) {
            const hours = Math.floor(diffMinutes / 60);
            timeText = `${hours}時間前`;
        } else {
            const days = Math.floor(diffMinutes / 1440);
            timeText = `${days}日前`;
        }
        
        element.textContent = `最終同期: ${timeText}`;
    } else {
        element.textContent = '未同期';
    }
}

// 単一URLの同期
async function syncSingleUrl(kidId, index) {
    const input = document.querySelector(`#${kidId}-urls .ical-url-input[data-index="${index}"]`);
    let url = input.value.trim();
    
    if (!url) {
        alert('URLを入力してください。');
        return;
    }
    
    url = convertWebcalToHttp(url);
    
    try {
        showSyncProgress(kidId, index, 'カレンダーを同期中...');
        
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        
        if (!response.ok) {
            throw new Error('カレンダーの取得に失敗しました。');
        }
        
        const icalData = await response.text();
        console.log('iCalデータを取得しました:', icalData.substring(0, 200));
        
        parseAndAddEvents(icalData, kidId, index);
        saveIcalUrls();
        
        hideSyncProgress(kidId, index);
        
        localStorage.setItem(LAST_SYNC_TIME_KEY, Date.now().toString());
        updateLastSyncTime();
        
        alert(`${kidsConfig[kidId].name}のカレンダー（URL ${index + 1}）を同期しました！`);
    } catch (error) {
        console.error('同期エラー:', error);
        hideSyncProgress(kidId, index);
        
        let errorMessage = '同期に失敗しました。\n\n';
        
        if (url.includes('webcal://')) {
            errorMessage += '❌ Webcal URLが正しく変換されませんでした。\n';
        } else if (url.includes('google.com')) {
            errorMessage += '💡 Googleカレンダーの場合：\n';
            errorMessage += '1. カレンダー設定 → カレンダーの統合\n';
            errorMessage += '2. 「iCal形式の非公開URL」をコピー\n';
            errorMessage += '3. webcal:// で始まる場合もそのまま貼り付けOK\n';
        } else {
            errorMessage += 'URLを確認してください。\n';
            errorMessage += 'webcal://, http://, https:// で始まるURLに対応しています。';
        }
        
        alert(errorMessage);
    }
}

// 全カレンダーを一括同期
async function syncAllCalendars(silent = false) {
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
    
    let syncCount = 0;
    let errorCount = 0;
    
    for (const [kidId, urlList] of Object.entries(urls)) {
        for (let i = 0; i < urlList.length; i++) {
            const url = urlList[i];
            if (url) {
                try {
                    const convertedUrl = convertWebcalToHttp(url);
                    const proxyUrl = 'https://api.allorigins.win/raw?url=';
                    const response = await fetch(proxyUrl + encodeURIComponent(convertedUrl));
                    
                    if (!response.ok) {
                        throw new Error('カレンダーの取得に失敗しました。');
                    }
                    
                    const icalData = await response.text();
                    parseAndAddEvents(icalData, kidId, i);
                    syncCount++;
                } catch (error) {
                    console.error(`同期エラー (${kidId}, URL ${i}):`, error);
                    errorCount++;
                }
            }
        }
    }
    
    saveIcalUrls();
    
    localStorage.setItem(LAST_SYNC_TIME_KEY, Date.now().toString());
    updateLastSyncTime();
    
    if (!silent) {
        if (syncCount > 0) {
            alert(`${syncCount}件のカレンダーを同期しました${errorCount > 0 ? `（${errorCount}件失敗）` : '！'}`);
        } else {
            alert('同期するURLが設定されていません。');
        }
    } else {
        console.log(`自動同期完了: ${syncCount}件成功, ${errorCount}件失敗`);
    }
}

// Webcal URLを HTTP/HTTPS に変換
function convertWebcalToHttp(url) {
    if (url.startsWith('webcal://')) {
        return url.replace('webcal://', 'https://');
    } else if (url.startsWith('webcals://')) {
        return url.replace('webcals://', 'https://');
    }
    return url;
}

// 同期進捗表示
function showSyncProgress(kidId, index, message) {
    const input = document.querySelector(`#${kidId}-urls .ical-url-input[data-index="${index}"]`);
    if (!input) return;
    
    const syncButton = input.nextElementSibling;
    
    syncButton.disabled = true;
    syncButton.textContent = '同期中...';
    syncButton.style.opacity = '0.6';
}

// 同期進捗非表示
function hideSyncProgress(kidId, index) {
    const input = document.querySelector(`#${kidId}-urls .ical-url-input[data-index="${index}"]`);
    if (!input) return;
    
    const syncButton = input.nextElementSibling;
    
    syncButton.disabled = false;
    syncButton.textContent = '同期';
    syncButton.style.opacity = '1';
}

function parseAndAddEvents(icalData, kidId, urlIndex) {
    try {
        const jcalData = ICAL.parse(icalData);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');
        
        console.log(`${vevents.length}件のイベントを検出しました`);
        
        const events = loadEvents();
        
        // 既存のiCalイベントを削除
        const filteredEvents = events.filter(e => 
            !(e.extendedProps.fromIcal && 
              e.extendedProps.kid === kidId && 
              e.extendedProps.urlIndex === urlIndex)
        );
        
        let addedCount = 0;
        
        vevents.forEach((vevent, eventIndex) => {
            const event = new ICAL.Event(vevent);
            
            console.log(`イベント ${eventIndex + 1}:`, {
                summary: event.summary,
                location: event.location,
                description: event.description
            });
            
            // 繰り返しイベントの処理
            if (event.isRecurring()) {
                const iterator = event.iterator();
                const now = new Date();
                const oneYearLater = new Date();
                oneYearLater.setFullYear(now.getFullYear() + 1);
                
                let next;
                let instanceCount = 0;
                const maxInstances = 365;
                
                while ((next = iterator.next()) && instanceCount < maxInstances) {
                    const nextDate = next.toJSDate();
                    
                    if (nextDate > oneYearLater) break;
                    
                    const duration = event.duration.toSeconds() * 1000;
                    const endDate = new Date(nextDate.getTime() + duration);
                    
                    const eventData = createEventData(
                        event,
                        kidId,
                        nextDate,
                        endDate,
                        `ical-${kidId}-${urlIndex}-${event.uid}-${instanceCount}`,
                        urlIndex
                    );
                    
                    filteredEvents.push(eventData);
                    addedCount++;
                    instanceCount++;
                }
            } else {
                // 通常のイベント
                const eventData = createEventData(
                    event,
                    kidId,
                    event.startDate.toJSDate(),
                    event.endDate.toJSDate(),
                    `ical-${kidId}-${urlIndex}-${event.uid}`,
                    urlIndex
                );
                
                filteredEvents.push(eventData);
                addedCount++;
            }
        });
        
        saveEvents(filteredEvents);
        
        if (typeof calendar !== 'undefined' && calendar) {
            calendar.removeAllEvents();
            calendar.addEventSource(filteredEvents);
            if (typeof filterEvents === 'function') {
                filterEvents();
            }
        }
        
        console.log(`${kidId} URL${urlIndex}: ${addedCount}件のイベントを追加しました`);
        
    } catch (error) {
        console.error('iCal解析エラー:', error);
        throw new Error('カレンダーデータの解析に失敗しました。');
    }
}

// イベントデータ作成ヘルパー関数
function createEventData(event, kidId, startDate, endDate, eventId, urlIndex) {
    // タイトルを取得
    let displayTitle = event.summary || '(タイトルなし)';
    
    // 場所情報を取得
    const location = event.location || '';
    
    // 場所がある場合はタイトルに追加
    if (location) {
        displayTitle = `${displayTitle} 📍${location}`;
    }
    
    console.log('イベント作成:', {
        title: displayTitle,
        location: location,
        originalTitle: event.summary
    });
    
    return {
        id: eventId,
        title: displayTitle,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        backgroundColor: kidsConfig[kidId].color,
        borderColor: kidsConfig[kidId].color,
        extendedProps: {
            kid: kidId,
            description: event.description || '',
            location: location,
            originalTitle: event.summary || '(タイトルなし)',
            fromIcal: true,
            icalUid: event.uid,
            urlIndex: urlIndex
        }
    };
}