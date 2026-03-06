'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Parse a French-style number string (accepts comma or dot as decimal sep) */
function parseNum(str) {
  if (!str || !str.trim()) return NaN;
  return parseFloat(str.trim().replace(/\s/g, '').replace(',', '.'));
}

/** Format a number as French currency (e.g. 1 234,56 €) */
function fmtEur(value, decimals = 2) {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + ' €';
}

/** Format a percentage */
function fmtPct(value, decimals = 3) {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + ' %';
}

// ─── Suivi: date helpers ──────────────────────────────────────────────────────

/** Parse an ISO date string (YYYY-MM-DD) as local midnight, avoiding UTC offsets */
function parseLocalDate(isoStr) {
  if (!isoStr) return null;
  const parts = isoStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Count how many monthly payments have been collected up to today.
 * @param {Date} firstPaymentDate  - local Date of the first payment
 * @returns {number}
 */
function computeMonthsPaid(firstPaymentDate) {
  if (!firstPaymentDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (firstPaymentDate > today) return 0;
  const totalMonths =
    (today.getFullYear() - firstPaymentDate.getFullYear()) * 12 +
    (today.getMonth()    - firstPaymentDate.getMonth());
  // Add 1 if today's day >= payment day (this month's payment has been collected)
  return today.getDate() >= firstPaymentDate.getDate()
    ? totalMonths + 1
    : totalMonths;
}

/** Format a Date as "juil. 2025" */
function fmtMonthYear(date) {
  return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

/** Return a new Date offset by n months (clamped to end of target month) */
function addMonths(date, n) {
  const d = new Date(date);
  const targetMonth = d.getMonth() + n;
  d.setMonth(targetMonth);
  // Clamp: if day overflowed into next month, go back to last day of target month
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0); // last day of previous month
  }
  return d;
}

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Calculate loan insurance breakdown.
 *
 * @param {number} capital   - borrowed capital in €
 * @param {number} totalMonthly - total monthly payment (interest + principal + insurance)
 * @param {number} annualRate   - nominal annual interest rate in % (e.g. 3.5)
 * @param {number} durationMonths - loan duration in months
 * @returns {object} result object
 */
function calculate(capital, totalMonthly, annualRate, durationMonths) {
  const r = annualRate / 100 / 12; // monthly interest rate (decimal)
  const n = durationMonths;

  // Monthly payment WITHOUT insurance (standard amortisation formula)
  let monthlyWithoutInsurance;
  if (r === 0) {
    // Zero-rate edge case
    monthlyWithoutInsurance = capital / n;
  } else {
    monthlyWithoutInsurance = capital * r / (1 - Math.pow(1 + r, -n));
  }

  const insuranceMonthly  = totalMonthly - monthlyWithoutInsurance;
  const insuranceAnnual   = insuranceMonthly * 12;
  const insuranceTotal    = insuranceMonthly * n;
  const insurancePct      = (insuranceMonthly / totalMonthly) * 100;

  // TAEA — Taux Annuel Effectif d'Assurance (on initial capital)
  const taea = (insuranceAnnual / capital) * 100;

  // Total interest cost
  const totalInterest = (monthlyWithoutInsurance * n) - capital;

  return {
    monthlyWithoutInsurance,
    insuranceMonthly,
    insuranceAnnual,
    insuranceTotal,
    insurancePct,
    taea,
    totalInterest,
  };
}

// ─── Donut chart (Canvas API) ─────────────────────────────────────────────────

/**
 * Draw a donut pie chart on a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{value: number, color: string, label: string}>} segments
 */
function getThemeColors() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    holeFill:    dark ? '#1E293B' : 'white',
    textColor:   dark ? '#E5E7EB' : '#374151',
    subtextColor: '#9CA3AF',
  };
}

