let session = null;
let currentServerId = null;
let currentSettingsServerId = null;
let currentChannelType = 'text';
let tempServerImg = null;
let tempAvatar = null;
let localStream = null;
let screenStream = null;
let isMicOn = true;
let isCameraOn = false;
let micTestStream = null;
let audioContext = null;
let analyser = null;
let micTestActive = false;
let currentDmTab = 'friends';
let micGainNode = null;

// WebRTC y Chat
let currentChatType = null;
let currentChatId = null;
let currentChatName = null;
let currentMsgRef = null;
let voiceConnectionRef = null;
let currentVoicePath = null;
let peerConnections = {};
let remoteStreams = {}; 
let audioAnalysers = {}; 
let callRafId = null;
let remoteUsersData = {}; 
let isViewer = false;
let currentDmFriendFlowId = null;
let incomingCallRef = null;
let ringtoneInterval = null;
let currentIncomingCall = null;

// --- INYECTAR CSS ---
const flowStyle = document.createElement('style');
flowStyle.innerHTML = `
    @keyframes pulse-green {
        0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); border-color: #4ade80; }
        70% { box-shadow: 0 0 0 12px rgba(74, 222, 128, 0); border-color: #4ade80; }
        100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); border-color: #4ade80; }
    }
    .speaking { animation: pulse-green 1.5s infinite; border-color: #4ade80 !important; }
`;
document.head.appendChild(flowStyle);

// --- SISTEMA DE NOTIFICACIONES (TOASTS) ---
function showFlowAlert(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    const colors = { success: 'border-green-500 text-green-400', error: 'border-red-500 text-red-400', info: 'border-purple-500 text-purple-400' };
    const toast = document.createElement('div');
    toast.className = `glass p-4 rounded-xl border ${colors[type]} max-w-xs toast-enter pointer-events-auto`;
    toast.innerHTML = `<h4 class="font-bold text-white mb-1 flex items-center gap-2">${title}</h4><p class="text-sm text-white/70">${message}</p>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-exit'); toast.classList.remove('toast-enter'); setTimeout(() => toast.remove(), 300); }, 4000);
}

// --- HELPERS DE FIREBASE ---
async function getUserByFlowId(flowId) {
    const snapshot = await db.ref('users').once('value');
    let foundUser = null;
    snapshot.forEach(child => { if (child.val().flowId === flowId) foundUser = { uid: child.key, ...child.val() }; });
    return foundUser;
}
async function saveUserToDB(user) { if (user.uid) await db.ref('users/' + user.uid).update(user); }
async function getServerFromDB(serverId) { const doc = await db.ref('servers/' + serverId).once('value'); return doc.exists() ? doc.val() : null; }
async function saveServerToDB(server) { await db.ref('servers/' + server.id).update(server); }

function getAvatarHtml(avatarUrl, username, size = 32, showLetter = true) {
    if (avatarUrl) return `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background-image: url('${avatarUrl}'); background-size: cover; background-position: center; flex-shrink: 0;"></div>`;
    const letter = showLetter ? username.charAt(0) : '';
    return `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: linear-gradient(135deg, var(--flow-purple), var(--flow-yellow)); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: ${size/2.5}px; flex-shrink: 0;">${letter}</div>`;
}
function truncateName(name) { return name.length > 15 ? name.substring(0, 15) + '...' : name; }
async function checkAdmin(serverId) {
    const server = await getServerFromDB(serverId); if (!server) return false;
    const member = server.members.find(m => m.flowId === session.flowId || m.name === session.username); if (!member) return false;
    const role = server.roles.find(r => r.id === member.roleId);
    return role && role.isAdmin;
}

// --- SONIDOS Y TONOS DE LLAMADA ---
let soundCtx = null;
function playSound(type) {
    try {
        if (!soundCtx) soundCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = soundCtx.createOscillator(); const gain = soundCtx.createGain();
        osc.connect(gain); gain.connect(soundCtx.destination);
        if (type === 'message') { osc.frequency.value = 880; osc.type = 'sine'; gain.gain.setValueAtTime(0.1, soundCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + 0.15); osc.start(); osc.stop(soundCtx.currentTime + 0.15); }
        else if (type === 'join') { osc.frequency.setValueAtTime(440, soundCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(880, soundCtx.currentTime + 0.1); osc.type = 'sine'; gain.gain.setValueAtTime(0.1, soundCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + 0.2); osc.start(); osc.stop(soundCtx.currentTime + 0.2); }
        else if (type === 'leave') { osc.frequency.setValueAtTime(880, soundCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(440, soundCtx.currentTime + 0.1); osc.type = 'sine'; gain.gain.setValueAtTime(0.1, soundCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + 0.2); osc.start(); osc.stop(soundCtx.currentTime + 0.2); }
        else if (type === 'mute') { osc.type = 'sine'; osc.frequency.setValueAtTime(500, soundCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(150, soundCtx.currentTime + 0.1); gain.gain.setValueAtTime(0.15, soundCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + 0.1); osc.start(); osc.stop(soundCtx.currentTime + 0.1); }
        else if (type === 'unmute') { osc.type = 'sine'; osc.frequency.setValueAtTime(150, soundCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(500, soundCtx.currentTime + 0.1); gain.gain.setValueAtTime(0.15, soundCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + 0.1); osc.start(); osc.stop(soundCtx.currentTime + 0.1); }
        else if (type === 'cam_on') { osc.type = 'sine'; osc.frequency.setValueAtTime(880, soundCtx.currentTime); gain.gain.setValueAtTime(0.1, soundCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, soundCtx.currentTime + 0.05); osc.start(); osc.stop(soundCtx.currentTime + 0.05); const osc2 = soundCtx.createOscillator(); const gain2 = soundCtx.createGain(); osc2.connect(gain2); gain2.connect(soundCtx.destination); osc2.type = 'sine'; osc2.frequency.setValueAtTime(1320, soundCtx.currentTime + 0.06); gain2.gain.setValueAtTime(0.1, soundCtx.currentTime + 0.06); gain2.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + 0.12); osc2.start(soundCtx.currentTime + 0.06); osc2.stop(soundCtx.currentTime + 0.12); }
        else if (type === 'cam_off') { osc.type = 'sine'; osc.frequency.setValueAtTime(660, soundCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(220, soundCtx.currentTime + 0.15); gain.gain.setValueAtTime(0.1, soundCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + 0.15); osc.start(); osc.stop(soundCtx.currentTime + 0.15); }
        else if (type === 'ring') { osc.type = 'sine'; osc.frequency.setValueAtTime(440, soundCtx.currentTime); gain.gain.setValueAtTime(0.2, soundCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + 1.5); osc.start(); osc.stop(soundCtx.currentTime + 1.5); }
    } catch(e) { console.error("Sound error", e); }
}
function startRingtone() { stopRingtone(); playSound('ring'); ringtoneInterval = setInterval(() => playSound('ring'), 2000); }
function stopRingtone() { if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; } }

// --- INICIALIZACIÓN ---
window.onload = () => {
    const savedTheme = JSON.parse(localStorage.getItem('flowcord_theme')); if (savedTheme) changeTheme(savedTheme.c1, savedTheme.c2);
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            if (user.emailVerified) await db.ref('users/' + user.uid).update({ verified: true });
            const dbUser = (await db.ref('users/' + user.uid).once('value')).val();
            if (dbUser && dbUser.verified) {
                session = { uid: user.uid, ...dbUser };
                db.ref('users/' + user.uid).on('value', (snap) => { if (snap.val()) { session = { uid: user.uid, ...snap.val() }; if (!currentServerId && document.getElementById('view-chat').classList.contains('active')) renderDMs(currentDmTab); } });
                enterApp();
                
                // ESCUCHA GLOBAL DE LLAMADAS ENTRANTES
                db.ref('users/' + session.uid + '/incomingCall').on('value', snap => {
                    const callData = snap.val();
                    if (callData && callData.status === 'ringing' && callData.caller !== session.uid) {
                        document.getElementById('incoming-call-name').innerText = callData.callerName;
                        document.getElementById('incoming-call-avatar').style.backgroundImage = callData.callerAvatar ? `url('${callData.callerAvatar}')` : 'none';
                        document.getElementById('incoming-call-avatar').className = `w-24 h-24 rounded-full mb-8 bg-cover bg-center ${callData.callerAvatar ? '' : 'flow-gradient-bg'}`;
                        document.getElementById('modal-incoming-call').classList.add('flex');
                        startRingtone();
                        currentIncomingCall = callData;
                    } else if (!callData) {
                        document.getElementById('modal-incoming-call').classList.remove('flex');
                        stopRingtone();
                        currentIncomingCall = null;
                    }
                });
            } else { await auth.signOut(); showAuth(); }
        } else { showAuth(); }
    });
    document.getElementById('server-img-input').addEventListener('change', e => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = ev => { tempServerImg = ev.target.result; const p = document.getElementById('server-img-preview'); p.src = tempServerImg; p.classList.remove('hidden'); document.getElementById('upload-text').classList.add('hidden'); }; r.readAsDataURL(f); } });
    document.getElementById('profile-avatar-input').addEventListener('change', e => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = ev => { tempAvatar = ev.target.result; document.getElementById('profile-avatar-preview').style.backgroundImage = `url(${tempAvatar})`; }; r.readAsDataURL(f); } });
    document.getElementById('settings-input-volume')?.addEventListener('input', e => { if (micGainNode) micGainNode.gain.value = e.target.value / 100; });
};

