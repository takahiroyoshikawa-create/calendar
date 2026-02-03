// 認証管理

const PASSWORD_KEY = 'kidsCalendarPasswordHash';
const SESSION_KEY = 'kidsCalendarSession';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24時間

// パスワードをハッシュ化
function hashPassword(password) {
    return CryptoJS.SHA256(password).toString();
}

// パスワードが設定されているか確認
function isPasswordSet() {
    return localStorage.getItem(PASSWORD_KEY) !== null;
}

// パスワードを検証
function verifyPassword(password) {
    const storedHash = localStorage.getItem(PASSWORD_KEY);
    const inputHash = hashPassword(password);
    return storedHash === inputHash;
}

// パスワードを設定
function setPassword(password) {
    const hash = hashPassword(password);
    localStorage.setItem(PASSWORD_KEY, hash);
}

// セッションを作成
function createSession() {
    const session = {
        timestamp: Date.now(),
        expires: Date.now() + SESSION_DURATION
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// セッションを検証
function isSessionValid() {
    const sessionData = sessionStorage.getItem(SESSION_KEY);
    if (!sessionData) return false;
    
    try {
        const session = JSON.parse(sessionData);
        return Date.now() < session.expires;
    } catch (e) {
        return false;
    }
}

// セッションを削除
function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
}

// ログイン処理
function handleLogin(e) {
    e.preventDefault();
    
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('loginError');
    
    if (!isPasswordSet()) {
        errorElement.textContent = 'パスワードが設定されていません。初回設定を行ってください。';
        errorElement.classList.remove('hidden');
        return;
    }
    
    if (verifyPassword(password)) {
        createSession();
        showMainApp();
        errorElement.classList.add('hidden');
    } else {
        errorElement.textContent = 'パスワードが正しくありません';
        errorElement.classList.remove('hidden');
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
    }
}

// パスワード設定処理
function handlePasswordSetup(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorElement = document.getElementById('setupError');
    
    // パスワードが既に設定されている場合、現在のパスワードを確認
    if (isPasswordSet()) {
        if (!verifyPassword(currentPassword)) {
            errorElement.textContent = '現在のパスワードが正しくありません';
            errorElement.classList.remove('hidden');
            return;
        }
    }
    
    // 新しいパスワードの検証
    if (newPassword.length < 4) {
        errorElement.textContent = 'パスワードは4文字以上で設定してください';
        errorElement.classList.remove('hidden');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        errorElement.textContent = 'パスワードが一致しません';
        errorElement.classList.remove('hidden');
        return;
    }
    
    // パスワードを設定
    setPassword(newPassword);
    createSession();
    
    alert('パスワードを設定しました！');
    showMainApp();
}

// ログアウト処理
function handleLogout() {
    if (confirm('ログアウトしますか？')) {
        clearSession();
        showLoginScreen();
    }
}

// メイン画面を表示
function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('passwordSetupScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    // カレンダーが初期化されていない場合は初期化
    if (!calendar) {
        initCalendar();
    }
}

// ログイン画面を表示
function showLoginScreen() {
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('passwordSetupScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    
    // フォームをリセット
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').classList.add('hidden');
}

// パスワード設定画面を表示
function showPasswordSetupScreen() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('passwordSetupScreen').classList.remove('hidden');
    
    const currentPasswordGroup = document.getElementById('currentPasswordGroup');
    const setupMessage = document.getElementById('setupMessage');
    const currentPasswordInput = document.getElementById('currentPassword');
    
    if (isPasswordSet()) {
        // パスワード変更モード
        currentPasswordGroup.classList.remove('hidden');
        currentPasswordInput.required = true;
        setupMessage.textContent = 'パスワードを変更します';
    } else {
        // 初回設定モード
        currentPasswordGroup.classList.add('hidden');
        currentPasswordInput.required = false;
        setupMessage.textContent = '新しいパスワードを設定してください';
    }
    
    // フォームをリセット
    document.getElementById('passwordSetupForm').reset();
    document.getElementById('setupError').classList.add('hidden');
}

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    // イベントリスナー設定
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('passwordSetupForm').addEventListener('submit', handlePasswordSetup);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('showPasswordSetup').addEventListener('click', showPasswordSetupScreen);
    document.getElementById('backToLogin').addEventListener('click', showLoginScreen);
    
    // セッション確認
    if (isSessionValid()) {
        showMainApp();
    } else {
        showLoginScreen();
    }
});