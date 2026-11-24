// 데이터 계층. Firebase 모드와 데모 모드가 같은 함수를 제공한다.
// 화면 코드는 이 파일의 store 객체만 쓴다.
import { firebaseConfig, DEVELOPER_EMAILS } from './config.js';

export const DEMO = !firebaseConfig;
const DEMO_DEV_EMAIL = 'demo.dev@example.com';
const DEV_LIST = DEVELOPER_EMAILS.map(e => e.trim().toLowerCase()).concat(DEMO ? [DEMO_DEV_EMAIL] : []);

export const isDeveloper = u => !!(u && u.email && DEV_LIST.includes(u.email.toLowerCase()));

// 메일 형식 확인. 공백 없는 로컬@도메인.최상위 형태만 통과시킨다.
export const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());

// 이 페이지 이름 (로그인 기록에 남는다): 'order' | 'fund' | 'dev'
let pageName = 'order';
export function setPage(name) { pageName = name; }

/* ---------------- 로그인 기록 공통 ----------------
   로그인 방법(구글/이메일)을 기억해 두었다가, 로그인 상태가 바뀌는 시점에 한 번만 기록한다.
   이미 로그인된 채로 다시 들어온 경우는 탭(세션)마다 한 번 '재방문'으로 기록한다. */
let pending = null; // { type: 'login' | 'signup', method: 'google' | 'email' }
const LOGGED_KEY = uid => 'fo-logged-' + uid;
function wasLogged(uid) { try { return sessionStorage.getItem(LOGGED_KEY(uid)) === '1'; } catch (e) { return false; } }
function markLogged(uid, on = true) {
  try { on ? sessionStorage.setItem(LOGGED_KEY(uid), '1') : sessionStorage.removeItem(LOGGED_KEY(uid)); } catch (e) { /* 무시 */ }
}
function deviceText() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '기타';
  const br = /KAKAOTALK/i.test(ua) ? '카카오톡' : /Instagram/.test(ua) ? '인스타그램' : /Edg\//.test(ua) ? 'Edge'
    : /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox' : '기타';
  return `${os} · ${br}`;
}
function makeLog(u, type, method) {
  return {
    uid: u.uid, email: (u.email || '').toLowerCase(), name: u.displayName || '',
    type, method: method || '', page: pageName, device: deviceText(), userAgent: navigator.userAgent.slice(0, 300),
  };
}

function sortNewest(list) { return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }

/* ---------------- 데모 모드 ---------------- */