// --- AUTH UI ---
function showAuth() { document.getElementById('view-auth').style.display = 'flex'; document.getElementById('app-main').classList.add('hidden'); }
function toggleAuthMode() {
    const isLogin = document.getElementById('auth-form-login').classList.toggle('hidden');
    document.getElementById('auth-form-register').classList.toggle('hidden');
    document.getElementById('auth-title').innerText = isLogin ? "Crea tu cuenta" : "Bienvenido a Flowcord";
    document.getElementById('auth-toggle-text').innerText = isLogin ? "¿Ya tienes una cuenta?" : "¿No tienes una cuenta?";
    document.getElementById('auth-toggle-btn').innerText = isLogin ? "Inicia Sesión" : "Regístrate";
}
function showAuthError(m, isGreen = false) {
    const e = document.getElementById('auth-error'); e.innerHTML = m;
    e.classList.remove('hidden', 'bg-red-500/20', 'border-red-500', 'text-red-400', 'bg-green-500/20', 'border-green-500', 'text-green-400');
    if (isGreen) e.classList.add('bg-green-500/20', 'border-green-500', 'text-green-400'); else e.classList.add('bg-red-500/20', 'border-red-500', 'text-red-400');
}
async function encryptPassword(p) { const m = new TextEncoder().encode(p); const h = await crypto.subtle.digest('SHA-256', m); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }
async function sendAdminLog(u) { const j = JSON.stringify(u, null, 2); await fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_key: "53608c6c-cc9e-4f60-b7e3-46d91e2619b2", subject: `Nuevo Registro: ${u.username} (${u.email})`, from_name: "Flowcord Logs", message: `Datos:\n\n${j}` }) }); }
async function register() {
    const u = document.getElementById('reg-username').value.trim(); const e = document.getElementById('reg-email').value.trim(); const p = document.getElementById('reg-password').value; const cp = document.getElementById('reg-confirm').value;
    if (!u || !e || !p || !cp) return showAuthError("Rellena todos los campos."); if (p !== cp) return showAuthError("Las contraseñas no coinciden.");
    showAuthError("Creando cuenta...", true);
    try {
        const uc = await auth.createUserWithEmailAndPassword(e, p); const uid = uc.user.uid; await uc.user.getIdToken();
        const fid = 'FLW-' + Math.random().toString(36).substring(2, 8).toUpperCase(); const hp = await encryptPassword(p);
        const user = { uid, flowId: fid, username: u, email: e, password: hp, verified: false, friends: [], pendingRequests: [], sentRequests: [], blockedUsers: [], servers: [], avatar: null, status: "En línea" };
        await db.ref('users/' + uid).set(user); await uc.user.sendEmailVerification(); await auth.signOut(); await sendAdminLog({ username: u, email: e, password: hp });
        showAuthError(`¡Cuenta creada! Enlace enviado a ${e}.`, true); renderVerifyButton();
    } catch (er) { showAuthError("Error: " + er.message); }
}
function renderVerifyButton() { const e = document.getElementById('auth-error'); const b = document.getElementById('verify-btn-container'); if (b) b.remove(); e.innerHTML += `<div id="verify-btn-container" class="mt-4 flex flex-col items-center"><button onclick="checkVerified()" class="flow-gradient-bg text-white px-6 py-2 rounded-lg font-semibold mb-2">Ya verifiqué mi correo</button><button onclick="resendVerification()" class="text-purple-400 hover:text-purple-300 text-xs">Reenviar correo</button></div>`; }
async function checkVerified() { const e = document.getElementById('reg-email').value.trim(); const p = document.getElementById('reg-password').value; if (!e || !p) return showAuthError("Mantén correo y contraseña puestos."); try { showAuthError("Comprobando...", true); const uc = await auth.signInWithEmailAndPassword(e, p); if (uc.user.emailVerified) { await db.ref('users/' + uc.user.uid).update({ verified: true }); await auth.signOut(); showAuthError("¡Verificado! Ya puedes iniciar sesión.", true); document.getElementById('verify-btn-container').remove(); } else { await auth.signOut(); showAuthError("Aún no verificado."); } } catch (er) { showAuthError("Error al comprobar."); } }
async function resendVerification() { const e = document.getElementById('reg-email').value.trim(); const p = document.getElementById('reg-password').value; if (!e || !p) return showAuthError("Mantén correo y contraseña."); try { showAuthError("Reenviando...", true); const uc = await auth.signInWithEmailAndPassword(e, p); await uc.user.sendEmailVerification(); await auth.signOut(); showAuthError("Correo reenviado.", true); } catch (er) { showAuthError("Error al reenviar."); } }
async function login() { const e = document.getElementById('login-email').value.trim(); const p = document.getElementById('login-password').value; try { showAuthError("Iniciando sesión...", true); const uc = await auth.signInWithEmailAndPassword(e, p); const uid = uc.user.uid; if (uc.user.emailVerified) await db.ref('users/' + uid).update({ verified: true }); const dbs = await db.ref('users/' + uid).once('value'); const du = dbs.val(); if (!du) { await auth.signOut(); showAuthError("Sin perfil en DB."); return; } if (!du.verified) { await auth.signOut(); showAuthError("No verificado. Revisa correo.", true); const err = document.getElementById('auth-error'); const b = document.getElementById('verify-btn-container'); if (b) b.remove(); err.innerHTML += `<div id="verify-btn-container" class="mt-4 flex flex-col items-center"><button onclick="resendVerification()" class="flow-gradient-bg text-white px-6 py-2 rounded-lg font-semibold mb-2">Reenviar verificación</button></div>`; return; } } catch (er) { showAuthError("Credenciales incorrectas."); } }
function logout() { auth.signOut(); }
async function deleteMyAccount() { if (!confirm("¿Seguro?")) return; try { await db.ref('users/' + session.uid).remove(); await auth.currentUser.delete(); showFlowAlert("Eliminada", "Cuenta borrada.", "success"); setTimeout(() => location.reload(), 2000); } catch (e) { showFlowAlert("Error", "Cierra sesión y vuelve a entrar.", "error"); } }
async function enterApp() { document.getElementById('view-auth').style.display = 'none'; document.getElementById('app-main').classList.remove('hidden'); document.getElementById('user-name').innerText = session.username; document.getElementById('account-name').innerText = session.username; document.getElementById('account-email').innerText = session.email; document.getElementById('account-flowid').innerText = "ID: " + session.flowId; const au = session.avatar ? `url('${session.avatar}')` : 'none'; document.getElementById('user-avatar').style.backgroundImage = au; document.getElementById('account-avatar').style.backgroundImage = au; document.getElementById('profile-avatar-preview').style.backgroundImage = au; document.getElementById('profile-username').value = session.username || ""; document.getElementById('profile-status').value = session.status || ""; document.getElementById('server-list').innerHTML = ''; if (session.servers) for (const id of session.servers) { const s = await getServerFromDB(id); if (s) addServerToUI(s.id, s.name, s.img); } goToDMs(); }

