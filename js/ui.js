// 두 화면이 같이 쓰는 작은 도구들

export const STATUS = {
  pending:    { label: '접수됨',     color: 'gray' },
  making:     { label: '만드는 중',  color: 'blue' },
  delivering: { label: '배달 중',    color: 'purple' },
  ready:      { label: '픽업 대기',  color: 'green' },
  done:       { label: '완료',       color: 'dark' },
  cancelled:  { label: '취소됨',     color: 'red' },
};
export const STATUS_FLOW = ['pending', 'making', 'delivering', 'ready', 'done'];

// 소비자에게 상태가 바뀌었을 때 보여줄 문장
export const STATUS_MESSAGE = {
  making: '주문하신 음식을 만들기 시작했어요.',
  delivering: '음식이 배달 출발했어요.',
  ready: '음식이 나왔어요! 받으러 와 주세요.',
  done: '주문이 완료됐어요. 맛있게 드세요!',
  cancelled: '주문이 취소됐어요.',
};

export const PAYMENT = { transfer: '계좌이체 (선불)', cash: '현금 (후불)', credit: '외상' };
// 현장 주문지에서 쓰는 짧은 이름과 색 (사진의 현금/계좌/외상)
export const WALKUP_PAY = [['cash', '현금'], ['transfer', '계좌'], ['credit', '외상']];
export const CATEGORY = { food: '음식', drink: '음료' };
export const DAYS = ['월', '화', '수', '목', '금'];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function won(n) { return (Number(n) || 0).toLocaleString('ko-KR') + '원'; }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function timeText(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function badge(status) {
  const s = STATUS[status] || { label: status, color: 'gray' };
  return `<span class="badge badge-${s.color}">${esc(s.label)}</span>`;
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'show ' + kind;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), 3200);
}

export function errText(e) {
  const code = e && e.code ? String(e.code) : '';
  const map = {
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/wrong-password': '비밀번호가 맞지 않아요.',
    'auth/user-not-found': '가입되지 않은 이메일이에요.',
    'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
    'auth/invalid-email': '이메일 형식이 맞지 않아요.',
    'auth/popup-closed-by-user': '로그인 창이 닫혔어요.',
    'permission-denied': '권한이 없어요.',
  };
  return map[code] || (e && e.message) || String(e);
}

// 브라우저 알림. 권한이 없으면 조용히 넘어간다.
export async function askNotify() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}
export function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'icons/icon-192.png' });
    }
  } catch (e) { /* 일부 모바일 브라우저는 페이지에서 직접 알림을 못 띄운다 */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// 짧은 '띵' 소리 (관리자 새 주문 알림용)
let audioCtx;
export function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.2, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    o.start(); o.stop(audioCtx.currentTime + 0.5);
  } catch (e) { /* 무시 */ }
}

export function openModal(html) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  return wrap.firstElementChild;
}
export function closeModal() {
  $$('.modal-wrap').forEach(m => m.remove());
  document.body.classList.remove('no-scroll');
}

export function registerSW() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
