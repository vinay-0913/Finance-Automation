/**
 * PayAnalytics — Payment Gateway Cost & Settlement Analysis
 * Main application script. Airtable Editorial Design System (DESIGN.md)
 * Web Interface Guidelines Compliant: Accessible, Tabular Numerics, Fluid Pacing.
 */

// ============================================================
// Globals & Helpers
// ============================================================
let DATA = null;
let AI_DATA = null;

const fmt = (n, decimals = 0) => {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const fmtCurrency = (n) => '₹' + fmt(n, 2);
const fmtPct = (n) => fmt(n, 2) + '%';

// Airtable Palette (from DESIGN.md)
const COLORS = {
    primary: '#181d26',
    ink: '#181d26',
    body: '#333840',
    muted: '#41454d',
    hairline: '#dddddd',
    canvas: '#ffffff',
    surfaceSoft: '#f8fafc',
    surfaceStrong: '#e0e2e6',
    
    // Airtable Signature Voltage Colors
    coral: '#aa2d00',
    coralSoft: 'rgba(170, 45, 0, 0.12)',
    forest: '#0a2e0e',
    forestSoft: 'rgba(10, 46, 14, 0.12)',
    cream: '#f5e9d4',
    peach: '#fcab79',
    peachSoft: 'rgba(252, 171, 121, 0.2)',
    mint: '#a8d8c4',
    mintSoft: 'rgba(168, 216, 196, 0.25)',
    yellow: '#f4d35e',
    mustard: '#d9a441',
    yellowSoft: 'rgba(217, 164, 65, 0.15)',
    
    // Semantic
    blue: '#1b61c9',
    blueSoft: 'rgba(27, 97, 201, 0.12)',
    info: '#254fad',
    infoSoft: 'rgba(37, 79, 173, 0.12)',
    success: '#006400',
    successSoft: 'rgba(0, 100, 0, 0.12)',
    red: '#aa2d00',
    redSoft: 'rgba(170, 45, 0, 0.12)',
    gray: '#75758a',
    graySoft: 'rgba(117, 117, 138, 0.12)',
};

const CHART_PALETTE = [
    '#181d26',
    '#aa2d00',
    '#0a2e0e',
    '#1b61c9',
    '#d9a441',
    '#fcab79',
    '#a8d8c4',
    '#254fad',
    '#006400',
    '#75758a'
];

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: {
                color: '#41454d',
                font: { family: "'Inter', -apple-system, sans-serif", size: 12, weight: 500 },
                padding: 16,
                usePointStyle: true,
                pointStyle: 'rectRounded'
            }
        },
        tooltip: {
            backgroundColor: '#181d26',
            titleColor: '#ffffff',
            bodyColor: '#e0e2e6',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
            titleFont: { family: "'Inter', -apple-system, sans-serif", weight: '500' },
            bodyFont: { family: "'Inter', -apple-system, sans-serif" },
            callbacks: {
                label: ctx => ` ${ctx.dataset.label || ''}: ${ctx.parsed.y != null ? fmtCurrency(ctx.parsed.y) : ctx.parsed}`
            }
        }
    },
    scales: {
        x: {
            ticks: { color: '#75758a', font: { family: "'Inter', -apple-system, sans-serif", size: 11 } },
            grid: { color: 'rgba(0,0,0,0.04)' },
            border: { color: '#dddddd' }
        },
        y: {
            ticks: { color: '#75758a', font: { family: "'Inter', -apple-system, sans-serif", size: 11 } },
            grid: { color: 'rgba(0,0,0,0.04)' },
            border: { color: '#dddddd' }
        }
    }
};

function makeChart(id, type, data, options = {}) {
    const ctx = document.getElementById(id);
    if (!ctx) return null;
    const merged = JSON.parse(JSON.stringify(CHART_DEFAULTS));
    for (const key in options) {
        if (typeof options[key] === 'object' && !Array.isArray(options[key]) && merged[key]) {
            Object.assign(merged[key], options[key]);
        } else {
            merged[key] = options[key];
        }
    }
    if (type === 'doughnut' || type === 'pie') {
        delete merged.scales;
    }
    return new Chart(ctx, { type, data, options: merged });
}

// ============================================================
// KPI Card Builder (Airtable Demo-Card Geometry)
// ============================================================
function kpiCard(label, value, sub, color) {
    const accentMap = {
        green: '#0a2e0e',
        forest: '#0a2e0e',
        blue: '#1b61c9',
        coral: '#aa2d00',
        red: '#aa2d00',
        yellow: '#d9a441',
        purple: '#254fad',
        gray: '#9297a0'
    };
    const barColor = accentMap[color] || '#181d26';
    const isAlert = color === 'red' || color === 'coral';

    return `
    <div class="kpi-card-shell" role="listitem">
        <div class="kpi-accent-bar" style="background:${barColor};height:2px;" aria-hidden="true"></div>
        <div class="kpi-lbl">${label}</div>
        <div class="kpi-val" style="${isAlert ? 'color:#aa2d00;' : ''}">${value}</div>
        <div class="kpi-sub">${sub}</div>
    </div>`;
}

// ============================================================
// Table Builder (Airtable Editorial Tables)
// ============================================================
function buildTable(headers, rows, opts = {}) {
    const thClass = 'th-cell';
    const tdClass = 'td-cell';

    let html = `<table class="data-table w-full${opts.tableClass ? ' ' + opts.tableClass : ''}"><thead><tr>`;
    headers.forEach((h, i) => {
        let align = '';
        if (opts.alignRight?.includes(i)) align = ' text-right';
        else if (opts.alignCenter?.includes(i)) align = ' text-center';
        html += `<th class="${thClass}${align}">${h}</th>`;
    });
    html += `</tr></thead><tbody>`;
    rows.forEach(row => {
        html += `<tr>`;
        row.forEach((cell, i) => {
            let align = '';
            if (opts.alignRight?.includes(i)) align = ' text-right';
            else if (opts.alignCenter?.includes(i)) align = ' text-center';
            html += `<td class="${tdClass}${align}">${cell}</td>`;
        });
        html += `</tr>`;
    });
    html += `</tbody></table>`;
    return html;
}

// ============================================================
// Navigation
// ============================================================
function initNav() {
    const links = document.querySelectorAll('#nav-module-gateway .nav-link');
    const sections = document.querySelectorAll('.content-section');
    const title = document.getElementById('pageTitle');
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');

    const titles = {
        upload: 'Upload Data',
        dashboard: 'Dashboard',
        reconciliation: 'Reconciliation Report',
        savings: 'Savings Model',
        'ai-insights': 'AI Insights & Audit',
        executive: 'Executive Summary'
    };

    links.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const sec = link.dataset.section;
            links.forEach(l => {
                l.classList.remove('nav-link-active');
                l.removeAttribute('aria-current');
            });
            link.classList.add('nav-link-active');
            link.setAttribute('aria-current', 'page');

            sections.forEach(s => {
                s.classList.add('hidden');
                s.classList.remove('block');
            });
            const target = document.getElementById(`section-${sec}`);
            if (target) {
                target.classList.remove('hidden');
                target.classList.add('block');
            }
            if (sec === 'ai-insights' && window.AI_DATA && typeof renderAINarratives === 'function') {
                renderAINarratives(window.AI_DATA);
            }
            if (title) title.textContent = titles[sec] || 'Dashboard';
            if (sidebar) sidebar.removeAttribute('data-open');
        });
    });

    menuToggle?.addEventListener('click', () => {
        if (!sidebar) return;
        if (sidebar.hasAttribute('data-open')) {
            sidebar.removeAttribute('data-open');
            menuToggle.setAttribute('aria-expanded', 'false');
        } else {
            sidebar.setAttribute('data-open', '');
            menuToggle.setAttribute('aria-expanded', 'true');
        }
    });
}