function drawDonut(canvas, segments) {
  const { holeFill, textColor, subtextColor } = getThemeColors();
  const ctx    = canvas.getContext('2d');
  const size   = canvas.width;
  const cx     = size / 2;
  const cy     = size / 2;
  const outerR = size * 0.44;
  const innerR = size * 0.28;
  const total  = segments.reduce((s, seg) => s + seg.value, 0);

  ctx.clearRect(0, 0, size, size);

  let startAngle = -Math.PI / 2;

  segments.forEach((seg) => {
    const slice = (seg.value / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    startAngle += slice;
  });

  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
  ctx.fillStyle = holeFill;
  ctx.fill();

  // Center label
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  ctx.font = `700 ${Math.round(size * 0.11)}px Inter, system-ui, sans-serif`;
  ctx.fillText(segments[1]
    ? ((segments[1].value / total) * 100).toFixed(1) + '%'
    : '', cx, cy - 6);
  ctx.font = `500 ${Math.round(size * 0.078)}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = subtextColor;
  ctx.fillText('assurance', cx, cy + size * 0.085);
}

// ─── Amortization table ───────────────────────────────────────────────────────

let lastAmortRows = [];

function buildAmortizationRows(capital, r, n, monthlyNoInsurance, insuranceMonthly, firstPaymentDate) {
  const rows = [];
  let remaining = capital;
  for (let i = 1; i <= n; i++) {
    const interest  = r === 0 ? 0 : remaining * r;
    const principal = monthlyNoInsurance - interest;
    const total     = monthlyNoInsurance + insuranceMonthly;
    remaining       = Math.max(0, remaining - principal);
    const date      = firstPaymentDate ? addMonths(firstPaymentDate, i - 1) : null;
    rows.push({ month: i, principal, interest, insurance: insuranceMonthly, total, remaining, date });
  }
  return rows;
}

function renderAmortizationTable(rows, monthsPaid) {
  lastAmortRows = rows;
  const tbody  = document.getElementById('amortTbody');
  const toggle = document.getElementById('btnAmortToggle');
  const table  = document.getElementById('amortTable');
  if (!tbody) return;

  const hasDates  = rows.length > 0 && rows[0].date !== null;
  const paidUntil = monthsPaid || 0;

  // Show/hide date column
  if (table) table.classList.toggle('suivi-active', hasDates);

  tbody.innerHTML = rows.map(r => {
    let rowClass = '';
    let marker   = '';
    let rowId    = '';
    if (paidUntil > 0) {
      if (r.month <= paidUntil) {
        rowClass = 'amort-row-paid';
      } else if (r.month === paidUntil + 1) {
        rowClass = 'amort-row-current';
        marker   = '<span class="amort-current-badge">← Prochain</span>';
        rowId    = ' id="amortCurrentRow"';
      }
    }
    const dateCell = hasDates
      ? `<td class="col-date">${fmtMonthYear(r.date)}</td>`
      : '';
    return `
    <tr class="${rowClass}"${rowId}>
      <td>${r.month}${marker}</td>
      ${dateCell}
      <td>${fmtEur(r.principal)}</td>
      <td>${fmtEur(r.interest)}</td>
      <td>${fmtEur(r.insurance)}</td>
      <td>${fmtEur(r.total)}</td>
      <td>${fmtEur(r.remaining)}</td>
    </tr>`;
  }).join('');

  tbody.classList.add('amort-collapsed');

  let expanded = false;
  if (rows.length > 24) {
    toggle.hidden = false;
    toggle.textContent = `Voir les ${rows.length - 24} mois restants ▾`;
    toggle.onclick = () => {
      expanded = !expanded;
      tbody.classList.toggle('amort-collapsed', !expanded);
      toggle.textContent = expanded
        ? 'Réduire ▴'
        : `Voir les ${rows.length - 24} mois restants ▾`;
    };
  } else {
    toggle.hidden = true;
  }

  // Auto-expand and scroll to current row when suivi is active
  if (paidUntil > 0 && rows.length > 24) {
    expanded = true;
    tbody.classList.remove('amort-collapsed');
    toggle.textContent = 'Réduire ▴';
    setTimeout(() => {
      const currentRow = document.getElementById('amortCurrentRow');
      if (currentRow) currentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }
}

// ─── Suivi panel rendering ────────────────────────────────────────────────────

function renderSuiviPanel(rows, monthsPaid, n) {
  const panel = document.getElementById('suiviPanel');
  if (!panel) return;

  if (!monthsPaid || monthsPaid <= 0 || !rows.length) {
    panel.hidden = true;
    return;
  }

  const paid      = Math.min(monthsPaid, n);
  const pct       = Math.round((paid / n) * 100);
  let assurPaid   = 0, intPaid = 0, capPaid = 0;
  let assurRem    = 0, intRem  = 0;

  for (const r of rows) {
    if (r.month <= paid) {
      assurPaid += r.insurance;
      intPaid   += r.interest;
      capPaid   += r.principal;
    } else {
      assurRem  += r.insurance;
      intRem    += r.interest;
    }
  }

  // Capital restant dû = CRD after the last paid payment
  const capRem = paid < n ? rows[paid - 1].remaining : 0;

  // Label with date range if dates are available
  const firstRow    = rows[0];
  const lastPaidRow = rows[paid - 1];
  let labelText = `${paid} mois remboursé${paid > 1 ? 's' : ''} sur ${n}`;
  if (firstRow.date && lastPaidRow.date) {
    labelText += ` — ${fmtMonthYear(firstRow.date)} → ${fmtMonthYear(lastPaidRow.date)}`;
  }

  document.getElementById('suiviLabel').textContent    = labelText;
  document.getElementById('suiviPct').textContent      = pct + '\u202f%';
  document.getElementById('progressFill').style.width  = pct + '%';
  document.querySelector('.progress-bar').setAttribute('aria-valuenow', pct);

  document.getElementById('suiviAssurPaid').textContent = fmtEur(assurPaid);
  document.getElementById('suiviIntPaid').textContent   = fmtEur(intPaid);
  document.getElementById('suiviCapPaid').textContent   = fmtEur(capPaid);
  document.getElementById('suiviAssurRem').textContent  = fmtEur(assurRem);
  document.getElementById('suiviIntRem').textContent    = fmtEur(intRem);
  document.getElementById('suiviCapRem').textContent    = fmtEur(capRem);

  panel.hidden = false;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showError(message) {
  const el = document.getElementById('formError');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function clearError() {
  const el = document.getElementById('formError');
  if (el) { el.textContent = ''; el.hidden = true; }
}

function showWarning(message) {
  const el = document.getElementById('warningMsg');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function clearWarning() {
  const el = document.getElementById('warningMsg');
  if (el) { el.textContent = ''; el.hidden = true; }
}

function setFieldError(fieldId, hasError) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const group = field.closest('.field-group');
  if (!group) return;
  group.classList.toggle('error', hasError);
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let lastShareText = null;
let lastShareUrl  = null;
let lastChartData = null; // { canvas, segments } — for dark mode redraw

// ─── Duration toggle ──────────────────────────────────────────────────────────

let durationUnit = 'ans'; // 'ans' | 'mois'

document.getElementById('btnAns').addEventListener('click', () => {
  durationUnit = 'ans';
  document.getElementById('btnAns').classList.add('active');
  document.getElementById('btnAns').setAttribute('aria-pressed', 'true');
  document.getElementById('btnMois').classList.remove('active');
  document.getElementById('btnMois').setAttribute('aria-pressed', 'false');
  document.getElementById('duree').placeholder = '20';
});

document.getElementById('btnMois').addEventListener('click', () => {
  durationUnit = 'mois';
  document.getElementById('btnMois').classList.add('active');
  document.getElementById('btnMois').setAttribute('aria-pressed', 'true');
  document.getElementById('btnAns').classList.remove('active');
  document.getElementById('btnAns').setAttribute('aria-pressed', 'false');
  document.getElementById('duree').placeholder = '240';
});

// ─── Form submission ──────────────────────────────────────────────────────────

document.getElementById('calcForm').addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();
  clearWarning();

  const capitalRaw     = document.getElementById('capital').value;
  const mensualiteRaw  = document.getElementById('mensualite').value;
  const tauxRaw        = document.getElementById('taux').value;
  const dureeRaw       = document.getElementById('duree').value;

  const capital    = parseNum(capitalRaw);
  const mensualite = parseNum(mensualiteRaw);
  const taux       = parseNum(tauxRaw);
  const dureeRaw2  = parseNum(dureeRaw);

  // ── Validation ──
  let hasError = false;
  const fields = ['capital', 'mensualite', 'taux', 'duree'];
  fields.forEach(f => setFieldError(f, false));

  function checkField(id, value, label) {
    if (isNaN(value) || value <= 0) {
      setFieldError(id, true);
      hasError = true;
      return false;
    }
    return true;
  }

  checkField('capital',    capital,    'Capital emprunté');
  checkField('mensualite', mensualite, 'Mensualité');
  checkField('taux',       taux,       'Taux nominal');
  checkField('duree',      dureeRaw2,  'Durée');

  if (hasError) {
    showError('Veuillez remplir tous les champs avec des valeurs numériques positives.');
    return;
  }

  // Convert duration to months
  const durationMonths = durationUnit === 'ans'
    ? Math.round(dureeRaw2 * 12)
    : Math.round(dureeRaw2);

  if (durationMonths < 1) {
    setFieldError('duree', true);
    showError('La durée doit être d\'au moins 1 mois.');
    return;
  }

  // ── Calculate ──
  const res = calculate(capital, mensualite, taux, durationMonths);

  // Coherence check: insurance must be positive
  if (res.insuranceMonthly < 0) {
    showWarning(
      '⚠️ Attention : la mensualité saisie (' + fmtEur(mensualite) + ') est inférieure à la '
      + 'mensualité théorique hors assurance (' + fmtEur(res.monthlyWithoutInsurance) + '). '
      + 'Vérifiez le capital, le taux ou la durée — les données semblent incohérentes. '
      + 'Les résultats affichés ne sont pas fiables.'
    );
  }

  // ── Update KPI cards ──
  setText('rMois',  fmtEur(Math.max(0, res.insuranceMonthly)));
  setText('rAn',    fmtEur(Math.max(0, res.insuranceAnnual)));
  setText('rTotal', fmtEur(Math.max(0, res.insuranceTotal)));

  // ── Update detail table ──
  setText('dMensualiteTotale', fmtEur(mensualite));
  setText('dMensualiteHors',   fmtEur(res.monthlyWithoutInsurance));
  setText('dPartPct',          fmtPct(Math.max(0, res.insurancePct), 1));
  setText('dTaea',             fmtPct(Math.max(0, res.taea)));
  setText('dInterets',         fmtEur(Math.max(0, res.totalInterest)));

  // ── Chart ──
  const canvas = document.getElementById('donutChart');
  const principalPlusInterest = res.monthlyWithoutInsurance;
  const insurancePart = Math.max(0, res.insuranceMonthly);

  const segments = [
    { value: principalPlusInterest, color: '#2563EB', label: 'Capital + intérêts' },
    { value: insurancePart,          color: '#7C3AED', label: 'Assurance' },
  ];

  drawDonut(canvas, segments);
  lastChartData = { canvas, segments };

  // Legend
  const legend = document.getElementById('chartLegend');
  legend.innerHTML = segments.map(seg => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${seg.color}"></span>
      <span>${seg.label} — <strong>${fmtEur(seg.value)}/mois</strong></span>
    </div>
  `).join('');

  // Caption
  const durationLabel = durationUnit === 'ans'
    ? dureeRaw2 + ' an' + (dureeRaw2 > 1 ? 's' : '') + ' (' + durationMonths + ' mois)'
    : durationMonths + ' mois';
  document.getElementById('chartCaption').textContent =
    `Sur une durée de ${durationLabel} — Capital : ${fmtEur(capital)}`;

  // ── Build share URL + text ──
  const dateEcheanceVal = document.getElementById('dateEcheance').value;
  let shareUrl = location.origin + location.pathname
    + '#capital=' + capital
    + '&mensualite=' + mensualite
    + '&taux=' + taux
    + '&duree=' + dureeRaw2
    + '&unite=' + durationUnit;
  if (dateEcheanceVal) shareUrl += '&dateEcheance=' + dateEcheanceVal;

  const durationLabelShare = durationUnit === 'ans'
    ? dureeRaw2 + ' an' + (dureeRaw2 > 1 ? 's' : '')
    : durationMonths + ' mois';
  lastShareText = [
    '📊 Mon assurance emprunteur — AssurCalc',
    '',
    '• Capital : ' + fmtEur(capital),
    '• Durée : ' + durationLabelShare,
    '• Taux nominal : ' + fmtPct(taux, 2),
    '',
    '🔵 Coût mensuel assurance : ' + fmtEur(Math.max(0, res.insuranceMonthly)),
    '🔵 Coût annuel assurance : ' + fmtEur(Math.max(0, res.insuranceAnnual)),
    '🟣 Coût total assurance : ' + fmtEur(Math.max(0, res.insuranceTotal)),
    '📈 TAEA : ' + fmtPct(Math.max(0, res.taea)),
    '',
    shareUrl,
  ].join('\n');
  lastShareUrl = shareUrl;

  // ── Amortization table + suivi ──
  const r = taux / 100 / 12;
  const firstPaymentDate = parseLocalDate(document.getElementById('dateEcheance').value);
  const monthsPaid       = computeMonthsPaid(firstPaymentDate);
  const amortRows = buildAmortizationRows(
    capital, r, durationMonths,
    res.monthlyWithoutInsurance, Math.max(0, res.insuranceMonthly),
    firstPaymentDate
  );
  renderAmortizationTable(amortRows, monthsPaid);
  renderSuiviPanel(amortRows, monthsPaid, durationMonths);

  // ── Persist values ──
  saveToStorage();

  // ── Show results ──
  const resultsPanel = document.getElementById('results');
  resultsPanel.hidden = false;
  // Smooth scroll to results on mobile
  if (window.innerWidth < 768) {
    setTimeout(() => resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
});

// ─── Suivi toggle ─────────────────────────────────────────────────────────────

document.getElementById('btnSuiviToggle').addEventListener('click', () => {
  const section  = document.getElementById('suiviSection');
  const chevron  = document.querySelector('.suivi-chevron');
  const btn      = document.getElementById('btnSuiviToggle');
  const expanded = !section.hidden;
  section.hidden = expanded;
  btn.setAttribute('aria-expanded', String(!expanded));
  if (chevron) chevron.textContent = expanded ? '▾' : '▴';
});

document.getElementById('dateEcheance').addEventListener('change', saveToStorage);

// ─── Share button ─────────────────────────────────────────────────────────────

document.getElementById('btnShare').addEventListener('click', async () => {
  if (!lastShareText) return;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Mon assurance emprunteur — AssurCalc',
        text: lastShareText,
        url: lastShareUrl,
      });
    } catch (err) {
      // User cancelled or browser blocked — ignore
    }
  } else {
    // Fallback : copier le lien pré-rempli dans le presse-papier
    try {
      await navigator.clipboard.writeText(lastShareUrl);
      const btn = document.getElementById('btnShare');
      const original = btn.innerHTML;
      btn.textContent = '✓ Lien copié dans le presse-papier';
      setTimeout(() => { btn.innerHTML = original; }, 2500);
    } catch {
      // Ignore silently
    }
  }
});

