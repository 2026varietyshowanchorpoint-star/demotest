// 소비자용 화면
import { SHOP } from './config.js';
import { store, DEMO, setPage, validEmail } from './store.js';
import {
  $, $$, won, esc, timeText, badge, toast, errText, askNotify, notify,
  openModal, closeModal, registerSW, STATUS, STATUS_FLOW, STATUS_MESSAGE, PAYMENT, CATEGORY,
} from './ui.js';

setPage('order');
registerSW();

const state = {
  user: null,
  profile: null,
  menu: [],
  settings: {},
  orders: [],
  cart: loadCart(),     // { menuId: qty }
  lastStatus: null,     // 상태 변화 감지용 { orderId: status }
};
let unwatchOrders = null;

/* ---------- 기본 화면 ---------- */

$('#shopTitle').textContent = SHOP.title;
$('#shopSub').textContent = SHOP.subtitle;
document.title = SHOP.title;
$('#foot').innerHTML = [
  SHOP.contact && esc(SHOP.contact),
  SHOP.instagram && `<a href="${esc(SHOP.instagram)}" target="_blank" rel="noopener">인스타그램</a>`,
].filter(Boolean).join(' · ');

$$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
function showTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $('#tab-menu').classList.toggle('hidden', name !== 'menu');
  $('#tab-orders').classList.toggle('hidden', name !== 'orders');
  $('#cartBar').classList.toggle('force-hide', name !== 'menu');
}

function renderBanners() {
  const out = [];
  if (DEMO) out.push(`<div class="banner warn">데모 모드예요. 주문은 이 브라우저에만 저장돼요. 펀드 화면(fund.html)을 다른 탭에 열어 두면 주문이 바로 보여요.</div>`);
  if (!isOpen()) out.push(`<div class="banner danger">지금은 주문을 받지 않아요.</div>`);
  if (state.settings.notice) out.push(`<div class="banner">${esc(state.settings.notice)}</div>`);
  // 메일로 가입했는데 아직 인증 안 한 사람
  if (state.user && state.user.email && state.user.emailVerified === false) {
    out.push(`<div class="banner warn verify-banner">
      메일 인증이 아직 안 됐어요. ${DEMO ? '데모라 실제 메일은 안 가요.' : `<strong>${esc(state.user.email)}</strong> 메일함에서 인증 링크를 눌러 주세요.`}
      <div class="verify-actions">
        <button class="btn small" data-verify="resend">${DEMO ? '데모: 인증 완료 처리' : '인증 메일 다시 보내기'}</button>
        ${DEMO ? '' : '<button class="btn small" data-verify="check">인증했어요 (새로고침)</button>'}
      </div>
    </div>`);
  }
  $('#banners').innerHTML = out.join('');
}
const isOpen = () => (state.settings.open ?? SHOP.defaultOpen) !== false;

$('#banners').addEventListener('click', async e => {
  const act = e.target.closest('[data-verify]')?.dataset.verify;
  if (!act) return;
  try {
    if (act === 'resend') {
      await store.sendVerification();
      if (DEMO) { state.user = store.user; renderBanners(); toast('인증 처리했어요.'); }
      else toast('인증 메일을 다시 보냈어요. 메일함을 확인하세요.');
    } else if (act === 'check') {
      await store.reloadUser();
      state.user = store.user;
      renderBanners();
      toast(state.user.emailVerified ? '인증됐어요!' : '아직 인증 전이에요. 메일 링크를 눌러 주세요.', state.user.emailVerified ? 'good' : 'error');
    }
  } catch (err) { toast(errText(err), 'error'); }
});

/* ---------- 로그인 ---------- */

store.onAuth(async u => {
  state.user = u;
  state.profile = null;
  $('#userBtn').textContent = u ? '내 정보' : '로그인';
  if (unwatchOrders) { unwatchOrders(); unwatchOrders = null; }
  state.orders = []; state.lastStatus = null;
  if (u) {
    try {
      state.profile = await store.getProfile(u.uid);
      if (!state.profile) {
        await store.saveProfile(u.uid, { email: u.email || '', name: u.displayName || '', createdAt: Date.now() });
        state.profile = await store.getProfile(u.uid);
      }
    } catch (e) { console.error(e); }
    unwatchOrders = store.watchMyOrders(u.uid, onOrders);
  }
  renderBanners();
  renderOrders();
});

$('#userBtn').addEventListener('click', () => (state.user ? openProfile() : openLogin()));