// ============================================================
// Render: Dashboard Section
// ============================================================
function renderDashboard() {
    const gA = DATA.overview.gatewayA;
    const gB = DATA.overview.gatewayB;
    const hasA = DATA.has_gateway_a !== false && gA && gA.total_volume > 0;
    const hasB = DATA.has_gateway_b !== false && gB && gB.total_volume > 0;

    // Update period in sidebar
    const periodEl = document.getElementById('period-label');
    if (periodEl && DATA.period) periodEl.textContent = DATA.period;

    // KPIs
    const gwValues = DATA.overview.gateways ? Object.values(DATA.overview.gateways) : [gA, gB].filter(Boolean);
    const totalVolume = gwValues.reduce((sum, g) => sum + (g?.total_volume || 0), 0);
    const totalCharges = gwValues.reduce((sum, g) => sum + (g?.total_charges || 0), 0);
    const totalTxns = gwValues.reduce((sum, g) => sum + (g?.txn_count || 0), 0);
    const overallRate = totalVolume > 0 ? (totalCharges / totalVolume * 100) : 0;

    const gwCount = gwValues.filter(g => (g?.total_volume || 0) > 0).length;
    let scopeSubtitle = `${fmt(totalTxns)} transactions across ${gwCount || 2} gateways`;
    if (hasA && !hasB && gwCount === 1) scopeSubtitle = `${fmt(totalTxns)} transactions (Gateway A Master Table)`;
    else if (!hasA && hasB && gwCount === 1) scopeSubtitle = `${fmt(totalTxns)} transactions (Gateway B Consolidated)`;

    const cardA = hasA
        ? kpiCard('Gateway A Rate', fmtPct(gA.effective_rate), `${fmt(gA.txn_count)} txns · Avg ${gA.avg_settlement_days}d settlement`, 'blue')
        : kpiCard('Gateway A Rate', '—', 'Not Active (Upload GwA files to compare)', 'gray');

    const cardB = hasB
        ? kpiCard('Gateway B Rate', fmtPct(gB.effective_rate), `${fmt(gB.txn_count)} txns · Avg ${gB.avg_settlement_days}d settlement`, 'purple')
        : kpiCard('Gateway B Rate', '—', 'Not Active (Upload GwB file to compare)', 'gray');

    const cardFailed = hasA
        ? kpiCard('Failed (Gw A)', fmt(gA.failed_count), `${fmtPct(DATA.failed_transactions?.gatewayA?.failure_rate || 0)} failure rate`, 'red')
        : kpiCard('Failed (Gw A)', '—', 'GwA data not active', 'gray');

    const refundCount = (gA?.refund_count || 0) + (gB?.refund_count || 0);
    const refundVol = (gA?.refund_volume || 0) + (gB?.refund_volume || 0);

    const kpiEl = document.getElementById('kpiGrid');
    if (kpiEl) {
        kpiEl.innerHTML = [
            kpiCard('Total Volume', fmtCurrency(totalVolume), scopeSubtitle, 'forest'),
            kpiCard('Total Charges', fmtCurrency(totalCharges), `Effective rate: ${fmtPct(overallRate)}`, 'coral'),
            cardA,
            cardB,
            cardFailed,
            kpiCard('Refunds', fmt(refundCount), `₹${fmt(refundVol, 2)} total refunded`, 'yellow'),
        ].join('');
    }

    // Chart: Volume & Charges comparison
    const gwEntries = DATA.overview.gateways ? Object.entries(DATA.overview.gateways) : [
        ['Gateway A', gA],
        ['Gateway B', gB]
    ];
    const gwLabels = gwEntries.map(([name]) => name);
    const gwVolumes = gwEntries.map(([, obj]) => obj?.total_volume || 0);
    const gwCharges = gwEntries.map(([, obj]) => obj?.total_charges || 0);

    makeChart('chartVolumeCompare', 'bar', {
        labels: gwLabels,
        datasets: [
            { label: 'Volume', data: gwVolumes, backgroundColor: COLORS.forestSoft, borderColor: COLORS.forest, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.5 },
            { label: 'Charges', data: gwCharges, backgroundColor: COLORS.coralSoft, borderColor: COLORS.coral, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.5 },
        ]
    }, { scales: { y: { ticks: { callback: v => '₹' + (v / 100000).toFixed(0) + 'L' } } } });

    // Chart: Effective rate by card network
    const networks = Object.keys(DATA.by_card_network);
    const netLabels = networks;
    const netRatesA = networks.map(n => DATA.by_card_network[n]?.gatewayA?.rate || 0);
    const netRatesB = networks.map(n => DATA.by_card_network[n]?.gatewayB?.rate || 0);
    makeChart('chartRateByNetwork', 'bar', {
        labels: netLabels,
        datasets: [
            { label: 'Gateway A %', data: netRatesA, backgroundColor: COLORS.forestSoft, borderColor: COLORS.forest, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.6 },
            { label: 'Gateway B %', data: netRatesB, backgroundColor: COLORS.blueSoft, borderColor: COLORS.blue, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.6 },
        ]
    }, {
        scales: { y: { ticks: { callback: v => v + '%' } } },
        plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } } }
    });

    // Chart: Settlement distribution
    const allSettleDays = new Set([...Object.keys(gA?.settlement_distribution || {}), ...Object.keys(gB?.settlement_distribution || {})]);
    const settleDayLabels = [...allSettleDays].sort((a, b) => Number(a) - Number(b));
    makeChart('chartSettlement', 'bar', {
        labels: settleDayLabels.map(d => d + 'd'),
        datasets: [
            { label: 'Gateway A', data: settleDayLabels.map(d => gA?.settlement_distribution?.[d] || 0), backgroundColor: COLORS.forestSoft, borderColor: COLORS.forest, borderWidth: 1.5, borderRadius: 4 },
            { label: 'Gateway B', data: settleDayLabels.map(d => gB?.settlement_distribution?.[d] || 0), backgroundColor: COLORS.blueSoft, borderColor: COLORS.blue, borderWidth: 1.5, borderRadius: 4 },
        ]
    }, {
        plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} transactions` } } },
        scales: { y: { ticks: { callback: v => v } } }
    });

    // Chart: Volume by method (Gateway A)
    const methods = Object.keys(DATA.by_method || {});
    makeChart('chartByMethod', 'doughnut', {
        labels: methods.map(m => m.charAt(0).toUpperCase() + m.slice(1)),
        datasets: [{
            data: methods.map(m => DATA.by_method[m].volume),
            backgroundColor: [COLORS.forest, COLORS.blue, COLORS.coral, COLORS.mustard, COLORS.info],
            borderColor: '#ffffff',
            borderWidth: 2,
            hoverOffset: 6
        }]
    }, {
        plugins: {
            legend: { position: 'right' },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtCurrency(ctx.parsed)} (${fmtPct(DATA.by_method[methods[ctx.dataIndex]]?.rate)})` } }
        }
    });

    // Chart: Geography (Gateway B top 10)
    const geoEntries = Object.entries(DATA.by_geography || {}).slice(0, 10);
    makeChart('chartGeography', 'bar', {
        labels: geoEntries.map(([k]) => k),
        datasets: [{
            label: 'Volume',
            data: geoEntries.map(([, v]) => v.volume),
            backgroundColor: geoEntries.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length] + '26'),
            borderColor: geoEntries.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
            borderWidth: 1.5,
            borderRadius: 4
        }]
    }, { indexAxis: 'y', scales: { x: { ticks: { callback: v => '₹' + (v / 100000).toFixed(0) + 'L' } } } });

    // Chart: Currency
    const gwACurr = Object.entries(DATA.by_currency?.gatewayA || {}).slice(0, 6);
    const gwBCurr = Object.entries(DATA.by_currency?.gatewayB || {}).slice(0, 6);
    const allCurrLabels = [...new Set([...gwACurr.map(([k]) => k), ...gwBCurr.map(([k]) => k)])];
    const gwAMap = Object.fromEntries(gwACurr);
    const gwBMap = Object.fromEntries(gwBCurr);
    makeChart('chartCurrency', 'bar', {
        labels: allCurrLabels,
        datasets: [
            { label: 'Gateway A', data: allCurrLabels.map(c => gwAMap[c]?.inr_volume || 0), backgroundColor: COLORS.forestSoft, borderColor: COLORS.forest, borderWidth: 1.5, borderRadius: 4 },
            { label: 'Gateway B', data: allCurrLabels.map(c => gwBMap[c]?.volume || 0), backgroundColor: COLORS.blueSoft, borderColor: COLORS.blue, borderWidth: 1.5, borderRadius: 4 },
        ]
    }, { scales: { y: { ticks: { callback: v => '₹' + (v / 100000).toFixed(0) + 'L' } } } });

    // Table: Comparison
    const compRows = networks.map(n => {
        const a = DATA.by_card_network[n]?.gatewayA;
        const b = DATA.by_card_network[n]?.gatewayB;
        const cheaper = (a && b) ? (a.rate < b.rate ? 'A' : 'B') : '—';
        return [
            `<span class="font-semibold" style="color:var(--c-ink);">${n}</span>`,
            a ? fmt(a.count) : '—', a ? fmtCurrency(a.volume) : '—', a ? fmtCurrency(a.charges) : '—', a ? `<span class="font-mono-data">${fmtPct(a.rate)}</span>` : '—',
            b ? fmt(b.count) : '—', b ? fmtCurrency(b.volume) : '—', b ? fmtCurrency(b.charges) : '—', b ? `<span class="font-mono-data">${fmtPct(b.rate)}</span>` : '—',
            cheaper !== '—' ? `<span class="cell-good">Gateway ${cheaper}</span>` : '—'
        ];
    });
    const compTable = document.getElementById('comparisonTable');
    if (compTable) {
        compTable.innerHTML = buildTable(
            ['Network', 'A Txns', 'A Volume', 'A Charges', 'A Rate', 'B Txns', 'B Volume', 'B Charges', 'B Rate', 'Cheapest'],
            compRows, { alignRight: [1, 2, 3, 4, 5, 6, 7, 8] }
        );
    }

    // Table: Geography
    const geoRows = Object.entries(DATA.by_geography || {}).map(([country, d]) => [
        `<span class="font-semibold" style="color:var(--c-ink);">${country}</span>`,
        fmt(d.count), fmtCurrency(d.volume), fmtCurrency(d.charges),
        `<span class="font-mono-data">${fmtPct(d.rate)}</span>`
    ]);
    const geoTable = document.getElementById('geographyTable');
    if (geoTable) {
        geoTable.innerHTML = buildTable(
            ['Country', 'Txns', 'Volume', 'Charges', 'Eff. Rate'],
            geoRows, { alignRight: [1, 2, 3, 4] }
        );
    }
}

