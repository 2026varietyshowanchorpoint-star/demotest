// 펀드 담당자 화면: 주문 처리, 메뉴·품절, 매출, 운영
// 들어올 수 있는 사람: role이 'fund'인 사용자, 개발자
import { store, DEMO, setPage, isDeveloper } from './store.js';
import { $, toast, askNotify } from './ui.js';
import { loginGate, deniedGate, mountOrders, mountMenu, mountSettings, mountAccounting, mountWalkup, renderStats, tabs } from './panels.js';

setPage('fund');
let mounted = [];
let ordersPanel = null;

if (DEMO) $('#banners').innerHTML = `<div class="banner warn">데모 모드예요. 같은 브라우저 다른 탭에서 학생 화면(index.html)으로 주문해 보세요.</div>`;

tabs($('#nav'), {
  orders: $('#tab-orders'), walkup: $('#tab-walkup'), menu: $('#tab-menu'), accounting: $('#tab-accounting'), stats: $('#tab-stats'), settings: $('#tab-settings'),
}, name => {
  if (name === 'orders' && ordersPanel) ordersPanel.clearFresh();
  if (name === 'stats' && ordersPanel) renderStats($('#tab-stats'), ordersPanel.orders);
});

$('#outBtn').onclick = () => store.signOut().then(() => toast('로그아웃했어요.'));

store.onAuth(async u => {
  mounted.forEach(m => m.unsub && m.unsub());
  mounted = []; ordersPanel = null;
  $('#outBtn').classList.toggle('hidden', !u);
  $('#app').classList.add('hidden');
  $('#gate').classList.remove('hidden');
  $('#who').textContent = '';

  const demoButton = DEMO ? { label: '데모 펀드 담당자로 들어가기', onClick: () => store.demoFundLogin() } : null;
  if (!u) return loginGate($('#gate'), { title: '펀드 담당자 로그인', demoButton });

  let role = '';
  try { role = await store.getRole(u.uid); } catch (e) { console.error(e); }
  const dev = isDeveloper(u);
  if (role !== 'fund' && !dev) {
    return deniedGate($('#gate'), u, { message: '개발자에게 아래 사용자 ID를 알려 주고 펀드 역할을 받으세요.', demoButton });
  }

  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#who').textContent = `${u.email || ''} · ${dev ? '개발자' : '펀드 담당'}`;
  askNotify();

  ordersPanel = mountOrders($('#tab-orders'), {
    onNewCount: n => { const c = $('#newCount'); c.textContent = n; c.classList.toggle('hidden', !n); },
    onOrders: list => { if (!$('#tab-stats').classList.contains('hidden')) renderStats($('#tab-stats'), list); },
  });
  mounted.push(ordersPanel, mountWalkup($('#tab-walkup')), mountMenu($('#tab-menu')), mountAccounting($('#tab-accounting')), mountSettings($('#tab-settings')));
});