function openLogin(after) {
  const m = openModal(`
    <h2>로그인</h2>
    <p class="muted">주문 상태를 확인하려면 로그인이 필요해요.</p>
    <button class="btn google wide" id="gBtn">구글 계정으로 로그인</button>
    <div class="or">또는 이메일</div>
    <form id="loginForm" class="form">
      <input type="email" name="email" placeholder="이메일" required autocomplete="email">
      <input type="password" name="pw" placeholder="비밀번호 (6자 이상)" ${DEMO ? '' : 'required minlength="6"'} autocomplete="current-password">
      <div class="row">
        <button class="btn primary" type="submit" data-mode="in">로그인</button>
        <button class="btn" type="submit" data-mode="up">회원가입</button>
      </div>
    </form>
    <p class="muted small-note">로그인하면 이메일과 접속 시간이 기록돼요.</p>
    <button class="btn ghost wide" id="closeBtn">닫기</button>`);
  const done = () => { closeModal(); toast('로그인했어요.'); if (after) after(); };
  $('#gBtn', m).onclick = async () => {
    try { await store.signInGoogle(); done(); } catch (e) { toast(errText(e), 'error'); }
  };
  let mode = 'in';
  $$('button[type=submit]', m).forEach(b => b.addEventListener('click', () => (mode = b.dataset.mode)));
  $('#loginForm', m).onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const email = f.get('email');
    if (!validEmail(email)) return toast('이메일 형식이 맞지 않아요.', 'error');
    try {
      if (mode === 'up') {
        await store.signUpEmail(email, f.get('pw'));
        closeModal();
        toast(DEMO ? '가입했어요.' : '가입했어요. 인증 메일을 보냈어요. 메일함을 확인하세요.', 'good');
        if (after) after();
      } else {
        await store.signInEmail(email, f.get('pw'));
        done();
      }
    } catch (e) { toast(errText(e), 'error'); }
  };
  $('#closeBtn', m).onclick = closeModal;
}

function openProfile() {
  const p = state.profile || {};
  const m = openModal(`
    <h2>내 정보</h2>
    <p class="muted">${esc(state.user.email || '')}</p>
    <form id="pf" class="form">
      <label>학년 반 이름<input name="student" value="${esc(p.student || '')}" placeholder="${esc(SHOP.studentHint)}"></label>
      <label>자주 받는 위치<input name="location" value="${esc(p.location || '')}" placeholder="${esc(SHOP.locationHint)}"></label>
      <button class="btn primary wide" type="submit">저장</button>
    </form>
    <button class="btn ghost wide" id="outBtn">로그아웃</button>`);
  $('#pf', m).onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const data = { student: f.get('student').trim(), location: f.get('location').trim() };
    try {
      await store.saveProfile(state.user.uid, data);
      state.profile = { ...state.profile, ...data };
      closeModal(); toast('저장했어요.');
    } catch (e) { toast(errText(e), 'error'); }
  };
  $('#outBtn', m).onclick = async () => { await store.signOut(); closeModal(); toast('로그아웃했어요.'); };
}

/* ---------- 메뉴와 장바구니 ---------- */

store.watchSettings(s => { state.settings = s || {}; renderBanners(); renderCart(); });
store.watchMenu(list => {
  state.menu = list;
  // 품절됐거나 삭제된 메뉴는 장바구니에서 뺀다
  for (const id of Object.keys(state.cart)) {
    const m = list.find(x => x.id === id);
    if (!m || m.soldOut) delete state.cart[id];
  }
  saveCart();
  renderMenu();
  renderCart();
});

function loadCart() {
  try { return JSON.parse(sessionStorage.getItem('fund-cart')) || {}; } catch (e) { return {}; }
}
function saveCart() {
  try { sessionStorage.setItem('fund-cart', JSON.stringify(state.cart)); } catch (e) { /* 무시 */ }
}