// ============================================================
// Render: Time-Series (Weekly by default; Monthly toggle)
// ============================================================
let _tsCharts = {};

function renderTimeseries() {
    const ts = DATA.timeseries;
    if (!ts) return;

    const allMonthsA = (ts.monthly?.gatewayA || []).map(m => m.period);
    const allMonthsB = (ts.monthly?.gatewayB || []).map(m => m.period);
    const uniqueMonths = new Set([...allMonthsA, ...allMonthsB]);
    const hasMultipleMonths = uniqueMonths.size > 1;

    const btnMonthly = document.getElementById('btnTsMonthly');
    if (btnMonthly) btnMonthly.style.display = hasMultipleMonths ? '' : 'none';

    drawTimeseries('weekly');
}

function drawTimeseries(granularity) {
    const ts = DATA.timeseries;
    if (!ts) return;
    const src = granularity === 'monthly' ? ts.monthly : ts.weekly;
    if (!src) return;
    const wa = src.gatewayA || [];
    const wb = src.gatewayB || [];
    const labels = [...new Set([...wa.map(w => w.period), ...wb.map(w => w.period)])].sort();
    const waMap = Object.fromEntries(wa.map(w => [w.period, w]));
    const wbMap = Object.fromEntries(wb.map(w => [w.period, w]));
    const periodLabel = granularity === 'monthly' ? 'Month' : 'Week';

    // Update toggle button styles
    document.querySelectorAll('.ts-tab').forEach(btn => {
        const isActive = btn.id === (granularity === 'monthly' ? 'btnTsMonthly' : 'btnTsWeekly');
        btn.classList.toggle('ts-tab-active', isActive);
        btn.classList.toggle('active', isActive);
    });

    // Update section heading labels
    const volTitle = document.getElementById('tsTitleVolume');
    const rateTitle = document.getElementById('tsTitleRate');
    const settleTitle = document.getElementById('tsTitleSettle');
    const tableTitle = document.getElementById('tsTitleTable');
    if (volTitle) volTitle.textContent = `${periodLabel}ly Volume Trend`;
    if (rateTitle) rateTitle.textContent = `${periodLabel}ly Effective Rate Trend`;
    if (settleTitle) settleTitle.textContent = `${periodLabel}ly Settlement Days`;
    if (tableTitle) tableTitle.textContent = `${periodLabel}-by-${periodLabel} Breakdown`;

    // Destroy old chart instances before recreating
    ['chartWeeklyVolume', 'chartWeeklyRate', 'chartWeeklySettle'].forEach(id => {
        if (_tsCharts[id]) { _tsCharts[id].destroy(); delete _tsCharts[id]; }
    });

    // Volume trend
    _tsCharts['chartWeeklyVolume'] = makeChart('chartWeeklyVolume', 'line', {
        labels,
        datasets: [
            { label: 'Gateway A Volume', data: labels.map(l => waMap[l]?.volume || 0), borderColor: COLORS.forest, backgroundColor: COLORS.forestSoft, fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: COLORS.forest },
            { label: 'Gateway B Volume', data: labels.map(l => wbMap[l]?.volume || 0), borderColor: COLORS.blue, backgroundColor: COLORS.blueSoft, fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: COLORS.blue },
        ]
    }, { scales: { y: { ticks: { callback: v => '₹' + (v / 100000).toFixed(1) + 'L' } } } });

    // Effective rate trend
    _tsCharts['chartWeeklyRate'] = makeChart('chartWeeklyRate', 'line', {
        labels,
        datasets: [
            { label: 'Gateway A Rate %', data: labels.map(l => waMap[l]?.rate || 0), borderColor: COLORS.forest, backgroundColor: 'transparent', tension: 0.35, pointRadius: 4, pointBackgroundColor: COLORS.forest, borderWidth: 2 },
            { label: 'Gateway B Rate %', data: labels.map(l => wbMap[l]?.rate || 0), borderColor: COLORS.blue, backgroundColor: 'transparent', tension: 0.35, pointRadius: 4, pointBackgroundColor: COLORS.blue, borderWidth: 2 },
        ]
    }, { scales: { y: { ticks: { callback: v => v + '%' } } }, plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.y)}` } } } });

    // Settlement days trend
    _tsCharts['chartWeeklySettle'] = makeChart('chartWeeklySettle', 'bar', {
        labels,
        datasets: [
            { label: 'Gateway A Avg Settlement (days)', data: labels.map(l => waMap[l]?.avg_settlement_days || 0), backgroundColor: COLORS.forestSoft, borderColor: COLORS.forest, borderWidth: 1.5, borderRadius: 4 },
            { label: 'Gateway B Avg Settlement (days)', data: labels.map(l => wbMap[l]?.avg_settlement_days || 0), backgroundColor: COLORS.blueSoft, borderColor: COLORS.blue, borderWidth: 1.5, borderRadius: 4 },
        ]
    }, { scales: { y: { ticks: { callback: v => v + 'd' } } }, plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}d` } } } });

    // Breakdown table
    const rows = labels.map(k => [
        `<span class="font-mono-data" style="color:var(--c-ink);font-weight:600;">${k}</span>`,
        `<span class="font-mono-data">${fmtCurrency(waMap[k]?.volume || 0)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(waMap[k]?.charges || 0)}</span>`,
        `<span class="font-mono-data">${fmtPct(waMap[k]?.rate || 0)}</span>`,
        `<span class="font-mono-data">${waMap[k]?.avg_settlement_days != null ? waMap[k].avg_settlement_days + 'd' : '—'}</span>`,
        `<span class="font-mono-data">${fmtCurrency(wbMap[k]?.volume || 0)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(wbMap[k]?.charges || 0)}</span>`,
        `<span class="font-mono-data">${fmtPct(wbMap[k]?.rate || 0)}</span>`,
        `<span class="font-mono-data">${wbMap[k]?.avg_settlement_days != null ? wbMap[k].avg_settlement_days + 'd' : '—'}</span>`,
    ]);
    const tsTableEl = document.getElementById('timeseriesTable');
    if (tsTableEl) {
        tsTableEl.innerHTML = buildTable(
            [periodLabel, 'Gw A Volume', 'Gw A Charges', 'Gw A Rate', 'Gw A Settle', 'Gw B Volume', 'Gw B Charges', 'Gw B Rate', 'Gw B Settle'],
            rows, { alignRight: [1, 2, 3, 4, 5, 6, 7, 8] }
        );
    }
}

