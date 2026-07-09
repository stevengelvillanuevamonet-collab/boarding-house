// ============================================================
// Admin dashboard
// ============================================================

let state = {
  profile: null,
  rooms: [],
  tenancies: [],   // joined with room + tenant profile
  payments: [],    // joined with tenancy -> room + tenant profile
};

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await requireAuth('admin');
  if (!profile) return;
  state.profile = profile;
  document.getElementById('admin-name').textContent = profile.full_name;
  document.getElementById('today-date').textContent = fmtDate(new Date());
  document.getElementById('signout-btn').addEventListener('click', signOut);

  setupNav();
  setupActions();
  await loadAll();
  renderAll();
});

// ------------------------------------------------------------
// Navigation between sections
// ------------------------------------------------------------
function setupNav() {
  document.querySelectorAll('.nav-item[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('main > section').forEach((s) => (s.style.display = 'none'));
      document.getElementById(`section-${btn.dataset.section}`).style.display = 'block';
    });
  });
}

function setupActions() {
  document.getElementById('add-room-btn').addEventListener('click', openAddRoomModal);
  document.getElementById('add-tenancy-btn').addEventListener('click', openAddTenancyModal);
  document.getElementById('generate-month-btn').addEventListener('click', generateThisMonth);
}

// ------------------------------------------------------------
// Data loading
// ------------------------------------------------------------
async function loadAll() {
  const [{ data: rooms }, { data: tenancies }, { data: payments }] = await Promise.all([
    supabase.from('rooms').select('*').order('room_number'),
    supabase.from('tenancies').select('*, room:rooms(*), tenant:profiles(*)').order('move_in_date', { ascending: false }),
    supabase.from('payments').select('*, tenancy:tenancies(*, room:rooms(*), tenant:profiles(*))').order('for_month', { ascending: false }),
  ]);
  state.rooms = rooms || [];
  state.tenancies = tenancies || [];
  state.payments = payments || [];
}

function renderAll() {
  renderOverview();
  renderRooms();
  renderTenants();
  renderPayments();
}

// ------------------------------------------------------------
// OVERVIEW
// ------------------------------------------------------------
function renderOverview() {
  const occupied = state.rooms.filter((r) => r.status === 'occupied').length;
  const vacant = state.rooms.filter((r) => r.status === 'vacant').length;
  const activeTenants = state.tenancies.filter((t) => t.status === 'active').length;
  const outstanding = state.payments
    .filter((p) => p.status !== 'paid')
    .reduce((sum, p) => sum + (p.amount_due - p.amount_paid), 0);

  document.getElementById('overview-stats').innerHTML = `
    <div class="stat-card"><div class="label">Total rooms</div><div class="value">${state.rooms.length}</div></div>
    <div class="stat-card"><div class="label">Occupied</div><div class="value">${occupied}</div></div>
    <div class="stat-card"><div class="label">Vacant</div><div class="value">${vacant}</div></div>
    <div class="stat-card"><div class="label">Active tenants</div><div class="value">${activeTenants}</div></div>
    <div class="stat-card"><div class="label">Outstanding</div><div class="value">${peso(outstanding)}</div></div>
  `;

  const dueRows = state.payments.filter((p) => p.status !== 'paid');
  document.getElementById('overview-due-table').innerHTML = dueRows.length
    ? tablePayments(dueRows, { showActions: true })
    : `<div class="empty-state">Nothing due right now. All caught up.</div>`;
  bindPaymentActions();
}

