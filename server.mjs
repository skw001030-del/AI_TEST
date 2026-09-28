import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const scrypt = promisify(scryptCallback);
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const DB_PATH = process.env.PREP_CAFE_DB || join(ROOT, 'data', 'prep-cafe.sqlite');
const SAMPLE_PATH = join(ROOT, 'data', '매장운영데이터.json');
const SESSION_COOKIE = 'prep_cafe_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (kind, id)
  );
  CREATE INDEX IF NOT EXISTS records_by_kind_date ON records(kind, json_extract(payload, '$.date'));
  CREATE UNIQUE INDEX IF NOT EXISTS sales_natural_key ON records(
    json_extract(payload, '$.date'), json_extract(payload, '$.menu_id'), json_extract(payload, '$.channel')
  ) WHERE kind = 'sales';
  CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const hasSeed = db.prepare("SELECT 1 FROM app_settings WHERE key = 'sample_seeded'").get();
if (!hasSeed) {
  const sample = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'));
  const insert = db.prepare('INSERT INTO records(kind, id, payload) VALUES (?, ?, ?)');
  const setting = db.prepare('INSERT OR REPLACE INTO app_settings(key, value) VALUES (?, ?)');
  db.exec('BEGIN IMMEDIATE');
  try {
    const keyFields = {
      suppliers: 'supplier_id', materials: 'material_id', menus: 'menu_id', recipes: null,
      price_history: null, calendar: 'date', sales: 'sale_id', opening_inventory: 'material_id',
      inventory_events: 'event_id', expenses: 'expense_id', monthly_expense_plan: null,
    };
    for (const [kind, keyField] of Object.entries(keyFields)) {
      const rows = sample[kind] || [];
      rows.forEach((row, index) => {
        const id = keyField ? String(row[keyField]) : `${kind}_${String(index + 1).padStart(6, '0')}`;
        insert.run(kind, id, JSON.stringify(row));
      });
    }
    setting.run('sample_seeded', sample.meta.version || '1');
    setting.run('store_name', sample.meta.store_name || '프렙 카페');
    setting.run('sample_as_of', sample.meta.as_of || '2026-09-18');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const queryAll = db.prepare('SELECT payload FROM records WHERE kind = ?');
const rowsOf = (kind) => queryAll.all(kind).map((row) => JSON.parse(row.payload));
const queryById = db.prepare('SELECT payload FROM records WHERE kind = ? AND id = ?');
const findById = (kind, id) => {
  const row = queryById.get(kind, id);
  return row ? JSON.parse(row.payload) : null;
};
const writeRecord = db.prepare('INSERT INTO records(kind, id, payload) VALUES (?, ?, ?)');
const replaceRecord = db.prepare('UPDATE records SET payload = ? WHERE kind = ? AND id = ?');
const deleteRecord = db.prepare('DELETE FROM records WHERE kind = ? AND id = ?');

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', ...extraHeaders });
  res.end(body);
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('요청 내용이 너무 큽니다.');
  }
  try { return JSON.parse(body || '{}'); } catch { throw new Error('요청 형식이 올바르지 않습니다.'); }
}

function readCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function authenticated(req) {
  const token = readCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.user;
}

function closedMonths() {
  const calendar = rowsOf('calendar');
  const groups = new Map();
  for (const day of calendar) {
    const month = day.date.slice(0, 7);
    const group = groups.get(month) || { month, days: 0, complete: 0 };
    group.days += 1;
    if (day.record_complete === true) group.complete += 1;
    groups.set(month, group);
  }
  return [...groups.values()].filter((group) => group.days === new Date(Number(group.month.slice(0, 4)), Number(group.month.slice(5, 7)), 0).getDate() && group.complete === group.days).map((group) => group.month).sort().reverse();
}

const currency = (value) => Math.round(value);
function unitCostFor(menu, channel, recipes, prices) {
  const matching = recipes.filter((recipe) => recipe.menu_id === menu.menu_id && recipe.recipe_version === menu.recipe_version && (!recipe.channel_only || recipe.channel_only === channel));
  if (!matching.length) return { ok: false, reason: '현재 적용 레시피 없음' };
  let total = 0;
  for (const recipe of matching) {
    const price = prices.get(recipe.material_id);
    if (!price || !Number.isFinite(Number(price.pack_quantity)) || Number(price.pack_quantity) <= 0) return { ok: false, reason: '재료 최신 가격 없음' };
    total += Number(recipe.quantity) * Number(price.pack_price) / Number(price.pack_quantity);
  }
  return { ok: true, value: total };
}