// ============================================================
// Render: Reconciliation Section
// ============================================================
function renderReconciliation() {
    const recon = DATA.reconciliation || {};
    const oc = DATA.overcharges || { items: [] };
    const refs = DATA.refunds_summary || { gatewayA: {}, gatewayB: {} };

    // KPIs
    const reconKpiEl = document.getElementById('reconKpiGrid');
    if (reconKpiEl) {
        reconKpiEl.innerHTML = [
            kpiCard('Reconciliation Mismatches', fmt(recon.total_mismatches), `Fee diff: ${fmtCurrency(recon.total_fee_diff)}`, 'yellow'),
            kpiCard('Overcharges Found', fmt(oc.count), `Total: ${fmtCurrency(oc.total_overcharge)} recoverable`, 'coral'),
            kpiCard('Refunds (Gw A)', fmt(refs.gatewayA?.count), `Volume: ${fmtCurrency(refs.gatewayA?.volume)}`, 'blue'),
            kpiCard('Refunds (Gw B)', fmt(refs.gatewayB?.count), `Volume: ${fmtCurrency(refs.gatewayB?.volume)}`, 'purple'),
        ].join('');
    }

    const ocBadge = document.getElementById('overchargeCount');
    if (ocBadge) ocBadge.textContent = `${oc.count || 0} items`;
    const mmBadge = document.getElementById('mismatchCount');
    if (mmBadge) mmBadge.textContent = `${recon.total_mismatches || 0} mismatches`;

    // Overcharges table
    const ocRows = (oc.items || []).map(o => [
        `<span class="font-mono-data text-xs" style="color:var(--c-muted);">${o.payment_id}</span>`,
        o.currency,
        `<span class="font-mono-data">${fmtCurrency(o.amount_inr)}</span>`,
        o.method, o.international ? '🌍 Yes' : 'No',
        o.card_network || '—',
        `<span class="font-mono-data">${fmtPct(o.expected_rate)}</span>`,
        `<span class="font-mono-data" style="color:var(--c-signature-coral);font-weight:600;">${fmtPct(o.actual_rate)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(o.expected_fee)}</span>`,
        `<span class="font-mono-data" style="color:var(--c-signature-coral);font-weight:600;">${fmtCurrency(o.actual_fee)}</span>`,
        `<span class="cell-bad">${fmtCurrency(o.overcharge)}</span>`,
    ]);
    const ocTable = document.getElementById('overchargesTable');
    if (ocTable) {
        ocTable.innerHTML = buildTable(
            ['Payment ID', 'CCY', 'Amount (INR)', 'Method', 'Intl', 'Network', 'Expected %', 'Actual %', 'Expected Fee', 'Actual Fee', 'Overcharge'],
            ocRows, { alignRight: [2, 6, 7, 8, 9, 10] }
        );
    }

    // Recon table
    const reconRows = (recon.mismatches || []).slice(0, 30).map(m => [
        `<span class="font-mono-data text-xs" style="color:var(--c-muted);">${m.payment_id}</span>`,
        m.issue || '',
        m.currency || '—',
        m.method || '—',
        m.pay_fee != null ? `<span class="font-mono-data">${fmtCurrency(m.pay_fee)}</span>` : '—',
        m.txn_fee != null ? `<span class="font-mono-data">${fmtCurrency(m.txn_fee)}</span>` : '—',
        m.fee_diff != null ? `<span class="font-mono-data" style="${m.fee_diff !== 0 ? 'color:var(--c-signature-coral);font-weight:600;' : ''}">${fmtCurrency(m.fee_diff)}</span>` : '—',
        m.pay_tax != null ? `<span class="font-mono-data">${fmtCurrency(m.pay_tax)}</span>` : '—',
        m.txn_tax != null ? `<span class="font-mono-data">${fmtCurrency(m.txn_tax)}</span>` : '—',
        m.tax_diff != null ? `<span class="font-mono-data" style="${m.tax_diff !== 0 ? 'color:var(--c-signature-mustard);font-weight:600;' : ''}">${fmtCurrency(m.tax_diff)}</span>` : '—',
    ]);
    const reconTable = document.getElementById('reconTable');
    if (reconTable) {
        reconTable.innerHTML = buildTable(
            ['Payment ID', 'Issue', 'Currency', 'Method', 'Pay Fee', 'Txn Fee', 'Fee Diff', 'Pay Tax', 'Txn Tax', 'Tax Diff'],
            reconRows, { alignRight: [4, 5, 6, 7, 8, 9] }
        );
        if (recon.unsettled_count > 0) {
            reconTable.innerHTML += `<div style="margin-top:12px;padding:10px 14px;background:#fefae0;border:1px solid #f4d35e;color:#7c5800;border-radius:6px;font-size:0.8rem;">⚠️ ${recon.unsettled_count} captured payment(s) have no corresponding settlement transaction.</div>`;
        }
    }

    // Refund table
    const refRows = [
        ['Gateway A', fmt(refs.gatewayA?.count), fmtCurrency(refs.gatewayA?.volume), '—'],
        ['Gateway B', fmt(refs.gatewayB?.count), fmtCurrency(refs.gatewayB?.volume), fmt(DATA.overview?.gatewayB?.dispute_count || 0) + ' dispute(s)'],
    ];
    const refTable = document.getElementById('refundTable');
    if (refTable) {
        refTable.innerHTML = buildTable(
            ['Gateway', 'Refund Count', 'Refund Volume', 'Disputes'],
            refRows, { alignRight: [1, 2] }
        );
    }
}

// ============================================================
// Render: Savings Section
// ============================================================
function renderSavings() {
    const sm = DATA.savings_model || { items: [] };
    const oc = DATA.overcharges || {};

    const totalSaving = sm.total_potential_saving || 0;
    const gwAVol = DATA.overview?.gatewayA?.total_volume || 0;
    const gwBVol = DATA.overview?.gatewayB?.total_volume || 0;

    const savKpi = document.getElementById('savingsKpiGrid');
    if (savKpi) {
        savKpi.innerHTML = [
            kpiCard('Potential Monthly Savings', fmtCurrency(totalSaving), 'By routing to cheapest gateway per network', 'forest'),
            kpiCard('Annualized Savings', fmtCurrency(totalSaving * 12), 'Projected at current volume', 'blue'),
            kpiCard('Overcharges to Recover', fmtCurrency(oc.total_overcharge), `${oc.count || 0} transactions above contracted rates`, 'coral'),
            kpiCard('Total Volume Analyzed', fmtCurrency(gwAVol + gwBVol), 'Across both gateways', 'purple'),
        ].join('');
    }

    // Chart: Current vs Optimized
    const savItems = sm.items || [];
    makeChart('chartSavings', 'bar', {
        labels: savItems.map(s => s.network),
        datasets: [
            { label: 'Current Charges', data: savItems.map(s => s.current_charges), backgroundColor: COLORS.coralSoft, borderColor: COLORS.coral, borderWidth: 1.5, borderRadius: 6 },
            { label: 'Optimized Charges', data: savItems.map(s => s.optimized_charges), backgroundColor: COLORS.forestSoft, borderColor: COLORS.forest, borderWidth: 1.5, borderRadius: 6 },
        ]
    }, { scales: { y: { ticks: { callback: v => '₹' + (v / 1000).toFixed(0) + 'K' } } } });

    // Chart: Gateway recommendation
    makeChart('chartRouting', 'bar', {
        labels: savItems.map(s => s.network),
        datasets: [
            { label: 'Gateway A Rate', data: savItems.map(s => s.gateway_a_rate), backgroundColor: COLORS.forestSoft, borderColor: COLORS.forest, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.5 },
            { label: 'Gateway B Rate', data: savItems.map(s => s.gateway_b_rate), backgroundColor: COLORS.blueSoft, borderColor: COLORS.blue, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.5 },
        ]
    }, {
        scales: { y: { ticks: { callback: v => v + '%' } } },
        plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } } }
    });

    // Savings table
    const savRows = savItems.map(s => [
        `<span class="font-semibold" style="color:var(--c-ink);">${s.network}</span>`,
        fmtCurrency(s.total_volume),
        `<span class="font-mono-data">${fmtPct(s.gateway_a_rate)}</span>`,
        `<span class="font-mono-data">${fmtPct(s.gateway_b_rate)}</span>`,
        `<span class="cell-good">${s.cheapest_gateway}</span>`,
        fmtCurrency(s.current_charges),
        fmtCurrency(s.optimized_charges),
        `<span class="font-mono-data font-bold" style="color:var(--c-signature-forest);">${fmtCurrency(s.potential_saving)}</span>`,
        `<span class="font-mono-data">${fmtPct(s.saving_pct)}</span>`,
    ]);
    savRows.push([
        '<span class="font-bold" style="color:var(--c-ink);">TOTAL</span>', fmtCurrency(savItems.reduce((a, s) => a + s.total_volume, 0)),
        '', '', '',
        `<span class="font-bold">${fmtCurrency(savItems.reduce((a, s) => a + s.current_charges, 0))}</span>`,
        `<span class="font-bold">${fmtCurrency(savItems.reduce((a, s) => a + s.optimized_charges, 0))}</span>`,
        `<span class="font-mono-data font-bold text-base" style="color:var(--c-signature-forest);">${fmtCurrency(totalSaving)}</span>`,
        ''
    ]);
    const savTable = document.getElementById('savingsTable');
    if (savTable) {
        savTable.innerHTML = buildTable(
            ['Network', 'Total Volume', 'Gw A Rate', 'Gw B Rate', 'Cheapest', 'Current Charges', 'Optimized', 'Saving', 'Saving %'],
            savRows, { alignRight: [1, 2, 3, 5, 6, 7, 8] }
        );
    }

    // Contracted rates table
    const cr = oc.contracted_rates || {};
    const crRows = [
        ['Gateway A', 'Domestic Card', fmtPct(cr.domestic_card), '—'],
        ['Gateway A', 'International Card', fmtPct(cr.intl_card), '—'],
        ['Gateway A', 'UPI', fmtPct(cr.upi), '—'],
        ['Gateway A', 'EMI', fmtPct(cr.emi), '—'],
    ];
    const crTable = document.getElementById('contractedRatesTable');
    if (crTable) {
        crTable.innerHTML = buildTable(
            ['Gateway', 'Payment Type', 'Contracted Rate', 'Notes'],
            crRows, { alignRight: [2] }
        );
    }
}