// ------------------------------------------------------------
// ROOMS
// ------------------------------------------------------------
function renderRooms() {
  const el = document.getElementById('rooms-table');
  if (!state.rooms.length) {
    el.innerHTML = `<div class="empty-state">No rooms yet. Add your first room to get started.</div>`;
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Room</th><th>Monthly rate</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${state.rooms.map((r) => `
          <tr>
            <td>${r.room_number}</td>
            <td class="mono">${peso(r.monthly_rate)}</td>
            <td><span class="badge ${r.status}">${r.status}</span></td>
            <td>
              <select data-room-id="${r.id}" class="room-status-select" style="width:auto; padding:6px 8px; font-size:0.82rem;">
                <option value="vacant" ${r.status === 'vacant' ? 'selected' : ''}>Vacant</option>
                <option value="occupied" ${r.status === 'occupied' ? 'selected' : ''}>Occupied</option>
                <option value="maintenance" ${r.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
              </select>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  document.querySelectorAll('.room-status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await supabase.from('rooms').update({ status: sel.value }).eq('id', sel.dataset.roomId);
      await loadAll();
      renderAll();
    });
  });
}

function openAddRoomModal() {
  renderModal(`
    <h3>Add room</h3>
    <form id="add-room-form">
      <div class="form-group">
        <label for="room_number">Room number / label</label>
        <input id="room_number" required placeholder="e.g. Room 1" />
      </div>
      <div class="form-group">
        <label for="monthly_rate">Monthly rate (₱)</label>
        <input id="monthly_rate" type="number" min="0" step="0.01" required />
      </div>
      <p class="error-text" id="room-form-error"></p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-block">Save room</button>
      </div>
    </form>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('add-room-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const room_number = document.getElementById('room_number').value.trim();
    const monthly_rate = parseFloat(document.getElementById('monthly_rate').value);
    const { error } = await supabase.from('rooms').insert({ room_number, monthly_rate });
    if (error) {
      document.getElementById('room-form-error').textContent = error.message.includes('duplicate')
        ? 'A room with that number already exists.'
        : 'Could not save the room. Please try again.';
      return;
    }
    closeModal();
    await loadAll();
    renderAll();
  });
}

// ------------------------------------------------------------
// TENANTS / TENANCIES
// ------------------------------------------------------------
function renderTenants() {
  const el = document.getElementById('tenants-table');
  if (!state.tenancies.length) {
    el.innerHTML = `<div class="empty-state">No tenancies yet. Assign a room to a tenant to begin.</div>`;
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Tenant</th><th>Room</th><th>Move-in</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${state.tenancies.map((t) => `
          <tr>
            <td>${t.tenant?.full_name ?? 'Unknown'}<div class="hint-text">${t.tenant?.phone ?? ''}</div></td>
            <td>${t.room?.room_number ?? '—'}</td>
            <td class="mono">${fmtDate(t.move_in_date)}</td>
            <td><span class="badge ${t.status === 'active' ? 'vacant' : 'maintenance'}">${t.status}</span></td>
            <td>${t.status === 'active' ? `<button class="btn btn-secondary end-tenancy-btn" data-id="${t.id}" data-room="${t.room_id}" style="font-size:0.8rem; padding:6px 10px;">End tenancy</button>` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  document.querySelectorAll('.end-tenancy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('End this tenancy? The room will be marked vacant.')) return;
      await supabase.from('tenancies').update({ status: 'ended', move_out_date: new Date().toISOString().slice(0, 10) }).eq('id', btn.dataset.id);
      await supabase.from('rooms').update({ status: 'vacant' }).eq('id', btn.dataset.room);
      await loadAll();
      renderAll();
    });
  });
}

async function openAddTenancyModal() {
  const { data: tenantProfiles } = await supabase.from('profiles').select('*').eq('role', 'tenant').order('full_name');
  const vacantRooms = state.rooms.filter((r) => r.status === 'vacant');

  if (!tenantProfiles || !tenantProfiles.length) {
    renderModal(`
      <h3>No tenant accounts found</h3>
      <p class="hint-text">Create a login for the tenant first in the Supabase Dashboard under
      Authentication → Add user, then return here to assign them a room.</p>
      <button class="btn btn-block" id="modal-cancel">Close</button>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    return;
  }

  renderModal(`
    <h3>Assign room to tenant</h3>
    <form id="add-tenancy-form">
      <div class="form-group">
        <label for="tenant_id">Tenant</label>
        <select id="tenant_id" required>
          ${tenantProfiles.map((p) => `<option value="${p.id}">${p.full_name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="room_id">Room</label>
        <select id="room_id" required>
          ${vacantRooms.length
            ? vacantRooms.map((r) => `<option value="${r.id}" data-rate="${r.monthly_rate}">${r.room_number} — ${peso(r.monthly_rate)}</option>`).join('')
            : `<option value="" disabled selected>No vacant rooms</option>`}
        </select>
      </div>
      <div class="form-group">
        <label for="move_in_date">Move-in date</label>
        <input id="move_in_date" type="date" required value="${new Date().toISOString().slice(0, 10)}" />
      </div>
      <p class="error-text" id="tenancy-form-error"></p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-block" ${vacantRooms.length ? '' : 'disabled'}>Save</button>
      </div>
    </form>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('add-tenancy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tenant_id = document.getElementById('tenant_id').value;
    const room_id = document.getElementById('room_id').value;
    const move_in_date = document.getElementById('move_in_date').value;

    const { error: tErr } = await supabase.from('tenancies').insert({ tenant_id, room_id, move_in_date });
    if (tErr) {
      document.getElementById('tenancy-form-error').textContent = 'Could not save. Please try again.';
      return;
    }
    await supabase.from('rooms').update({ status: 'occupied' }).eq('id', room_id);
    closeModal();
    await loadAll();
    renderAll();
  });
}

// ------------------------------------------------------------
// PAYMENTS
// ------------------------------------------------------------
function statusStamp(status) {
  return `<span class="stamp ${status}">${status}</span>`;
}

function tablePayments(rows, { showActions = false } = {}) {
  return `
    <table>
      <thead>
        <tr><th>Tenant</th><th>Room</th><th>Month</th><th>Due</th><th>Paid</th><th>Due date</th><th>Status</th>${showActions ? '<th></th>' : ''}</tr>
      </thead>
      <tbody>
        ${rows.map((p) => `
          <tr>
            <td>${p.tenancy?.tenant?.full_name ?? '—'}</td>
            <td>${p.tenancy?.room?.room_number ?? '—'}</td>
            <td class="mono">${new Date(p.for_month).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })}</td>
            <td class="mono">${peso(p.amount_due)}</td>
            <td class="mono">${peso(p.amount_paid)}</td>
            <td class="mono">${fmtDate(p.due_date)}</td>
            <td>${statusStamp(p.status)}</td>
            ${showActions ? `<td>${p.status !== 'paid' ? `<button class="btn mark-paid-btn" data-id="${p.id}" data-due="${p.amount_due}" style="font-size:0.8rem; padding:6px 10px;">Mark paid</button>` : ''}</td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderPayments() {
  const el = document.getElementById('payments-table');
  el.innerHTML = state.payments.length
    ? tablePayments(state.payments, { showActions: true })
    : `<div class="empty-state">No payment records yet. Click "Generate this month's rent" once tenants are assigned.</div>`;
  bindPaymentActions();
}

function bindPaymentActions() {
  document.querySelectorAll('.mark-paid-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await supabase.from('payments').update({
        amount_paid: parseFloat(btn.dataset.due),
        paid_date: new Date().toISOString().slice(0, 10),
      }).eq('id', btn.dataset.id);
      await loadAll();
      renderAll();
    });
  });
}

async function generateThisMonth() {
  const activeTenancies = state.tenancies.filter((t) => t.status === 'active');
  if (!activeTenancies.length) {
    alert('No active tenancies to generate rent for.');
    return;
  }
  const now = new Date();
  const forMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const dueDate = new Date(now.getFullYear(), now.getMonth(), 5).toISOString().slice(0, 10);

  const rows = activeTenancies.map((t) => ({
    tenancy_id: t.id,
    for_month: forMonth,
    amount_due: t.room.monthly_rate,
    due_date: dueDate,
  }));

  // upsert avoids duplicate rows if this month was already generated
  const { error } = await supabase.from('payments').upsert(rows, { onConflict: 'tenancy_id,for_month', ignoreDuplicates: true });
  if (error) {
    alert('Could not generate payments: ' + error.message);
    return;
  }
  await loadAll();
  renderAll();
}

// ------------------------------------------------------------
// Modal helper
// ------------------------------------------------------------
function renderModal(innerHtml) {
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">${innerHtml}</div>
    </div>
  `;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}