// ─── Pre-fill from URL hash ───────────────────────────────────────────────────

(function restoreFromHash() {
  if (!location.hash || location.hash.length < 2) return;

  const params = new URLSearchParams(location.hash.slice(1));
  const capital       = params.get('capital');
  const mensualite    = params.get('mensualite');
  const taux          = params.get('taux');
  const duree         = params.get('duree');
  const unite         = params.get('unite');
  const dateEcheance  = params.get('dateEcheance');

  if (!capital || !mensualite || !taux || !duree) return;

  document.getElementById('capital').value    = capital;
  document.getElementById('mensualite').value = mensualite;
  document.getElementById('taux').value       = taux;
  document.getElementById('duree').value      = duree;

  if (unite === 'mois') {
    document.getElementById('btnMois').click();
  } else {
    document.getElementById('btnAns').click();
  }

  if (dateEcheance) {
    document.getElementById('dateEcheance').value = dateEcheance;
    const section = document.getElementById('suiviSection');
    const btn     = document.getElementById('btnSuiviToggle');
    const chevron = document.querySelector('.suivi-chevron');
    section.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (chevron) chevron.textContent = '▴';
  }

  // Déclencher le calcul automatiquement
  document.getElementById('calcForm').dispatchEvent(new Event('submit'));
})();