// ============================================================
// Render: FX / Cross-Border Analysis
// ============================================================
function renderFXAnalysis() {
    const fx = DATA.fx_analysis;
    if (!fx) return;

    const fxEl = document.getElementById('fxAnalysisContent');
    if (!fxEl) return;

    const fxA = fx.gatewayA || { domestic: {}, international: {} };
    const fxB = fx.gatewayB || { domestic: {}, international: {} };

    // KPI cards
    const kpis = [
        kpiCard('Gw A Domestic Rate', fmtPct(fxA.domestic.rate), `${fmt(fxA.domestic.count)} txns · ${fmtCurrency(fxA.domestic.volume)}`, 'forest'),
        kpiCard('Gw A Intl Rate', fmtPct(fxA.international.rate), `FX premium: +${fmtPct(fxA.fx_premium_pct)}pp`, 'coral'),
        kpiCard('Gw B Domestic Rate', fmtPct(fxB.domestic.rate), `${fmt(fxB.domestic.count)} txns · ${fmtCurrency(fxB.domestic.volume)}`, 'blue'),
        kpiCard('Gw B Intl Rate', fmtPct(fxB.international.rate), `FX premium: +${fmtPct(fxB.fx_premium_pct)}pp`, 'purple'),
    ].join('');

    // Gateway A — by currency
    const fxACurrRows = Object.entries(fxA.intl_by_currency || {}).map(([ccy, d]) => [
        `<span class="font-semibold" style="color:var(--c-ink);">${ccy}</span>`,
        `<span class="font-mono-data">${fmtCurrency(d.volume)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(d.charges)}</span>`,
        `<span class="font-mono-data" style="color:var(--c-signature-coral);font-weight:600;">${fmtPct(d.rate)}</span>`,
        `<span class="font-mono-data">${fmt(d.count)}</span>`,
    ]);

    // Gateway B — by country (top 10)
    const fxBCountryRows = Object.entries(fxB.intl_by_country || {}).slice(0, 10).map(([country, d]) => [
        `<span class="font-semibold" style="color:var(--c-ink);">${country}</span>`,
        `<span class="font-mono-data">${fmtCurrency(d.volume)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(d.charges)}</span>`,
        `<span class="font-mono-data" style="color:var(--c-link);font-weight:600;">${fmtPct(d.rate)}</span>`,
        `<span class="font-mono-data">${fmt(d.count)}</span>`,
    ]);

    fxEl.innerHTML = `
        <div class="grid grid-cols-4 gap-4 mb-6 max-lg:grid-cols-2 max-sm:grid-cols-1">${kpis}</div>
        <div class="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
            <div>
                <h4 style="font-size:0.92rem;font-weight:500;color:var(--c-ink);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#0a2e0e;display:inline-block;" aria-hidden="true"></span>
                    Gateway A — International by Currency
                </h4>
                <div class="tbl-wrap">
                    ${fxACurrRows.length ? buildTable(['Currency', 'INR Volume', 'Charges', 'Eff Rate', 'Txns'], fxACurrRows, { alignRight: [1, 2, 3, 4] }) : '<p style="padding:16px;color:#75758a;font-size:0.85rem;">No international transactions</p>'}
                </div>
            </div>
            <div>
                <h4 style="font-size:0.92rem;font-weight:500;color:var(--c-ink);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#1b61c9;display:inline-block;" aria-hidden="true"></span>
                    Gateway B — International by Country (Top 10)
                </h4>
                <div class="tbl-wrap">
                    ${fxBCountryRows.length ? buildTable(['Country', 'INR Volume', 'Charges', 'Eff Rate', 'Txns'], fxBCountryRows, { alignRight: [1, 2, 3, 4] }) : '<p style="padding:16px;color:#75758a;font-size:0.85rem;">No international transactions</p>'}
                </div>
            </div>
        </div>`;
}

// ============================================================
// Render: Rate Renegotiation
// ============================================================
function renderRenegotiation() {
    const reco = DATA.renegotiation;
    if (!reco) return;
    const el = document.getElementById('renegotiationContent');
    if (!el) return;

    const gc = reco.gateway_comparison;

    // Action summary cards
    const summaryCards = (reco.summary || []).map((s, i) => `
        <div style="display:flex;gap:12px;background:#ffffff;border:1px solid #dddddd;border-radius:10px;padding:16px;align-items:flex-start;">
            <div style="width:28px;height:28px;border-radius:50%;background:#0a2e0e;color:#ffffff;font-size:0.75rem;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
            <p style="font-size:0.84rem;color:#333840;line-height:1.55;margin:0;">${s.replace(/^[0-9]+\.\s*/, '')}</p>
        </div>`).join('');

    // Category renegotiation table
    const catRows = (reco.by_category || []).map(c => [
        `<span class="font-semibold" style="color:var(--c-ink);">${c.category}</span>`,
        `<span class="font-mono-data">${fmt(c.overcharge_count)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(c.volume_affected)}</span>`,
        `<span class="font-mono-data" style="color:var(--c-signature-forest);font-weight:600;">${fmtPct(c.contracted_rate)}</span>`,
        `<span class="font-mono-data" style="color:var(--c-signature-coral);font-weight:600;">${fmtPct(c.avg_actual_rate)}</span>`,
        `<span class="font-mono-data font-semibold" style="color:var(--c-signature-coral);">${fmtCurrency(c.total_overcharge)}</span>`,
    ]);

    // Network overcharge table
    const netRows = (reco.by_network || []).map(n => [
        `<span class="font-semibold" style="color:var(--c-ink);">${n.network}</span>`,
        `<span class="font-mono-data">${fmt(n.overcharge_count)}</span>`,
        `<span class="font-mono-data font-semibold" style="color:var(--c-signature-coral);">${fmtCurrency(n.total_overcharge)}</span>`,
        `<span class="font-mono-data" style="color:var(--c-signature-coral);">${fmtPct(n.avg_actual_rate)}</span>`,
    ]);

    el.innerHTML = `
        <div style="margin-bottom:24px;padding:20px 24px;background:#f8fafc;border:1px solid #dddddd;border-radius:12px;">
            <h4 style="font-size:0.92rem;font-weight:600;color:var(--c-ink);margin-bottom:8px;">Gateway Rate Comparison</h4>
            <p style="font-size:0.84rem;color:#41454d;line-height:1.5;margin:0 0 16px 0;">${gc?.recommendation || ''}</p>
            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;" class="max-sm:grid-cols-1">
                <div style="text-align:center;padding:12px;background:#ffffff;border:1px solid #dddddd;border-radius:8px;">
                    <div style="font-size:0.72rem;color:#75758a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Gateway A Rate</div>
                    <div style="font-size:1.4rem;font-weight:600;color:#0a2e0e;" class="font-mono-data">${fmtPct(gc?.gateway_a_rate)}</div>
                </div>
                <div style="text-align:center;padding:12px;background:#ffffff;border:1px solid #dddddd;border-radius:8px;">
                    <div style="font-size:0.72rem;color:#75758a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Gateway B Rate</div>
                    <div style="font-size:1.4rem;font-weight:600;color:#1b61c9;" class="font-mono-data">${fmtPct(gc?.gateway_b_rate)}</div>
                </div>
                <div style="text-align:center;padding:12px;background:#ffffff;border:1px solid #dddddd;border-radius:8px;">
                    <div style="font-size:0.72rem;color:#75758a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">B vs A Premium</div>
                    <div style="font-size:1.4rem;font-weight:600;color:#aa2d00;" class="font-mono-data">+${fmtPct(gc?.rate_premium_pp)}pp</div>
                </div>
            </div>
        </div>

        <div style="margin-bottom:24px;">
            <h4 style="font-size:0.92rem;font-weight:600;color:var(--c-ink);margin-bottom:12px;">Action Plan</h4>
            <div style="display:grid;grid-template-columns:1fr;gap:10px;">${summaryCards}</div>
        </div>

        <div class="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
            <div>
                <h4 style="font-size:0.92rem;font-weight:600;color:var(--c-ink);margin-bottom:12px;">Overcharges by Category</h4>
                <div class="tbl-wrap">
                    ${catRows.length ? buildTable(['Category', 'Count', 'Volume', 'Contracted %', 'Actual %', 'Overcharge'], catRows, { alignRight: [1, 2, 3, 4, 5] }) : '<p style="padding:16px;color:#75758a;font-size:0.85rem;">No overcharges found</p>'}
                </div>
            </div>
            <div>
                <h4 style="font-size:0.92rem;font-weight:600;color:var(--c-ink);margin-bottom:12px;">Overcharges by Card Network</h4>
                <div class="tbl-wrap">
                    ${netRows.length ? buildTable(['Network', 'Count', 'Total Overcharge', 'Avg Actual Rate'], netRows, { alignRight: [1, 2, 3] }) : '<p style="padding:16px;color:#75758a;font-size:0.85rem;">No overcharges found</p>'}
                </div>
            </div>
        </div>`;
}