function makeDemoStore() {
  // 주문·메뉴·기록은 localStorage(탭끼리 공유), 로그인은 sessionStorage(탭마다 따로)
  const KEY = 'fund-order-demo-v2';
  const AUTH_KEY = 'fund-order-demo-auth';
  const listeners = new Set();

  const seedMenu = [
    ['붕어빵 (팥)', 1000, 'food'], ['붕어빵 (슈크림)', 1000, 'food'],
    ['떡볶이 컵', 3000, 'food'], ['핫도그', 2500, 'food'],
    ['아이스티', 1500, 'drink'], ['핫초코', 2000, 'drink'],
  ];

  function fresh() {
    const menu = {};
    seedMenu.forEach(([name, price, category], i) => {
      const id = 'm' + (i + 1);
      menu[id] = { id, name, price, category, soldOut: false, order: i, description: '' };
    });
    return { menu, orders: {}, users: {}, logs: [], counter: 0, settings: { open: true, notice: '' } };
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* 무시 */ }
    return fresh();
  }
  let db = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 무시 */ } emit(); }
  function emit() { listeners.forEach(fn => fn()); }
  window.addEventListener('storage', e => { if (e.key === KEY) { db = load(); emit(); } });
  function watch(compute, cb) { const run = () => cb(compute()); listeners.add(run); setTimeout(run, 0); return () => listeners.delete(run); }

  const authListeners = new Set();
  function readAuth() { try { return JSON.parse(sessionStorage.getItem(AUTH_KEY)) || null; } catch (e) { return null; } }
  let authUser = readAuth();

  function writeLog(u, type, method) {
    db.logs.unshift({ ...makeLog(u, type, method), id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), createdAt: Date.now() });
    db.logs = db.logs.slice(0, 2000);
    if (type !== 'logout' && db.users[u.uid]) {
      db.users[u.uid].lastLoginAt = Date.now();
      db.users[u.uid].loginCount = (db.users[u.uid].loginCount || 0) + 1;
    }
    save();
  }
  function setAuth(u) {
    authUser = u;
    try { u ? sessionStorage.setItem(AUTH_KEY, JSON.stringify(u)) : sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* 무시 */ }
    if (u && !wasLogged(u.uid)) {
      writeLog(u, pending ? pending.type : 'session', pending ? pending.method : '');
      markLogged(u.uid);
    }
    pending = null;
    authListeners.forEach(fn => fn(u));
  }
  // 첫 화면에서 이미 로그인돼 있으면 재방문 기록
  setTimeout(() => { if (authUser && !wasLogged(authUser.uid)) { writeLog(authUser, 'session', ''); markLogged(authUser.uid); } }, 0);

  function demoUid(email) {
    let h = 0;
    for (const c of email) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 'demo_' + Math.abs(h).toString(36);
  }
  function authObj(uid) {
    const u = db.users[uid];
    return { uid, email: u.email, displayName: u.name, emailVerified: u.emailVerified !== false };
  }
  function loginAs(email, name, extra = {}) {
    email = email.trim().toLowerCase();
    const uid = demoUid(email);
    const isNew = !db.users[uid];
    db.users[uid] = { ...(db.users[uid] || { uid, email, name: name || email.split('@')[0], emailVerified: true, createdAt: Date.now() }), ...extra };
    save();
    if (!pending) pending = { type: isNew ? 'signup' : 'login', method: 'email' };
    setAuth(authObj(uid));
    return authUser;
  }

  return {
    onAuth(cb) { authListeners.add(cb); setTimeout(() => cb(authUser), 0); return () => authListeners.delete(cb); },
    get user() { return authUser; },
    async signInGoogle() { pending = { type: 'login', method: 'google' }; return loginAs('demo.student@example.com', '데모 학생'); },
    async signInEmail(email) {
      if (!validEmail(email)) throw new Error('이메일 형식이 맞지 않아요.');
      pending = { type: 'login', method: 'email' };
      return loginAs(email);
    },
    async signUpEmail(email) {
      if (!validEmail(email)) throw new Error('이메일 형식이 맞지 않아요.');
      pending = { type: 'signup', method: 'email' };
      // 데모에서는 새 가입이면 미인증 상태로 만든다 (인증 메일은 못 보내니 데모 인증 버튼으로 처리)
      const uid = demoUid(email.trim().toLowerCase());
      const isNew = !db.users[uid];
      const u = loginAs(email);
      if (isNew) { db.users[uid].emailVerified = false; save(); authUser = authObj(uid); authListeners.forEach(fn => fn(authUser)); }
      return u;
    },
    // 데모: 인증 메일 대신 바로 인증 처리 (실제 모드에서는 메일 링크로 인증)
    async sendVerification() {
      if (authUser) { db.users[authUser.uid].emailVerified = true; save(); authUser = authObj(authUser.uid); authListeners.forEach(fn => fn(authUser)); }
      return 'demo';
    },
    async reloadUser() { if (authUser) { authUser = authObj(authUser.uid); } return authUser; },
    async sendPasswordReset(email) {
      if (!validEmail(email)) throw new Error('이메일 형식이 맞지 않아요.');
      return 'demo';
    },
    async signOut() {
      if (authUser) { writeLog(authUser, 'logout', ''); markLogged(authUser.uid, false); }
      setAuth(null);
    },
    // 데모 전용 입장 버튼
    async demoFundLogin() { pending = { type: 'login', method: 'demo' }; return loginAs('demo.fund@example.com', '데모 펀드 담당', { role: 'fund' }); },
    async demoDevLogin() { pending = { type: 'login', method: 'demo' }; return loginAs(DEMO_DEV_EMAIL, '데모 개발자'); },

    async getProfile(uid) { return db.users[uid] || null; },
    async saveProfile(uid, data) {
      const { role, ...rest } = data; // 역할은 여기서 못 바꾼다 (실제 규칙과 같게)
      db.users[uid] = { ...(db.users[uid] || { uid }), ...rest };
      save();
    },
    async getRole(uid) { return (db.users[uid] && db.users[uid].role) || ''; },
    watchUsers(cb) { return watch(() => Object.values(db.users).sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0)), cb); },
    async setRole(uid, role) { if (role) db.users[uid].role = role; else delete db.users[uid].role; save(); },

    watchLoginLogs(cb) { return watch(() => db.logs.slice(), cb); },
    async clearLoginLogs() { db.logs = []; save(); },

    watchSettings(cb) { return watch(() => ({ ...db.settings }), cb); },
    async updateSettings(patch) { db.settings = { ...db.settings, ...patch }; save(); },

    watchMenu(cb) { return watch(() => Object.values(db.menu).sort((a, b) => a.order - b.order), cb); },
    async addMenu(item) {
      const id = 'm' + Date.now().toString(36);
      const order = Math.max(-1, ...Object.values(db.menu).map(m => m.order)) + 1;
      db.menu[id] = { id, soldOut: false, description: '', category: 'food', order, ...item };
      save();
    },
    async updateMenu(id, patch) { db.menu[id] = { ...db.menu[id], ...patch }; save(); },
    async deleteMenu(id) { delete db.menu[id]; save(); },

    async placeOrder(order) {
      db.counter += 1;
      const id = 'o' + Date.now().toString(36);
      const now = Date.now();
      db.orders[id] = { ...order, id, number: db.counter, status: 'pending', paid: false, createdAt: now, updatedAt: now };
      save();
      return { id, number: db.counter };
    },
    watchMyOrders(uid, cb) { return watch(() => sortNewest(Object.values(db.orders).filter(o => o.uid === uid)), cb); },
    watchAllOrders(cb) { return watch(() => sortNewest(Object.values(db.orders)), cb); },
    async updateOrder(id, patch) { db.orders[id] = { ...db.orders[id], ...patch, updatedAt: Date.now() }; save(); },
    async cancelMyOrder(id) {
      const o = db.orders[id];
      if (!o || o.status !== 'pending') throw new Error('이미 처리 중인 주문은 취소할 수 없습니다.');
      o.status = 'cancelled'; o.updatedAt = Date.now(); save();
    },
    async deleteOrder(id) { delete db.orders[id]; save(); },
    async exportAll() { return JSON.parse(JSON.stringify(db)); },
    async resetDemo() { db = fresh(); save(); },
  };
}