function renderMenu() {
  if (!state.menu.length) {
    $('#menuList').innerHTML = '<p class="empty">아직 등록된 메뉴가 없어요.</p>';
    return;
  }
  const groups = {};
  state.menu.forEach(m => (groups[m.category || 'food'] ||= []).push(m));
  $('#menuList').innerHTML = Object.entries(groups).map(([cat, items]) => `
    <h2 class="cat">${esc(CATEGORY[cat] || cat)}</h2>
    <div class="menu-grid">
      ${items.map(m => {
        const q = state.cart[m.id] || 0;
        return `
        <div class="menu-card ${m.soldOut ? 'sold' : ''}" data-id="${esc(m.id)}">
          ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="" loading="lazy">` : ''}
          <div class="menu-info">
            <div class="menu-name">${esc(m.name)}</div>
            ${m.description ? `<div class="menu-desc">${esc(m.description)}</div>` : ''}
            <div class="menu-price">${won(m.price)}</div>
          </div>
          ${m.soldOut ? '<div class="soldtag">품절</div>' : `
          <div class="stepper">
            <button data-act="minus" aria-label="빼기" ${q ? '' : 'disabled'}>−</button>
            <span>${q}</span>
            <button data-act="plus" aria-label="더하기">+</button>
          </div>`}
        </div>`;
      }).join('')}
    </div>`).join('');
}

$('#menuList').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('.menu-card').dataset.id;
  const q = state.cart[id] || 0;
  if (btn.dataset.act === 'plus') state.cart[id] = Math.min(q + 1, 20);
  else if (q <= 1) delete state.cart[id];
  else state.cart[id] = q - 1;
  saveCart();
  renderMenu();
  renderCart();
});

function cartItems() {
  return Object.entries(state.cart).map(([id, qty]) => {
    const m = state.menu.find(x => x.id === id);
    return m ? { id, name: m.name, price: Number(m.price) || 0, qty } : null;
  }).filter(Boolean);
}
const cartTotal = () => cartItems().reduce((s, i) => s + i.price * i.qty, 0);

function renderCart() {
  const items = cartItems();
  const count = items.reduce((s, i) => s + i.qty, 0);
  $('#cartBar').classList.toggle('hidden', count === 0);
  $('#cartCount').textContent = count;
  $('#cartTotal').textContent = won(cartTotal());
  $('#checkoutBtn').disabled = !isOpen();
  $('#checkoutBtn').textContent = isOpen() ? '주문하기' : '주문 마감';
}

/* ---------- 주문서 ---------- */

$('#checkoutBtn').addEventListener('click', () => {
  if (!isOpen()) return toast('지금은 주문을 받지 않아요.', 'error');
  if (!state.user) return openLogin(openCheckout);
  openCheckout();
});

function openCheckout() {
  const items = cartItems();
  if (!items.length) return;
  const p = state.profile || {};
  const m = openModal(`
    <h2>주문서</h2>
    <ul class="summary">
      ${items.map(i => `<li><span>${esc(i.name)} × ${i.qty}</span><span>${won(i.price * i.qty)}</span></li>`).join('')}
      <li class="total"><span>총 금액</span><span>${won(cartTotal())}</span></li>
    </ul>
    <form id="of" class="form">
      <label>학년 반 이름 *<input name="student" required value="${esc(p.student || '')}" placeholder="${esc(SHOP.studentHint)}"></label>
      <label>배달 위치 *<input name="location" required value="${esc(p.location || '')}" placeholder="${esc(SHOP.locationHint)}"></label>
      <fieldset>
        <legend>결제 방식 *</legend>
        <label class="radio"><input type="radio" name="payment" value="cash" required checked> ${PAYMENT.cash}</label>
        <label class="radio"><input type="radio" name="payment" value="transfer" required> ${PAYMENT.transfer}</label>
        <label class="radio"><input type="radio" name="payment" value="credit" required> ${PAYMENT.credit} (나중에 결제)</label>
      </fieldset>
      <div id="bankBox" class="bank hidden">${SHOP.bankInfo
        ? `입금 계좌: <strong>${esc(SHOP.bankInfo)}</strong><br>입금자명은 학년 반 이름으로 해 주세요.`
        : '계좌 정보는 담당자가 곧 안내할게요.'}</div>
      <div id="creditBox" class="bank hidden">지금은 안 내도 돼요. 나중에 펀드 담당자에게 내면 됩니다.</div>
      <label id="changeBox" class="hidden">거스름돈이 필요하면 낼 금액을 적어 주세요<input name="cashGiven" type="number" min="0" step="100" placeholder="예: 10000"></label>
      <label>요청 사항<textarea name="note" rows="2" maxlength="300" placeholder="예: 붕어빵 팥 1개, 슈크림 2개로 나눠 주세요"></textarea></label>
      <button class="btn primary wide" type="submit" id="placeBtn">${won(cartTotal())} 주문하기</button>
    </form>
    <button class="btn ghost wide" id="cancelBtn">닫기</button>`);

  const sync = () => {
    const pay = $('input[name=payment]:checked', m)?.value;
    $('#bankBox', m).classList.toggle('hidden', pay !== 'transfer');
    $('#creditBox', m).classList.toggle('hidden', pay !== 'credit');
    $('#changeBox', m).classList.toggle('hidden', pay !== 'cash');
  };
  $$('input[name=payment]', m).forEach(r => r.addEventListener('change', sync));
  sync();
  $('#cancelBtn', m).onclick = closeModal;

  $('#of', m).onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const btn = $('#placeBtn', m);
    btn.disabled = true; btn.textContent = '주문하는 중...';
    const order = {
      uid: state.user.uid,
      email: state.user.email || '',
      student: f.get('student').trim(),
      location: f.get('location').trim(),
      payment: f.get('payment'),
      cashGiven: Number(f.get('cashGiven')) || 0,
      note: (f.get('note') || '').trim(),
      items: cartItems().map(({ id, name, price, qty }) => ({ id, name, price, qty })),
      total: cartTotal(),
    };
    try {
      const res = await store.placeOrder(order);
      // 다음 주문 때 다시 안 적어도 되게 저장
      store.saveProfile(state.user.uid, { student: order.student, location: order.location }).catch(() => {});
      state.profile = { ...state.profile, student: order.student, location: order.location };
      state.cart = {}; saveCart(); renderMenu(); renderCart();
      showDone(res.number, order);
    } catch (e) {
      toast('주문하지 못했어요: ' + errText(e), 'error');
      btn.disabled = false; btn.textContent = '다시 주문하기';
    }
  };
}

function showDone(number, order) {
  const m = openModal(`
    <div class="done">
      <div class="done-num">#${number}</div>
      <h2>주문이 접수됐어요</h2>
      <p>${won(order.total)} · ${esc(PAYMENT[order.payment])}</p>
      ${order.payment === 'transfer' ? `<p class="bank">입금 계좌: <strong>${esc(SHOP.bankInfo)}</strong></p>` : ''}
      <p class="muted">음식이 나오면 알려 드릴게요. 알림을 허용해 주세요.</p>
    </div>
    <button class="btn primary wide" id="okBtn">내 주문 보기</button>`);
  $('#okBtn', m).onclick = () => { closeModal(); showTab('orders'); };
  askNotify();
}

/* ---------- 내 주문 ---------- */

function onOrders(list) {
  // 처음 불러올 때는 알리지 않고, 그 뒤로 상태가 바뀐 것만 알린다
  if (state.lastStatus) {
    for (const o of list) {
      const before = state.lastStatus[o.id];
      if (before && before !== o.status && STATUS_MESSAGE[o.status]) {
        const msg = `#${o.number} ${STATUS_MESSAGE[o.status]}`;
        toast(msg, o.status === 'ready' ? 'good' : '');
        notify(SHOP.title, msg);
      }
    }
  }
  state.lastStatus = Object.fromEntries(list.map(o => [o.id, o.status]));
  state.orders = list;
  renderOrders();
}