// ============================================================
// AI Narratives Renderer (Airtable Signature Voltage Surfaces)
// ============================================================
function renderAINarratives(aiData) {
    if (aiData) {
        AI_DATA = aiData;
        window.AI_DATA = aiData;
    } else if (window.AI_DATA) {
        AI_DATA = window.AI_DATA;
    }
    if (!AI_DATA || !AI_DATA.sections) return;

    const exec = AI_DATA.sections.executive_briefing || {};
    const oc = AI_DATA.sections.overcharge_investigation || {};
    const route = AI_DATA.sections.smart_routing_strategy || {};
    const fx = AI_DATA.sections.fx_and_treasury_audit || {};
    const modelUsed = AI_DATA.model || 'Gemini 3.5 Flash-Lite';

    // 1. Dashboard Banner — Signature Cream Callout Card
    const dbEl = document.getElementById('aiDashboardBanner');
    if (dbEl && exec.headline) {
        const findingsBadges = (exec.key_findings || []).map(f => {
            const isHigh = f.impact?.toLowerCase() === 'high';
            return `
                <div style="padding:14px;background:#ffffff;border:1px solid #ebd9be;border-radius:8px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:0.72rem;font-weight:600;color:#75758a;text-transform:uppercase;letter-spacing:0.06em;">${f.metric}</span>
                        <span style="font-size:0.68rem;font-weight:700;padding:2px 7px;border-radius:4px;background:${isHigh ? '#fff2ea' : '#fefae0'};color:${isHigh ? '#aa2d00' : '#7c5800'};border:1px solid ${isHigh ? '#fcab79' : '#f4d35e'};">${f.impact} Impact</span>
                    </div>
                    <div style="font-size:0.84rem;color:#181d26;line-height:1.4;">${f.finding}</div>
                </div>
            `;
        }).join('');

        dbEl.innerHTML = `
            <div class="signature-cream-card" style="margin-bottom:24px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="chip" style="background:#ffffff;color:#181d26;border-color:#dddddd;font-weight:600;">AI Executive Briefing</span>
                        <span style="font-size:0.75rem;color:#41454d;font-family:var(--f-mono);">Analyzed by ${modelUsed}</span>
                    </div>
                    <a href="#ai-insights" onclick="document.querySelector('[data-section=\\'ai-insights\\']')?.click()" class="btn-primary" style="text-decoration:none;font-size:0.8rem;padding:8px 18px;">
                        Explore Full AI Audit &amp; Dispute Letter &rarr;
                    </a>
                </div>
                <h3 style="font-size:1.35rem;font-weight:500;color:#181d26;margin-bottom:8px;letter-spacing:-0.01em;">${exec.headline}</h3>
                <p style="font-size:0.88rem;color:#333840;line-height:1.55;margin-bottom:20px;">${exec.plain_english_summary}</p>
                <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;" class="max-md:grid-cols-1">
                    ${findingsBadges}
                </div>
            </div>
        `;
    }

    // 2. Reconciliation Banner — Full-Bleed Signature Coral Card
    const reconEl = document.getElementById('aiReconBanner');
    if (reconEl && oc.plain_english_explanation) {
        const evidenceCards = (oc.evidence_summary || []).map(e => `
            <div style="padding:10px 14px;background:#ffffff;border:1px solid #ebd9be;border-radius:8px;">
                <span style="display:block;font-size:0.72rem;color:#75758a;font-weight:500;margin-bottom:2px;">${e.label}</span>
                <span style="display:block;font-size:0.82rem;color:#181d26;font-weight:600;">${e.detail}</span>
            </div>
        `).join('');

        const stepsList = (oc.recommended_investigation_steps || []).map((step, idx) => `
            <li style="display:flex;align-items:flex-start;gap:8px;font-size:0.82rem;color:#333840;margin-bottom:8px;">
                <span style="width:20px;height:20px;border-radius:50%;background:#aa2d00;color:#ffffff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.7rem;font-weight:700;margin-top:2px;">${idx + 1}</span>
                <span>${step}</span>
            </li>
        `).join('');

        reconEl.innerHTML = `
            <div class="signature-coral-card" style="margin-bottom:24px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="chip" style="background:#ffffff;color:#aa2d00;border-color:rgba(255,255,255,0.4);font-weight:700;">AI Investigation</span>
                        <h3 style="font-size:1.25rem;font-weight:500;color:#ffffff;margin:0;">${oc.title || 'Overcharge & Tariff Violation Audit'}</h3>
                    </div>
                    <span style="font-size:0.75rem;color:rgba(255,255,255,0.85);font-family:var(--f-mono);">Analyzed by ${modelUsed}</span>
                </div>
                <div style="margin-bottom:18px;">
                    <p style="font-size:0.88rem;color:#ffffff;line-height:1.6;margin:0;">${oc.plain_english_explanation}</p>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;" class="max-lg:grid-cols-1">
                    <div style="padding:16px;background:#ffffff;border-radius:10px;color:#181d26;">
                        <h5 style="font-size:0.78rem;font-weight:700;color:#aa2d00;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            Root-Cause Analysis
                        </h5>
                        <p style="font-size:0.82rem;color:#333840;line-height:1.55;margin:0;">${oc.root_cause_analysis}</p>
                    </div>
                    <div style="padding:16px;background:#ffffff;border-radius:10px;color:#181d26;">
                        <h5 style="font-size:0.78rem;font-weight:700;color:#0a2e0e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                            Finance Team Action Plan
                        </h5>
                        <ul style="list-style:none;padding:0;margin:0;">${stepsList}</ul>
                    </div>
                </div>

                ${evidenceCards ? `
                <div style="margin-bottom:18px;">
                    <div style="font-size:0.74rem;font-weight:600;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Supporting Reconciliation Evidence</div>
                    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;" class="max-md:grid-cols-2">${evidenceCards}</div>
                </div>` : ''}

                ${oc.dispute_email_draft ? `
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.25);">
                    <details class="group" style="background:#f5e9d4;border:1px solid #ebd9be;border-radius:10px;overflow:hidden;">
                        <summary style="padding:14px 18px;cursor:pointer;font-size:0.85rem;font-weight:600;color:#181d26;display:flex;align-items:center;justify-content:space-between;background:#f5e9d4;outline:none;">
                            <span style="display:flex;align-items:center;gap:8px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                Ready-to-Send Gateway Dispute Letter Draft (Click to Expand)
                            </span>
                            <span style="font-size:0.8rem;color:#75758a;">&darr;</span>
                        </summary>
                        <div style="padding:16px;border-top:1px solid #ebd9be;background:#ffffff;">
                            <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #eeeeee;">
                                <div style="font-size:0.82rem;color:#41454d;"><strong>To:</strong> ${oc.dispute_email_draft.recipient || 'Gateway A Merchant Support'}</div>
                                <button type="button" onclick="copyDisputeEmail()" id="btnCopyEmail" class="btn-primary" style="padding:6px 14px;font-size:0.75rem;">
                                    Copy Letter to Clipboard
                                </button>
                            </div>
                            <div style="font-size:0.82rem;color:#181d26;margin-bottom:8px;"><strong>Subject:</strong> <span id="disputeEmailSubject">${oc.dispute_email_draft.subject}</span></div>
                            <pre id="disputeEmailBody" style="background:#f8fafc;color:#181d26;border:1px solid #dddddd;border-radius:8px;padding:14px;font-family:var(--f-mono);font-size:0.8rem;line-height:1.6;white-space:pre-wrap;margin:0;">${oc.dispute_email_draft.body}</pre>
                        </div>
                    </details>
                </div>` : ''}
            </div>
        `;
    }

    // 3. Savings Model Banner — Full-Bleed Signature Forest Card
    const savEl = document.getElementById('aiSavingsBanner');
    if (savEl && route.plain_english_explanation) {
        const roadmapItems = (route.implementation_roadmap || []).map(r => `
            <div style="padding:14px;background:#ffffff;border-radius:8px;color:#181d26;">
                <div style="font-size:0.74rem;font-weight:700;color:#0a2e0e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${r.phase}</div>
                <div style="font-size:0.82rem;color:#333840;line-height:1.5;">${r.actions}</div>
            </div>
        `).join('');

        savEl.innerHTML = `
            <div class="signature-forest-card" style="margin-bottom:24px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="chip" style="background:#ffffff;color:#0a2e0e;border-color:rgba(255,255,255,0.4);font-weight:700;">AI Strategy</span>
                        <h3 style="font-size:1.25rem;font-weight:500;color:#ffffff;margin:0;">${route.title || 'Smart Gateway Routing Arbitrage'}</h3>
                    </div>
                    <span style="font-size:0.82rem;color:#a8d8c4;font-weight:600;font-family:var(--f-mono);">Potential: ₹8.51L / month</span>
                </div>
                <p style="font-size:0.88rem;color:#ffffff;line-height:1.6;margin:0 0 16px 0;">${route.plain_english_explanation}</p>
                <div style="padding:16px;background:#ffffff;border-radius:10px;margin-bottom:16px;color:#181d26;">
                    <h5 style="font-size:0.78rem;font-weight:700;color:#aa2d00;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Operational Trade-offs & Failure Risk Analysis</h5>
                    <p style="font-size:0.82rem;color:#333840;line-height:1.55;margin:0;">${route.root_cause_and_tradeoffs}</p>
                </div>
                ${roadmapItems ? `
                <div>
                    <div style="font-size:0.74rem;font-weight:600;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Phased Execution Roadmap</div>
                    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;" class="max-md:grid-cols-1">${roadmapItems}</div>
                </div>` : ''}
            </div>
        `;
    }

    // 4. Dedicated AI Insights & Audit Section
    const fullAuditEl = document.getElementById('aiFullAuditContainer');
    if (fullAuditEl) {
        const stratRecs = (exec.strategic_recommendations || []).map(s => `
            <div style="padding:16px;background:#ffffff;border:1px solid #dddddd;border-radius:10px;display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;">
                <span style="width:26px;height:26px;border-radius:50%;background:#0a2e0e;color:#ffffff;font-weight:700;font-size:0.75rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">#${s.priority}</span>
                <div style="flex:1;">
                    <div style="font-size:0.92rem;font-weight:600;color:var(--c-ink);margin-bottom:4px;">${s.action}</div>
                    <div style="font-size:0.82rem;color:#41454d;line-height:1.55;margin-bottom:8px;">${s.rationale}</div>
                    <div style="font-size:0.75rem;font-family:var(--f-mono);font-weight:600;color:#0a2e0e;background:#edfce9;border:1px solid #a8d8c4;display:inline-block;padding:2px 8px;border-radius:4px;">Benefit: ${s.financial_benefit}</div>
                </div>
            </div>
        `).join('');

        const treasuryRecs = (fx.recommended_treasury_actions || []).map((t, idx) => `
            <li style="display:flex;align-items:flex-start;gap:8px;font-size:0.82rem;color:#333840;margin-bottom:8px;">
                <span style="width:20px;height:20px;border-radius:50%;background:#1b61c9;color:#ffffff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.7rem;font-weight:700;margin-top:2px;">${idx + 1}</span>
                <span>${t}</span>
            </li>
        `).join('');

        fullAuditEl.innerHTML = `
            <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;padding-bottom:16px;border-bottom:1px solid #dddddd;">
                <div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span class="chip" style="background:#0a2e0e;color:#ffffff;border-color:#0a2e0e;font-weight:600;">AI Financial Audit</span>
                        <span style="font-size:0.75rem;color:#75758a;font-family:var(--f-mono);">Generated: ${new Date(AI_DATA.generated_at).toLocaleString('en-IN')}</span>
                    </div>
                    <h2 style="font-size:1.6rem;font-weight:500;color:var(--c-ink);letter-spacing:-0.01em;margin:0;">LLM-Driven Payment &amp; Tax Intelligence Audit</h2>
                    <p style="font-size:0.85rem;color:#41454d;margin-top:4px;">Plain-English diagnostic narratives, root-cause deductions, and dispute recovery workflows powered by ${modelUsed}.</p>
                </div>
                <button type="button" onclick="window.print()" class="btn-secondary" style="display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;padding:8px 16px;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Print Audit Report
                </button>
            </div>

            <!-- Executive Summary Card -->
            <div class="card" style="margin-bottom:24px;padding:28px;">
                <h3 style="font-size:1.2rem;font-weight:600;color:#0a2e0e;margin-bottom:8px;">${exec.headline || 'Executive Briefing'}</h3>
                <p style="font-size:0.88rem;color:#333840;line-height:1.6;margin-bottom:24px;">${exec.plain_english_summary || ''}</p>
                
                <h4 style="font-size:0.82rem;font-weight:700;color:#41454d;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Strategic Priorities for Leadership</h4>
                <div>${stratRecs}</div>
            </div>

            <!-- FX & Treasury Float Card -->
            <div class="card" style="margin-bottom:24px;padding:28px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
                    <h3 style="font-size:1.15rem;font-weight:600;color:var(--c-ink);display:flex;align-items:center;gap:8px;margin:0;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1b61c9" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                        ${fx.title || 'Cross-Border FX & Working Capital Velocity Audit'}
                    </h3>
                    <span class="chip" style="background:#eff6ff;color:#1b61c9;border-color:#bfdbfe;font-weight:600;">Treasury Impact</span>
                </div>
                <div class="grid grid-cols-2 gap-5 mb-5 max-lg:grid-cols-1">
                    <div style="padding:16px;background:#f8fafc;border:1px solid #dddddd;border-radius:10px;">
                        <h5 style="font-size:0.78rem;font-weight:700;color:#1b61c9;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Cross-Border FX Markup Impact</h5>
                        <p style="font-size:0.84rem;color:#333840;line-height:1.6;margin:0;">${fx.fx_markup_explanation || ''}</p>
                    </div>
                    <div style="padding:16px;background:#f8fafc;border:1px solid #dddddd;border-radius:10px;">
                        <h5 style="font-size:0.78rem;font-weight:700;color:#254fad;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Working Capital Float &amp; Liquidity</h5>
                        <p style="font-size:0.84rem;color:#333840;line-height:1.6;margin:0;">${fx.working_capital_impact || ''}</p>
                    </div>
                </div>
                <div>
                    <h5 style="font-size:0.78rem;font-weight:700;color:#41454d;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Recommended Treasury Actions</h5>
                    <ul style="list-style:none;padding:0;margin:0;">${treasuryRecs}</ul>
                </div>
            </div>
        `;
    }
}