/* ---------------- Firebase 모드 ---------------- */

async function makeFirebaseStore() {
  const V = '11.9.1';
  const base = `https://www.gstatic.com/firebasejs/${V}/`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const fs = F.getFirestore(app);

  const ts = v => (v && typeof v.toMillis === 'function' ? v.toMillis() : v || 0);
  const fromSnap = d => {
    const data = d.data({ serverTimestamps: 'estimate' });
    return { ...data, id: d.id, createdAt: ts(data.createdAt), updatedAt: ts(data.updatedAt), lastLoginAt: ts(data.lastLoginAt) };
  };
  const listOf = (q, cb, onErr) => F.onSnapshot(q, s => cb(s.docs.map(fromSnap)), onErr || (e => console.error(e)));

  async function writeLog(u, type, method) {
    try {
      await F.addDoc(F.collection(fs, 'login_logs'), { ...makeLog(u, type, method), createdAt: F.serverTimestamp() });
      if (type !== 'logout') {
        await F.setDoc(F.doc(fs, 'users', u.uid), {
          uid: u.uid, email: (u.email || '').toLowerCase(), emailVerified: !!u.emailVerified,
          lastLoginAt: F.serverTimestamp(), loginCount: F.increment(1),
        }, { merge: true });
      }
    } catch (e) { console.error('로그인 기록 실패', e); }
  }

  let current = null;
  const authListeners = new Set();
  // 로그인 기록은 여기 한 곳에서만 한다 (화면이 onAuth를 여러 번 불러도 한 번만 기록)
  A.onAuthStateChanged(auth, async u => {
    current = u;
    if (u && !wasLogged(u.uid)) {
      markLogged(u.uid);
      await writeLog(u, pending ? pending.type : 'session', pending ? pending.method : '');
    }
    pending = null;
    known = true;
    authListeners.forEach(fn => fn(u));
  });
  let known = false; // 첫 로그인 상태를 받았는지

  return {
    onAuth(cb) {
      authListeners.add(cb);
      if (known) setTimeout(() => cb(current), 0); // 이미 상태를 알면 바로 알려 준다
      return () => authListeners.delete(cb);
    },
    get user() { return current; },
    async signInGoogle() {
      pending = { type: 'login', method: 'google' };
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      try { return (await A.signInWithPopup(auth, p)).user; } catch (e) { pending = null; throw e; }
    },
    async signInEmail(email, pw) {
      if (!validEmail(email)) throw new Error('이메일 형식이 맞지 않아요.');
      pending = { type: 'login', method: 'email' };
      try { return (await A.signInWithEmailAndPassword(auth, email.trim(), pw)).user; } catch (e) { pending = null; throw e; }
    },
    async signUpEmail(email, pw) {
      if (!validEmail(email)) throw new Error('이메일 형식이 맞지 않아요.');
      pending = { type: 'signup', method: 'email' };
      try {
        const cred = await A.createUserWithEmailAndPassword(auth, email.trim(), pw);
        try { await A.sendEmailVerification(cred.user); } catch (e) { console.error('인증 메일 발송 실패', e); }
        return cred.user;
      } catch (e) { pending = null; throw e; }
    },
    // 지금 로그인한 사람에게 인증 메일을 다시 보낸다
    async sendVerification() {
      if (!current) throw new Error('로그인이 필요해요.');
      await A.sendEmailVerification(current);
    },
    // 메일 링크를 눌렀는지 서버에서 다시 확인한다
    async reloadUser() { if (current) { await current.reload(); current = auth.currentUser; } return current; },
    // 비밀번호 재설정 메일 (개발자가 학생을 도울 때)
    async sendPasswordReset(email) {
      if (!validEmail(email)) throw new Error('이메일 형식이 맞지 않아요.');
      await A.sendPasswordResetEmail(auth, email.trim());
    },
    async signOut() {
      if (current) { await writeLog(current, 'logout', ''); markLogged(current.uid, false); }
      await A.signOut(auth);
    },

    async getProfile(uid) {
      const s = await F.getDoc(F.doc(fs, 'users', uid));
      return s.exists() ? { ...s.data(), uid } : null;
    },
    async saveProfile(uid, data) {
      const { role, ...rest } = data;
      await F.setDoc(F.doc(fs, 'users', uid), { ...rest, uid, updatedAt: F.serverTimestamp() }, { merge: true });
    },
    async getRole(uid) {
      const s = await F.getDoc(F.doc(fs, 'users', uid));
      return (s.exists() && s.data().role) || '';
    },
    watchUsers(cb) { return listOf(F.query(F.collection(fs, 'users'), F.limit(1000)), l => cb(l.sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0)))); },
    async setRole(uid, role) { await F.updateDoc(F.doc(fs, 'users', uid), { role: role ? role : F.deleteField() }); },

    watchLoginLogs(cb, onErr) {
      return listOf(F.query(F.collection(fs, 'login_logs'), F.orderBy('createdAt', 'desc'), F.limit(2000)), cb, onErr);
    },
    async clearLoginLogs() {
      const s = await F.getDocs(F.collection(fs, 'login_logs'));
      // 한 번에 500개까지 지울 수 있어서 나눠서 지운다
      for (let i = 0; i < s.docs.length; i += 450) {
        const b = F.writeBatch(fs);
        s.docs.slice(i, i + 450).forEach(d => b.delete(d.ref));
        await b.commit();
      }
    },

    watchSettings(cb) {
      return F.onSnapshot(F.doc(fs, 'meta', 'settings'), s => cb(s.exists() ? s.data() : {}), e => { console.error(e); cb({}); });
    },
    async updateSettings(patch) { await F.setDoc(F.doc(fs, 'meta', 'settings'), patch, { merge: true }); },

    watchMenu(cb) { return listOf(F.query(F.collection(fs, 'menu'), F.orderBy('order')), cb); },
    async addMenu(item) {
      await F.addDoc(F.collection(fs, 'menu'), { soldOut: false, description: '', category: 'food', order: Date.now(), ...item });
    },
    async updateMenu(id, patch) { await F.updateDoc(F.doc(fs, 'menu', id), patch); },
    async deleteMenu(id) { await F.deleteDoc(F.doc(fs, 'menu', id)); },

    // 주문 번호는 meta/counter 문서를 트랜잭션으로 1씩 올려서 붙인다
    async placeOrder(order) {
      const counterRef = F.doc(fs, 'meta', 'counter');
      const orderRef = F.doc(F.collection(fs, 'orders'));
      const number = await F.runTransaction(fs, async tx => {
        const c = await tx.get(counterRef);
        const n = (c.exists() ? c.data().n : 0) + 1;
        tx.set(counterRef, { n });
        tx.set(orderRef, {
          ...order, number: n, status: 'pending', paid: false,
          createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(),
        });
        return n;
      });
      return { id: orderRef.id, number };
    },
    // 내 주문은 email이 아니라 uid로 찾는다
    watchMyOrders(uid, cb) {
      return listOf(F.query(F.collection(fs, 'orders'), F.where('uid', '==', uid)), l => cb(sortNewest(l)));
    },
    watchAllOrders(cb, onErr) {
      return listOf(F.query(F.collection(fs, 'orders'), F.orderBy('createdAt', 'desc'), F.limit(1000)), cb, onErr);
    },
    async updateOrder(id, patch) { await F.updateDoc(F.doc(fs, 'orders', id), { ...patch, updatedAt: F.serverTimestamp() }); },
    async cancelMyOrder(id) { await F.updateDoc(F.doc(fs, 'orders', id), { status: 'cancelled', updatedAt: F.serverTimestamp() }); },
    async deleteOrder(id) { await F.deleteDoc(F.doc(fs, 'orders', id)); },
    async exportAll() {
      const out = {};
      for (const c of ['users', 'orders', 'menu', 'login_logs', 'meta']) {
        const s = await F.getDocs(F.collection(fs, c));
        out[c] = s.docs.map(fromSnap);
      }
      return out;
    },
  };
}

export const store = DEMO ? makeDemoStore() : await makeFirebaseStore();
