// 개발자 화면: 로그인 기록, 사용자 권한, 그리고 펀드 화면의 모든 기능 + 강제 권한
// 들어올 수 있는 사람: config.js의 DEVELOPER_EMAILS에 있는 계정만
import { DEVELOPER_EMAILS } from './config.js';
import { store, DEMO, setPage, isDeveloper } from './store.js';
import { $, esc, timeText, toast, errText } from './ui.js';
import {
  loginGate, deniedGate, mountOrders, mountMenu, mountSettings, mountAccounting, mountWalkup, renderStats, tabs, downloadCsv, download, today,
} from './panels.js';

setPage('dev');

const TYPE = { login: '로그인', signup: '회원가입', session: '재방문', logout: '로그아웃' };
const METHOD = { google: '구글', email: '이메일', demo: '데모' };
const PAGE = { order: '학생 주문', fund: '펀드', dev: '개발자' };
const ROLE = { '': '일반', fund: '펀드 담당' };

const st = { logs: [], users: [], ordersPanel: null };
let mounted = [];

if (DEMO) $('#banners').innerHTML = `<div class="banner warn">데모 모드예요. 기록은 이 브라우저 안에만 남아요.</div>`;

tabs($('#nav'), {
  logs: $('#tab-logs'), users: $('#tab-users'), orders: $('#tab-orders'), walkup: $('#tab-walkup'), menu: $('#tab-menu'),
  accounting: $('#tab-accounting'), stats: $('#tab-stats'), settings: $('#tab-settings'), system: $('#tab-system'),
}, name => { if (name === 'stats' && st.ordersPanel) renderStats($('#tab-stats'), st.ordersPanel.orders); });

$('#outBtn').onclick = () => store.signOut().then(() => toast('로그아웃했어요.'));

store.onAuth(u => {
  mounted.forEach(m => m.unsub && m.unsub());
  mounted = []; st.ordersPanel = null;
  $('#outBtn').classList.toggle('hidden', !u);
  $('#app').classList.add('hidden');
  $('#gate').classList.remove('hidden');
  $('#who').textContent = '';

  const demoButton = DEMO ? { label: '데모 개발자로 들어가기', onClick: () => store.demoDevLogin() } : null;
  if (!u) return loginGate($('#gate'), { title: '개발자 로그인', demoButton });
  if (!isDeveloper(u)) {
    return deniedGate($('#gate'), u, { message: '개발자 계정이 아니에요. js/config.js의 DEVELOPER_EMAILS에 등록된 계정만 들어올 수 있어요.', demoButton });
  }

  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#who').textContent = `${u.email} · 개발자 (모든 권한)`;
  $('#devList').innerHTML = DEVELOPER_EMAILS.map(e => `<li>${esc(e)}</li>`).join('');
  $('#demoCard').classList.toggle('hidden', !DEMO);

  st.ordersPanel = mountOrders($('#tab-orders'), {
    dev: true,
    onOrders: list => { if (!$('#tab-stats').classList.contains('hidden')) renderStats($('#tab-stats'), list); },
  });
  mounted.push(
    st.ordersPanel,
    mountWalkup($('#tab-walkup')),
    mountMenu($('#tab-menu')),
    mountAccounting($('#tab-accounting')),
    mountSettings($('#tab-settings')),
    { unsub: store.watchLoginLogs(l => { st.logs = l; renderLogs(); }, e => toast('기록을 불러오지 못했어요: ' + errText(e), 'error')) },
    { unsub: store.watchUsers(l => { st.users = l; renderUsers(); }) },
  );
});

/* ---------- 로그인 기록 ---------- */

function filteredLogs() {
  const q = $('#logSearch').value.trim().toLowerCase();
  const t = $('#logType').value, p = $('#logPage').value;
  return st.logs.filter(l =>
    (!q || `${l.email} ${l.name}`.toLowerCase().includes(q)) && (!t || l.type === t) && (!p || l.page === p));
}

function renderLogs() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const todays = st.logs.filter(l => l.createdAt >= start.getTime() && l.type !== 'logout');
  const uniq = arr => new Set(arr.map(l => l.email || l.uid)).size;
  $('#logStats').innerHTML = `
    <div class="stat"><span>전체 기록</span><strong>${st.logs.length}건</strong></div>
    <div class="stat"><span>오늘 접속</span><strong>${todays.length}회</strong></div>
    <div class="stat"><span>오늘 접속한 사람</span><strong>${uniq(todays)}명</strong></div>
    <div class="stat"><span>지금까지 접속한 사람</span><strong>${uniq(st.logs)}명</strong></div>`;

  const list = filteredLogs();
  $('#logRows').innerHTML = list.slice(0, 500).map(l => `
    <tr class="log-${esc(l.type)}">
      <td>${timeText(l.createdAt)}</td>
      <td><a href="#" data-email="${esc(l.email)}">${esc(l.email || '(없음)')}</a></td>
      <td>${esc(l.name)}</td>
      <td>${esc(TYPE[l.type] || l.type)}</td>
      <td>${esc(METHOD[l.method] || l.method || '')}</td>
      <td>${esc(PAGE[l.page] || l.page)}</td>
      <td title="${esc(l.userAgent || '')}">${esc(l.device || '')}</td>
    </tr>`).join('') || '<tr><td colspan="7">기록이 없어요.</td></tr>';
  $('#logCount').textContent = list.length > 500 ? `${list.length}건 중 최근 500건만 보여요. 전부 보려면 CSV로 받으세요.` : `${list.length}건`;
}

