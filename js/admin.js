// ============================================================
// Admin dashboard
// ============================================================

let state = {
  profile: null,
  rooms: [],
  tenancies: [],   // joined with room + tenant profile
  payments: [],    // joined with tenancy -> room + tenant profile
  announcements: [],
};

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

// How many beds in this room are currently taken by an active tenancy.
function occupiedCount(roomId) {
  return state.tenancies.filter((t) => t.room_id === roomId && t.status === 'active').length;
}

// Rooms with at least one free bed, not under maintenance.
function roomsWithSpace(excludeTenancyId = null) {
  return state.rooms
    .filter((r) => r.status !== 'maintenance')
    .map((r) => ({ ...r, taken: occupiedCount(r.id) }))
    .filter((r) => r.taken < r.capacity || (excludeTenancyId && state.tenancies.find((t) => t.id === excludeTenancyId)?.room_id === r.id));
}

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
  document.getElementById('add-payment-btn').addEventListener('click', openAddPaymentModal);
  document.getElementById('add-announcement-btn').addEventListener('click', openAddAnnouncementModal);
}

// ------------------------------------------------------------
// Data loading
// ------------------------------------------------------------
async function loadAll() {
  const [{ data: rooms }, { data: tenancies }, { data: payments }, { data: announcements }] = await Promise.all([
    supabase.from('rooms').select('*').order('room_number'),
    supabase.from('tenancies').select('*, room:rooms(*), tenant:profiles(*)').order('move_in_date', { ascending: false }),
    supabase.from('payments').select('*, tenancy:tenancies(*, room:rooms(*), tenant:profiles(*))').order('for_month', { ascending: false }),
    supabase.from('announcements').select('*, author:profiles(full_name)').order('created_at', { ascending: false }),
  ]);
  state.rooms = rooms || [];
  state.tenancies = tenancies || [];
  state.payments = payments || [];
  state.announcements = announcements || [];
}

function renderAll() {
  renderOverview();
  renderRooms();
  renderTenants();
  renderPayments();
  renderAnnouncements();
}

// ------------------------------------------------------------
// OVERVIEW
// ------------------------------------------------------------
function renderOverview() {
  const totalBeds = state.rooms.reduce((sum, r) => sum + r.capacity, 0);
  const bedsOccupied = state.tenancies.filter((t) => t.status === 'active').length;
  const bedsAvailable = totalBeds - bedsOccupied;
  const outstanding = state.payments
    .filter((p) => p.status !== 'paid')
    .reduce((sum, p) => sum + (p.amount_due - p.amount_paid), 0);

  document.getElementById('overview-stats').innerHTML = `
    <div class="stat-card"><div class="label">Total rooms</div><div class="value">${state.rooms.length}</div></div>
    <div class="stat-card"><div class="label">Total beds</div><div class="value">${totalBeds}</div></div>
    <div class="stat-card"><div class="label">Beds occupied</div><div class="value">${bedsOccupied}</div></div>
    <div class="stat-card"><div class="label">Beds available</div><div class="value">${bedsAvailable}</div></div>
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
      <thead><tr><th>Room</th><th>Monthly rate</th><th>Beds</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${state.rooms.map((r) => {
          const taken = occupiedCount(r.id);
          const isMaintenance = r.status === 'maintenance';
          const badgeClass = isMaintenance ? 'maintenance' : (taken >= r.capacity ? 'occupied' : 'vacant');
          const badgeLabel = isMaintenance ? 'Maintenance' : (taken >= r.capacity ? 'Full' : 'Available');
          return `
          <tr>
            <td>${r.room_number}</td>
            <td class="mono">${peso(r.monthly_rate)}</td>
            <td class="mono">${taken} / ${r.capacity}</td>
            <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
            <td style="white-space:nowrap;">
              <button class="btn btn-secondary edit-room-btn" data-id="${r.id}" style="font-size:0.8rem; padding:6px 10px;">Edit</button>
              <button class="btn btn-danger delete-room-btn" data-id="${r.id}" data-number="${r.room_number}" style="font-size:0.8rem; padding:6px 10px;">Delete</button>
            </td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  `;
  document.querySelectorAll('.edit-room-btn').forEach((btn) => {
    btn.addEventListener('click', () => openEditRoomModal(btn.dataset.id));
  });
  document.querySelectorAll('.delete-room-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteRoom(btn.dataset.id, btn.dataset.number));
  });
}

async function deleteRoom(roomId, roomNumber) {
  if (!confirm(`Delete ${roomNumber}? This can't be undone.`)) return;

  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) {
    // Foreign key restriction: a tenancy still points at this room.
    if (error.message.includes('foreign key') || error.code === '23503') {
      alert(`Can't delete ${roomNumber} — it has tenancy history on record. End or remove any tenancies for this room first.`);
    } else {
      alert('Could not delete the room. Please try again.');
    }
    return;
  }
  await loadAll();
  renderAll();
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
        <label for="monthly_rate">Monthly rate per bed (₱)</label>
        <input id="monthly_rate" type="number" min="0" step="0.01" required />
      </div>
      <div class="form-group">
        <label for="capacity">Number of beds</label>
        <input id="capacity" type="number" min="1" step="1" required value="1" />
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
    const capacity = parseInt(document.getElementById('capacity').value, 10);
    const { error } = await supabase.from('rooms').insert({ room_number, monthly_rate, capacity });
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