function copyDisputeEmail() {
    const subj = document.getElementById('disputeEmailSubject')?.innerText || '';
    const body = document.getElementById('disputeEmailBody')?.innerText || '';
    const fullText = `Subject: ${subj}\n\n${body}`;
    navigator.clipboard.writeText(fullText).then(() => {
        const btn = document.getElementById('btnCopyEmail');
        if (btn) {
            const orig = btn.innerText;
            btn.innerText = 'Copied to Clipboard!';
            btn.style.background = '#0a2e0e';
            btn.style.color = '#ffffff';
            setTimeout(() => {
                btn.innerText = orig;
                btn.style.background = '';
                btn.style.color = '';
            }, 2500);
        }
    }).catch(err => {
        alert('Could not copy automatically. Please select and copy manually.');
    });
}

// ============================================================
// Render: Executive Summary (Editorial Long-Form Pacing)
// ============================================================
function renderExecutive() {
    const gA = DATA.overview?.gatewayA;
    const gB = DATA.overview?.gatewayB;
    const sm = DATA.savings_model || { items: [] };
    const oc = DATA.overcharges || { count: 0, total_overcharge: 0 };
    const recon = DATA.reconciliation || { total_mismatches: 0, total_fee_diff: 0 };
    const hasA = DATA.has_gateway_a !== false && gA && gA.total_volume > 0;
    const hasB = DATA.has_gateway_b !== false && gB && gB.total_volume > 0;

    const totalVol = (gA?.total_volume || 0) + (gB?.total_volume || 0);
    const totalCharges = (gA?.total_charges || 0) + (gB?.total_charges || 0);
    const blendedRate = totalVol > 0 ? (totalCharges / totalVol * 100) : 0;

    let gatewayVolumeItems = '';
    if (hasA && hasB) {
        gatewayVolumeItems = `
            <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway A: ${fmtCurrency(gA.total_volume)} at <strong style="color:#0a2e0e;">${fmtPct(gA.effective_rate)}</strong> effective rate
            </li>
            <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway B: ${fmtCurrency(gB.total_volume)} at <strong style="color:#1b61c9;">${fmtPct(gB.effective_rate)}</strong> effective rate — <strong style="color:#aa2d00;">${fmtPct(gB.effective_rate - gA.effective_rate)} higher</strong> than Gateway A
            </li>
        `;
    } else if (hasA) {
        gatewayVolumeItems = `
            <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway A (Master Enriched Table): ${fmtCurrency(gA.total_volume)} at <strong style="color:#0a2e0e;">${fmtPct(gA.effective_rate)}</strong> effective rate
            </li>
            <li style="padding-left:18px;position:relative;color:#75758a;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway B: Not active. (Upload Gateway B consolidated file to unlock comparative analytics)
            </li>
        `;
    } else if (hasB) {
        gatewayVolumeItems = `
            <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway B (Consolidated Ledger): ${fmtCurrency(gB.total_volume)} at <strong style="color:#1b61c9;">${fmtPct(gB.effective_rate)}</strong> effective rate
            </li>
            <li style="padding-left:18px;position:relative;color:#75758a;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway A: Not active. (Upload Gateway A split files to unlock comparative analytics)
            </li>
        `;
    }

    let settlementItems = '';
    if (hasA && hasB) {
        settlementItems = `
            <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway A average settlement: <strong>${gA.avg_settlement_days}&nbsp;days</strong> (range: ${gA.min_settlement_days}–${gA.max_settlement_days}&nbsp;days)
            </li>
            <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway B average settlement: <strong>${gB.avg_settlement_days}&nbsp;days</strong> (range: ${gB.min_settlement_days}–${gB.max_settlement_days}&nbsp;days)
            </li>
            <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                ${gA.avg_settlement_days < gB.avg_settlement_days ? 'Gateway A settles faster' : 'Gateway B settles faster'} — cash flow advantage of <strong>${Math.abs(gA.avg_settlement_days - gB.avg_settlement_days).toFixed(1)}&nbsp;days</strong>
            </li>
        `;
    } else if (hasA) {
        settlementItems = `
            <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway A average settlement: <strong>${gA.avg_settlement_days}&nbsp;days</strong> (range: ${gA.min_settlement_days}–${gA.max_settlement_days}&nbsp;days)
            </li>
        `;
    } else if (hasB) {
        settlementItems = `
            <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                Gateway B average settlement: <strong>${gB.avg_settlement_days}&nbsp;days</strong> (range: ${gB.min_settlement_days}–${gB.max_settlement_days}&nbsp;days)
            </li>
        `;
    }

    const execContainer = document.getElementById('execSummary');
    if (execContainer) {
        execContainer.innerHTML = `
            <h2 style="font-size:2rem;font-weight:400;color:var(--c-ink);letter-spacing:-0.02em;margin-bottom:6px;text-wrap:balance;">Payment Gateway Intelligence Brief</h2>
            <p style="font-size:0.88rem;color:#75758a;margin-bottom:32px;">Executive Summary · ${DATA.period || ''} · Generated ${new Date(DATA.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

            <div style="margin-bottom:28px;">
                <h3 style="font-size:1.1rem;font-weight:600;color:var(--c-ink);padding-bottom:8px;border-bottom:1px solid #dddddd;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#0a2e0e;display:inline-block;" aria-hidden="true"></span>
                    Volume &amp; Cost Overview
                </h3>
                <ul style="list-style:none;padding:0;margin:0;">
                    <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                        <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                        Total processed volume: <strong style="color:var(--c-ink);">${fmtCurrency(totalVol)}</strong> across <strong style="color:var(--c-ink);">${fmt((gA?.txn_count || 0) + (gB?.txn_count || 0))}</strong> transactions
                    </li>
                    <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                        <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                        Total gateway charges: <strong style="color:var(--c-ink);">${fmtCurrency(totalCharges)}</strong> (blended rate: <strong style="color:var(--c-ink);">${fmtPct(blendedRate)}</strong>)
                    </li>
                    ${gatewayVolumeItems}
                </ul>
            </div>

            <div style="margin-bottom:28px;">
                <h3 style="font-size:1.1rem;font-weight:600;color:var(--c-ink);padding-bottom:8px;border-bottom:1px solid #dddddd;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#1b61c9;display:inline-block;" aria-hidden="true"></span>
                    Settlement Performance
                </h3>
                <ul style="list-style:none;padding:0;margin:0;">
                    ${settlementItems}
                </ul>
            </div>

            <div style="margin-bottom:28px;">
                <h3 style="font-size:1.1rem;font-weight:600;color:var(--c-ink);padding-bottom:8px;border-bottom:1px solid #dddddd;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#aa2d00;display:inline-block;" aria-hidden="true"></span>
                    Issues &amp; Recovery
                </h3>
                <ul style="list-style:none;padding:0;margin:0;">
                    <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                        <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                        <strong style="color:#aa2d00;">${fmt(oc.count || 0)} overcharged transactions</strong> detected on Gateway A, totaling <strong style="color:#aa2d00;">${fmtCurrency(oc.total_overcharge || 0)}</strong> recoverable
                    </li>
                    <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                        <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                        <strong style="color:#d9a441;">${fmt(recon.total_mismatches || 0)} reconciliation mismatches</strong> between payment and transaction records
                    </li>
                    <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                        <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                        Gateway A failure rate: <strong>${fmtPct(DATA.failed_transactions?.gatewayA?.failure_rate || 0)}</strong> (${fmt(DATA.failed_transactions?.gatewayA?.count || 0)} of ${fmt(DATA.failed_transactions?.gatewayA?.total || 0)})
                    </li>
                    <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                        <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                        Gateway B standalone fees (non-transaction): <strong>${fmtCurrency(gB?.standalone_fees || 0)}</strong>
                    </li>
                </ul>
            </div>

            <div style="margin-bottom:28px;">
                <h3 style="font-size:1.1rem;font-weight:600;color:var(--c-ink);padding-bottom:8px;border-bottom:1px solid #dddddd;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#0a2e0e;display:inline-block;" aria-hidden="true"></span>
                    Savings Opportunity
                </h3>
                <ul style="list-style:none;padding:0;margin:0;">
                    <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                        <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                        Monthly savings from optimal routing: <strong style="color:#0a2e0e;">${fmtCurrency(sm.total_potential_saving)}</strong>
                    </li>
                    <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                        <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                        Annualized: <strong style="color:#0a2e0e;">${fmtCurrency(sm.total_potential_saving * 12)}</strong>
                    </li>
                    ${(sm.items || []).map(s => `
                    <li style="padding-left:18px;position:relative;color:#333840;font-size:0.9rem;line-height:1.65;margin-bottom:6px;">
                        <span style="position:absolute;left:0;color:#75758a;" aria-hidden="true">&rarr;</span>
                        ${s.network}: route to <strong>${s.cheapest_gateway}</strong> (${fmtPct(Math.min(s.gateway_a_rate, s.gateway_b_rate))} vs ${fmtPct(Math.max(s.gateway_a_rate, s.gateway_b_rate))}) — saves <strong style="color:#0a2e0e;">${fmtCurrency(s.potential_saving)}</strong>/mo
                    </li>`).join('')}
                </ul>
            </div>

            <div style="margin-bottom:28px;">
                <h3 style="font-size:1.1rem;font-weight:600;color:var(--c-ink);padding-bottom:8px;border-bottom:1px solid #dddddd;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#d9a441;display:inline-block;" aria-hidden="true"></span>
                    Recommended Actions
                </h3>
                <div class="grid grid-cols-2 gap-4 mt-3 max-lg:grid-cols-1">
                    <div class="card" style="padding:20px;">
                        <h4 style="font-size:0.92rem;font-weight:600;color:#aa2d00;margin-bottom:6px;">1. Recover Overcharges</h4>
                        <p style="font-size:0.82rem;color:#41454d;line-height:1.55;margin:0;">File claims for ${fmtCurrency(oc.total_overcharge)} in overcharges on ${fmt(oc.count)} Gateway A transactions that exceeded contracted rates.</p>
                    </div>
                    <div class="card" style="padding:20px;">
                        <h4 style="font-size:0.92rem;font-weight:600;color:#0a2e0e;margin-bottom:6px;">2. Implement Smart Routing</h4>
                        <p style="font-size:0.82rem;color:#41454d;line-height:1.55;margin:0;">Route each card network to its cheapest gateway to save ${fmtCurrency(sm.total_potential_saving)}/month (${fmtCurrency(sm.total_potential_saving * 12)}/year).</p>
                    </div>
                    <div class="card" style="padding:20px;">
                        <h4 style="font-size:0.92rem;font-weight:600;color:#1b61c9;margin-bottom:6px;">3. Renegotiate Gateway B Rates</h4>
                        <p style="font-size:0.82rem;color:#41454d;line-height:1.55;margin:0;">Gateway B's ${fmtPct(gB?.effective_rate || 0)} blended rate is ${fmtPct((gB?.effective_rate || 0) - (gA?.effective_rate || 0))} above Gateway A. Negotiate toward parity using volume leverage.</p>
                    </div>
                    <div class="card" style="padding:20px;">
                        <h4 style="font-size:0.92rem;font-weight:600;color:#d9a441;margin-bottom:6px;">4. Resolve Reconciliation Gaps</h4>
                        <p style="font-size:0.82rem;color:#41454d;line-height:1.55;margin:0;">Investigate ${fmt(recon.total_mismatches || 0)} mismatches between payment and settlement records. Total fee discrepancy: ${fmtCurrency(recon.total_fee_diff || 0)}.</p>
                    </div>
                </div>
            </div>
        `;
    }
}

