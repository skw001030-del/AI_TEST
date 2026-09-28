const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { user: null, reference: null, month: null, page: 'dashboard', analysis: null, inventory: [], salesPage: 1, salesQuery: '', expensePage: 1, expenseQuery: '', dialogMode: null, editingSaleId: null, salesRows: [] };
const pageNames = { dashboard: '월별 손익 대시보드', sales: '판매 기록 관리', expenses: '비용 내역', inventory: '재료 실사', profitability: '메뉴 수익성 분석' };
let toastTimer;

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function money(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '계산 불가';
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value));
}
function number(value) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(Number(value || 0)); }
function monthLabel(month) { const [year, monthNumber] = month.split('-'); return `${year}년 ${Number(monthNumber)}월`; }
function dateLabel(date) { return date ? `${date.slice(0, 4)}.${date.slice(5, 7)}.${date.slice(8, 10)}` : '—'; }
function todayDefault() { return state.reference?.asOf || '2026-09-18'; }
function currentDateTimeLocal() { const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16); }
function inspectionLabel(inspection) { return inspection?.inspectedAt ? `${dateLabel(inspection.date)} ${inspection.inspectedAt.slice(11, 16)}` : dateLabel(inspection?.date); }

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) { showAuth(true); throw new Error(payload.error || '로그인이 만료되었습니다.'); }
  if (!response.ok) { const error = new Error(payload.error || '요청을 처리하지 못했습니다.'); error.status = response.status; error.details = payload.details; throw error; }
  return payload;
}

function showToast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function saveErrorMessage(error) {
  return error instanceof TypeError || /failed to fetch/i.test(error.message)
    ? '서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 저장해 주세요.'
    : error.message;
}

function showAuth(configured) {
  $('#appView').hidden = true; $('#authView').hidden = false;
  const setup = !configured;
  $('#authTitle').textContent = setup ? '운영자 계정 만들기' : '운영자 로그인';
  $('#authDescription').textContent = setup ? '이 로컬 앱에서 매장 자료를 보호할 운영자 한 명을 등록합니다.' : '등록한 운영자 이메일과 비밀번호로 매장 자료를 엽니다.';
  $('#nameField').hidden = !setup;
  $('#authForm [name="name"]').required = setup;
  $('#authForm [name="password"]').autocomplete = setup ? 'new-password' : 'current-password';
  $('#authForm [name="password"]').minLength = setup ? 8 : 0;
  $('#authSubmit').textContent = setup ? '계정 만들기' : '로그인';
  $('#authError').textContent = '';
  $('#authForm').dataset.mode = setup ? 'setup' : 'login';
}

async function initialize() {
  const session = await api('/api/session');
  if (!session.configured) return showAuth(false);
  if (!session.authenticated) return showAuth(true);
  state.user = session.user;
  $('#appView').hidden = false; $('#authView').hidden = true;
  $('#operatorName').textContent = state.user.name || '운영자';
  $('#operatorEmail').textContent = state.user.email;
  state.reference = await api('/api/reference');
  state.month = state.reference.closedMonths[0];
  buildMonthSelect();
  await navigate('dashboard');
}

function buildMonthSelect() {
  const select = $('#monthSelect');
  select.innerHTML = state.reference.closedMonths.map((month) => `<option value="${esc(month)}">${esc(monthLabel(month))} · 마감</option>`).join('');
  select.value = state.month;
}

async function getAnalysis() {
  if (!state.analysis || state.analysis.month !== state.month) state.analysis = await api(`/api/analysis?month=${encodeURIComponent(state.month)}`);
  return state.analysis;
}

async function navigate(page) {
  state.page = page;
  $$('.nav-item,.bottom-nav button').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  $('#pageTitle').textContent = pageNames[page] || pageNames.dashboard;
  const main = $('#mainContent'); main.innerHTML = '<div class="loading-panel">자료를 불러오고 있습니다…</div>';
  try {
    if (page === 'dashboard') await renderDashboard(main);
    else if (page === 'sales') await renderSales(main);
    else if (page === 'expenses') await renderExpenses(main);
    else if (page === 'inventory') await renderInventory(main);
    else if (page === 'profitability') await renderProfitability(main);
  } catch (error) { main.innerHTML = `<div class="notice warn">${esc(error.message)}</div>`; }
}

