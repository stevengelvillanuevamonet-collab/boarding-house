// ============================================================
// Tenant dashboard — read-only view scoped to the logged-in tenant
// (RLS on the backend enforces this even if the frontend had bugs)
// ============================================================

const peso2 = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fmtDate2 = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await requireAuth('tenant');
  if (!profile) return;

  document.getElementById('tenant-name').textContent = profile.full_name;
  document.getElementById('signout-btn').addEventListener('click', signOut);

  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('*, room:rooms(*)')
    .eq('tenant_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!tenancy) {
    document.getElementById('no-tenancy-msg').style.display = 'block';
    return;
  }

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('tenancy_id', tenancy.id)
    .order('for_month', { ascending: false });

  document.getElementById('tenancy-content').style.display = 'block';

  const outstanding = (payments || []).filter((p) => p.status !== 'paid').reduce((s, p) => s + (p.amount_due - p.amount_paid), 0);
  const nextDue = (payments || []).find((p) => p.status !== 'paid');

  document.getElementById('tenant-stats').innerHTML = `
    <div class="stat-card"><div class="label">Room</div><div class="value">${tenancy.room.room_number}</div></div>
    <div class="stat-card"><div class="label">Monthly rate</div><div class="value">${peso2(tenancy.room.monthly_rate)}</div></div>
    <div class="stat-card"><div class="label">Outstanding balance</div><div class="value">${peso2(outstanding)}</div></div>
    <div class="stat-card"><div class="label">Next due date</div><div class="value" style="font-size:1.1rem;">${nextDue ? fmtDate2(nextDue.due_date) : 'None due'}</div></div>
  `;

  const el = document.getElementById('tenant-payments-table');
  el.innerHTML = (payments && payments.length)
    ? `
      <table>
        <thead><tr><th>Month</th><th>Amount due</th><th>Amount paid</th><th>Due date</th><th>Status</th></tr></thead>
        <tbody>
          ${payments.map((p) => `
            <tr>
              <td class="mono">${new Date(p.for_month).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })}</td>
              <td class="mono">${peso2(p.amount_due)}</td>
              <td class="mono">${peso2(p.amount_paid)}</td>
              <td class="mono">${fmtDate2(p.due_date)}</td>
              <td><span class="stamp ${p.status}">${p.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : `<div class="empty-state">No payment records yet.</div>`;
});