// ─── Print button ─────────────────────────────────────────────────────────────

document.getElementById('btnPrint').addEventListener('click', () => {
  // Expand amortization table before printing so all rows are visible
  const tbody  = document.getElementById('amortTbody');
  const toggle = document.getElementById('btnAmortToggle');
  const wasCollapsed = tbody && tbody.classList.contains('amort-collapsed');
  if (wasCollapsed) tbody.classList.remove('amort-collapsed');

  window.print();

  // Restore state after print dialog closes
  if (wasCollapsed) tbody.classList.add('amort-collapsed');
});

// ─── CSV download ─────────────────────────────────────────────────────────────

document.getElementById('btnCsvDownload').addEventListener('click', () => {
  if (!lastAmortRows.length) return;
  const hasDates = lastAmortRows[0].date !== null;
  const header = hasDates
    ? 'Mois;Date;Capital remboursé (€);Intérêts (€);Assurance (€);Mensualité totale (€);Capital restant dû (€)'
    : 'Mois;Capital remboursé (€);Intérêts (€);Assurance (€);Mensualité totale (€);Capital restant dû (€)';
  const lines  = lastAmortRows.map(r => {
    const cols = [r.month];
    if (hasDates) cols.push(fmtMonthYear(r.date));
    cols.push(r.principal.toFixed(2), r.interest.toFixed(2),
     r.insurance.toFixed(2), r.total.toFixed(2), r.remaining.toFixed(2));
    return cols.join(';');
  });
  const csv  = '\uFEFF' + [header, ...lines].join('\n'); // BOM for Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'amortissement-assurCalc.csv' });
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Dark mode: redraw canvas on theme change ─────────────────────────────────

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (lastChartData) drawDonut(lastChartData.canvas, lastChartData.segments);
});