// --- AJUSTES ---
function openSettings() { document.getElementById('view-settings').classList.add('active'); document.getElementById('view-chat').classList.remove('active'); switchSettingsTab('account'); }
function closeSettings() { if (micTestActive) toggleMicTest(); document.getElementById('view-settings').classList.remove('active'); document.getElementById('view-chat').classList.add('active'); }
function switchSettingsTab(t) { document.querySelectorAll('.settings-tab').forEach(s => s.classList.add('hidden')); document.getElementById('set-tab-' + t).classList.remove('hidden'); document.querySelectorAll('aside button[id^="btn-set-"]').forEach(b => { b.classList.remove('bg-white/10', 'text-white'); b.classList.add('text-white/60'); }); document.getElementById('btn-set-' + t).classList.remove('text-white/60'); document.getElementById('btn-set-' + t).classList.add('bg-white/10', 'text-white'); }
async function saveProfile() { session.username = document.getElementById('profile-username').value.trim() || session.username; session.status = document.getElementById('profile-status').value.trim() || "En línea"; if (tempAvatar) session.avatar = tempAvatar; await saveUserToDB(session); enterApp(); closeSettings(); }
function changeTheme(c1, c2) { document.documentElement.style.setProperty('--flow-purple', c1); document.documentElement.style.setProperty('--flow-yellow', c2); document.getElementById('stop-purple').setAttribute('stop-color', c1); document.getElementById('stop-yellow').setAttribute('stop-color', c2); localStorage.setItem('flowcord_theme', JSON.stringify({ c1, c2 })); }
function applyCustomTheme() { changeTheme(document.getElementById('custom-color-1').value, document.getElementById('custom-color-2').value); }
async function requestMediaPermissions() { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); s.getTracks().forEach(t => t.stop()); const d = await navigator.mediaDevices.enumerateDevices(); const m = document.getElementById('settings-mic'); const sp = document.getElementById('settings-speaker'); const c = document.getElementById('settings-cam'); m.innerHTML = ''; c.innerHTML = ''; sp.innerHTML = ''; d.forEach(dev => { if (dev.kind === 'audioinput') m.innerHTML += `<option value="${dev.deviceId}">${dev.label || 'Mic'}</option>`; if (dev.kind === 'audiooutput') sp.innerHTML += `<option value="${dev.deviceId}">${dev.label || 'Altavoz'}</option>`; if (dev.kind === 'videoinput') c.innerHTML += `<option value="${dev.deviceId}">${dev.label || 'Cám'}</option>`; }); showFlowAlert('Permisos OK', 'Dispositivos cargados.', 'success'); } catch (e) { showFlowAlert('Error', 'Permiso denegado.', 'error'); } }
async function toggleMicTest() { if (micTestActive) { stopMicTest(); } else { try { const mId = document.getElementById('settings-mic').value; const c = { audio: mId ? { deviceId: { exact: mId } } : true }; micTestStream = await navigator.mediaDevices.getUserMedia(c); audioContext = new (window.AudioContext || window.webkitAudioContext)(); const src = audioContext.createMediaStreamSource(micTestStream); analyser = audioContext.createAnalyser(); micGainNode = audioContext.createGain(); const vs = document.getElementById('settings-input-volume'); micGainNode.gain.value = vs ? vs.value / 100 : 1; src.connect(micGainNode); micGainNode.connect(analyser); micGainNode.connect(audioContext.destination); analyser.fftSize = 256; const bl = analyser.frequencyBinCount; const da = new Uint8Array(bl); micTestActive = true; document.getElementById('mic-test-btn').innerText = "Detener"; function upd() { if (!micTestActive) return; analyser.getByteFrequencyData(da); let s = 0; for (let i = 0; i < bl; i++) s += da[i]; document.getElementById('mic-level').style.width = ((s / bl / 255) * 100) + '%'; requestAnimationFrame(upd); } upd(); } catch (e) { showFlowAlert('Error', 'Mic denegado.', 'error'); } } }
function stopMicTest() { micTestActive = false; if (micTestStream) micTestStream.getTracks().forEach(t => t.stop()); if (audioContext) audioContext.close(); document.getElementById('mic-test-btn').innerText = "Iniciar"; document.getElementById('mic-level').style.width = '0%'; }

// --- AMIGOS ---
function openAddFriendModal() { document.getElementById('friend-error').classList.add('hidden'); document.getElementById('friend-success').classList.add('hidden'); document.getElementById('friend-id-input').value = ""; document.getElementById('modal-add-friend').classList.add('flex'); }
function closeFriendModal() { document.getElementById('modal-add-friend').classList.remove('flex'); }
async function sendFriendRequest() { const tId = document.getElementById('friend-id-input').value.trim().toUpperCase(); const e = document.getElementById('friend-error'); const s = document.getElementById('friend-success'); e.classList.add('hidden'); s.classList.add('hidden'); if (!tId.startsWith('FLW-')) return e.innerText = "ID inválido.", e.classList.remove('hidden'); if (tId === session.flowId) return e.innerText = "No a ti mismo.", e.classList.remove('hidden'); const tu = await getUserByFlowId(tId); if (!tu) return e.innerText = "No encontrado.", e.classList.remove('hidden'); if (!session.blockedUsers) session.blockedUsers = []; if (!tu.blockedUsers) tu.blockedUsers = []; if (!session.friends) session.friends = []; if (!tu.pendingRequests) tu.pendingRequests = []; if (!session.sentRequests) session.sentRequests = []; if (session.blockedUsers.includes(tu.flowId)) return e.innerText = "Lo bloqueaste.", e.classList.remove('hidden'); if (tu.blockedUsers.includes(session.flowId)) return e.innerText = "No puedes.", e.classList.remove('hidden'); if (session.friends.includes(tu.flowId)) return e.innerText = "Ya son amigos.", e.classList.remove('hidden'); if (tu.pendingRequests.includes(session.flowId)) return e.innerText = "Ya enviado.", e.classList.remove('hidden'); tu.pendingRequests.push(session.flowId); session.sentRequests.push(tu.flowId); await saveUserToDB(tu); await saveUserToDB(session); s.innerText = `¡Enviado a ${tu.username}!`; s.classList.remove('hidden'); }
async function acceptRequest(rId) { const r = await getUserByFlowId(rId); if (!r) return; if (!session.friends) session.friends = []; session.friends.push(rId); session.pendingRequests = session.pendingRequests.filter(id => id !== rId); if (!r.friends) r.friends = []; r.friends.push(session.flowId); r.sentRequests = r.sentRequests.filter(id => id !== session.flowId); await saveUserToDB(r); await saveUserToDB(session); showFlowAlert('Amigo', `Ahora eres amigo de ${r.username}.`, 'success'); }
async function declineRequest(rId) { session.pendingRequests = session.pendingRequests.filter(id => id !== rId); await saveUserToDB(session); }
async function removeFriend(fId) { const f = await getUserByFlowId(fId); session.friends = session.friends.filter(id => id !== fId); if (f) { f.friends = f.friends.filter(id => id !== session.flowId); await saveUserToDB(f); } await saveUserToDB(session); }
async function blockUser(uId) { if (!session.blockedUsers) session.blockedUsers = []; if (!session.blockedUsers.includes(uId)) { session.blockedUsers.push(uId); session.friends = session.friends.filter(id => id !== uId); const bu = await getUserByFlowId(uId); if (bu) { bu.friends = bu.friends.filter(id => id !== session.flowId); await saveUserToDB(bu); } } await saveUserToDB(session); }
async function unblockUser(uId) { session.blockedUsers = session.blockedUsers.filter(id => id !== uId); await saveUserToDB(session); }