function renderOrders() {
  const active = state.orders.filter(o => !['done', 'cancelled'].includes(o.status)).length;
  const c = $('#activeCount');
  c.textContent = active;
  c.classList.toggle('hidden', !active);

  if (!state.user) {
    $('#orderList').innerHTML = `<div class="empty">로그인하면 내 주문이 보여요.<br><button class="btn primary" id="loginHere">로그인</button></div>`;
    $('#loginHere').onclick = () => openLogin();
    return;
  }
  if (!state.orders.length) {
    $('#orderList').innerHTML = '<p class="empty">아직 주문이 없어요.</p>';
    return;
  }
  $('#orderList').innerHTML = state.orders.map(o => {
    const step = STATUS_FLOW.indexOf(o.status);
    const steps = o.status === 'cancelled' ? '' : `
      <ol class="progress">
        ${['pending', 'making', o.status === 'ready' ? 'ready' : 'delivering', 'done'].map(s =>
          `<li class="${STATUS_FLOW.indexOf(s) <= step ? 'on' : ''}">${STATUS[s].label}</li>`).join('')}
      </ol>`;
    return `
    <article class="order-card st-${esc(o.status)}">
      <header><span class="num">#${esc(o.number)}</span>${badge(o.status)}<span class="pay-tag">${esc(PAYMENT[o.payment] || o.payment)}</span><span class="time">${timeText(o.createdAt)}</span></header>
      ${steps}
      <ul class="items">${(o.items || []).map(i => `<li>${esc(i.name)} × ${esc(i.qty)}</li>`).join('')}</ul>
      <div class="meta">
        <span>${esc(o.location)}</span>
        <span>${esc(PAYMENT[o.payment] || o.payment)}${o.payment === 'transfer' ? (o.paid ? ' · 입금 확인됨' : ' · 입금 확인 전') : ''}</span>
        <strong>${won(o.total)}</strong>
      </div>
      ${o.note ? `<p class="note">${esc(o.note)}</p>` : ''}
      ${o.status === 'pending' ? `<button class="btn ghost small" data-cancel="${esc(o.id)}">주문 취소</button>` : ''}
    </article>`;
  }).join('');
}

$('#orderList').addEventListener('click', async e => {
  const id = e.target.closest('[data-cancel]')?.dataset.cancel;
  if (!id) return;
  if (!confirm('이 주문을 취소할까요?')) return;
  try { await store.cancelMyOrder(id); toast('주문을 취소했어요.'); } catch (err) { toast(errText(err), 'error'); }
});

renderBanners();