function heading(title, description, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">PREP CAFE OPERATIONS</p><h1>${esc(title)}</h1><p>${description}</p></div>${action}</div>`;
}

function closedMonthNotice(month) {
  return `<div class="notice"><span class="notice-icon">✓</span><div><strong>${esc(monthLabel(month))} 마감 자료 기준</strong> · 이 월의 모든 영업달력 날짜가 기록 완료 상태입니다. ${esc(state.reference.latestPriceDate)} 적용 최신 레시피·재료 가격으로 원가를 다시 계산합니다. 월별 비용 계획은 실제 지출에 더하지 않습니다.</div></div>`;
}

function metricCard(label, value, detail, extra = '') {
  return `<article class="metric-card"><div class="metric-label"><span>${esc(label)}</span>${extra}</div><div class="metric-value">${value}</div><div class="metric-detail">${detail}</div></article>`;
}

async function renderDashboard(main) {
  const analysis = await getAnalysis();
  const months = state.reference.closedMonths.slice(0, 6).reverse();
  const chartData = await Promise.all(months.map((month) => month === analysis.month ? analysis : api(`/api/analysis?month=${encodeURIComponent(month)}`)));
  const maxRevenue = Math.max(1, ...chartData.map((item) => item.netSales));
  const chart = chartData.map((item) => `<div class="chart-col"><span class="chart-value">${item.netSales ? `${(item.netSales / 1_000_000).toFixed(1)}백만` : '—'}</span><div class="bar-track"><div class="bar" style="height:${Math.max(2, item.netSales / maxRevenue * 100)}%" title="${esc(monthLabel(item.month))}: ${esc(money(item.netSales))}"></div></div><span class="chart-month">${esc(item.month.slice(2))}</span></div>`).join('');
  const topMenus = [...analysis.profitability].filter((item) => item.contribution !== null && item.quantity).sort((a, b) => b.contribution - a.contribution).slice(0, 5);
  const recentInspections = state.inventory.length ? state.inventory : (await api('/api/inventory')).materials;
  state.inventory = recentInspections;
  const inspected = recentInspections.filter((item) => item.inspection);
  main.innerHTML = `${heading('월별 손익 & 운영 현황', '마감된 월의 기록과 현재 가격 기준 재산정 결과를 확인합니다.')} ${closedMonthNotice(state.month)}
    <section class="metric-grid">
      ${metricCard('순매출 합계', money(analysis.netSales), `판매 기록 ${number(analysis.recordCount)}건 · ${number(analysis.quantity)}개 판매`)}
      ${metricCard('현재 원가 기준 재산정 손익', money(analysis.profit), '현재 레시피·가격 · 결제 수수료 · 날짜별 실제 비용 반영', '<span class="badge">재산정</span>')}
      ${metricCard('결제 수수료', `−${money(analysis.paymentFees)}`, '월 손익에서 한 번 차감 · 메뉴 공헌이익에는 미포함')}
      ${metricCard('날짜별 실제 비용', `−${money(analysis.actualExpenses)}`, '일자별 비용 기록만 반영 · 월별 계획 제외')}
    </section>
    ${analysis.available ? '' : `<div class="notice warn">${esc(analysis.reason || '계산에 필요한 원가 자료가 없습니다.')}</div>`}
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-head"><div><h2>최근 마감 월 순매출</h2><p>마감이 확인된 월만 표시합니다.</p></div><button class="button subtle small" data-page="profitability">메뉴 수익성 보기 →</button></div><div class="chart" aria-label="최근 6개월 매출 막대 그래프">${chart}</div><div class="panel-footnote">월 계획 금액은 손익 계산에서 제외되며, 2026년 9월은 아직 마감되지 않아 선택 목록에 나타나지 않습니다.</div></section>
      <section class="panel"><div class="panel-head"><div><h2>재료 마지막 실사</h2><p>실제로 입력한 수량과 실사일만 표시합니다.</p></div><button class="button subtle small" data-page="inventory">전체 재료 →</button></div>
        <div class="stat-strip"><span class="stat-chip">재료 ${state.reference.counts.materials}종</span><span class="stat-chip">실사 기록 ${inspected.length}종</span><span class="stock-state">미실사 ${state.reference.counts.materials - inspected.length}종</span></div>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>재료</th><th class="numeric">마지막 실사</th><th>실사 시각</th></tr></thead><tbody>${recentInspections.slice(0, 5).map((item) => `<tr><td><span class="row-title">${esc(item.name)}</span></td><td class="numeric">${item.inspection ? `${number(item.inspection.quantity)} ${esc(item.inspection.unit)}` : '<span class="stock-state">실사 기록 없음</span>'}</td><td>${item.inspection ? inspectionLabel(item.inspection) : '—'}</td></tr>`).join('')}</tbody></table></div>
      </section>
      <section class="panel"><div class="panel-head"><div><h2>공헌이익 상위 메뉴</h2><p>${esc(state.month)} · 최신 원가로 다시 계산</p></div><button class="button subtle small" data-page="profitability">전체 메뉴 →</button></div>
        <div class="table-wrap"><table><thead><tr><th>메뉴</th><th class="numeric">판매량</th><th class="numeric">현재 원가</th><th class="numeric">공헌이익</th></tr></thead><tbody>${topMenus.map((item) => `<tr><td><span class="row-title">${esc(item.menu)}</span><span class="row-subtitle">${esc(item.menuId)}</span></td><td class="numeric">${number(item.quantity)}</td><td class="numeric">${money(item.cost)}</td><td class="numeric positive">${money(item.contribution)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">이 달의 판매 기록이 없습니다.</td></tr>'}</tbody></table></div>
      </section>
      <section class="panel"><div class="panel-head"><div><h2>샘플 자료 준비 상태</h2><p>JSON 샘플 한 번만 DB에 적재했습니다.</p></div><span class="badge">가상 자료</span></div><div class="stat-strip">${[['판매', 'sales'], ['날짜별 비용', 'expenses'], ['메뉴', 'menus'], ['레시피', 'recipes'], ['재료', 'materials']].map(([name, key]) => `<span class="stat-chip">${name} ${number(state.reference.counts[key])}건</span>`).join('')}</div><div class="panel-footnote">Excel은 같은 자료의 다른 형식이라 함께 더하지 않았습니다.</div></section>
    </div>`;
}

function pager(page, total, pageSize, prefix) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return `<div class="pagination"><span>${number(total)}건 · ${page}/${pages}쪽</span><button class="button subtle small" data-action="${prefix}-page" data-page-number="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>이전</button><button class="button subtle small" data-action="${prefix}-page" data-page-number="${Math.min(pages, page + 1)}" ${page >= pages ? 'disabled' : ''}>다음</button></div>`;
}

async function renderSales(main) {
  const result = await api(`/api/sales?month=${encodeURIComponent(state.month)}&q=${encodeURIComponent(state.salesQuery)}&page=${state.salesPage}&pageSize=25`);
  state.salesRows = result.rows;
  const rows = result.rows.map((sale) => `<tr><td>${dateLabel(sale.date)}</td><td><span class="row-title">${esc(sale.menu_name)}</span><span class="row-subtitle">${esc(sale.menu_id)}</span></td><td>${esc(sale.channel)}</td><td class="numeric">${number(sale.quantity)}</td><td class="numeric">${money(sale.unit_price)}</td><td class="numeric">${money(sale.discount_amount)}</td><td class="numeric row-title">${money(sale.net_sales)}</td><td class="numeric">${money(sale.payment_fee)}</td><td><div class="inline-actions"><button class="button outline small" data-action="edit-sale" data-id="${esc(sale.sale_id)}">수정</button><button class="button subtle small" data-action="delete-sale" data-id="${esc(sale.sale_id)}">삭제</button></div></td></tr>`).join('');
  main.innerHTML = `${heading('판매 기록 관리', '판매 한 행은 날짜·메뉴·채널별로 합산한 기록입니다. 주문 한 건과 다릅니다.', '<button class="button accent" data-action="new-sale">＋ 판매 집계 추가</button>')}
    <div class="notice info"><span class="notice-icon">ⓘ</span><div>신규 기록은 메뉴 등록 단가로 순매출을 계산합니다. 할인과 실제 결제 수수료는 집계 행 전체 금액으로 입력하세요. 같은 날짜·메뉴·채널이 이미 있으면 중복을 막고 기존 기록 수정 여부를 묻습니다.</div></div>
    <section class="panel"><div class="toolbar"><div class="toolbar-left"><span class="stat-chip">${esc(monthLabel(state.month))}</span><span class="read-only-tag">총 ${number(result.total)}건</span></div><div class="toolbar-right"><input class="search-input" id="salesSearch" type="search" value="${esc(state.salesQuery)}" placeholder="날짜·메뉴·채널 검색" aria-label="판매 기록 검색"><button class="button subtle small" data-action="sales-search">검색</button></div></div>
    <div class="table-wrap"><table><thead><tr><th>판매일</th><th>메뉴</th><th>채널</th><th class="numeric">수량</th><th class="numeric">판매 단가</th><th class="numeric">할인</th><th class="numeric">순매출</th><th class="numeric">수수료</th><th>작업</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="empty-state">조건에 맞는 판매 기록이 없습니다.</td></tr>'}</tbody></table></div>${pager(result.page, result.total, result.pageSize, 'sales')}</section>`;
}

async function renderExpenses(main) {
  const result = await api(`/api/expenses?month=${encodeURIComponent(state.month)}&q=${encodeURIComponent(state.expenseQuery)}&page=${state.expensePage}&pageSize=25`);
  const rows = result.rows.map((expense) => `<tr><td>${dateLabel(expense.date)}</td><td><span class="row-title">${esc(expense.category)}</span></td><td class="numeric">${money(expense.amount)}</td><td>${esc(expense.recognition)}</td><td><span class="read-only-tag">조회 전용</span></td></tr>`).join('');
  main.innerHTML = `${heading('날짜별 비용 내역', '샘플의 실제 비용 기록을 조회합니다. 월별 계획은 이 목록과 월 손익에 다시 더하지 않습니다.')}
    <div class="notice info"><span class="notice-icon">ⓘ</span><div>계획에서 확정한 범위에 따라 비용 추가·수정·삭제는 제공하지 않습니다. 아래 날짜별 실제 비용만 손익에 한 번 반영됩니다.</div></div>
    <section class="panel"><div class="toolbar"><div class="toolbar-left"><span class="stat-chip">${esc(monthLabel(state.month))}</span><span class="read-only-tag">조회 전용</span><span class="read-only-tag">${number(result.total)}건</span></div><div class="toolbar-right"><input class="search-input" id="expenseSearch" type="search" value="${esc(state.expenseQuery)}" placeholder="날짜·분류 검색" aria-label="비용 내역 검색"><button class="button subtle small" data-action="expense-search">검색</button></div></div><div class="table-wrap"><table><thead><tr><th>날짜</th><th>분류</th><th class="numeric">실제 금액</th><th>인식 구분</th><th>자료 상태</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty-state">이 달의 비용 기록이 없습니다.</td></tr>'}</tbody></table></div>${pager(result.page, result.total, result.pageSize, 'expenses')}</section>`;
}

async function renderInventory(main) {
  const result = await api('/api/inventory'); state.inventory = result.materials;
  const inspected = result.materials.filter((item) => item.inspection).length;
  const rows = result.materials.map((item) => `<tr><td><span class="row-title">${esc(item.name)}</span><span class="row-subtitle">${esc(item.material_id)} · ${esc(item.unit)} · 포장 ${number(item.pack_quantity)} ${esc(item.unit)}</span></td><td>${esc(item.supplier_id)}</td><td class="numeric">${item.inspection ? `<span class="row-title">${number(item.inspection.quantity)} ${esc(item.inspection.unit)}</span>` : '<span class="stock-state">실사 기록 없음</span>'}</td><td>${item.inspection ? inspectionLabel(item.inspection) : '—'}</td><td>${item.inspection ? '<span class="badge">기록 있음</span>' : '<span class="stock-state">미실사</span>'}</td></tr>`).join('');
  main.innerHTML = `${heading('재료 실사', '직접 확인한 수량과 날짜·시각을 남깁니다. 판매량으로 재고를 추정하지 않습니다.', '<button class="button accent" data-action="new-inventory">＋ 실사 기록</button>')}
    <div class="notice info"><span class="notice-icon">ⓘ</span><div>입력 단위는 재료 기준인 g·ml·개입니다. 0은 실제로 센 수량이며, 실사하지 않은 재료는 “실사 기록 없음”으로 구분됩니다. kg·팩은 직접 기준 단위로 환산해 입력하세요.</div></div>
    <section class="metric-grid">${metricCard('관리 재료', `${number(result.materials.length)}종`, '가상 샘플의 전체 재료')}${metricCard('실사 기록 있음', `${number(inspected)}종`, '각 재료의 가장 최근 실사 기록')}${metricCard('실사 기록 없음', `${number(result.materials.length - inspected)}종`, '0으로 바꾸지 않고 별도 표시')}${metricCard('재고 계산', '미제공', '입고·폐기 후 현재고 추정은 범위 밖')}</section>
    <section class="panel"><div class="panel-head"><div><h2>재료별 마지막 실사 수량</h2><p>${number(result.materials.length)}종의 마지막 실측값과 날짜·시각</p></div><span class="read-only-tag">실사 이력 보존</span></div><div class="table-wrap"><table><thead><tr><th>재료</th><th>공급사 ID</th><th class="numeric">마지막 실사 수량</th><th>실사 시각</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function channelCostDetails(item) {
  if (item.status === '계산 불가') return '계산 불가';
  const details = item.channelCosts || [];
  return details.map((detail) => `${esc(detail.channel)} ${money(detail.unitCost, 1)}`).join(' · ');
}

async function renderProfitability(main) {
  const analysis = await getAnalysis();
  const rows = [...analysis.profitability].sort((a, b) => (b.contribution ?? -Infinity) - (a.contribution ?? -Infinity)).map((item, index) => `<tr><td><span class="rank-cell">${index + 1}</span></td><td><span class="row-title">${esc(item.menu)}</span><span class="row-subtitle">${esc(item.menuId)} · ${esc(item.category)}</span></td><td class="numeric">${money(item.menuPrice)}</td><td class="numeric">${number(item.quantity)}</td><td class="numeric">${money(item.netSales)}</td><td class="numeric">${item.unitCost === null ? '—' : money(item.unitCost, 1)}<span class="row-subtitle">${channelCostDetails(item) || '채널별 판매 없음'}</span></td><td class="numeric">${item.status === '계산 불가' ? '<span class="stock-state">계산 불가</span>' : money(item.cost)}</td><td class="numeric">${item.margin === null ? '—' : `<div class="margin-meter"><span>${(item.margin * 100).toFixed(1)}%</span><span class="margin-track"><span class="margin-fill" style="display:block;width:${Math.max(0, Math.min(100, item.margin * 100))}%"></span></span></div>`}</td><td class="numeric ${item.contribution === null ? '' : item.contribution >= 0 ? 'positive' : 'negative-text'}">${item.contribution === null ? esc(item.reason) : money(item.contribution)}</td></tr>`).join('');
  const totalContribution = analysis.available ? analysis.profitability.reduce((sum, item) => sum + (item.contribution ?? 0), 0) : null;
  main.innerHTML = `${heading('메뉴별 수익성 분석', '전체 메뉴의 판매량과 현재 레시피·가격 기준 원가 및 공헌이익입니다.')}${closedMonthNotice(state.month)}
    ${analysis.available ? '' : `<div class="notice warn">${esc(analysis.reason || '누락된 현재 원가 자료가 있어 전체 계산이 완료되지 않았습니다.')}</div>`}
    <section class="metric-grid">${metricCard('선택 월 메뉴 공헌이익', money(totalContribution), '순매출 − 최신 원가 · 결제 수수료 제외')}${metricCard('월 메뉴 원가', money(analysis.cost), `최신 가격 기준일 ${esc(analysis.costBasisDate || '확인 불가')}`)}${metricCard('총 판매 수량', `${number(analysis.quantity)}개`, '날짜·메뉴·채널 집계')}${metricCard('재산정 기준', esc(analysis.costBasisDate || '확인 불가'), '과거 판매도 현재 레시피·가격 적용')}</section>
    <section class="panel"><div class="panel-head"><div><h2>${esc(monthLabel(state.month))} 전체 메뉴 수익성</h2><p>공헌이익 = 할인 반영 순매출 − 최신 레시피 기준 원가. 수수료는 월 손익에 별도 반영합니다.</p></div><span class="badge">${number(analysis.profitability.length)}개 메뉴</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>메뉴</th><th class="numeric">등록 판매 단가</th><th class="numeric">판매량</th><th class="numeric">순매출</th><th class="numeric">1개당 원가</th><th class="numeric">총 원가</th><th class="numeric">공헌이익률</th><th class="numeric">공헌이익</th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel-footnote">재료 1단위 가격은 최신 적용 가격 ÷ 구매 포장량으로 계산합니다. 결과는 과거 당시 원가를 뜻하지 않으며, 공헌이익률은 순매출을 분모로 계산합니다.</div></section>
    <section class="panel"><div class="panel-head"><div><h2>현재 원가 기준 재산정 손익</h2><p>${esc(monthLabel(state.month))} · 날짜별 실제 비용만 포함</p></div></div><div class="table-wrap"><table><tbody><tr><td>순매출</td><td class="numeric">${money(analysis.netSales)}</td></tr><tr><td>현재 레시피·가격 기준 판매 원가</td><td class="numeric negative-text">${money(analysis.cost)}</td></tr><tr><td>기록된 결제 수수료</td><td class="numeric negative-text">−${money(analysis.paymentFees)}</td></tr><tr><td>날짜별 실제 비용</td><td class="numeric negative-text">−${money(analysis.actualExpenses)}</td></tr><tr><td class="row-title">재산정 손익</td><td class="numeric row-title">${money(analysis.profit)}</td></tr></tbody></table></div><div class="panel-footnote">월별 비용 계획은 합산하지 않았습니다. 값은 현재 원가로 과거 판매를 다시 계산한 관리용 수치입니다.</div></section>`;
}

function openSaleDialog(sale = null) {
  const form = $('#recordForm'); form.reset(); state.dialogMode = 'sale'; state.editingSaleId = sale?.sale_id || null;
  $('#dialogEyebrow').textContent = sale ? '판매 기록 수정' : '판매 기록';
  $('#dialogTitle').textContent = sale ? '판매 집계 수정' : '판매 집계 추가';
  $('#recordSubmit').textContent = sale ? '수정 저장' : '판매 기록 저장';
  $('#salesFormFields').hidden = false; $('#inventoryFormFields').hidden = true;
  setFieldGroupDisabled('#salesFormFields', false); setFieldGroupDisabled('#inventoryFormFields', true);
  const formEls = form.elements;
  formEls.namedItem('date').value = sale?.date || `${state.month}-${new Date(Number(state.month.slice(0, 4)), Number(state.month.slice(5, 7)), 0).getDate()}`;
  formEls.namedItem('menu_id').innerHTML = state.reference.menus.map((menu) => `<option value="${esc(menu.menu_id)}">${esc(menu.menu_id)} · ${esc(menu.name)} (${money(menu.price)})</option>`).join('');
  formEls.namedItem('channel').innerHTML = state.reference.channels.map((channel) => `<option value="${esc(channel)}">${esc(channel)}</option>`).join('');
  formEls.namedItem('quantity').value = sale?.quantity ?? '';
  formEls.namedItem('discount_amount').value = sale?.discount_amount ?? 0;
  formEls.namedItem('payment_fee').value = sale?.payment_fee ?? '';
  if (sale) { formEls.namedItem('menu_id').value = sale.menu_id; formEls.namedItem('channel').value = sale.channel; }
  $('#recordError').textContent = ''; updateSaleCalculation(); $('#recordDialog').showModal();
}

function openInventoryDialog() {
  const form = $('#recordForm'); form.reset(); state.dialogMode = 'inventory'; state.editingSaleId = null;
  $('#dialogEyebrow').textContent = '재고 실사'; $('#dialogTitle').textContent = '실제 수량 기록'; $('#recordSubmit').textContent = '실사 기록 저장';
  $('#salesFormFields').hidden = true; $('#inventoryFormFields').hidden = false;
  setFieldGroupDisabled('#salesFormFields', true); setFieldGroupDisabled('#inventoryFormFields', false);
  const formEls = form.elements;
  formEls.namedItem('inventory_date').value = currentDateTimeLocal();
  formEls.namedItem('material_id').innerHTML = state.reference.materials.map((material) => `<option value="${esc(material.material_id)}">${esc(material.material_id)} · ${esc(material.name)}</option>`).join('');
  updateInventoryUnit(); formEls.namedItem('inventory_quantity').value = '';
  $('#recordError').textContent = ''; $('#recordDialog').showModal();
}

function setFieldGroupDisabled(selector, disabled) { $$('.form-grid input,.form-grid select', $(selector)).forEach((el) => { el.disabled = disabled; }); }

function updateInventoryUnit() {
  const material = state.reference.materials.find((item) => item.material_id === $('#recordForm').elements.namedItem('material_id').value);
  $('#recordForm').elements.namedItem('unit').innerHTML = material ? `<option value="${esc(material.unit)}">${esc(material.unit)}</option>` : '';
}

function updateSaleCalculation() {
  if (state.dialogMode !== 'sale') return;
  const form = $('#recordForm').elements;
  const menu = state.reference.menus.find((item) => item.menu_id === form.namedItem('menu_id').value);
  const sale = state.editingSaleId ? state.salesRows.find((item) => item.sale_id === state.editingSaleId) : null;
  const price = sale ? Number(sale.unit_price) : Number(menu?.price);
  const qty = Number(form.namedItem('quantity').value || 0); const discount = Number(form.namedItem('discount_amount').value || 0);
  $('#saleCalculation').textContent = menu ? `판매 총액 ${money(price * qty)} − 할인 ${money(discount)} = 순매출 ${money(Math.max(0, price * qty - discount))} · ${sale ? '기록 당시' : '현재 메뉴'} 단가 ${money(price)}` : '판매 단가와 수량에서 할인액을 뺀 순매출을 저장합니다.';
}

async function saveSale() {
  const form = $('#recordForm').elements;
  const body = { sale_id: state.editingSaleId || undefined, date: form.namedItem('date').value, menu_id: form.namedItem('menu_id').value, channel: form.namedItem('channel').value, quantity: form.namedItem('quantity').value, discount_amount: form.namedItem('discount_amount').value, payment_fee: form.namedItem('payment_fee').value };
  try {
    const result = await api('/api/sales', { method: 'POST', body: JSON.stringify(body) });
    $('#recordDialog').close(); state.analysis = null; showToast(`${result.sale.menu_name} 판매 집계를 저장했습니다. 순매출 ${money(result.sale.net_sales)}.`); await navigate(state.page);
  } catch (error) {
    if (error.status === 409 && error.details?.duplicateId && !state.editingSaleId) {
      if (confirm('같은 날짜·메뉴·채널 집계가 있습니다. 기존 집계를 지금 입력한 값으로 수정할까요?')) {
        state.editingSaleId = error.details.duplicateId; $('#dialogEyebrow').textContent = '기존 판매 기록 수정'; $('#dialogTitle').textContent = '중복 집계 수정 확인'; $('#recordSubmit').textContent = '기존 기록 수정';
        return saveSale();
      }
      $('#recordError').textContent = '기존 집계는 변경하지 않았습니다. 날짜·메뉴·채널을 확인해 주세요.'; return;
    }
    if (error.details && typeof error.details === 'object') $('#recordError').textContent = Object.values(error.details).join(' ');
    else $('#recordError').textContent = saveErrorMessage(error);
  }
}

async function submitRecord(event) {
  event.preventDefault();
  if (state.dialogMode === 'sale') return saveSale();
  if (state.dialogMode === 'inventory') {
    const form = $('#recordForm').elements;
    const body = { inspected_at: form.namedItem('inventory_date').value, material_id: form.namedItem('material_id').value, quantity: form.namedItem('inventory_quantity').value, unit: form.namedItem('unit').value };
    try {
      const result = await api('/api/inventory', { method: 'POST', body: JSON.stringify(body) });
      state.inventory = []; $('#recordDialog').close(); showToast(`${result.material.name}: ${number(result.material.inspection.quantity)} ${result.material.inspection.unit} 실사값을 저장했습니다.`); await navigate(state.page);
    } catch (error) { $('#recordError').textContent = error.details ? Object.values(error.details).join(' ') : saveErrorMessage(error); }
  }
}

async function deleteSale(id) {
  const sale = state.salesRows.find((row) => row.sale_id === id);
  if (!sale || !confirm(`${dateLabel(sale.date)} ${sale.menu_name} ${sale.channel} ${number(sale.quantity)}개 집계를 삭제할까요?`)) return;
  try { await api(`/api/sales/${encodeURIComponent(id)}`, { method: 'DELETE' }); state.analysis = null; showToast('판매 기록을 삭제했습니다.'); await navigate('sales'); }
  catch (error) { showToast(error.message); }
}

document.addEventListener('click', async (event) => {
  const closeButton = event.target.closest('[data-close-dialog]');
  if (closeButton) { $('#recordDialog').close(); return; }
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) { await navigate(pageButton.dataset.page); return; }
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  if (action === 'new-sale') openSaleDialog();
  if (action === 'new-inventory') openInventoryDialog();
  if (action === 'sales-search') { state.salesQuery = $('#salesSearch').value.trim(); state.salesPage = 1; await renderSales($('#mainContent')); }
  if (action === 'expense-search') { state.expenseQuery = $('#expenseSearch').value.trim(); state.expensePage = 1; await renderExpenses($('#mainContent')); }
  if (action === 'sales-page') { state.salesPage = Number(button.dataset.pageNumber); await renderSales($('#mainContent')); }
  if (action === 'expenses-page') { state.expensePage = Number(button.dataset.pageNumber); await renderExpenses($('#mainContent')); }
  if (action === 'edit-sale') { const sale = state.salesRows.find((row) => row.sale_id === button.dataset.id); if (sale) openSaleDialog(sale); }
  if (action === 'delete-sale') await deleteSale(button.dataset.id);
});

$('#monthSelect').addEventListener('change', async (event) => { state.month = event.target.value; state.analysis = null; state.salesPage = 1; state.expensePage = 1; await navigate(state.page); });
$('#recordForm').addEventListener('submit', submitRecord);
$('#recordForm').addEventListener('input', updateSaleCalculation);
$('#recordForm').elements.namedItem('menu_id').addEventListener('change', updateSaleCalculation);
$('#recordForm').elements.namedItem('material_id').addEventListener('change', updateInventoryUnit);
$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#authError').textContent = '';
  const form = new FormData(event.currentTarget); const mode = event.currentTarget.dataset.mode;
  const body = Object.fromEntries(form.entries());
  try { await api(mode === 'setup' ? '/api/setup' : '/api/login', { method: 'POST', body: JSON.stringify(body) }); await initialize(); }
  catch (error) { $('#authError').textContent = error.message; }
});
async function logout() { await api('/api/logout', { method: 'POST', body: '{}' }); state.user = null; showAuth(true); }
$('#logoutButton').addEventListener('click', logout); $('#mobileLogout').addEventListener('click', logout);

initialize().catch((error) => { $('#authView').hidden = false; $('#authTitle').textContent = '앱을 시작할 수 없습니다'; $('#authDescription').textContent = error.message; $('#authForm').hidden = true; });