function summarize(month) {
  if (!closedMonths().includes(month)) return { available: false, reason: '모든 날짜가 마감된 월만 분석할 수 있습니다.' };
  const sales = rowsOf('sales').filter((row) => row.date.startsWith(month));
  const expenses = rowsOf('expenses').filter((row) => row.date.startsWith(month));
  const menus = rowsOf('menus');
  const recipes = rowsOf('recipes');
  const priceRows = rowsOf('price_history');
  const priceByMaterial = new Map();
  for (const price of priceRows) {
    const old = priceByMaterial.get(price.material_id);
    if (!old || price.effective_date > old.effective_date) priceByMaterial.set(price.material_id, price);
  }
  const menuById = new Map(menus.map((menu) => [menu.menu_id, menu]));
  const profitability = menus.map((menu) => ({ menu, quantity: 0, netSales: 0, cost: 0, contribution: 0, channels: new Set(), channelStats: new Map(), errors: new Set() }));
  const profitByMenu = new Map(profitability.map((item) => [item.menu.menu_id, item]));
  let costTotal = 0;
  let netSalesTotal = 0;
  let paymentFeeTotal = 0;
  for (const sale of sales) {
    const menu = menuById.get(sale.menu_id);
    const aggregate = profitByMenu.get(sale.menu_id);
    if (!menu || !aggregate || !Number.isFinite(Number(sale.net_sales)) || !Number.isFinite(Number(sale.payment_fee))) continue;
    const cost = unitCostFor(menu, sale.channel, recipes, priceByMaterial);
    aggregate.quantity += Number(sale.quantity);
    aggregate.netSales += Number(sale.net_sales);
    aggregate.channels.add(sale.channel);
    const channelStat = aggregate.channelStats.get(sale.channel) || { channel: sale.channel, quantity: 0, cost: 0 };
    channelStat.quantity += Number(sale.quantity);
    if (!cost.ok) aggregate.errors.add(cost.reason);
    else {
      const rowCost = Number(sale.quantity) * cost.value;
      aggregate.cost += rowCost;
      channelStat.cost += rowCost;
      costTotal += rowCost;
    }
    aggregate.channelStats.set(sale.channel, channelStat);
    netSalesTotal += Number(sale.net_sales);
    paymentFeeTotal += Number(sale.payment_fee);
  }
  for (const item of profitability) item.contribution = item.errors.size ? null : item.netSales - item.cost;
  const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenseCategories = new Map();
  for (const row of expenses) expenseCategories.set(row.category, (expenseCategories.get(row.category) || 0) + Number(row.amount || 0));
  const costErrors = profitability.filter((item) => item.quantity && item.errors.size).map((item) => ({ menu: item.menu.name, reasons: [...item.errors] }));
  return {
    available: costErrors.length === 0,
    reason: costErrors.length ? '현재 레시피나 재료 가격이 빠진 메뉴가 있습니다.' : null,
    month,
    recordCount: sales.length,
    quantity: sales.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    netSales: netSalesTotal,
    cost: costErrors.length ? null : costTotal,
    paymentFees: paymentFeeTotal,
    actualExpenses: expenseTotal,
    profit: costErrors.length ? null : netSalesTotal - costTotal - paymentFeeTotal - expenseTotal,
    costBasisDate: [...priceByMaterial.values()].map((row) => row.effective_date).sort().at(-1) || null,
    expenseCategories: [...expenseCategories.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    profitability: profitability.map((item) => ({
      menuId: item.menu.menu_id, menu: item.menu.name, category: item.menu.category, menuPrice: Number(item.menu.price), quantity: item.quantity,
      netSales: item.netSales, cost: item.errors.size ? null : item.cost, unitCost: item.quantity && !item.errors.size ? item.cost / item.quantity : null,
      contribution: item.contribution, margin: item.netSales && item.contribution !== null ? item.contribution / item.netSales : null,
      channelCosts: [...item.channelStats.values()].map((channel) => ({ channel: channel.channel, unitCost: item.errors.size || !channel.quantity ? null : channel.cost / channel.quantity, quantity: channel.quantity })),
      channels: [...item.channels], status: item.errors.size ? '계산 불가' : item.quantity ? '판매 기록 있음' : '해당 월 판매 없음',
      reason: [...item.errors].join(', ') || null,
    })),
    costErrors,
  };
}

function referenceData() {
  const allRows = db.prepare('SELECT kind, count(*) AS count FROM records GROUP BY kind').all();
  const counts = Object.fromEntries(allRows.map((row) => [row.kind, row.count]));
  const menus = rowsOf('menus').sort((a, b) => a.menu_id.localeCompare(b.menu_id));
  const materials = rowsOf('materials').sort((a, b) => a.material_id.localeCompare(b.material_id));
  const channels = [...new Set(rowsOf('sales').map((row) => row.channel))].sort();
  return { storeName: db.prepare("SELECT value FROM app_settings WHERE key = 'store_name'").get()?.value || '프렙 카페', asOf: db.prepare("SELECT value FROM app_settings WHERE key = 'sample_as_of'").get()?.value || '2026-09-18', counts, menus, materials, channels, closedMonths: closedMonths(), latestPriceDate: rowsOf('price_history').map((row) => row.effective_date).sort().at(-1) };
}

function listSales(params) {
  const month = params.get('month') || '';
  const query = params.get('q')?.trim().toLowerCase() || '';
  const page = Math.max(1, Number(params.get('page') || 1));
  const pageSize = Math.min(50, Math.max(10, Number(params.get('pageSize') || 25)));
  const menus = new Map(rowsOf('menus').map((row) => [row.menu_id, row.name]));
  let rows = rowsOf('sales');
  if (month) rows = rows.filter((row) => row.date.startsWith(month));
  if (query) rows = rows.filter((row) => [row.date, row.menu_id, menus.get(row.menu_id), row.channel, row.sale_id].join(' ').toLowerCase().includes(query));
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.sale_id.localeCompare(a.sale_id));
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize).map((row) => ({ ...row, menu_name: menus.get(row.menu_id) || row.menu_id })), total: rows.length, page, pageSize };
}

