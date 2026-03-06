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
function drawDonut(canvas, segments) {
  const ctx    = canvas.getContext('2d');
  const size   = canvas.width;
  const cx     = size / 2;
  const cy     = size / 2;
  const outerR = size * 0.44;
  const innerR = size * 0.28;
  const total  = segments.reduce((s, seg) => s + seg.value, 0);

  ctx.clearRect(0, 0, size, size);

  let startAngle = -Math.PI / 2; // start at top

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

  // Cut inner circle (donut hole)
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();

  // Center label
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#374151';
  ctx.font = `700 ${Math.round(size * 0.11)}px Inter, system-ui, sans-serif`;
  ctx.fillText(segments[1]
    ? ((segments[1].value / total) * 100).toFixed(1) + '%'
    : '', cx, cy - 6);
  ctx.font = `500 ${Math.round(size * 0.078)}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText('assurance', cx, cy + size * 0.085);
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

// ─── Share state ──────────────────────────────────────────────────────────────

let lastShareText = null;

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

  // ── Build share text ──
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
    'Calculé sur https://antexa.github.io/Cloud-Claude-Test/',
  ].join('\n');

  // ── Show results ──
  const resultsPanel = document.getElementById('results');
  resultsPanel.hidden = false;
  // Smooth scroll to results on mobile
  if (window.innerWidth < 768) {
    setTimeout(() => resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
});

// ─── Share button ─────────────────────────────────────────────────────────────

document.getElementById('btnShare').addEventListener('click', async () => {
  if (!lastShareText) return;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Mon assurance emprunteur — AssurCalc',
        text: lastShareText,
      });
    } catch (err) {
      // User cancelled or browser blocked — ignore
    }
  } else {
    // Fallback : copier dans le presse-papier
    try {
      await navigator.clipboard.writeText(lastShareText);
      const btn = document.getElementById('btnShare');
      const original = btn.innerHTML;
      btn.textContent = '✓ Copié dans le presse-papier';
      setTimeout(() => { btn.innerHTML = original; }, 2500);
    } catch {
      // Ignore silently
    }
  }
});

// ─── Live re-format inputs (accept comma as decimal) ─────────────────────────
['capital', 'mensualite', 'taux', 'duree'].forEach(id => {
  document.getElementById(id).addEventListener('blur', function () {
    const val = parseNum(this.value);
    if (!isNaN(val) && val > 0) {
      // Normalise: replace comma with dot for consistency
      this.value = this.value.trim().replace(',', '.');
    }
  });
  // Clear error state on input
  document.getElementById(id).addEventListener('input', function () {
    const group = this.closest('.field-group');
    if (group) group.classList.remove('error');
    clearError();
  });
});
