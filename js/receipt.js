// ============================================================
// Receipt system — builds a printable receipt for a paid payment.
// Self-contained: injects its own overlay into the page, so it
// works from any page that includes this script + config.js.
// ============================================================

function pesoReceipt(n) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function fmtDateReceipt(d) {
  return d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
}

/**
 * Opens a printable receipt for a payment.
 * `payment` must include the nested tenancy -> room/tenant data,
 * i.e. the shape returned by `.select('*, tenancy:tenancies(*, room:rooms(*), tenant:profiles(*)))')`.
 */
function openReceiptModal(payment) {
  const existing = document.getElementById('receipt-overlay');
  if (existing) existing.remove();

  const tenantName = payment.tenancy?.tenant?.full_name ?? 'Unknown';
  const roomNumber = payment.tenancy?.room?.room_number ?? '—';
  const monthLabel = new Date(payment.for_month).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' });
  const receiptNo = payment.receipt_no ? `OR-${String(payment.receipt_no).padStart(6, '0')}` : '—';

  const overlay = document.createElement('div');
  overlay.id = 'receipt-overlay';
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal receipt-modal">
      <div class="receipt-print" id="receipt-print-area">
        <div class="receipt-header">
          <div class="receipt-mark">⌂</div>
          <h2>Official Receipt</h2>
          <p>${BUSINESS_INFO.address}</p>
          <p>${BUSINESS_INFO.contact}</p>
        </div>

        <div class="receipt-row"><span>Receipt No.</span><span class="mono">${receiptNo}</span></div>
        <div class="receipt-row"><span>Date issued</span><span class="mono">${fmtDateReceipt(payment.paid_date)}</span></div>

        <hr class="receipt-divider" />

        <div class="receipt-row"><span>Received from</span><span>${tenantName}</span></div>
        <div class="receipt-row"><span>Room</span><span>${roomNumber}</span></div>
        <div class="receipt-row"><span>For the month of</span><span>${monthLabel}</span></div>

        <hr class="receipt-divider" />

        <div class="receipt-row receipt-total"><span>Amount paid</span><span class="mono">${pesoReceipt(payment.amount_paid)}</span></div>
        <div class="receipt-row"><span>Amount due</span><span class="mono">${pesoReceipt(payment.amount_due)}</span></div>

        <div class="receipt-signature">
          <div class="receipt-sign-line"></div>
          <p>Received by</p>
        </div>
      </div>

      <div class="receipt-actions no-print">
        <button type="button" class="btn btn-secondary btn-block" id="receipt-close-btn">Close</button>
        <button type="button" class="btn btn-block" id="receipt-print-btn">Print / Save as PDF</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('receipt-close-btn').addEventListener('click', () => overlay.remove());
  document.getElementById('receipt-print-btn').addEventListener('click', () => window.print());
}
