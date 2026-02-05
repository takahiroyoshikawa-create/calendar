// クラウド同期機能

let cloudSyncEnabled = false;
let isCloudSyncing = false;
let lastCloudSyncTime = 0;
const CLOUD_SYNC_DEBOUNCE = 2000; // 2秒のデバウンス

// クラウド同期の初期化
function initCloudSync() {
    const passwordHash = localStorage.getItem('passwordHash');
    
    if (!passwordHash) {
        console.log('パスワードが設定されていないため、クラウド同期を無効化');
        return;
    }
    
    // クラウド同期の有効/無効を確認
    const syncEnabled = localStorage.getItem('cloudSyncEnabled') === 'true';
    const toggle = document.getElementById('cloudSyncToggle');
    
    if (toggle) {
        toggle.checked = syncEnabled;
        cloudSyncEnabled = syncEnabled;
        
        toggle.addEventListener('change', function() {
            cloudSyncEnabled = this.checked;
            localStorage.setItem('cloudSyncEnabled', cloudSyncEnabled);
            
            if (cloudSyncEnabled) {
                uploadToCloud();
                listenToCloudChanges();
                updateCloudSyncStatus('有効', '#4CAF50');
            } else {
                stopListeningToCloud();
                updateCloudSyncStatus('無効', '#999');
            }
        });
    }
    
    if (cloudSyncEnabled) {
        // クラウドから初期データを読み込み
        downloadFromCloud();
        // クラウドの変更を監視
        listenToCloudChanges();
        updateCloudSyncStatus('有効', '#4CAF50');
    } else {
        updateCloudSyncStatus('無効', '#999');
    }
}

// クラウド同期ステータスを更新
function updateCloudSyncStatus(status, color) {
    const statusElement = document.getElementById('cloudSyncStatus');
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.style.color = color;
    }
}

// データをクラウドにアップロード
function uploadToCloud() {
    if (!cloudSyncEnabled || isCloudSyncing) {
        return;
    }
    
    // デバウンス処理
    const now = Date.now();
    if (now - lastCloudSyncTime < CLOUD_SYNC_DEBOUNCE) {
        return;
    }
    lastCloudSyncTime = now;
    
    isCloudSyncing = true;
    
    const passwordHash = localStorage.getItem('passwordHash');
    const dataPath = `calendar_data/${passwordHash}`;
    
    const data = {
        version: CURRENT_DATA_VERSION,
        lastModified: firebase.database.ServerValue.TIMESTAMP,
        events: loadEvents(),
        icalUrls: JSON.parse(localStorage.getItem(ICAL_URLS_KEY) || '{}'),
        autoSyncEnabled: localStorage.getItem(AUTO_SYNC_ENABLED_KEY) === 'true',
        autoSyncInterval: localStorage.getItem(AUTO_SYNC_INTERVAL_KEY) || '60',
        lastSyncTime: localStorage.getItem(LAST_SYNC_TIME_KEY)
    };
    
    database.ref(dataPath).set(data)
        .then(() => {
            console.log('✅ クラウドにデータをアップロードしました');
            updateCloudSyncStatus('同期完了', '#4CAF50');
            setTimeout(() => {
                if (cloudSyncEnabled) {
                    updateCloudSyncStatus('有効', '#4CAF50');
                }
            }, 2000);
        })
        .catch((error) => {
            console.error('❌ クラウドアップロードエラー:', error);
            updateCloudSyncStatus('エラー', '#dc3545');
        })
        .finally(() => {
            isCloudSyncing = false;
        });
}