// ============================================================
// Render All Dashboard Data from Memory
// ============================================================
function renderAll(data) {
    if (!data) return;
    DATA = data;
    window.DATA = data;

    renderDashboard();
    renderTimeseries();
    renderReconciliation();
    renderSavings();
    renderFXAnalysis();
    renderRenegotiation();
    renderExecutive();

    if (window.AI_DATA) {
        AI_DATA = window.AI_DATA;
        renderAINarratives(window.AI_DATA);
    }
}

function renderEmptyState() {
    const emptyHtml = `
        <div style="background:#ffffff;border:1px dashed #dddddd;border-radius:12px;padding:56px 24px;text-align:center;margin:20px 0;width:100%;grid-column:1/-1;">
            <div style="width:52px;height:52px;border-radius:50%;background:#f8fafc;border:1px solid #dddddd;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#181d26" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <h3 style="font-size:1.25rem;font-weight:500;color:#181d26;margin-bottom:8px;letter-spacing:-0.01em;">No Gateway Dataset Loaded</h3>
            <p style="font-size:0.88rem;color:#75758a;max-width:480px;margin:0 auto 24px;line-height:1.55;">
                Load or upload your gateway transaction and settlement files in the <strong>Upload Data</strong> studio to build Master Enriched Tables and generate AI insights.
            </p>
            <button type="button" onclick="document.querySelector('[data-section=\\'upload\\']')?.click()" class="btn-primary" style="padding:12px 24px;">
                Go to Upload Data &rarr;
            </button>
        </div>
    `;

    const kpi = document.getElementById('kpiGrid');
    if (kpi) kpi.innerHTML = emptyHtml;
    const reconKpi = document.getElementById('reconKpiGrid');
    if (reconKpi) reconKpi.innerHTML = emptyHtml;
    const savingsKpi = document.getElementById('savingsKpiGrid');
    if (savingsKpi) savingsKpi.innerHTML = emptyHtml;
    const exec = document.getElementById('execSummary');
    if (exec) exec.innerHTML = emptyHtml;
    const fullAudit = document.getElementById('aiFullAuditContainer');
    if (fullAudit) fullAudit.innerHTML = emptyHtml;
}

async function init() {
    initNav();

    const hash = window.location.hash ? window.location.hash.replace('#', '') : '';
    if (hash.startsWith('v-')) {
        if (typeof switchModule === 'function') switchModule('module-vendor');
        return;
    }

    if (window.DATA) {
        renderAll(window.DATA);
    } else {
        renderEmptyState();
        const uploadNav = document.querySelector('#nav-module-gateway [data-section="upload"]');
        if (uploadNav && (!hash || hash === 'dashboard' || hash === 'upload')) {
            uploadNav.click();
        }
    }
}

window.kpiCard = kpiCard;
window.buildTable = buildTable;
window.makeChart = makeChart;
window.drawTimeseries = drawTimeseries;
window.renderAll = renderAll;
window.renderAINarratives = renderAINarratives;
window.renderEmptyState = renderEmptyState;
window.copyDisputeEmail = copyDisputeEmail;

document.addEventListener('DOMContentLoaded', init);