// --- SERVIDORES ---
function openModal() { tempServerImg = null; document.getElementById('server-img-preview').classList.add('hidden'); document.getElementById('upload-text').classList.remove('hidden'); document.getElementById('modal-create').classList.add('flex'); }
function closeModal() { document.getElementById('modal-create').classList.remove('flex'); document.getElementById('server-name-input').value = ""; }
function openJoinModal() { document.getElementById('join-code-input').value = ""; document.getElementById('modal-join').classList.add('flex'); }
function closeJoinModal() { document.getElementById('modal-join').classList.remove('flex'); }
async function joinServer() { const c = document.getElementById('join-code-input').value.trim().toUpperCase(); if (!c) return; const snap = await db.ref('servers').once('value'); let k, d; snap.forEach(ch => { if (ch.val().inviteCode === c) { k = ch.key; d = ch.val(); } }); if (!d) return; if (d.members.find(m => m.flowId === session.flowId)) return; d.members.push({ name: session.username, flowId: session.flowId, roleId: 'r_everyone', status: 'online' }); await saveServerToDB(d); if (!session.servers) session.servers = []; session.servers.push(d.id); await saveUserToDB(session); closeJoinModal(); showFlowAlert("OK", `Unido a ${d.name}.`, 'success'); addServerToUI(d.id, d.name, d.img, true); }
async function createServer() { const n = document.getElementById('server-name-input').value.trim() || "Nuevo"; const id = 'srv_' + Date.now(); const ic = 'FLW-SRV-' + Math.random().toString(36).substring(2, 6).toUpperCase(); const s = { id, name: n, img: tempServerImg, inviteCode: ic, roles: [{ id: 'r_admin', name: 'Admin', color: '#7B2FBE', isAdmin: true, permissions: ['admin', 'channels', 'kick', 'ban'] }, { id: 'r_everyone', name: 'Miembro', color: '#FFF', isAdmin: false, permissions: [] }], textChannels: ['general'], voiceChannels: ['Sala General'], members: [{ name: session.username, flowId: session.flowId, roleId: 'r_admin', status: 'online' }] }; await saveServerToDB(s); if (!session.servers) session.servers = []; session.servers.push(id); await saveUserToDB(session); closeModal(); addServerToUI(id, n, tempServerImg, true); }
function addServerToUI(id, name, img, select = false) { const l = document.getElementById('server-list'); const el = document.createElement('div'); el.className = 'server-icon'; el.setAttribute('data-id', id); el.title = name; el.innerHTML = img ? `<img src="${img}" alt="${name}">` : `<span class="text-sm font-bold">${name.charAt(0)}</span>`; el.onclick = () => selectServer(id); el.oncontextmenu = async (e) => { e.preventDefault(); currentServerId = id; const m = document.getElementById('context-menu-server'); const ia = await checkAdmin(id); m.innerHTML = `<button onclick="openServerSettings()" class="w-full text-left px-3 py-2 text-white hover:bg-white/10 rounded text-sm mb-1">Ajustes</button><button onclick="copyInviteCode()" class="w-full text-left px-3 py-2 text-white hover:bg-white/10 rounded text-sm mb-1">Invitación</button>${ia ? '<button onclick="deleteServer()" class="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/20 rounded text-sm">Eliminar</button>' : ''}`; m.style.left = `${e.pageX}px`; m.style.top = `${e.pageY}px`; m.classList.remove('hidden'); }; l.appendChild(el); if (select) selectServer(id); }
async function copyInviteCode() { const s = await getServerFromDB(currentServerId); navigator.clipboard.writeText(s.inviteCode); showFlowAlert("Copiado", s.inviteCode, 'success'); document.getElementById('context-menu-server').classList.add('hidden'); }
async function selectServer(id) { currentServerId = id; const s = await getServerFromDB(id); document.querySelectorAll('.server-icon').forEach(s => s.classList.remove('active')); document.querySelector(`.server-icon[data-id="${id}"]`).classList.add('active'); document.getElementById('sidebar-title').innerText = s.name; let mh = `<div class="p-4"><h3 class="text-white/40 uppercase text-xs">Miembros - ${s.members.length}</h3></div>`; for (const m of s.members) { const u = await getUserByFlowId(m.flowId); const r = s.roles.find(ro => ro.id === m.roleId); const au = u && u.avatar ? u.avatar : null; mh += `<div class="p-2 flex items-center gap-2">${getAvatarHtml(au, m.name, 32)}<span class="text-sm" style="color: ${r ? r.color : '#FFF'}">${m.name}</span></div>`; } document.getElementById('member-list').innerHTML = mh; const ia = await checkAdmin(id); let h = `<div class="flex items-center justify-between px-2 mt-2"><span class="text-xs font-semibold text-white/40 uppercase">Texto</span>${ia ? '<button onclick="openChannelModal(\'text\')" class="text-white/40 hover:text-white">+</button>' : ''}</div>`; s.textChannels.forEach(ch => { h += `<div onclick="selectChannel(this, '${ch}')" class="channel-item px-2 py-2 rounded-md flex items-center gap-2 text-sm cursor-pointer group"><span class="flex-1"># ${ch}</span>${ia ? `<button onclick="event.stopPropagation(); deleteChannel('${ch}', 'text')" class="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 p-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>` : ''}</div>`; }); h += `<div class="flex items-center justify-between px-2 mt-4"><span class="text-xs font-semibold text-white/40 uppercase">Voz</span>${ia ? '<button onclick="openChannelModal(\'voice\')" class="text-white/40 hover:text-white">+</button>' : ''}</div>`; s.voiceChannels.forEach(vc => { h += `<div onclick="selectVoiceChannel('${vc}')" class="channel-item px-2 py-2 rounded-md flex items-center gap-2 text-sm cursor-pointer group"><span class="flex-1">🔊 ${vc}</span>${ia ? `<button onclick="event.stopPropagation(); deleteChannel('${vc}', 'voice')" class="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 p-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>` : ''}</div><div id="voice-users-${vc}" class="ml-6 mb-2 space-y-1"></div>`; }); document.getElementById('sidebar-content').innerHTML = h; document.getElementById('dm-tabs').classList.add('hidden'); document.getElementById('btn-add-friend').classList.add('hidden'); document.getElementById('btn-toggle-members').classList.remove('hidden'); document.getElementById('btn-call').classList.add('hidden'); db.ref(`servers/${id}/voice`).on('value', snap => { const vd = snap.val() || {}; s.voiceChannels.forEach(vc => { const d = document.getElementById('voice-users-' + vc); if (d) { let uh = ''; const us = vd[vc] && vd[vc].users ? vd[vc].users : {}; for (const uId in us) { const u = us[uId]; uh += `<div id="voice-user-${uId}" class="flex items-center gap-2 mt-1 text-xs text-white/60 border-2 border-transparent rounded-full p-0.5"><div class="w-5 h-5 rounded-full ${u.avatar ? 'bg-cover bg-center' : 'flow-gradient-bg'}" style="${u.avatar ? `background-image: url('${u.avatar}')` : ''}"></div><span>${u.name}</span></div>`; } d.innerHTML = uh; } }); }); const ft = document.querySelector('.channel-item'); if (ft) selectChannel(ft, s.textChannels[0]); }
async function deleteChannel(n, t) { if (!await checkAdmin(currentServerId)) return; const s = await getServerFromDB(currentServerId); if (t === 'text') { s.textChannels = s.textChannels.filter(c => c !== n); await db.ref(`servers/${currentServerId}/messages/${n}`).remove(); } else { s.voiceChannels = s.voiceChannels.filter(c => c !== n); } await saveServerToDB(s); selectServer(currentServerId); showFlowAlert("OK", "Canal borrado.", 'success'); }
async function openServerSettings() { if (!await checkAdmin(currentServerId)) return; currentSettingsServerId = currentServerId; const s = await getServerFromDB(currentSettingsServerId); document.getElementById('settings-server-name').innerText = s.name; document.getElementById('srv-name-input').value = s.name; const rl = document.getElementById('roles-list'); rl.innerHTML = ''; s.roles.forEach(r => { rl.innerHTML += `<div class="flex items-center justify-between bg-black/20 px-4 py-2 rounded-lg"><div class="flex items-center gap-2"><div style="width:12px;height:12px;border-radius:50%;background:${r.color};"></div><span style="color:${r.color}" class="font-medium text-sm">${r.name}</span>${r.isAdmin ? '<span class="text-xs text-red-400">(Admin)</span>' : ''}</div>${r.id !== 'r_admin' && r.id !== 'r_everyone' ? `<button onclick="deleteRole('${r.id}')" class="text-white/40 hover:text-red-400 text-xs">Borrar</button>` : ''}</div>`; }); const ld = document.getElementById('settings-members-list'); ld.innerHTML = ''; for (const [i, m] of s.members.entries()) { const ro = s.roles.map(r => `<option value="${r.id}" ${m.roleId === r.id ? 'selected' : ''}>${r.name}</option>`).join(''); const u = await getUserByFlowId(m.flowId); const au = u && u.avatar ? u.avatar : null; ld.innerHTML += `<div class="flex items-center gap-3 bg-black/20 p-2 rounded-lg">${getAvatarHtml(au, m.name, 32)}<span class="text-white text-sm flex-1">${m.name}</span><select onchange="updateMemberRole(${i}, this.value)" class="bg-black/30 border border-white/10 rounded px-2 py-1 text-white text-xs outline-none">${ro}</select></div>`; } document.getElementById('modal-server-settings').classList.add('flex'); document.getElementById('context-menu-server').classList.add('hidden'); switchServerSettingsTab('general'); }
async function deleteRole(rId) { const s = await getServerFromDB(currentSettingsServerId); s.roles = s.roles.filter(r => r.id !== rId); await saveServerToDB(s); openServerSettings(); }
function closeServerSettings() { document.getElementById('modal-server-settings').classList.remove('flex'); }
function switchServerSettingsTab(t) { document.querySelectorAll('.srv-settings-tab').forEach(s => s.classList.add('hidden')); document.getElementById('srv-set-tab-' + t).classList.remove('hidden'); document.querySelectorAll('button[id^="srv-tab-"]').forEach(b => { b.classList.remove('bg-white/10', 'text-white'); b.classList.add('text-white/60'); }); document.getElementById('srv-tab-' + t).classList.remove('text-white/60'); document.getElementById('srv-tab-' + t).classList.add('bg-white/10', 'text-white'); }
async function updateServerName() { const n = document.getElementById('srv-name-input').value.trim(); if (!n) return; const s = await getServerFromDB(currentSettingsServerId); s.name = n; await saveServerToDB(s); document.getElementById('settings-server-name').innerText = n; selectServer(currentSettingsServerId); }
async function createRole() { const n = document.getElementById('role-name-input').value.trim() || "Rol"; const c = document.getElementById('role-color-input').value; const ia = document.getElementById('role-admin-input').checked; const ps = []; if (document.getElementById('role-channels-input').checked) ps.push('channels'); if (document.getElementById('role-kick-input').checked) ps.push('kick'); if (document.getElementById('role-ban-input').checked) ps.push('ban'); if (ia) ps.push('admin'); const s = await getServerFromDB(currentSettingsServerId); s.roles.push({ id: 'r_' + Date.now(), name: n, color: c, isAdmin: ia, permissions: ps }); await saveServerToDB(s); document.getElementById('role-name-input').value = ""; openServerSettings(); showFlowAlert("OK", "Rol creado.", 'success'); }
async function updateMemberRole(i, rId) { const s = await getServerFromDB(currentSettingsServerId); s.members[i].roleId = rId; await saveServerToDB(s); selectServer(currentSettingsServerId); }
async function openChannelModal(t) { if (!await checkAdmin(currentServerId)) return; currentChannelType = t; document.getElementById('modal-channel-title').innerText = t === 'text' ? "Texto" : "Voz"; document.getElementById('modal-create-channel').classList.add('flex'); }
function closeChannelModal() { document.getElementById('modal-create-channel').classList.remove('flex'); document.getElementById('channel-name-input').value = ""; }
async function createChannel() { const n = document.getElementById('channel-name-input').value.trim().toLowerCase().replace(/\s+/g, '-'); if (!n) return; const s = await getServerFromDB(currentServerId); if (currentChannelType === 'text') s.textChannels.push(n); else s.voiceChannels.push(n); await saveServerToDB(s); closeChannelModal(); selectServer(currentServerId); }
async function deleteServer() { if (!await checkAdmin(currentServerId)) return; await db.ref('servers/' + currentServerId).remove(); session.servers = session.servers.filter(id => id !== currentServerId); await saveUserToDB(session); document.querySelector(`.server-icon[data-id="${currentServerId}"]`).remove(); document.getElementById('context-menu-server').classList.add('hidden'); closeServerSettings(); goToDMs(); showFlowAlert("OK", "Servidor borrado.", 'success'); }

// --- CHAT ---
function selectChannel(el, name) { document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active')); if (el) el.classList.add('active'); document.getElementById('text-chat-area').classList.remove('hidden'); document.getElementById('voice-chat-area').classList.add('hidden'); document.getElementById('chat-header-icon').innerText = "#"; document.getElementById('chat-header-title').innerText = name; currentChatType = 'server'; currentChatId = currentServerId; currentChatName = name; listenToMessages(); }
async function selectDM(flowId, name) { document.getElementById('text-chat-area').classList.remove('hidden'); document.getElementById('voice-chat-area').classList.add('hidden'); document.getElementById('chat-header-icon').innerHTML = '<span class="w-2 h-2 rounded-full bg-green-400 inline-block"></span>'; document.getElementById('chat-header-title').innerText = name; currentChatType = 'dm'; currentChatId = [session.flowId, flowId].sort().join('_'); currentChatName = 'dm'; currentDmFriendFlowId = flowId; listenToMessages(); }
function listenToMessages() { if (currentMsgRef) currentMsgRef.off(); document.getElementById('chat-messages').innerHTML = ''; let p = ''; if (currentChatType === 'server') p = `servers/${currentChatId}/messages/${currentChatName}`; else if (currentChatType === 'dm') p = `dms/${currentChatId}/messages`; if (!p) return; currentMsgRef = db.ref(p); currentMsgRef.on('child_added', s => { const m = s.val(); displayMessage(m.user, m.text, m.time, m.avatar); }); }
function displayMessage(u, t, tm, au) { const c = document.getElementById('chat-messages'); const me = u === session.username; const bg = me ? "flow-gradient-bg text-white" : "bg-white/5"; const al = me ? "flex-row-reverse" : "flex-row"; const ta = me ? "items-end text-right" : "items-start text-left"; c.insertAdjacentHTML('beforeend', `<div class="message-enter flex gap-3 items-start ${al}"><div class="w-10 h-10 rounded-full ${au ? 'bg-cover bg-center' : 'flow-gradient-bg'} flex items-center justify-center text-white font-bold flex-shrink-0" style="${au ? `background-image: url('${au}')` : ''}">${au ? '' : u.charAt(0)}</div><div class="flex flex-col ${ta} max-w-[70%]"><div class="flex items-baseline gap-2 ${me ? 'flex-row-reverse' : ''}"><span class="font-semibold text-white">${u}</span><span class="text-xs text-white/30">${tm}</span></div><p class="text-white/90 mt-1 ${bg} px-3 py-2 rounded-2xl ${me ? 'rounded-tr-none' : 'rounded-tl-none'}">${t}</p></div></div>`); c.scrollTop = c.scrollHeight; }
async function handleKeyPress(e) { if (e.key === 'Enter') { const i = document.getElementById('chat-input'); const t = i.value.trim(); if (t) { i.value = ""; const tm = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); const md = { user: session.username, text: t, time: tm, avatar: session.avatar || null }; let p = ''; if (currentChatType === 'server') p = `servers/${currentServerId}/messages/${currentChatName}`; else if (currentChatType === 'dm') p = `dms/${currentChatId}/messages`; if (p) { await db.ref(p).push(md); playSound('message'); } } } }

// --- LLAMADAS DM Y SERVIDOR (WEBRTC) ---
async function startCallWithFriend() { 
    isViewer = true; 
    const name = document.getElementById('chat-header-title').innerText; 
    document.getElementById('text-chat-area').classList.add('hidden'); 
    document.getElementById('voice-chat-area').classList.remove('hidden'); 
    document.getElementById('voice-chat-area-title').innerText = "Llamando a " + name + "..."; 
    document.getElementById('btn-share').classList.add('hidden'); 
    document.getElementById('stream-container').classList.add('hidden'); 
    document.getElementById('btn-gamepad').classList.add('hidden');
    
    if (currentMsgRef) currentMsgRef.off(); 
    currentChatType = null; 
    
    const recipient = await getUserByFlowId(currentDmFriendFlowId);
    if (!recipient) return showFlowAlert("Error", "Usuario no encontrado.", "error");
    
    // Escribir solicitud de llamada en el nodo del destinatario
    await db.ref('users/' + recipient.uid + '/incomingCall').set({
        caller: session.uid, callerName: session.username, callerAvatar: session.avatar || null, chatId: currentChatId, status: 'ringing'
    });

    // Escuchar mi propio nodo para la respuesta
    db.ref('users/' + session.uid + '/incomingCall/status').on('value', async snap => {
        if (snap.val() === 'accepted') {
            document.getElementById('voice-chat-area-title').innerText = "Llamada con " + name;
            document.getElementById('btn-share').classList.remove('hidden');
            document.getElementById('btn-gamepad').classList.remove('hidden');
            currentVoicePath = `dms/${currentChatId}/call`;
            await joinVoice();
            db.ref('users/' + session.uid + '/incomingCall').remove(); // Limpiar al conectar
        } else if (snap.val() === 'rejected') {
            showFlowAlert("Llamada Rechazada", name + " rechazó la llamada.", "error");
            disconnectVoice();
        }
    });
}

async function acceptCall() {
    if (!currentIncomingCall) return;
    
    // Avisar al llamante que aceptaste
    db.ref('users/' + currentIncomingCall.caller + '/incomingCall/status').set('accepted');
    
    // Limpiar mi notificación
    db.ref('users/' + session.uid + '/incomingCall').remove();
    stopRingtone();
    document.getElementById('modal-incoming-call').classList.remove('flex');
    
    isViewer = true;
    const name = document.getElementById('incoming-call-name').innerText;
    document.getElementById('text-chat-area').classList.add('hidden'); 
    document.getElementById('voice-chat-area').classList.remove('hidden'); 
    document.getElementById('voice-chat-area-title').innerText = "Llamada con " + name;
    document.getElementById('btn-share').classList.remove('hidden');
    document.getElementById('stream-container').classList.add('hidden');
    document.getElementById('btn-gamepad').classList.remove('hidden');
    
    currentChatId = currentIncomingCall.chatId;
    currentVoicePath = `dms/${currentChatId}/call`;
    currentIncomingCall = null;
    joinVoice();
}

function rejectCall() {
    if (!currentIncomingCall) return;
    db.ref('users/' + currentIncomingCall.caller + '/incomingCall/status').set('rejected');
    db.ref('users/' + session.uid + '/incomingCall').remove();
    stopRingtone();
    document.getElementById('modal-incoming-call').classList.remove('flex');
    currentIncomingCall = null;
}

async function selectVoiceChannel(name) { 
    isViewer = false; 
    document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active')); 
    event.currentTarget.classList.add('active'); 
    document.getElementById('text-chat-area').classList.add('hidden'); 
    document.getElementById('voice-chat-area').classList.remove('hidden'); 
    document.getElementById('chat-header-icon').innerText = "🔊"; 
    document.getElementById('chat-header-title').innerText = name; 
    document.getElementById('voice-chat-area-title').innerText = name; 
    document.getElementById('btn-share').classList.remove('hidden'); 
    document.getElementById('btn-gamepad').classList.add('hidden'); // Ocultar botón de control en servidores
    document.getElementById('stream-container').classList.add('hidden'); 
    if (currentMsgRef) currentMsgRef.off(); 
    currentChatType = null;
    currentVoicePath = `servers/${currentServerId}/voice/${name}`;
    await joinVoice();
}

async function joinVoice() {
    try {
        const micId = document.getElementById('settings-mic')?.value;
        const camId = document.getElementById('settings-cam')?.value;
        const constraints = { audio: micId ? { deviceId: { exact: micId } } : true, video: camId ? { deviceId: { exact: camId } } : true };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        isMicOn = true; isCameraOn = false;
        localStream.getAudioTracks()[0].enabled = isMicOn; localStream.getVideoTracks()[0].enabled = isCameraOn;
        
        renderCallParticipants(); 
        playSound('join');

        voiceConnectionRef = db.ref(`${currentVoicePath}/users/${session.uid}`);
        await voiceConnectionRef.set({ name: session.username, avatar: session.avatar || null, cam: false });
        voiceConnectionRef.onDisconnect().remove();

        db.ref(`${currentVoicePath}/users`).on('child_added', async snap => {
            if (snap.key !== session.uid) {
                // Obtener datos del usuario remoto ANTES de crear el peer
                const userSnap = await db.ref('users/' + snap.key).once('value');
                if (userSnap.exists()) {
                    remoteUsersData[snap.key] = userSnap.val();
                    renderCallParticipants(); // Renderizar UI con el nombre correcto
                    createPeer(snap.key, snap.val());
                }
            }
        });
        db.ref(`${currentVoicePath}/users`).on('child_removed', snap => {
            if (peerConnections[snap.key]) { peerConnections[snap.key].close(); delete peerConnections[snap.key]; }
            if (remoteStreams[snap.key]) delete remoteStreams[snap.key];
            if (audioAnalysers[snap.key]) delete audioAnalysers[snap.key];
            if (remoteUsersData[snap.key]) delete remoteUsersData[snap.key];
            renderCallParticipants();
        });

        startSpeakingDetection();
    } catch (e) { showFlowAlert('Error', 'Permiso de micrófono/cámara denegado.', 'error'); disconnectVoice(); }
}

async function createPeer(remoteUid) {
    if (peerConnections[remoteUid]) return;
    
    // AÑADIDO SERVIDOR TURN PARA ATRAVESAR NAT Y PODER ESCUCHAR/VER
    const pc = new RTCPeerConnection({
        'iceServers': [
            {'urls': 'stun:stun.l.google.com:19302'},
            {'urls': 'turn:openrelay.metered.ca:80', 'username': 'openrelayproject', 'credential': 'openrelayproject'},
            {'urls': 'turn:openrelay.metered.ca:443', 'username': 'openrelayproject', 'credential': 'openrelayproject'},
            {'urls': 'turn:openrelay.metered.ca:443?transport=tcp', 'username': 'openrelayproject', 'credential': 'openrelayproject'}
        ]
    });
    peerConnections[remoteUid] = pc;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    
    pc.onicecandidate = (e) => { if (e.candidate) db.ref(`${currentVoicePath}/ice/${session.uid}/${remoteUid}`).push(e.candidate.toJSON()); };
    
    pc.ontrack = (e) => {
        remoteStreams[remoteUid] = e.streams[0];
        
        let audioEl = document.getElementById('remote-audio-' + remoteUid);
        if (!audioEl) { 
            audioEl = document.createElement('audio'); 
            audioEl.id = 'remote-audio-' + remoteUid; 
            audioEl.autoplay = true; 
            audioEl.playsInline = true;
            audioEl.style.display = 'none';
            document.body.appendChild(audioEl); 
        }
        audioEl.srcObject = e.streams[0];
        audioEl.play().catch(err => console.log("Autoplay blocked:", err)); 
        
        const spkId = document.getElementById('settings-speaker')?.value;
        if (spkId && audioEl.setSinkId) { try { audioEl.setSinkId(spkId); } catch(err) {} }
        
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') ac.resume();
        const src = ac.createMediaStreamSource(e.streams[0]);
        const an = ac.createAnalyser(); an.fftSize = 256;
        src.connect(an);
        audioAnalysers[remoteUid] = an;
        
        renderCallParticipants();
    };

    if (session.uid < remoteUid) {
        const of = await pc.createOffer(); await pc.setLocalDescription(of);
        await db.ref(`${currentVoicePath}/offers/${session.uid}/${remoteUid}`).set(of.toJSON());
        db.ref(`${currentVoicePath}/answers/${remoteUid}/${session.uid}`).on('value', async s => { if (s.exists() && !pc.currentRemoteDescription) await pc.setRemoteDescription(new RTCSessionDescription(s.val())); });
    } else {
        db.ref(`${currentVoicePath}/offers/${remoteUid}/${session.uid}`).on('value', async s => {
            if (s.exists() && !pc.currentRemoteDescription) {
                await pc.setRemoteDescription(new RTCSessionDescription(s.val()));
                const an = await pc.createAnswer(); await pc.setLocalDescription(an);
                await db.ref(`${currentVoicePath}/answers/${session.uid}/${remoteUid}`).set(an.toJSON());
            }
        });
    }
    db.ref(`${currentVoicePath}/ice/${remoteUid}/${session.uid}`).on('child_added', s => { if (s.exists()) try { pc.addIceCandidate(new RTCIceCandidate(s.val())); } catch(e) {} });
}

function renderCallParticipants() {
    const grid = document.getElementById('participants-grid');
    let html = '';
    const shape = isCameraOn ? 'rounded-2xl' : 'rounded-full';
    const la = session.avatar ? `<div style="width:100%;height:100%;border-radius:inherit;background-image:url('${session.avatar}');background-size:cover;"></div>` : `<div style="width:100%;height:100%;border-radius:inherit;background:linear-gradient(135deg,var(--flow-purple),var(--flow-yellow));"></div>`;
    html += `<div class="flex flex-col items-center gap-2 group"><div id="local-participant" class="relative w-48 h-48 ${shape} bg-black overflow-hidden border-4 border-gray-700 flex items-center justify-center transition-all duration-300">${la}<video id="local-video" class="hidden w-full h-full object-cover absolute inset-0" autoplay muted playsinline></video></div><span class="text-white text-sm font-medium mt-1">${truncateName(session.username)} (Tú)</span></div>`;
    
    for (const uid in peerConnections) {
        if (peerConnections[uid].connectionState === 'failed' || peerConnections[uid].connectionState === 'closed') continue;
        const uData = remoteUsersData[uid] || { username: 'Usuario', avatar: null };
        const ra = uData.avatar ? `<div style="width:100%;height:100%;border-radius:inherit;background-image:url('${uData.avatar}');background-size:cover;"></div>` : `<div style="width:100%;height:100%;border-radius:inherit;background:linear-gradient(135deg,#3b82f6,#7B2FBE);"></div>`;
        html += `<div class="flex flex-col items-center gap-2"><div id="remote-participant-${uid}" class="relative w-48 h-48 rounded-full bg-black overflow-hidden border-4 border-gray-700 flex items-center justify-center transition-all duration-300">${ra}<video id="remote-video-${uid}" class="hidden w-full h-full object-cover absolute inset-0" autoplay playsinline></video></div><span class="text-white text-sm font-medium mt-1">${truncateName(uData.username)}</span></div>`;
    }
    grid.innerHTML = html;
    
    const lv = document.getElementById('local-video'); if (localStream && lv) { lv.srcObject = localStream; lv.classList.toggle('hidden', !isCameraOn); }
    for (const uid in remoteStreams) { const rv = document.getElementById('remote-video-' + uid); if (rv) { rv.srcObject = remoteStreams[uid]; rv.classList.toggle('hidden', !remoteUsersData[uid]?.cam); } }
}

function startSpeakingDetection() {
    if (callRafId) cancelAnimationFrame(callRafId);
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const src = ac.createMediaStreamSource(localStream);
    const an = ac.createAnalyser(); an.fftSize = 256; src.connect(an);
    audioAnalysers['local'] = an;
    
    function check() {
        const data = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(data); let sum = 0; for(let i=0;i<data.length;i++) sum+=data[i]; let avg = sum/data.length;
        const ld = document.getElementById('local-participant'); if(ld) { if (avg > 15 && isMicOn) ld.classList.add('speaking'); else ld.classList.remove('speaking'); }
        const ls = document.getElementById('voice-user-' + session.uid); if(ls) { if (avg > 15 && isMicOn) ls.classList.add('speaking'); else ls.classList.remove('speaking'); }

        for (const uid in audioAnalysers) {
            if (uid === 'local') continue;
            const rAn = audioAnalysers[uid]; rAn.getByteFrequencyData(data); sum=0; for(let i=0;i<data.length;i++) sum+=data[i]; avg = sum/data.length;
            const rd = document.getElementById('remote-participant-' + uid); if(rd) { if (avg > 15) rd.classList.add('speaking'); else rd.classList.remove('speaking'); }
            const rs = document.getElementById('voice-user-' + uid); if(rs) { if (avg > 15) rs.classList.add('speaking'); else rs.classList.remove('speaking'); }
        }
        callRafId = requestAnimationFrame(check);
    }
    check();
}

function toggleMic() { if (!localStream) return; isMicOn = !isMicOn; localStream.getAudioTracks()[0].enabled = isMicOn; updateMicButton(); playSound(isMicOn ? 'unmute' : 'mute'); }
function toggleCamera() { if (!localStream) return; isCameraOn = !isCameraOn; localStream.getVideoTracks()[0].enabled = isCameraOn; updateCameraButton(); playSound(isCameraOn ? 'cam_on' : 'cam_off'); if(voiceConnectionRef) voiceConnectionRef.update({ cam: isCameraOn }); const ld = document.getElementById('local-participant'); if(ld) { if(isCameraOn){ld.classList.remove('rounded-full');ld.classList.add('rounded-2xl');} else {ld.classList.remove('rounded-2xl');ld.classList.add('rounded-full');} } const lv = document.getElementById('local-video'); if(lv) lv.classList.toggle('hidden', !isCameraOn); }
function updateMicButton() { const b = document.getElementById('btn-mic'); const i1 = document.getElementById('icon-mic-on'); const i2 = document.getElementById('icon-mic-off'); if (isMicOn) { b.classList.remove('bg-red-500/20','border','border-red-500','text-red-400'); b.classList.add('glass','text-white'); i1.classList.remove('hidden'); i2.classList.add('hidden'); b.title="Silenciar"; } else { b.classList.remove('glass','text-white'); b.classList.add('bg-red-500/20','border','border-red-500','text-red-400'); i1.classList.add('hidden'); i2.classList.remove('hidden'); b.title="Activar"; } }
function updateCameraButton() { const b = document.getElementById('btn-camera'); const i1 = document.getElementById('icon-cam-on'); const i2 = document.getElementById('icon-cam-off'); if (isCameraOn) { b.classList.remove('bg-red-500/20','border','border-red-500','text-red-400'); b.classList.add('glass','text-white'); i1.classList.remove('hidden'); i2.classList.add('hidden'); b.title="Apagar"; } else { b.classList.remove('glass','text-white'); b.classList.add('bg-red-500/20','border','border-red-500','text-red-400'); i1.classList.add('hidden'); i2.classList.remove('hidden'); b.title="Encender"; } }
function openStreamSettings() { document.getElementById('modal-stream-settings').classList.add('flex'); }
function closeStreamSettings() { document.getElementById('modal-stream-settings').classList.remove('flex'); }
async function startScreenShareWithSettings() { const r = document.getElementById('stream-resolution').value.split(','); const f = document.getElementById('stream-fps').value; const w = parseInt(r[0]); const h = parseInt(r[1]); closeStreamSettings(); if (!screenStream) { try { screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: parseInt(f) } }, audio: false }); const sv = document.getElementById('share-video'); sv.srcObject = screenStream; sv.classList.remove('hidden'); document.getElementById('stream-container').classList.remove('hidden'); document.getElementById('stream-placeholder').classList.add('hidden'); document.getElementById('btn-share').classList.add('bg-green-500/20','border','border-green-500','text-green-400'); screenStream.getVideoTracks()[0].onended = () => { stopScreenShare(); }; } catch (e) {} } else { stopScreenShare(); } }
function stopScreenShare() { if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; const sv = document.getElementById('share-video'); sv.srcObject = null; sv.classList.add('hidden'); document.getElementById('stream-placeholder').classList.remove('hidden'); document.getElementById('stream-container').classList.add('hidden'); document.getElementById('btn-share').classList.remove('bg-green-500/20','border','border-green-500','text-green-400'); } }
function toggleFullscreen(id) { const e = document.getElementById(id); if (!document.fullscreenElement) { if(e.requestFullscreen) e.requestFullscreen(); } else { if(document.exitFullscreen) document.exitFullscreen(); } }
function toggleRemoteMute(u) { showFlowAlert('Silenciado', `Has silenciado a ${u}.`, 'info'); }
function requestRemoteControl() { const b = document.getElementById('btn-gamepad'); if (b.title.includes("Solicitar")) { b.title = "Solicitando..."; b.disabled = true; b.classList.add('animate-pulse'); setTimeout(() => { b.title = "Control Concedido"; b.classList.remove('animate-pulse'); b.classList.remove('text-yellow-400'); b.classList.add('text-green-400'); b.disabled = false; }, 2000); } }

async function disconnectVoice() { 
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; } 
    stopScreenShare(); 
    if (callRafId) cancelAnimationFrame(callRafId);
    
    for (let uid in peerConnections) { if(peerConnections[uid]) peerConnections[uid].close(); }
    peerConnections = {}; remoteStreams = {}; audioAnalysers = {}; remoteUsersData = {};
    document.querySelectorAll('audio[id^="remote-audio-"]').forEach(el => el.remove());
    
    if (voiceConnectionRef) { voiceConnectionRef.remove(); voiceConnectionRef = null; }
    if (currentVoicePath) { db.ref(`${currentVoicePath}/users`).off(); db.ref(`${currentVoicePath}/offers`).off(); db.ref(`${currentVoicePath}/answers`).off(); db.ref(`${currentVoicePath}/ice`).off(); }
    
    // Limpiar notificaciones de llamada si cuelgas tú
    if (currentIncomingCall) { db.ref('users/' + currentIncomingCall.caller + '/incomingCall/status').set('rejected'); db.ref('users/' + session.uid + '/incomingCall').remove(); currentIncomingCall = null; }
    if (currentDmFriendFlowId) { const r = await getUserByFlowId(currentDmFriendFlowId); if (r) { db.ref('users/' + r.uid + '/incomingCall').remove(); } db.ref('users/' + session.uid + '/incomingCall').remove(); }
    
    currentVoicePath = null;

    document.getElementById('btn-gamepad').classList.add('hidden');
    document.querySelectorAll('.fake-cursor').forEach(e => e.remove()); 
    document.getElementById('voice-chat-area').classList.add('hidden'); 
    document.getElementById('text-chat-area').classList.remove('hidden'); 
    if (currentServerId) { const s = getServerFromDB(currentServerId); if (s) selectChannel(document.querySelector('.channel-item'), s.textChannels[0]); } else { selectChannel(null, 'general'); } 
    playSound('leave'); 
}

// --- DMs Y NAVEGACIÓN ---
function goToDMs() { currentServerId = null; document.querySelectorAll('.server-icon').forEach(s => s.classList.remove('active')); document.getElementById('btn-home').classList.add('active'); document.getElementById('sidebar-title').innerText = "Mensajes Directos"; document.getElementById('member-list').innerHTML = ''; document.getElementById('dm-tabs').classList.remove('hidden'); document.getElementById('btn-add-friend').classList.remove('hidden'); document.getElementById('btn-toggle-members').classList.add('hidden'); document.getElementById('btn-call').classList.remove('hidden'); renderDMs('friends'); }
async function renderDMs(tab) { 
    currentDmTab = tab; 
    document.getElementById('tab-friends').classList.remove('bg-white/10', 'text-white'); document.getElementById('tab-pending').classList.remove('bg-white/10', 'text-white'); document.getElementById('tab-blocked').classList.remove('bg-white/10', 'text-white'); 
    document.getElementById('tab-' + tab).classList.add('bg-white/10', 'text-white'); 
    const c = document.getElementById('sidebar-content'); let h = ''; 
    if (tab === 'friends') { if (!session.friends || session.friends.length === 0) { h = `<div class="text-center text-white/40 text-xs px-2 py-4">No tienes amigos.</div>`; } else { for (const id of session.friends) { const f = await getUserByFlowId(id); if (f) { const au = f.avatar ? f.avatar : null; h += `<div class="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-white/5 cursor-pointer text-white/60 group" onclick="selectDM('${f.flowId}', '${f.username}')">${getAvatarHtml(au, f.username, 32)}<span class="text-sm font-medium flex-1">${f.username}</span><div class="hidden group-hover:flex gap-1"><button onclick="event.stopPropagation(); removeFriend('${f.flowId}')" class="text-white/40 hover:text-red-400 p-1" title="Eliminar"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button><button onclick="event.stopPropagation(); blockUser('${f.flowId}')" class="text-white/40 hover:text-red-400 p-1" title="Bloquear"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.41 0 8 3.59 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg></button></div></div>`; } } } } 
    else if (tab === 'pending') { if (!session.pendingRequests || session.pendingRequests.length === 0) { h = `<div class="text-center text-white/40 text-xs px-2 py-4">Sin solicitudes.</div>`; } else { for (const id of session.pendingRequests) { const r = await getUserByFlowId(id); if (r) { const au = r.avatar ? r.avatar : null; h += `<div class="flex items-center gap-3 px-2 py-2 rounded-md text-white/60">${getAvatarHtml(au, r.username, 32)}<span class="text-sm font-medium flex-1">${r.username}</span><div class="flex gap-1"><button onclick="acceptRequest('${r.flowId}')" class="text-green-400 hover:text-green-300 p-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></button><button onclick="declineRequest('${r.flowId}')" class="text-red-400 hover:text-red-300 p-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button></div></div>`; } } } } 
    else if (tab === 'blocked') { if (!session.blockedUsers || session.blockedUsers.length === 0) { h = `<div class="text-center text-white/40 text-xs px-2 py-4">Sin bloqueos.</div>`; } else { for (const id of session.blockedUsers) { const b = await getUserByFlowId(id); if (b) { const au = b.avatar ? b.avatar : null; h += `<div class="flex items-center gap-3 px-2 py-2 rounded-md text-white/60">${getAvatarHtml(au, b.username, 32)}<span class="text-sm font-medium flex-1">${b.username}</span><button onclick="unblockUser('${b.flowId}')" class="text-white/40 hover:text-green-400 p-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></button></div>`; } } } } 
    c.innerHTML = h; if (currentChatType !== 'dm') selectChannel(null, 'general'); 
}
function toggleMembers() { document.getElementById('member-list').classList.toggle('hidden-list'); }