// クラウドからデータをダウンロード
function downloadFromCloud() {
    if (!cloudSyncEnabled) {
        return;
    }
    
    const passwordHash = localStorage.getItem('passwordHash');
    const dataPath = `calendar_data/${passwordHash}`;
    
    updateCloudSyncStatus('ダウンロード中...', '#FF9800');
    
    database.ref(dataPath).once('value')
        .then((snapshot) => {
            const data = snapshot.val();
            
            if (data) {
                console.log('📥 クラウドからデータをダウンロードしました');
                
                // ローカルデータと比較
                const localEvents = loadEvents();
                const cloudEvents = data.events || [];
                
                // クラウドのデータが新しい場合のみ更新
                if (cloudEvents.length > 0) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudEvents));
                    
                    if (data.icalUrls) {
                        localStorage.setItem(ICAL_URLS_KEY, JSON.stringify(data.icalUrls));
                    }
                    
                    if (data.autoSyncEnabled !== undefined) {
                        localStorage.setItem(AUTO_SYNC_ENABLED_KEY, data.autoSyncEnabled);
                    }
                    
                    if (data.autoSyncInterval) {
                        localStorage.setItem(AUTO_SYNC_INTERVAL_KEY, data.autoSyncInterval);
                    }
                    
                    if (data.lastSyncTime) {
                        localStorage.setItem(LAST_SYNC_TIME_KEY, data.lastSyncTime);
                    }
                    
                    // カレンダーを更新
                    if (typeof calendar !== 'undefined' && calendar) {
                        calendar.removeAllEvents();
                        calendar.addEventSource(cloudEvents);
                        if (typeof filterEvents === 'function') {
                            filterEvents();
                        }
                    }
                    
                    // URL入力欄を更新
                    if (typeof loadIcalUrls === 'function') {
                        loadIcalUrls();
                    }
                    
                    console.log(`${cloudEvents.length}件のイベントをクラウドから読み込みました`);
                }
                
                updateCloudSyncStatus('有効', '#4CAF50');
            } else {
                console.log('クラウドにデータが存在しません。初回アップロードします。');
                uploadToCloud();
            }
        })
        .catch((error) => {
            console.error('❌ クラウドダウンロードエラー:', error);
            updateCloudSyncStatus('エラー', '#dc3545');
        });
}

// クラウドの変更を監視
let cloudListener = null;

function listenToCloudChanges() {
    if (!cloudSyncEnabled || cloudListener) {
        return;
    }
    
    const passwordHash = localStorage.getItem('passwordHash');
    const dataPath = `calendar_data/${passwordHash}`;
    
    cloudListener = database.ref(dataPath).on('value', (snapshot) => {
        // 自分の変更は無視
        if (isCloudSyncing) {
            return;
        }
        
        const data = snapshot.val();
        
        if (data && data.events) {
            console.log('🔄 クラウドから変更を検出しました');
            
            const cloudEvents = data.events;
            const localEvents = loadEvents();
            
            // イベント数が異なる場合のみ更新
            if (cloudEvents.length !== localEvents.length) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudEvents));
                
                if (typeof calendar !== 'undefined' && calendar) {
                    calendar.removeAllEvents();
                    calendar.addEventSource(cloudEvents);
                    if (typeof filterEvents === 'function') {
                        filterEvents();
                    }
                }
                
                console.log('カレンダーを更新しました');
                updateCloudSyncStatus('同期完了', '#4CAF50');
                setTimeout(() => {
                    if (cloudSyncEnabled) {
                        updateCloudSyncStatus('有効', '#4CAF50');
                    }
                }, 2000);
            }
        }
    });
    
    console.log('クラウド変更の監視を開始しました');
}

// クラウド監視を停止
function stopListeningToCloud() {
    if (cloudListener) {
        const passwordHash = localStorage.getItem('passwordHash');
        const dataPath = `calendar_data/${passwordHash}`;
        database.ref(dataPath).off('value', cloudListener);
        cloudListener = null;
        console.log('クラウド変更の監視を停止しました');
    }
}

// ローカルストレージの変更を監視してクラウドにアップロード
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    
    // イベントデータが変更された場合、クラウドにアップロード
    if (key === STORAGE_KEY && cloudSyncEnabled) {
        uploadToCloud();
    }
};

// ページロード時に初期化
document.addEventListener('DOMContentLoaded', function() {
    if (typeof isSessionValid !== 'undefined' && isSessionValid()) {
        setTimeout(initCloudSync, 1000); // 他の初期化の後に実行
    }
});