// ─── localStorage persistence ─────────────────────────────────────────────────

const LS_KEY = 'assurcalc_v1';

function saveToStorage() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      capital:      document.getElementById('capital').value,
      mensualite:   document.getElementById('mensualite').value,
      taux:         document.getElementById('taux').value,
      duree:        document.getElementById('duree').value,
      unite:        durationUnit,
      dateEcheance: document.getElementById('dateEcheance').value,
    }));
  } catch { /* quota or private mode — ignore */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d.capital || !d.mensualite || !d.taux || !d.duree) return false;
    document.getElementById('capital').value    = d.capital;
    document.getElementById('mensualite').value = d.mensualite;
    document.getElementById('taux').value       = d.taux;
    document.getElementById('duree').value      = d.duree;
    if (d.unite === 'mois') document.getElementById('btnMois').click();
    else                    document.getElementById('btnAns').click();
    if (d.dateEcheance) {
      document.getElementById('dateEcheance').value = d.dateEcheance;
      const section = document.getElementById('suiviSection');
      const btn     = document.getElementById('btnSuiviToggle');
      const chevron = document.querySelector('.suivi-chevron');
      section.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (chevron) chevron.textContent = '▴';
    }
    return true;
  } catch { return false; }
}

function clearStorage() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

// ─── Reset form ───────────────────────────────────────────────────────────────