function openEditRoomModal(roomId) {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return;
  const taken = occupiedCount(roomId);

  renderModal(`
    <h3>Edit room</h3>
    <form id="edit-room-form">
      <div class="form-group">
        <label for="edit_room_number">Room number / label</label>
        <input id="edit_room_number" required value="${room.room_number}" />
      </div>
      <div class="form-group">
        <label for="edit_monthly_rate">Monthly rate per bed (₱)</label>
        <input id="edit_monthly_rate" type="number" min="0" step="0.01" required value="${room.monthly_rate}" />
      </div>
      <div class="form-group">
        <label for="edit_capacity">Number of beds</label>
        <input id="edit_capacity" type="number" min="${taken}" step="1" required value="${room.capacity}" />
        ${taken > 0 ? `<p class="hint-text">${taken} bed${taken === 1 ? '' : 's'} currently occupied — can't go below that.</p>` : ''}
      </div>
      <div class="form-group">
        <label for="edit_status">Status</label>
        <select id="edit_status">
          <option value="vacant" ${room.status !== 'maintenance' ? 'selected' : ''}>Available</option>
          <option value="maintenance" ${room.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
        </select>
      </div>
      <p class="error-text" id="edit-room-form-error"></p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-block">Save changes</button>
      </div>
    </form>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('edit-room-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const room_number = document.getElementById('edit_room_number').value.trim();
    const monthly_rate = parseFloat(document.getElementById('edit_monthly_rate').value);
    const capacity = parseInt(document.getElementById('edit_capacity').value, 10);
    const status = document.getElementById('edit_status').value;

    if (capacity < taken) {
      document.getElementById('edit-room-form-error').textContent = `Can't be less than ${taken}, the number of beds currently occupied.`;
      return;
    }

    const { error } = await supabase.from('rooms').update({ room_number, monthly_rate, capacity, status }).eq('id', roomId);
    if (error) {
      document.getElementById('edit-room-form-error').textContent = error.message.includes('duplicate')
        ? 'A room with that number already exists.'
        : 'Could not save changes. Please try again.';
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
      <thead><tr><th>Tenant</th><th>Room</th><th>Move-in</th><th>Deposit</th><th>Advance</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${state.tenancies.map((t) => `
          <tr>
            <td>${t.tenant?.full_name ?? 'Unknown'}<div class="hint-text">${t.tenant?.phone ?? ''}</div></td>
            <td>${t.room?.room_number ?? '—'}</td>
            <td class="mono">${fmtDate(t.move_in_date)}</td>
            <td class="mono">${peso(t.deposit_amount)}<div class="hint-text">${t.deposit_status}</div></td>
            <td class="mono">${peso(t.advance_amount)}<div class="hint-text">${t.advance_applied ? 'applied' : 'not applied'}</div></td>
            <td><span class="badge ${t.status === 'active' ? 'vacant' : 'maintenance'}">${t.status}</span></td>
            <td style="white-space:nowrap;">
              <button class="btn btn-secondary edit-tenancy-btn" data-id="${t.id}" style="font-size:0.8rem; padding:6px 10px;">Edit</button>
              ${t.status === 'active' ? `<button class="btn btn-secondary end-tenancy-btn" data-id="${t.id}" data-room="${t.room_id}" style="font-size:0.8rem; padding:6px 10px;">End tenancy</button>` : ''}
              <button class="btn btn-danger delete-tenancy-btn" data-id="${t.id}" data-room="${t.room_id}" data-status="${t.status}" style="font-size:0.8rem; padding:6px 10px;">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  document.querySelectorAll('.end-tenancy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('End this tenancy? The bed will free up for a new tenant.')) return;
      await supabase.from('tenancies').update({ status: 'ended', move_out_date: new Date().toISOString().slice(0, 10) }).eq('id', btn.dataset.id);
      await loadAll();
      renderAll();
    });
  });
  document.querySelectorAll('.edit-tenancy-btn').forEach((btn) => {
    btn.addEventListener('click', () => openEditTenancyModal(btn.dataset.id));
  });
  document.querySelectorAll('.delete-tenancy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const warn = btn.dataset.status === 'active'
        ? 'This tenancy is still active. Deleting also removes all of its payment records. Continue?'
        : 'Deleting this tenancy also removes all of its payment records. Continue?';
      if (!confirm(warn)) return;

      await supabase.from('tenancies').delete().eq('id', btn.dataset.id);
      await loadAll();
      renderAll();
    });
  });
}

function openEditTenancyModal(tenancyId) {
  const tenancy = state.tenancies.find((t) => t.id === tenancyId);
  if (!tenancy) return;

  // Room choices: any room with a free bed, plus the tenancy's current room.
  const roomOptions = roomsWithSpace(tenancyId);

  renderModal(`
    <h3>Edit tenancy</h3>
    <p class="hint-text" style="margin-top:0;">Tenant: <strong>${tenancy.tenant?.full_name ?? 'Unknown'}</strong></p>
    <form id="edit-tenancy-form">
      <div class="form-group">
        <label for="edit_room_id">Room</label>
        <select id="edit_room_id">
          ${roomOptions.map((r) => `<option value="${r.id}" ${r.id === tenancy.room_id ? 'selected' : ''}>${r.room_number} — ${peso(r.monthly_rate)} (${occupiedCount(r.id)}/${r.capacity} beds)</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="edit_move_in_date">Move-in date</label>
        <input id="edit_move_in_date" type="date" required value="${tenancy.move_in_date}" />
      </div>
      <div class="form-group">
        <label for="edit_tenancy_status">Status</label>
        <select id="edit_tenancy_status">
          <option value="active" ${tenancy.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="ended" ${tenancy.status === 'ended' ? 'selected' : ''}>Ended</option>
        </select>
      </div>
      <hr class="receipt-divider" />
      <div class="form-group">
        <label for="edit_deposit_amount">Security deposit (₱)</label>
        <input id="edit_deposit_amount" type="number" min="0" step="0.01" value="${tenancy.deposit_amount}" />
      </div>
      <div class="form-group">
        <label for="edit_deposit_status">Deposit status</label>
        <select id="edit_deposit_status">
          <option value="held" ${tenancy.deposit_status === 'held' ? 'selected' : ''}>Held</option>
          <option value="refunded" ${tenancy.deposit_status === 'refunded' ? 'selected' : ''}>Refunded</option>
          <option value="forfeited" ${tenancy.deposit_status === 'forfeited' ? 'selected' : ''}>Forfeited</option>
        </select>
      </div>
      <div class="form-group">
        <label for="edit_deposit_notes">Deposit notes (optional)</label>
        <input id="edit_deposit_notes" placeholder="e.g. ₱500 deducted for wall damage" value="${tenancy.deposit_notes ?? ''}" />
      </div>
      <div class="form-group">
        <label for="edit_advance_amount">Advance rent (₱)</label>
        <input id="edit_advance_amount" type="number" min="0" step="0.01" value="${tenancy.advance_amount}" />
      </div>
      <div class="form-group" style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="edit_advance_applied" style="width:auto;" ${tenancy.advance_applied ? 'checked' : ''} />
        <label for="edit_advance_applied" style="margin:0;">Advance has been applied to a month's rent</label>
      </div>
      <p class="error-text" id="edit-tenancy-form-error"></p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-block">Save changes</button>
      </div>
    </form>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('edit-tenancy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newRoomId = document.getElementById('edit_room_id').value;
    const move_in_date = document.getElementById('edit_move_in_date').value;
    const status = document.getElementById('edit_tenancy_status').value;
    const deposit_amount = parseFloat(document.getElementById('edit_deposit_amount').value) || 0;
    const deposit_status = document.getElementById('edit_deposit_status').value;
    const deposit_notes = document.getElementById('edit_deposit_notes').value.trim() || null;
    const advance_amount = parseFloat(document.getElementById('edit_advance_amount').value) || 0;
    const advance_applied = document.getElementById('edit_advance_applied').checked;

    const update = {
      room_id: newRoomId, move_in_date, status,
      deposit_amount, deposit_status, deposit_notes,
      advance_amount, advance_applied,
    };
    if (status === 'ended' && !tenancy.move_out_date) update.move_out_date = new Date().toISOString().slice(0, 10);
    if (status === 'active') update.move_out_date = null;

    const { error } = await supabase.from('tenancies').update(update).eq('id', tenancyId);
    if (error) {
      document.getElementById('edit-tenancy-form-error').textContent = 'Could not save changes. Please try again.';
      return;
    }

    closeModal();
    await loadAll();
    renderAll();
  });
}

async function openAddTenancyModal() {
  const { data: tenantProfiles } = await supabase.from('profiles').select('*').eq('role', 'tenant').order('full_name');
  const availableRooms = roomsWithSpace();

  if (!tenantProfiles || !tenantProfiles.length) {
    renderModal(`
      <h3>No tenant accounts found</h3>
      <p class="hint-text">Ask the tenant to create their own account on the sign-in page first
      (or add one yourself via the Supabase Dashboard under Authentication → Add user),
      then return here to assign them a room.</p>
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
          ${availableRooms.length
            ? availableRooms.map((r) => `<option value="${r.id}" data-rate="${r.monthly_rate}">${r.room_number} — ${peso(r.monthly_rate)} (${occupiedCount(r.id)}/${r.capacity} beds)</option>`).join('')
            : `<option value="" disabled selected>No rooms with a free bed</option>`}
        </select>
      </div>
      <div class="form-group">
        <label for="move_in_date">Move-in date</label>
        <input id="move_in_date" type="date" required value="${new Date().toISOString().slice(0, 10)}" />
      </div>
      <div class="form-group">
        <label for="deposit_amount">Security deposit collected (₱)</label>
        <input id="deposit_amount" type="number" min="0" step="0.01" value="0" />
      </div>
      <div class="form-group">
        <label for="advance_amount">Advance rent collected (₱)</label>
        <input id="advance_amount" type="number" min="0" step="0.01" value="0" />
      </div>
      <p class="error-text" id="tenancy-form-error"></p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-block" ${availableRooms.length ? '' : 'disabled'}>Save</button>
      </div>
    </form>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('add-tenancy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tenant_id = document.getElementById('tenant_id').value;
    const room_id = document.getElementById('room_id').value;
    const move_in_date = document.getElementById('move_in_date').value;
    const deposit_amount = parseFloat(document.getElementById('deposit_amount').value) || 0;
    const advance_amount = parseFloat(document.getElementById('advance_amount').value) || 0;

    const { error: tErr } = await supabase.from('tenancies').insert({ tenant_id, room_id, move_in_date, deposit_amount, advance_amount });
    if (tErr) {
      document.getElementById('tenancy-form-error').textContent = 'Could not save. Please try again.';
      return;
    }
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

function tablePayments(rows, { showActions = false, fullActions = false } = {}) {
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
            ${showActions ? `
              <td style="white-space:nowrap;">
                ${p.status !== 'paid' ? `<button class="btn mark-paid-btn" data-id="${p.id}" data-due="${p.amount_due}" style="font-size:0.8rem; padding:6px 10px;">Mark paid</button>` : ''}
                ${p.status === 'paid' ? `<button class="btn btn-secondary receipt-btn" data-id="${p.id}" style="font-size:0.8rem; padding:6px 10px;">Receipt</button>` : ''}
                ${fullActions ? `
                  <button class="btn btn-secondary edit-payment-btn" data-id="${p.id}" style="font-size:0.8rem; padding:6px 10px;">Edit</button>
                  <button class="btn btn-danger delete-payment-btn" data-id="${p.id}" style="font-size:0.8rem; padding:6px 10px;">Delete</button>
                ` : ''}
              </td>
            ` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderPayments() {
  const el = document.getElementById('payments-table');
  el.innerHTML = state.payments.length
    ? tablePayments(state.payments, { showActions: true, fullActions: true })
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
  document.querySelectorAll('.receipt-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const payment = state.payments.find((p) => p.id === btn.dataset.id);
      if (payment) openReceiptModal(payment);
    });
  });
  document.querySelectorAll('.edit-payment-btn').forEach((btn) => {
    btn.addEventListener('click', () => openEditPaymentModal(btn.dataset.id));
  });
  document.querySelectorAll('.delete-payment-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this payment record? This can\'t be undone.')) return;
      await supabase.from('payments').delete().eq('id', btn.dataset.id);
      await loadAll();
      renderAll();
    });
  });
}

function openAddPaymentModal() {
  const activeTenancies = state.tenancies.filter((t) => t.status === 'active');
  if (!activeTenancies.length) {
    renderModal(`
      <h3>No active tenancies</h3>
      <p class="hint-text">Assign a tenant to a room first before adding a payment record.</p>
      <button class="btn btn-block" id="modal-cancel">Close</button>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    return;
  }

  const today = new Date();
  renderModal(`
    <h3>Add payment</h3>
    <form id="add-payment-form">
      <div class="form-group">
        <label for="pay_tenancy_id">Tenant / room</label>
        <select id="pay_tenancy_id" required>
          ${activeTenancies.map((t) => `<option value="${t.id}" data-rate="${t.room.monthly_rate}">${t.tenant?.full_name ?? 'Unknown'} — ${t.room.room_number}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="pay_for_month">Billing month</label>
        <input id="pay_for_month" type="month" required value="${today.toISOString().slice(0, 7)}" />
      </div>
      <div class="form-group">
        <label for="pay_amount_due">Amount due (₱)</label>
        <input id="pay_amount_due" type="number" min="0" step="0.01" required value="${activeTenancies[0].room.monthly_rate}" />
      </div>
      <div class="form-group">
        <label for="pay_amount_paid">Amount already paid (₱)</label>
        <input id="pay_amount_paid" type="number" min="0" step="0.01" value="0" />
      </div>
      <div class="form-group">
        <label for="pay_due_date">Due date</label>
        <input id="pay_due_date" type="date" required value="${new Date(today.getFullYear(), today.getMonth(), 5).toISOString().slice(0, 10)}" />
      </div>
      <p class="error-text" id="add-payment-form-error"></p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-block">Save payment</button>
      </div>
    </form>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('pay_tenancy_id').addEventListener('change', (e) => {
    const rate = e.target.selectedOptions[0].dataset.rate;
    document.getElementById('pay_amount_due').value = rate;
  });
  document.getElementById('add-payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tenancy_id = document.getElementById('pay_tenancy_id').value;
    const for_month = document.getElementById('pay_for_month').value + '-01';
    const amount_due = parseFloat(document.getElementById('pay_amount_due').value);
    const amount_paid = parseFloat(document.getElementById('pay_amount_paid').value) || 0;
    const due_date = document.getElementById('pay_due_date').value;

    const { error } = await supabase.from('payments').insert({ tenancy_id, for_month, amount_due, amount_paid, due_date });
    if (error) {
      document.getElementById('add-payment-form-error').textContent = error.message.includes('duplicate')
        ? 'A payment for that tenant and month already exists.'
        : 'Could not save the payment. Please try again.';
      return;
    }
    closeModal();
    await loadAll();
    renderAll();
  });
}

function openEditPaymentModal(paymentId) {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment) return;

  renderModal(`
    <h3>Edit payment</h3>
    <p class="hint-text" style="margin-top:0;">${payment.tenancy?.tenant?.full_name ?? 'Unknown'} — ${payment.tenancy?.room?.room_number ?? ''}</p>
    <form id="edit-payment-form">
      <div class="form-group">
        <label for="edit_pay_amount_due">Amount due (₱)</label>
        <input id="edit_pay_amount_due" type="number" min="0" step="0.01" required value="${payment.amount_due}" />
      </div>
      <div class="form-group">
        <label for="edit_pay_amount_paid">Amount paid (₱)</label>
        <input id="edit_pay_amount_paid" type="number" min="0" step="0.01" required value="${payment.amount_paid}" />
      </div>
      <div class="form-group">
        <label for="edit_pay_due_date">Due date</label>
        <input id="edit_pay_due_date" type="date" required value="${payment.due_date}" />
      </div>
      <p class="error-text" id="edit-payment-form-error"></p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-block">Save changes</button>
      </div>
    </form>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('edit-payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount_due = parseFloat(document.getElementById('edit_pay_amount_due').value);
    const amount_paid = parseFloat(document.getElementById('edit_pay_amount_paid').value);
    const due_date = document.getElementById('edit_pay_due_date').value;

    const { error } = await supabase.from('payments').update({ amount_due, amount_paid, due_date }).eq('id', paymentId);
    if (error) {
      document.getElementById('edit-payment-form-error').textContent = 'Could not save changes. Please try again.';
      return;
    }
    closeModal();
    await loadAll();
    renderAll();
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
// ANNOUNCEMENTS
// ------------------------------------------------------------
function renderAnnouncements() {
  const el = document.getElementById('announcements-list');
  if (!state.announcements.length) {
    el.innerHTML = `<div class="empty-state card">No announcements yet. Post one and it'll show up on every tenant's dashboard.</div>`;
    return;
  }
  el.innerHTML = state.announcements.map((a) => `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <h3 style="font-size:1rem; margin-bottom:2px;">${a.title}</h3>
          <p class="hint-text" style="margin:0 0 12px;">
            ${fmtDate(a.created_at)}${a.author?.full_name ? ` · ${a.author.full_name}` : ''}
          </p>
        </div>
        <div style="display:flex; gap:8px; white-space:nowrap;">
          <button class="btn btn-secondary edit-announcement-btn" data-id="${a.id}" style="font-size:0.8rem; padding:6px 10px;">Edit</button>
          <button class="btn btn-danger delete-announcement-btn" data-id="${a.id}" style="font-size:0.8rem; padding:6px 10px;">Delete</button>
        </div>
      </div>
      <p style="white-space:pre-wrap; margin:0;">${a.body}</p>
    </div>
  `).join('');

  document.querySelectorAll('.edit-announcement-btn').forEach((btn) => {
    btn.addEventListener('click', () => openEditAnnouncementModal(btn.dataset.id));
  });
  document.querySelectorAll('.delete-announcement-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this announcement?')) return;
      await supabase.from('announcements').delete().eq('id', btn.dataset.id);
      await loadAll();
      renderAll();
    });
  });
}

function openAddAnnouncementModal() {
  renderModal(`
    <h3>New announcement</h3>
    <form id="add-announcement-form">
      <div class="form-group">
        <label for="ann_title">Title</label>
        <input id="ann_title" required placeholder="e.g. Water interruption Friday" />
      </div>
      <div class="form-group">
        <label for="ann_body">Message</label>
        <textarea id="ann_body" rows="4" required></textarea>
      </div>
      <p class="error-text" id="add-announcement-form-error"></p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-block">Post</button>
      </div>
    </form>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('add-announcement-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('ann_title').value.trim();
    const body = document.getElementById('ann_body').value.trim();

    const { error } = await supabase.from('announcements').insert({ title, body, created_by: state.profile.id });
    if (error) {
      document.getElementById('add-announcement-form-error').textContent = 'Could not post. Please try again.';
      return;
    }
    closeModal();
    await loadAll();
    renderAll();
  });
}

function openEditAnnouncementModal(id) {
  const a = state.announcements.find((x) => x.id === id);
  if (!a) return;

  renderModal(`
    <h3>Edit announcement</h3>
    <form id="edit-announcement-form">
      <div class="form-group">
        <label for="edit_ann_title">Title</label>
        <input id="edit_ann_title" required value="${a.title}" />
      </div>
      <div class="form-group">
        <label for="edit_ann_body">Message</label>
        <textarea id="edit_ann_body" rows="4" required>${a.body}</textarea>
      </div>
      <p class="error-text" id="edit-announcement-form-error"></p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-block">Save changes</button>
      </div>
    </form>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('edit-announcement-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('edit_ann_title').value.trim();
    const body = document.getElementById('edit_ann_body').value.trim();

    const { error } = await supabase.from('announcements').update({ title, body }).eq('id', id);
    if (error) {
      document.getElementById('edit-announcement-form-error').textContent = 'Could not save changes. Please try again.';
      return;
    }
    closeModal();
    await loadAll();
    renderAll();
  });
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