['logSearch', 'logType', 'logPage'].forEach(id => $('#' + id).addEventListener('input', renderLogs));
$('#logRows').addEventListener('click', e => {
  const a = e.target.closest('[data-email]');
  if (!a) return;
  e.preventDefault();
  $('#logSearch').value = a.dataset.email;
  renderLogs();
});
$('#logCsv').onclick = () => downloadCsv(`로그인기록_${today()}.csv`,
  ['시간', '이메일', '이름', '종류', '방법', '화면', '기기', 'uid', '브라우저 정보'],
  filteredLogs().map(l => [new Date(l.createdAt).toLocaleString('ko-KR'), l.email, l.name, TYPE[l.type] || l.type,
    METHOD[l.method] || l.method, PAGE[l.page] || l.page, l.device, l.uid, l.userAgent]));
$('#logClear').onclick = async () => {
  if (!confirm('로그인 기록을 전부 지울까요? 되돌릴 수 없어요. 필요하면 먼저 CSV로 받아 두세요.')) return;
  try { await store.clearLoginLogs(); toast('기록을 지웠어요.'); } catch (e) { toast(errText(e), 'error'); }
};

/* ---------- 사용자·권한 ---------- */

function renderUsers() {
  const q = $('#userSearch').value.trim().toLowerCase();
  const list = st.users.filter(u => !q || [u.email, u.name, u.student].join(' ').toLowerCase().includes(q));
  $('#userRows').innerHTML = list.map(u => {
    const dev = isDeveloper(u);
    return `
    <tr data-uid="${esc(u.uid)}">
      <td>${esc(u.email || '(없음)')}</td>
      <td>${esc([u.name, u.student].filter(Boolean).join(' / '))}</td>
      <td>${dev ? '<span class="badge badge-purple">개발자 (고정)</span>' : `
        <select data-role>
          ${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${(u.role || '') === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>`}</td>
      <td>${u.emailVerified === false ? '<span class="badge badge-red">미인증</span>' : '<span class="badge badge-green">인증됨</span>'}</td>
      <td>${timeText(u.lastLoginAt)}</td>
      <td>${u.loginCount || 0}</td>
      <td class="nowrap">
        <button class="btn ghost small" data-logs="${esc(u.email || '')}">기록 보기</button>
        ${u.email ? `<button class="btn ghost small" data-reset="${esc(u.email)}">재설정 메일</button>` : ''}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7">사용자가 없어요.</td></tr>';
}
$('#userSearch').addEventListener('input', renderUsers);
$('#userRows').addEventListener('change', async e => {
  if (!('role' in e.target.dataset)) return;
  const uid = e.target.closest('tr').dataset.uid;
  try { await store.setRole(uid, e.target.value); toast('권한을 바꿨어요.'); } catch (err) { toast(errText(err), 'error'); }
});
$('#userRows').addEventListener('click', async e => {
  const reset = e.target.closest('[data-reset]');
  if (reset) {
    const email = reset.dataset.reset;
    if (!confirm(`${email} 으로 비밀번호 재설정 메일을 보낼까요?\n받은 사람이 직접 새 비밀번호를 정하게 돼요.`)) return;
    try { await store.sendPasswordReset(email); toast(DEMO ? '데모라 실제로는 안 가요.' : '재설정 메일을 보냈어요.', 'good'); }
    catch (err) { toast(errText(err), 'error'); }
    return;
  }
  const b = e.target.closest('[data-logs]');
  if (!b) return;
  $('#logSearch').value = b.dataset.logs;
  $('.tab[data-tab=logs]').click();
  renderLogs();
});

/* ---------- 시스템 ---------- */

$('#backupBtn').onclick = async () => {
  try {
    const data = await store.exportAll();
    download(`펀드백업_${today()}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  } catch (e) { toast(errText(e), 'error'); }
};
$('#resetBtn').onclick = async () => {
  if (!confirm('데모 데이터를 전부 지울까요?')) return;
  await store.resetDemo();
  toast('초기화했어요.');
};