document.getElementById('btnReset').addEventListener('click', () => {
  ['capital', 'mensualite', 'taux', 'duree'].forEach(id => {
    document.getElementById(id).value = '';
    setFieldError(id, false);
  });
  document.getElementById('dateEcheance').value = '';
  clearError();
  clearWarning();
  document.getElementById('btnAns').click();
  document.getElementById('results').hidden = true;
  document.getElementById('suiviPanel').hidden = true;
  // Collapse suivi section
  const section = document.getElementById('suiviSection');
  const btn     = document.getElementById('btnSuiviToggle');
  const chevron = document.querySelector('.suivi-chevron');
  section.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  if (chevron) chevron.textContent = '▾';
  clearStorage();
  lastShareText = null;
  lastShareUrl  = null;
  document.getElementById('capital').focus();
});

// ─── Live re-format + blur validation + autosave ──────────────────────────────

['capital', 'mensualite', 'taux', 'duree'].forEach(id => {
  document.getElementById(id).addEventListener('blur', function () {
    const val = parseNum(this.value);
    if (!isNaN(val) && val > 0) {
      this.value = this.value.trim().replace(',', '.');
      setFieldError(id, false);
    } else if (this.value.trim() !== '') {
      setFieldError(id, true);
    }
    saveToStorage();
  });
  // Clear error state on input
  document.getElementById(id).addEventListener('input', function () {
    const group = this.closest('.field-group');
    if (group) group.classList.remove('error');
    clearError();
  });
});

// ─── Restore on load (localStorage, sauf si hash URL présent) ────────────────

if (!location.hash || location.hash.length < 2) {
  if (loadFromStorage()) {
    document.getElementById('calcForm').dispatchEvent(new Event('submit'));
  }
}