function inventorySummary() {
  const materials = rowsOf('materials');
  const events = rowsOf('inventory_events').filter((row) => row.counted_quantity !== undefined && row.counted_quantity !== null);
  const latest = new Map();
  for (const row of events) {
    const previous = latest.get(row.material_id);
    const rowTime = row.inspected_at || `${row.date}T00:00`;
    const previousTime = previous ? previous.inspected_at || `${previous.date}T00:00` : '';
    if (!previous || `${rowTime} ${row.event_id}` > `${previousTime} ${previous.event_id}`) latest.set(row.material_id, row);
  }
  return materials.sort((a, b) => a.material_id.localeCompare(b.material_id)).map((material) => {
    const last = latest.get(material.material_id);
    return { ...material, inspection: last ? { date: last.date, inspectedAt: last.inspected_at || null, quantity: Number(last.counted_quantity), unit: last.unit || material.unit } : null };
  });
}

const emailIsValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function sendError(res, status, message, details) { json(res, status, { error: message, ...(details ? { details } : {}) }); }

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method || 'GET';
  if (method === 'GET' && url.pathname === '/api/session') {
    const owner = db.prepare("SELECT value FROM app_settings WHERE key = 'owner_email'").get();
    return json(res, 200, { configured: Boolean(owner), authenticated: Boolean(authenticated(req)), user: authenticated(req) || (owner ? { email: owner.value } : null) });
  }
  if (method === 'POST' && url.pathname === '/api/setup') {
    if (db.prepare("SELECT 1 FROM app_settings WHERE key = 'owner_email'").get()) return sendError(res, 409, '운영자 계정이 이미 만들어져 있습니다. 로그인해 주세요.');
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!name || name.length > 40 || !emailIsValid(email) || password.length < 8 || password.length > 128) return sendError(res, 400, '이름, 올바른 이메일, 8자 이상 비밀번호를 입력해 주세요.');
    const salt = randomBytes(16).toString('hex');
    const digest = (await scrypt(password, salt, 64)).toString('hex');
    const insert = db.prepare('INSERT OR IGNORE INTO app_settings(key, value) VALUES (?, ?)');
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare("SELECT 1 FROM app_settings WHERE key = 'owner_email'").get()) throw new Error('SETUP_COMPLETE');
      insert.run('owner_email', email);
      insert.run('owner_name', name);
      insert.run('owner_salt', salt);
      insert.run('owner_password', digest);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      if (error.message === 'SETUP_COMPLETE') return sendError(res, 409, '운영자 계정이 이미 만들어져 있습니다. 로그인해 주세요.');
      throw error;
    }
    const token = randomBytes(32).toString('base64url');
    const user = { email, name };
    sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL });
    return json(res, 201, { user }, { 'set-cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}` });
  }
  if (method === 'POST' && url.pathname === '/api/login') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const ownerEmail = db.prepare("SELECT value FROM app_settings WHERE key = 'owner_email'").get()?.value;
    const salt = db.prepare("SELECT value FROM app_settings WHERE key = 'owner_salt'").get()?.value;
    const expected = db.prepare("SELECT value FROM app_settings WHERE key = 'owner_password'").get()?.value;
    if (!ownerEmail || email !== ownerEmail || !salt || !expected) return sendError(res, 401, '이메일 또는 비밀번호를 확인해 주세요.');
    const actual = await scrypt(String(body.password || ''), salt, 64);
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) return sendError(res, 401, '이메일 또는 비밀번호를 확인해 주세요.');
    const token = randomBytes(32).toString('base64url');
    const user = { email: ownerEmail, name: db.prepare("SELECT value FROM app_settings WHERE key = 'owner_name'").get()?.value || '운영자' };
    sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL });
    return json(res, 200, { user }, { 'set-cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}` });
  }
  if (method === 'POST' && url.pathname === '/api/logout') {
    const token = readCookies(req)[SESSION_COOKIE];
    if (token) sessions.delete(token);
    return json(res, 200, { ok: true }, { 'set-cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
  }
  if (url.pathname.startsWith('/api/')) {
    const user = authenticated(req);
    if (!user) return sendError(res, 401, '로그인 후 다시 시도해 주세요.');
    if (method === 'GET' && url.pathname === '/api/reference') return json(res, 200, referenceData());
    if (method === 'GET' && url.pathname === '/api/analysis') {
      const month = url.searchParams.get('month') || closedMonths()[0];
      return json(res, 200, summarize(month));
    }
    if (method === 'GET' && url.pathname === '/api/sales') return json(res, 200, listSales(url.searchParams));
    if (method === 'POST' && url.pathname === '/api/sales') {
      const body = await readBody(req);
      const date = String(body.date || '');
      const menu = rowsOf('menus').find((row) => row.menu_id === body.menu_id);
      const channels = referenceData().channels;
      const quantity = Number(body.quantity);
      const discount = Number(body.discount_amount);
      const paymentFee = Number(body.payment_fee);
      const editingId = String(body.sale_id || '');
      const prior = editingId ? findById('sales', editingId) : null;
      const unitPrice = menu ? Number(prior?.unit_price ?? menu.price) : NaN;
      const errors = {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !rowsOf('calendar').some((row) => row.date === date)) errors.date = '영업 달력에 있는 날짜를 선택해 주세요.';
      if (!menu) errors.menu_id = '목록에 있는 메뉴를 선택해 주세요.';
      if (!channels.includes(body.channel)) errors.channel = '목록에 있는 판매 채널을 선택해 주세요.';
      if (!Number.isInteger(quantity) || quantity <= 0) errors.quantity = '판매 수량은 1 이상의 정수로 입력해 주세요.';
      if (body.discount_amount === '' || !Number.isFinite(discount) || discount < 0) errors.discount_amount = '할인 금액은 0 이상의 숫자로 입력해 주세요.';
      if (body.payment_fee === '' || !Number.isFinite(paymentFee) || paymentFee < 0) errors.payment_fee = '결제 수수료는 0 이상의 실제 금액으로 입력해 주세요.';
      if (Number.isFinite(discount) && Number.isFinite(quantity) && Number.isFinite(unitPrice) && discount > quantity * unitPrice) errors.discount_amount = '할인은 판매 총액보다 클 수 없습니다.';
      if (Object.keys(errors).length) return sendError(res, 400, '입력값을 확인해 주세요.', errors);
      const duplicate = rowsOf('sales').find((row) => row.date === date && row.menu_id === menu.menu_id && row.channel === body.channel && row.sale_id !== editingId);
      if (duplicate) return sendError(res, 409, '같은 날짜·메뉴·채널 집계가 이미 있습니다. 기존 기록을 수정할까요?', { duplicateId: duplicate.sale_id });
      if (editingId && !prior) return sendError(res, 404, '수정할 판매 기록을 찾지 못했습니다.');
      const record = {
        sale_id: editingId || `LOCAL-${randomUUID()}`, date, menu_id: menu.menu_id, channel: body.channel,
        quantity, unit_price: unitPrice, discount_amount: discount, net_sales: quantity * unitPrice - discount,
        payment_fee: paymentFee, recipe_version: menu.recipe_version,
        unit_food_cost_snapshot: null, unit_packaging_cost_snapshot: null,
      };
      try {
        if (prior) replaceRecord.run(JSON.stringify(record), 'sales', editingId);
        else writeRecord.run('sales', record.sale_id, JSON.stringify(record));
      } catch (error) {
        if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') return sendError(res, 409, '같은 날짜·메뉴·채널 기록이 이미 있습니다.');
        throw error;
      }
      return json(res, prior ? 200 : 201, { sale: { ...record, menu_name: menu.name } });
    }
    const saleMatch = url.pathname.match(/^\/api\/sales\/([^/]+)$/);
    if (saleMatch && method === 'DELETE') {
      const id = decodeURIComponent(saleMatch[1]);
      if (!findById('sales', id)) return sendError(res, 404, '판매 기록을 찾지 못했습니다.');
      deleteRecord.run('sales', id);
      return json(res, 200, { ok: true });
    }
    if (method === 'GET' && url.pathname === '/api/expenses') {
      const month = url.searchParams.get('month') || '';
      const query = url.searchParams.get('q')?.trim().toLowerCase() || '';
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));
      const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get('pageSize') || 25)));
      let rows = rowsOf('expenses');
      if (month) rows = rows.filter((row) => row.date.startsWith(month));
      if (query) rows = rows.filter((row) => [row.date, row.category, row.recognition].join(' ').toLowerCase().includes(query));
      rows.sort((a, b) => b.date.localeCompare(a.date));
      return json(res, 200, { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, editable: false });
    }
    if (method === 'GET' && url.pathname === '/api/inventory') return json(res, 200, { materials: inventorySummary() });
    if (method === 'POST' && url.pathname === '/api/inventory') {
      const body = await readBody(req);
      const material = rowsOf('materials').find((row) => row.material_id === body.material_id);
      const inspectedAt = String(body.inspected_at || '');
      const date = inspectedAt.slice(0, 10);
      const quantity = Number(body.quantity);
      const errors = {};
      if (!material) errors.material_id = '목록에 있는 재료를 선택해 주세요.';
      if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(inspectedAt) || !rowsOf('calendar').some((row) => row.date === date)) errors.inspected_at = '영업 달력에 있는 실사 날짜와 시각을 입력해 주세요.';
      if (body.quantity === '' || !Number.isFinite(quantity) || quantity < 0) errors.quantity = '실사 수량은 0 이상의 숫자로 입력해 주세요.';
      if (material && body.unit !== material.unit) errors.unit = `이 재료의 기준 단위는 ${material.unit}입니다.`;
      if (Object.keys(errors).length) return sendError(res, 400, '입력값을 확인해 주세요.', errors);
      const event = { event_id: `LOCAL-${randomUUID()}`, date, inspected_at: inspectedAt, material_id: material.material_id, event_type: '실사', quantity: 0, counted_quantity: quantity, unit: material.unit, reason: '사용자 실사 기록' };
      writeRecord.run('inventory_events', event.event_id, JSON.stringify(event));
      return json(res, 201, { material: inventorySummary().find((row) => row.material_id === material.material_id) });
    }
    return sendError(res, 404, '요청한 기능을 찾지 못했습니다.');
  }

  if (method === 'GET') {
    const relative = url.pathname === '/' ? 'index.html' : normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
    const filePath = join(ROOT, 'public', relative);
    if (!filePath.startsWith(join(ROOT, 'public'))) return sendError(res, 403, '요청한 파일에 접근할 수 없습니다.');
    if (!existsSync(filePath)) return sendError(res, 404, '페이지를 찾지 못했습니다.');
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    const body = readFileSync(filePath);
    res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-cache' });
    return res.end(body);
  }
  return sendError(res, 405, '지원하지 않는 요청입니다.');
}

const server = createServer((req, res) => {
  Promise.resolve(handle(req, res)).catch((error) => {
    console.error('[server]', error.message);
    if (!res.headersSent) json(res, 500, { error: '요청을 처리하지 못했습니다. 다시 시도해 주세요.' });
    else res.end();
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`Prep Cafe Ops is ready at http://127.0.0.1:${PORT}`));
for (const [signal, code] of [['SIGINT', 0], ['SIGTERM', 0]]) process.on(signal, () => { server.close(() => { db.close(); process.exit(code); }); });
