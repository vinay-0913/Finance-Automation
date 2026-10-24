/**
 * PayAnalytics — Payment Gateway Cost & Settlement Analysis
 * Main application script. Loads dashboard_data.json and renders all sections.
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

const COLORS = {
    green: '#39e58c',
    greenSoft: 'rgba(57,229,140,0.15)',
    blue: '#5b8af5',
    blueSoft: 'rgba(91,138,245,0.15)',
    coral: '#ff7759',
    coralSoft: 'rgba(255,119,89,0.15)',
    yellow: '#f5c842',
    yellowSoft: 'rgba(245,200,66,0.15)',
    purple: '#a87ee6',
    purpleSoft: 'rgba(168,126,230,0.15)',
    red: '#ef4444',
    redSoft: 'rgba(239,68,68,0.15)',
    gray: '#93939f',
    graySoft: 'rgba(147,147,159,0.15)',
};

const CHART_PALETTE = ['#39e58c', '#5b8af5', '#ff7759', '#f5c842', '#a87ee6', '#ef4444', '#38bdf8', '#fb923c', '#c084fc', '#4ade80'];

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { labels: { color: '#93939f', font: { family: 'Inter', size: 11 }, padding: 16, usePointStyle: true, pointStyle: 'rectRounded' } },
        tooltip: {
            backgroundColor: '#1e1e2a', titleColor: '#f0f0f5', bodyColor: '#93939f',
            borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 8, padding: 12,
            titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' },
            callbacks: { label: ctx => ` ${ctx.dataset.label || ''}: ${ctx.parsed.y != null ? fmtCurrency(ctx.parsed.y) : ctx.parsed}` }
        }
    },
    scales: {
        x: { ticks: { color: '#65657a', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#65657a', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'rgba(255,255,255,0.06)' } }
    }
};

function makeChart(id, type, data, options = {}) {
    const ctx = document.getElementById(id);
    if (!ctx) return null;
    const merged = JSON.parse(JSON.stringify(CHART_DEFAULTS));
    // Deep merge options
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
// KPI Card Builder
// ============================================================
function kpiCard(label, value, sub, color) {
    const barClass = `kpi-bar kpi-bar-${color}`;
    return `
    <div class="bg-surface-card border border-border-subtle rounded-xl px-6 py-5 relative overflow-hidden transition-all duration-300 hover:border-border-medium hover:-translate-y-0.5 hover:shadow-lg group">
        <div class="${barClass}"></div>
        <div class="text-[0.75rem] font-medium text-gray-500 uppercase tracking-widest mb-2">${label}</div>
        <div class="text-[1.7rem] font-extrabold tracking-tight leading-none mb-1 font-mono-data text-${color === 'coral' ? 'orange' : color === 'red' ? 'red' : color === 'yellow' ? 'yellow' : color === 'blue' ? 'blue' : color === 'purple' ? 'purple' : 'emerald'}-400">${value}</div>
        <div class="text-[0.75rem] text-gray-500">${sub}</div>
    </div>`;
}

// ============================================================
// Table Builder
// ============================================================
function buildTable(headers, rows, opts = {}) {
    const thClass = 'bg-surface-elevated text-gray-400 font-semibold text-[0.73rem] uppercase tracking-widest px-3.5 py-2.5 text-left border-b border-border-medium whitespace-nowrap sticky top-0';
    const tdClass = 'px-3.5 py-2.5 border-b border-border-subtle whitespace-nowrap text-[0.83rem]';

    let html = `<table class="w-full border-collapse text-[0.83rem]"><thead><tr>`;
    headers.forEach((h, i) => {
        const align = opts.alignRight?.includes(i) ? ' text-right' : '';
        html += `<th class="${thClass}${align}">${h}</th>`;
    });
    html += `</tr></thead><tbody>`;
    rows.forEach(row => {
        html += `<tr class="hover:bg-white/[0.02] transition-colors">`;
        row.forEach((cell, i) => {
            const align = opts.alignRight?.includes(i) ? ' text-right' : '';
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
    const links = document.querySelectorAll('.nav-link');
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
            links.forEach(l => l.classList.remove('nav-link-active'));
            link.classList.add('nav-link-active');
            sections.forEach(s => { s.classList.add('hidden'); s.classList.remove('block'); });
            const target = document.getElementById(`section-${sec}`);
            if (target) { target.classList.remove('hidden'); target.classList.add('block'); }
            if (sec === 'ai-insights' && window.AI_DATA && typeof renderAINarratives === 'function') {
                renderAINarratives(window.AI_DATA);
            }
            title.textContent = titles[sec] || 'Dashboard';
            sidebar.removeAttribute('data-open');
        });
    });

    menuToggle?.addEventListener('click', () => {
        if (sidebar.hasAttribute('data-open')) sidebar.removeAttribute('data-open');
        else sidebar.setAttribute('data-open', '');
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

    document.getElementById('kpiGrid').innerHTML = [
        kpiCard('Total Volume', fmtCurrency(totalVolume), scopeSubtitle, 'green'),
        kpiCard('Total Charges', fmtCurrency(totalCharges), `Effective rate: ${fmtPct(overallRate)}`, 'coral'),
        cardA,
        cardB,
        cardFailed,
        kpiCard('Refunds', fmt(refundCount), `₹${fmt(refundVol, 2)} total refunded`, 'yellow'),
    ].join('');

    // Chart: Volume & Charges comparison
    const gwEntries = DATA.overview.gateways ? Object.entries(DATA.overview.gateways) : [
        ['Gateway A', gA],
        ['Gateway B', gB]
    ];
    const gwLabels = gwEntries.map(([name]) => name);
    const gwVolumes = gwEntries.map(([, obj]) => obj?.total_volume || 0);
    const gwCharges = gwEntries.map(([, obj]) => obj?.total_charges || 0);
    const volColors = [COLORS.greenSoft, COLORS.blueSoft, COLORS.purpleSoft, COLORS.yellowSoft];
    const volBorders = [COLORS.green, COLORS.blue, COLORS.purple, COLORS.yellow];
    const chargeColors = [COLORS.coralSoft, COLORS.yellowSoft, COLORS.coralSoft, COLORS.blueSoft];
    const chargeBorders = [COLORS.coral, COLORS.yellow, COLORS.coral, COLORS.blue];

    makeChart('chartVolumeCompare', 'bar', {
        labels: gwLabels,
        datasets: [
            { label: 'Volume', data: gwVolumes, backgroundColor: gwLabels.map((_, i) => volColors[i % volColors.length]), borderColor: gwLabels.map((_, i) => volBorders[i % volBorders.length]), borderWidth: 1.5, borderRadius: 6, barPercentage: 0.5 },
            { label: 'Charges', data: gwCharges, backgroundColor: gwLabels.map((_, i) => chargeColors[i % chargeColors.length]), borderColor: gwLabels.map((_, i) => chargeBorders[i % chargeBorders.length]), borderWidth: 1.5, borderRadius: 6, barPercentage: 0.5 },
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
            { label: 'Gateway A %', data: netRatesA, backgroundColor: COLORS.greenSoft, borderColor: COLORS.green, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.6 },
            { label: 'Gateway B %', data: netRatesB, backgroundColor: COLORS.purpleSoft, borderColor: COLORS.purple, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.6 },
        ]
    }, {
        scales: { y: { ticks: { callback: v => v + '%' } } },
        plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } } }
    });

    // Chart: Settlement distribution
    const allSettleDays = new Set([...Object.keys(gA.settlement_distribution || {}), ...Object.keys(gB.settlement_distribution || {})]);
    const settleDayLabels = [...allSettleDays].sort((a, b) => Number(a) - Number(b));
    makeChart('chartSettlement', 'bar', {
        labels: settleDayLabels.map(d => d + 'd'),
        datasets: [
            { label: 'Gateway A', data: settleDayLabels.map(d => gA.settlement_distribution?.[d] || 0), backgroundColor: COLORS.greenSoft, borderColor: COLORS.green, borderWidth: 1.5, borderRadius: 4 },
            { label: 'Gateway B', data: settleDayLabels.map(d => gB.settlement_distribution?.[d] || 0), backgroundColor: COLORS.purpleSoft, borderColor: COLORS.purple, borderWidth: 1.5, borderRadius: 4 },
        ]
    }, {
        plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} transactions` } } },
        scales: { y: { ticks: { callback: v => v } } }
    });

    // Chart: Volume by method (Gateway A)
    const methods = Object.keys(DATA.by_method);
    makeChart('chartByMethod', 'doughnut', {
        labels: methods.map(m => m.charAt(0).toUpperCase() + m.slice(1)),
        datasets: [{
            data: methods.map(m => DATA.by_method[m].volume),
            backgroundColor: [COLORS.green, COLORS.blue, COLORS.coral, COLORS.yellow, COLORS.purple],
            borderColor: '#16161f', borderWidth: 3, hoverOffset: 8
        }]
    }, {
        plugins: {
            legend: { position: 'right' },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtCurrency(ctx.parsed)} (${fmtPct(DATA.by_method[methods[ctx.dataIndex]].rate)})` } }
        }
    });

    // Chart: Geography (Gateway B top 10)
    const geoEntries = Object.entries(DATA.by_geography).slice(0, 10);
    makeChart('chartGeography', 'bar', {
        labels: geoEntries.map(([k]) => k),
        datasets: [{
            label: 'Volume',
            data: geoEntries.map(([, v]) => v.volume),
            backgroundColor: geoEntries.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length] + '22'),
            borderColor: geoEntries.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
            borderWidth: 1.5, borderRadius: 4
        }]
    }, { indexAxis: 'y', scales: { x: { ticks: { callback: v => '₹' + (v / 100000).toFixed(0) + 'L' } } } });

    // Chart: Currency
    const gwACurr = Object.entries(DATA.by_currency.gatewayA).slice(0, 6);
    const gwBCurr = Object.entries(DATA.by_currency.gatewayB).slice(0, 6);
    const allCurrLabels = [...new Set([...gwACurr.map(([k]) => k), ...gwBCurr.map(([k]) => k)])];
    const gwAMap = Object.fromEntries(gwACurr);
    const gwBMap = Object.fromEntries(gwBCurr);
    makeChart('chartCurrency', 'bar', {
        labels: allCurrLabels,
        datasets: [
            { label: 'Gateway A', data: allCurrLabels.map(c => gwAMap[c]?.inr_volume || 0), backgroundColor: COLORS.greenSoft, borderColor: COLORS.green, borderWidth: 1.5, borderRadius: 4 },
            { label: 'Gateway B', data: allCurrLabels.map(c => gwBMap[c]?.volume || 0), backgroundColor: COLORS.purpleSoft, borderColor: COLORS.purple, borderWidth: 1.5, borderRadius: 4 },
        ]
    }, { scales: { y: { ticks: { callback: v => '₹' + (v / 100000).toFixed(0) + 'L' } } } });

    // Table: Comparison
    const compRows = networks.map(n => {
        const a = DATA.by_card_network[n]?.gatewayA;
        const b = DATA.by_card_network[n]?.gatewayB;
        const cheaper = (a && b) ? (a.rate < b.rate ? 'A' : 'B') : '—';
        return [
            `<span class="font-semibold">${n}</span>`,
            a ? fmt(a.count) : '—', a ? fmtCurrency(a.volume) : '—', a ? fmtCurrency(a.charges) : '—', a ? `<span class="font-mono-data">${fmtPct(a.rate)}</span>` : '—',
            b ? fmt(b.count) : '—', b ? fmtCurrency(b.volume) : '—', b ? fmtCurrency(b.charges) : '—', b ? `<span class="font-mono-data">${fmtPct(b.rate)}</span>` : '—',
            cheaper !== '—' ? `<span class="cell-good">Gateway ${cheaper}</span>` : '—'
        ];
    });
    document.getElementById('comparisonTable').innerHTML = buildTable(
        ['Network', 'A Txns', 'A Volume', 'A Charges', 'A Rate', 'B Txns', 'B Volume', 'B Charges', 'B Rate', 'Cheapest'],
        compRows, { alignRight: [1, 2, 3, 4, 5, 6, 7, 8] }
    );

    // Table: Geography
    const geoRows = Object.entries(DATA.by_geography).map(([country, d]) => [
        `<span class="font-semibold">${country}</span>`,
        fmt(d.count), fmtCurrency(d.volume), fmtCurrency(d.charges),
        `<span class="font-mono-data">${fmtPct(d.rate)}</span>`
    ]);
    document.getElementById('geographyTable').innerHTML = buildTable(
        ['Country', 'Txns', 'Volume', 'Charges', 'Eff. Rate'],
        geoRows, { alignRight: [1, 2, 3, 4] }
    );
}

// ============================================================
// Render: Reconciliation Section
// ============================================================
function renderReconciliation() {
    const recon = DATA.reconciliation;
    const oc = DATA.overcharges;
    const refs = DATA.refunds_summary;

    // KPIs
    document.getElementById('reconKpiGrid').innerHTML = [
        kpiCard('Reconciliation Mismatches', fmt(recon.total_mismatches), `Fee diff: ${fmtCurrency(recon.total_fee_diff)}`, 'yellow'),
        kpiCard('Overcharges Found', fmt(oc.count), `Total: ${fmtCurrency(oc.total_overcharge)} recoverable`, 'red'),
        kpiCard('Refunds (Gw A)', fmt(refs.gatewayA.count), `Volume: ${fmtCurrency(refs.gatewayA.volume)}`, 'coral'),
        kpiCard('Refunds (Gw B)', fmt(refs.gatewayB.count), `Volume: ${fmtCurrency(refs.gatewayB.volume)}`, 'purple'),
    ].join('');

    document.getElementById('overchargeCount').textContent = `${oc.count} items`;
    document.getElementById('mismatchCount').textContent = `${recon.total_mismatches} mismatches`;

    // Overcharges table
    const ocRows = oc.items.map(o => [
        `<span class="font-mono-data text-[0.78rem] text-gray-400">${o.payment_id}</span>`,
        o.currency,
        `<span class="font-mono-data">${fmtCurrency(o.amount_inr)}</span>`,
        o.method, o.international ? '🌍 Yes' : 'No',
        o.card_network || '—',
        `<span class="font-mono-data">${fmtPct(o.expected_rate)}</span>`,
        `<span class="font-mono-data text-red-400">${fmtPct(o.actual_rate)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(o.expected_fee)}</span>`,
        `<span class="font-mono-data text-red-400">${fmtCurrency(o.actual_fee)}</span>`,
        `<span class="cell-bad">${fmtCurrency(o.overcharge)}</span>`,
    ]);
    document.getElementById('overchargesTable').innerHTML = buildTable(
        ['Payment ID', 'CCY', 'Amount (INR)', 'Method', 'Intl', 'Network', 'Expected %', 'Actual %', 'Expected Fee', 'Actual Fee', 'Overcharge'],
        ocRows, { alignRight: [2, 6, 7, 8, 9, 10] }
    );

    // Recon table
    const reconRows = recon.mismatches.slice(0, 30).map(m => [
        `<span class="font-mono-data text-[0.78rem] text-gray-400">${m.payment_id}</span>`,
        m.issue || '',
        m.currency || '—',
        m.method || '—',
        m.pay_fee != null ? `<span class="font-mono-data">${fmtCurrency(m.pay_fee)}</span>` : '—',
        m.txn_fee != null ? `<span class="font-mono-data">${fmtCurrency(m.txn_fee)}</span>` : '—',
        m.fee_diff != null ? `<span class="font-mono-data ${m.fee_diff !== 0 ? 'text-red-400' : ''}">${fmtCurrency(m.fee_diff)}</span>` : '—',
        m.pay_tax != null ? `<span class="font-mono-data">${fmtCurrency(m.pay_tax)}</span>` : '—',
        m.txn_tax != null ? `<span class="font-mono-data">${fmtCurrency(m.txn_tax)}</span>` : '—',
        m.tax_diff != null ? `<span class="font-mono-data ${m.tax_diff !== 0 ? 'text-yellow-400' : ''}">${fmtCurrency(m.tax_diff)}</span>` : '—',
    ]);
    document.getElementById('reconTable').innerHTML = buildTable(
        ['Payment ID', 'Issue', 'Currency', 'Method', 'Pay Fee', 'Txn Fee', 'Fee Diff', 'Pay Tax', 'Txn Tax', 'Tax Diff'],
        reconRows, { alignRight: [4, 5, 6, 7, 8, 9] }
    );

    // Unsettled items info
    if (recon.unsettled_count > 0) {
        document.getElementById('reconTable').innerHTML += `<div class="mt-3 px-4 py-2 bg-yellow-400/10 text-yellow-400 rounded-lg text-[0.82rem]">⚠ ${recon.unsettled_count} captured payment(s) have no corresponding settlement transaction.</div>`;
    }

    // Refund table
    const refRows = [
        ['Gateway A', fmt(refs.gatewayA.count), fmtCurrency(refs.gatewayA.volume), '—'],
        ['Gateway B', fmt(refs.gatewayB.count), fmtCurrency(refs.gatewayB.volume), fmt(DATA.overview.gatewayB.dispute_count) + ' dispute(s)'],
    ];
    document.getElementById('refundTable').innerHTML = buildTable(
        ['Gateway', 'Refund Count', 'Refund Volume', 'Disputes'],
        refRows, { alignRight: [1, 2] }
    );
}

// ============================================================
// Render: Savings Section
// ============================================================
function renderSavings() {
    const sm = DATA.savings_model;
    const oc = DATA.overcharges;

    // KPIs
    const totalSaving = sm.total_potential_saving;
    const gwAVol = DATA.overview.gatewayA.total_volume;
    const gwBVol = DATA.overview.gatewayB.total_volume;

    document.getElementById('savingsKpiGrid').innerHTML = [
        kpiCard('Potential Monthly Savings', fmtCurrency(totalSaving), 'By routing to cheapest gateway per network', 'green'),
        kpiCard('Annualized Savings', fmtCurrency(totalSaving * 12), 'Projected at current volume', 'blue'),
        kpiCard('Overcharges to Recover', fmtCurrency(oc.total_overcharge), `${oc.count} transactions above contracted rates`, 'red'),
        kpiCard('Total Volume Analyzed', fmtCurrency(gwAVol + gwBVol), 'Across both gateways', 'purple'),
    ].join('');

    // Chart: Current vs Optimized
    const savItems = sm.items;
    makeChart('chartSavings', 'bar', {
        labels: savItems.map(s => s.network),
        datasets: [
            { label: 'Current Charges', data: savItems.map(s => s.current_charges), backgroundColor: COLORS.coralSoft, borderColor: COLORS.coral, borderWidth: 1.5, borderRadius: 6 },
            { label: 'Optimized Charges', data: savItems.map(s => s.optimized_charges), backgroundColor: COLORS.greenSoft, borderColor: COLORS.green, borderWidth: 1.5, borderRadius: 6 },
        ]
    }, { scales: { y: { ticks: { callback: v => '₹' + (v / 1000).toFixed(0) + 'K' } } } });

    // Chart: Gateway recommendation
    makeChart('chartRouting', 'bar', {
        labels: savItems.map(s => s.network),
        datasets: [
            { label: 'Gateway A Rate', data: savItems.map(s => s.gateway_a_rate), backgroundColor: COLORS.greenSoft, borderColor: COLORS.green, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.5 },
            { label: 'Gateway B Rate', data: savItems.map(s => s.gateway_b_rate), backgroundColor: COLORS.purpleSoft, borderColor: COLORS.purple, borderWidth: 1.5, borderRadius: 6, barPercentage: 0.5 },
        ]
    }, {
        scales: { y: { ticks: { callback: v => v + '%' } } },
        plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } } }
    });

    // Savings table
    const savRows = savItems.map(s => [
        `<span class="font-semibold">${s.network}</span>`,
        fmtCurrency(s.total_volume),
        `<span class="font-mono-data">${fmtPct(s.gateway_a_rate)}</span>`,
        `<span class="font-mono-data">${fmtPct(s.gateway_b_rate)}</span>`,
        `<span class="cell-good">${s.cheapest_gateway}</span>`,
        fmtCurrency(s.current_charges),
        fmtCurrency(s.optimized_charges),
        `<span class="font-mono-data font-bold text-emerald-400">${fmtCurrency(s.potential_saving)}</span>`,
        `<span class="font-mono-data">${fmtPct(s.saving_pct)}</span>`,
    ]);
    savRows.push([
        '<span class="font-bold text-gray-100">TOTAL</span>', fmtCurrency(savItems.reduce((a, s) => a + s.total_volume, 0)),
        '', '', '',
        `<span class="font-bold">${fmtCurrency(savItems.reduce((a, s) => a + s.current_charges, 0))}</span>`,
        `<span class="font-bold">${fmtCurrency(savItems.reduce((a, s) => a + s.optimized_charges, 0))}</span>`,
        `<span class="font-mono-data font-bold text-emerald-400 text-base">${fmtCurrency(totalSaving)}</span>`,
        ''
    ]);
    document.getElementById('savingsTable').innerHTML = buildTable(
        ['Network', 'Total Volume', 'Gw A Rate', 'Gw B Rate', 'Cheapest', 'Current Charges', 'Optimized', 'Saving', 'Saving %'],
        savRows, { alignRight: [1, 2, 3, 5, 6, 7, 8] }
    );

    // Contracted rates table
    const cr = oc.contracted_rates;
    const crRows = [
        ['Gateway A', 'Domestic Card', fmtPct(cr.domestic_card), '—'],
        ['Gateway A', 'International Card', fmtPct(cr.intl_card), '—'],
        ['Gateway A', 'UPI', fmtPct(cr.upi), '—'],
        ['Gateway A', 'EMI', fmtPct(cr.emi), '—'],
    ];
    document.getElementById('contractedRatesTable').innerHTML = buildTable(
        ['Gateway', 'Payment Type', 'Contracted Rate', 'Notes'],
        crRows, { alignRight: [2] }
    );
}

// ============================================================
// Render: Executive Summary
// ============================================================
function renderExecutive() {
    const gA = DATA.overview.gatewayA;
    const gB = DATA.overview.gatewayB;
    const sm = DATA.savings_model;
    const oc = DATA.overcharges;
    const recon = DATA.reconciliation;
    const hasA = DATA.has_gateway_a !== false && gA && gA.total_volume > 0;
    const hasB = DATA.has_gateway_b !== false && gB && gB.total_volume > 0;

    const totalVol = (gA?.total_volume || 0) + (gB?.total_volume || 0);
    const totalCharges = (gA?.total_charges || 0) + (gB?.total_charges || 0);
    const blendedRate = totalVol > 0 ? (totalCharges / totalVol * 100) : 0;

    let gatewayVolumeItems = '';
    if (hasA && hasB) {
        gatewayVolumeItems = `
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway A: ${fmtCurrency(gA.total_volume)} at <strong class="text-emerald-400">${fmtPct(gA.effective_rate)}</strong> effective rate</li>
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway B: ${fmtCurrency(gB.total_volume)} at <strong class="text-purple-400">${fmtPct(gB.effective_rate)}</strong> effective rate — <strong class="text-red-400">${fmtPct(gB.effective_rate - gA.effective_rate)} higher</strong> than Gateway A</li>
        `;
    } else if (hasA) {
        gatewayVolumeItems = `
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway A (Master Enriched Table): ${fmtCurrency(gA.total_volume)} at <strong class="text-emerald-400">${fmtPct(gA.effective_rate)}</strong> effective rate</li>
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway B: Not active. (Upload Gateway B consolidated file to unlock comparative analytics)</li>
        `;
    } else if (hasB) {
        gatewayVolumeItems = `
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway B (Consolidated Ledger): ${fmtCurrency(gB.total_volume)} at <strong class="text-purple-400">${fmtPct(gB.effective_rate)}</strong> effective rate</li>
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway A: Not active. (Upload Gateway A split files to unlock comparative analytics)</li>
        `;
    }

    let settlementItems = '';
    if (hasA && hasB) {
        settlementItems = `
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway A average settlement: <strong class="text-gray-100">${gA.avg_settlement_days} days</strong> (range: ${gA.min_settlement_days}–${gA.max_settlement_days} days)</li>
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway B average settlement: <strong class="text-gray-100">${gB.avg_settlement_days} days</strong> (range: ${gB.min_settlement_days}–${gB.max_settlement_days} days)</li>
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">${gA.avg_settlement_days < gB.avg_settlement_days ? 'Gateway A settles faster' : 'Gateway B settles faster'} — cash flow advantage of <strong class="text-gray-100">${Math.abs(gA.avg_settlement_days - gB.avg_settlement_days).toFixed(1)} days</strong></li>
        `;
    } else if (hasA) {
        settlementItems = `
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway A average settlement: <strong class="text-gray-100">${gA.avg_settlement_days} days</strong> (range: ${gA.min_settlement_days}–${gA.max_settlement_days} days)</li>
        `;
    } else if (hasB) {
        settlementItems = `
            <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway B average settlement: <strong class="text-gray-100">${gB.avg_settlement_days} days</strong> (range: ${gB.min_settlement_days}–${gB.max_settlement_days} days)</li>
        `;
    }

    document.getElementById('execSummary').innerHTML = `
        <h2 class="text-[2rem] font-extrabold tracking-tighter mb-2 bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">Payment Gateway Analysis</h2>
        <p class="text-[0.88rem] text-gray-500 mb-8">Executive Summary · ${DATA.period} · Generated ${new Date(DATA.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <div class="mb-7">
            <h3 class="text-[1.08rem] font-bold mb-3 pb-2 border-b border-border-subtle flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span> Volume & Cost Overview
            </h3>
            <ul class="list-none space-y-1">
                <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Total processed volume: <strong class="text-gray-100">${fmtCurrency(totalVol)}</strong> across <strong class="text-gray-100">${fmt((gA?.txn_count || 0) + (gB?.txn_count || 0))}</strong> transactions</li>
                <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Total gateway charges: <strong class="text-gray-100">${fmtCurrency(totalCharges)}</strong> (blended rate: <strong class="text-gray-100">${fmtPct(blendedRate)}</strong>)</li>
                ${gatewayVolumeItems}
            </ul>
        </div>

        <div class="mb-7">
            <h3 class="text-[1.08rem] font-bold mb-3 pb-2 border-b border-border-subtle flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-blue-400 inline-block"></span> Settlement Performance
            </h3>
            <ul class="list-none space-y-1">
                ${settlementItems}
            </ul>
        </div>

        <div class="mb-7">
            <h3 class="text-[1.08rem] font-bold mb-3 pb-2 border-b border-border-subtle flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span> Issues & Recovery
            </h3>
            <ul class="list-none space-y-1">
                <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600"><strong class="text-red-400">${fmt(oc.count)} overcharged transactions</strong> detected on Gateway A, totaling <strong class="text-red-400">${fmtCurrency(oc.total_overcharge)}</strong> recoverable</li>
                <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600"><strong class="text-yellow-400">${fmt(recon.total_mismatches)} reconciliation mismatches</strong> between payment and transaction records</li>
                <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway A failure rate: <strong class="text-gray-100">${fmtPct(DATA.failed_transactions.gatewayA.failure_rate)}</strong> (${fmt(DATA.failed_transactions.gatewayA.count)} of ${fmt(DATA.failed_transactions.gatewayA.total)})</li>
                <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Gateway B standalone fees (non-transaction): <strong class="text-gray-100">${fmtCurrency(gB.standalone_fees)}</strong></li>
            </ul>
        </div>

        <div class="mb-7">
            <h3 class="text-[1.08rem] font-bold mb-3 pb-2 border-b border-border-subtle flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span> Savings Opportunity
            </h3>
            <ul class="list-none space-y-1">
                <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Monthly savings from optimal routing: <strong class="text-emerald-400">${fmtCurrency(sm.total_potential_saving)}</strong></li>
                <li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">Annualized: <strong class="text-emerald-400">${fmtCurrency(sm.total_potential_saving * 12)}</strong></li>
                ${sm.items.map(s => `<li class="pl-5 relative text-gray-400 text-[0.9rem] leading-relaxed before:content-['→'] before:absolute before:left-0 before:text-gray-600">${s.network}: route to <strong class="text-gray-100">${s.cheapest_gateway}</strong> (${fmtPct(Math.min(s.gateway_a_rate, s.gateway_b_rate))} vs ${fmtPct(Math.max(s.gateway_a_rate, s.gateway_b_rate))}) — saves <strong class="text-emerald-400">${fmtCurrency(s.potential_saving)}</strong>/mo</li>`).join('')}
            </ul>
        </div>

        <div class="mb-7">
            <h3 class="text-[1.08rem] font-bold mb-3 pb-2 border-b border-border-subtle flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span> Recommended Actions
            </h3>
            <div class="grid grid-cols-2 gap-4 mt-3 max-lg:grid-cols-1">
                <div class="bg-surface-card border border-border-subtle rounded-xl p-5 hover:border-border-medium hover:-translate-y-0.5 transition-all">
                    <h4 class="text-[0.88rem] font-semibold mb-1.5 text-emerald-400">1. Recover Overcharges</h4>
                    <p class="text-[0.8rem] text-gray-400 leading-relaxed">File claims for ${fmtCurrency(oc.total_overcharge)} in overcharges on ${fmt(oc.count)} Gateway A transactions that exceeded contracted rates.</p>
                </div>
                <div class="bg-surface-card border border-border-subtle rounded-xl p-5 hover:border-border-medium hover:-translate-y-0.5 transition-all">
                    <h4 class="text-[0.88rem] font-semibold mb-1.5 text-emerald-400">2. Implement Smart Routing</h4>
                    <p class="text-[0.8rem] text-gray-400 leading-relaxed">Route each card network to its cheapest gateway to save ${fmtCurrency(sm.total_potential_saving)}/month (${fmtCurrency(sm.total_potential_saving * 12)}/year).</p>
                </div>
                <div class="bg-surface-card border border-border-subtle rounded-xl p-5 hover:border-border-medium hover:-translate-y-0.5 transition-all">
                    <h4 class="text-[0.88rem] font-semibold mb-1.5 text-emerald-400">3. Renegotiate Gateway B Rates</h4>
                    <p class="text-[0.8rem] text-gray-400 leading-relaxed">Gateway B's ${fmtPct(gB.effective_rate)} blended rate is ${fmtPct(gB.effective_rate - gA.effective_rate)} above Gateway A. Negotiate toward parity using volume leverage.</p>
                </div>
                <div class="bg-surface-card border border-border-subtle rounded-xl p-5 hover:border-border-medium hover:-translate-y-0.5 transition-all">
                    <h4 class="text-[0.88rem] font-semibold mb-1.5 text-emerald-400">4. Resolve Reconciliation Gaps</h4>
                    <p class="text-[0.8rem] text-gray-400 leading-relaxed">Investigate ${fmt(recon.total_mismatches)} mismatches between payment and settlement records. Total fee discrepancy: ${fmtCurrency(recon.total_fee_diff)}.</p>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// Render: Time-Series (Weekly by default; Monthly toggle if >1 month)
// ============================================================
let _tsCharts = {};   // holds Chart instances so we can destroy before redraw

function renderTimeseries() {
    const ts = DATA.timeseries;
    if (!ts) return;

    // Show/hide Monthly button based on whether data spans more than 1 month
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
    const src = granularity === 'monthly' ? ts.monthly : ts.weekly;
    const wa = src.gatewayA;
    const wb = src.gatewayB;
    const labels = [...new Set([...wa.map(w => w.period), ...wb.map(w => w.period)])].sort();
    const waMap = Object.fromEntries(wa.map(w => [w.period, w]));
    const wbMap = Object.fromEntries(wb.map(w => [w.period, w]));
    const periodLabel = granularity === 'monthly' ? 'Month' : 'Week';

    // Update toggle button styles
    document.querySelectorAll('.ts-tab').forEach(btn => {
        const isActive = btn.id === (granularity === 'monthly' ? 'btnTsMonthly' : 'btnTsWeekly');
        btn.className = isActive
            ? 'ts-tab px-3 py-1 rounded-lg text-[0.75rem] font-semibold transition-all bg-emerald-400/10 text-emerald-400 border border-emerald-400/30'
            : 'ts-tab px-3 py-1 rounded-lg text-[0.75rem] font-semibold transition-all text-gray-500 border border-transparent hover:text-gray-300';
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
            { label: 'Gateway A Volume', data: labels.map(l => waMap[l]?.volume || 0), borderColor: COLORS.green, backgroundColor: COLORS.greenSoft, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: COLORS.green },
            { label: 'Gateway B Volume', data: labels.map(l => wbMap[l]?.volume || 0), borderColor: COLORS.purple, backgroundColor: COLORS.purpleSoft, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: COLORS.purple },
        ]
    }, { scales: { y: { ticks: { callback: v => '₹' + (v / 100000).toFixed(1) + 'L' } } } });

    // Effective rate trend
    _tsCharts['chartWeeklyRate'] = makeChart('chartWeeklyRate', 'line', {
        labels,
        datasets: [
            { label: 'Gateway A Rate %', data: labels.map(l => waMap[l]?.rate || 0), borderColor: COLORS.green, backgroundColor: 'transparent', tension: 0.4, pointRadius: 4, pointBackgroundColor: COLORS.green, borderWidth: 2 },
            { label: 'Gateway B Rate %', data: labels.map(l => wbMap[l]?.rate || 0), borderColor: COLORS.purple, backgroundColor: 'transparent', tension: 0.4, pointRadius: 4, pointBackgroundColor: COLORS.purple, borderWidth: 2 },
        ]
    }, { scales: { y: { ticks: { callback: v => v + '%' } } }, plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.y)}` } } } });

    // Settlement days trend
    _tsCharts['chartWeeklySettle'] = makeChart('chartWeeklySettle', 'bar', {
        labels,
        datasets: [
            { label: 'Gateway A Avg Settlement (days)', data: labels.map(l => waMap[l]?.avg_settlement_days || 0), backgroundColor: COLORS.greenSoft, borderColor: COLORS.green, borderWidth: 1.5, borderRadius: 4 },
            { label: 'Gateway B Avg Settlement (days)', data: labels.map(l => wbMap[l]?.avg_settlement_days || 0), backgroundColor: COLORS.purpleSoft, borderColor: COLORS.purple, borderWidth: 1.5, borderRadius: 4 },
        ]
    }, { scales: { y: { ticks: { callback: v => v + 'd' } } }, plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}d` } } } });

    // Breakdown table
    const rows = labels.map(k => [
        `<span class="font-mono-data text-gray-300">${k}</span>`,
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
// Render: FX / Cross-Border Analysis (injected into Savings)
// ============================================================
function renderFXAnalysis() {
    const fx = DATA.fx_analysis;
    if (!fx) return;

    const fxEl = document.getElementById('fxAnalysisContent');
    if (!fxEl) return;

    const fxA = fx.gatewayA;
    const fxB = fx.gatewayB;

    // KPI cards
    const kpis = [
        kpiCard('Gw A Domestic Rate', fmtPct(fxA.domestic.rate), `${fmt(fxA.domestic.count)} txns · ${fmtCurrency(fxA.domestic.volume)}`, 'green'),
        kpiCard('Gw A Intl Rate', fmtPct(fxA.international.rate), `FX premium: +${fmtPct(fxA.fx_premium_pct)}pp`, 'coral'),
        kpiCard('Gw B Domestic Rate', fmtPct(fxB.domestic.rate), `${fmt(fxB.domestic.count)} txns · ${fmtCurrency(fxB.domestic.volume)}`, 'blue'),
        kpiCard('Gw B Intl Rate', fmtPct(fxB.international.rate), `FX premium: +${fmtPct(fxB.fx_premium_pct)}pp`, 'purple'),
    ].join('');

    // Gateway A — by currency
    const fxACurrRows = Object.entries(fxA.intl_by_currency || {}).map(([ccy, d]) => [
        `<span class="font-semibold text-gray-200">${ccy}</span>`,
        `<span class="font-mono-data">${fmtCurrency(d.volume)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(d.charges)}</span>`,
        `<span class="font-mono-data text-coral-400">${fmtPct(d.rate)}</span>`,
        `<span class="font-mono-data">${fmt(d.count)}</span>`,
    ]);

    // Gateway B — by country (top 10)
    const fxBCountryRows = Object.entries(fxB.intl_by_country || {}).slice(0, 10).map(([country, d]) => [
        `<span class="font-semibold text-gray-200">${country}</span>`,
        `<span class="font-mono-data">${fmtCurrency(d.volume)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(d.charges)}</span>`,
        `<span class="font-mono-data text-purple-400">${fmtPct(d.rate)}</span>`,
        `<span class="font-mono-data">${fmt(d.count)}</span>`,
    ]);

    fxEl.innerHTML = `
        <div class="grid grid-cols-4 gap-4 mb-6 max-lg:grid-cols-2 max-sm:grid-cols-1">${kpis}</div>
        <div class="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
            <div>
                <h4 class="text-[0.88rem] font-semibold text-gray-300 mb-3 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                    Gateway A — International by Currency
                </h4>
                <div class="overflow-x-auto rounded-lg">
                    ${fxACurrRows.length ? buildTable(['Currency', 'INR Volume', 'Charges', 'Eff Rate', 'Txns'], fxACurrRows, { alignRight: [1, 2, 3, 4] }) : '<p class="text-gray-500 text-sm">No international transactions</p>'}
                </div>
            </div>
            <div>
                <h4 class="text-[0.88rem] font-semibold text-gray-300 mb-3 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-purple-400 inline-block"></span>
                    Gateway B — International by Country (Top 10)
                </h4>
                <div class="overflow-x-auto rounded-lg">
                    ${fxBCountryRows.length ? buildTable(['Country', 'INR Volume', 'Charges', 'Eff Rate', 'Txns'], fxBCountryRows, { alignRight: [1, 2, 3, 4] }) : '<p class="text-gray-500 text-sm">No international transactions</p>'}
                </div>
            </div>
        </div>`;
}

// ============================================================
// Render: Rate Renegotiation (injected into Savings)
// ============================================================
function renderRenegotiation() {
    const reco = DATA.renegotiation;
    if (!reco) return;
    const el = document.getElementById('renegotiationContent');
    if (!el) return;

    const gc = reco.gateway_comparison;

    // Action summary cards
    const summaryCards = (reco.summary || []).map((s, i) => `
        <div class="flex gap-3 bg-surface-card border border-border-subtle rounded-xl p-4 hover:border-border-medium transition-all">
            <div class="w-7 h-7 rounded-full bg-emerald-400/10 text-emerald-400 text-[0.75rem] font-bold flex items-center justify-center shrink-0">${i + 1}</div>
            <p class="text-[0.83rem] text-gray-400 leading-relaxed">${s.replace(/^[0-9]+\.\s*/, '')}</p>
        </div>`).join('');

    // Category renegotiation table
    const catRows = (reco.by_category || []).map(c => [
        `<span class="font-semibold text-gray-200">${c.category}</span>`,
        `<span class="font-mono-data">${fmt(c.overcharge_count)}</span>`,
        `<span class="font-mono-data">${fmtCurrency(c.volume_affected)}</span>`,
        `<span class="font-mono-data text-emerald-400">${fmtPct(c.contracted_rate)}</span>`,
        `<span class="font-mono-data text-red-400">${fmtPct(c.avg_actual_rate)}</span>`,
        `<span class="font-mono-data text-red-400 font-semibold">${fmtCurrency(c.total_overcharge)}</span>`,
    ]);

    // Network overcharge table
    const netRows = (reco.by_network || []).map(n => [
        `<span class="font-semibold text-gray-200">${n.network}</span>`,
        `<span class="font-mono-data">${fmt(n.overcharge_count)}</span>`,
        `<span class="font-mono-data text-red-400 font-semibold">${fmtCurrency(n.total_overcharge)}</span>`,
        `<span class="font-mono-data text-red-400">${fmtPct(n.avg_actual_rate)}</span>`,
    ]);

    el.innerHTML = `
        <div class="mb-6 p-5 bg-blue-500/5 border border-blue-500/20 rounded-xl">
            <h4 class="text-[0.88rem] font-semibold text-blue-400 mb-2">Gateway Rate Comparison</h4>
            <p class="text-[0.83rem] text-gray-400">${gc?.recommendation || ''}</p>
            <div class="grid grid-cols-3 gap-4 mt-4 max-sm:grid-cols-1">
                <div class="text-center"><div class="text-[0.75rem] text-gray-500 uppercase tracking-wide mb-1">Gateway A Rate</div><div class="text-[1.4rem] font-bold font-mono-data text-emerald-400">${fmtPct(gc?.gateway_a_rate)}</div></div>
                <div class="text-center"><div class="text-[0.75rem] text-gray-500 uppercase tracking-wide mb-1">Gateway B Rate</div><div class="text-[1.4rem] font-bold font-mono-data text-purple-400">${fmtPct(gc?.gateway_b_rate)}</div></div>
                <div class="text-center"><div class="text-[0.75rem] text-gray-500 uppercase tracking-wide mb-1">B vs A Premium</div><div class="text-[1.4rem] font-bold font-mono-data text-red-400">+${fmtPct(gc?.rate_premium_pp)}pp</div></div>
            </div>
        </div>

        <div class="mb-6">
            <h4 class="text-[0.88rem] font-semibold text-gray-300 mb-3">Action Plan</h4>
            <div class="grid grid-cols-1 gap-2">${summaryCards}</div>
        </div>

        <div class="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
            <div>
                <h4 class="text-[0.88rem] font-semibold text-gray-300 mb-3">Overcharges by Category</h4>
                <div class="overflow-x-auto rounded-lg">
                    ${catRows.length ? buildTable(['Category', 'Count', 'Volume', 'Contracted %', 'Actual %', 'Overcharge'], catRows, { alignRight: [1, 2, 3, 4, 5] }) : '<p class="text-gray-500 text-sm">No overcharges found</p>'}
                </div>
            </div>
            <div>
                <h4 class="text-[0.88rem] font-semibold text-gray-300 mb-3">Overcharges by Card Network</h4>
                <div class="overflow-x-auto rounded-lg">
                    ${netRows.length ? buildTable(['Network', 'Count', 'Total Overcharge', 'Avg Actual Rate'], netRows, { alignRight: [1, 2, 3] }) : '<p class="text-gray-500 text-sm">No overcharges found</p>'}
                </div>
            </div>
        </div>`;
}

// ============================================================
// AI Narratives Renderer
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

    // 1. Dashboard Banner
    const dbEl = document.getElementById('aiDashboardBanner');
    if (dbEl && exec.headline) {
        const findingsBadges = (exec.key_findings || []).map(f => {
            const badgeColor = f.impact?.toLowerCase() === 'high' ? 'bg-red-400/10 text-red-400 border-red-400/30' : 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30';
            return `
                <div class="p-3 bg-surface border border-border-subtle rounded-lg">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wider">${f.metric}</span>
                        <span class="text-[0.65rem] font-bold uppercase px-1.5 py-0.5 rounded border ${badgeColor}">${f.impact} Impact</span>
                    </div>
                    <div class="text-[0.82rem] text-gray-200">${f.finding}</div>
                </div>
            `;
        }).join('');

        dbEl.innerHTML = `
            <div class="p-6 bg-gradient-to-r from-emerald-950/40 via-surface-card to-blue-950/30 border border-emerald-500/30 rounded-xl relative overflow-hidden shadow-lg">
                <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div class="flex items-center gap-2.5">
                        <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <h3 class="text-[0.98rem] font-bold text-gray-100 tracking-tight flex items-center gap-2">
                            AI Executive Briefing
                        </h3>
                    </div>
                    <a href="#ai-insights" onclick="document.querySelector('[data-section=\\'ai-insights\\']')?.click()" class="text-[0.78rem] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors">
                        Explore Full AI Audit & Dispute Letter &rarr;
                    </a>
                </div>
                <h4 class="text-[1.05rem] font-semibold text-emerald-300 mb-2">${exec.headline}</h4>
                <p class="text-[0.85rem] text-gray-300 leading-relaxed mb-4">${exec.plain_english_summary}</p>
                <div class="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                    ${findingsBadges}
                </div>
            </div>
        `;
    }

    // 2. Reconciliation Banner (Overcharge Explanation & Next Steps)
    const reconEl = document.getElementById('aiReconBanner');
    if (reconEl && oc.plain_english_explanation) {
        const evidenceCards = (oc.evidence_summary || []).map(e => `
            <div class="p-2.5 bg-surface/70 border border-border-subtle rounded-lg text-xs">
                <span class="block text-gray-400 font-medium mb-0.5">${e.label}</span>
                <span class="block text-gray-200 font-semibold">${e.detail}</span>
            </div>
        `).join('');

        const stepsList = (oc.recommended_investigation_steps || []).map((step, idx) => `
            <li class="flex items-start gap-2 text-[0.82rem] text-gray-300">
                <span class="w-5 h-5 rounded-full bg-red-400/10 text-red-400 flex items-center justify-center shrink-0 text-[0.7rem] font-bold mt-0.5">${idx + 1}</span>
                <span>${step}</span>
            </li>
        `).join('');

        reconEl.innerHTML = `
            <div class="p-6 bg-surface-card border border-red-500/30 rounded-xl mb-5 shadow-lg relative">
                <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[0.68rem] font-bold uppercase tracking-wider bg-red-400/15 text-red-400 border border-red-400/30">AI Investigation</span>
                        <h3 class="text-[1.02rem] font-bold text-gray-100">${oc.title || 'Overcharge & Tariff Violation Audit'}</h3>
                    </div>
                    <span class="text-[0.72rem] text-gray-500 font-mono">Analyzed by ${modelUsed}</span>
                </div>
                <div class="mb-4">
                    <h5 class="text-[0.78rem] font-semibold text-gray-400 uppercase tracking-wider mb-1">Plain-English Finding Explanation</h5>
                    <p class="text-[0.86rem] text-gray-200 leading-relaxed">${oc.plain_english_explanation}</p>
                </div>
                
                <div class="grid grid-cols-2 gap-4 mb-4 max-lg:grid-cols-1">
                    <div class="p-4 bg-surface border border-border-subtle rounded-lg">
                        <h5 class="text-[0.78rem] font-semibold text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            Root-Cause Analysis
                        </h5>
                        <p class="text-[0.82rem] text-gray-300 leading-relaxed">${oc.root_cause_analysis}</p>
                    </div>
                    <div class="p-4 bg-surface border border-border-subtle rounded-lg">
                        <h5 class="text-[0.78rem] font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                            Finance Team Action Plan
                        </h5>
                        <ul class="space-y-2 list-none p-0">${stepsList}</ul>
                    </div>
                </div>

                ${evidenceCards ? `
                <div class="mb-4">
                    <h5 class="text-[0.74rem] font-semibold text-gray-400 uppercase tracking-wider mb-2">Supporting Reconciliation Evidence</h5>
                    <div class="grid grid-cols-4 gap-2.5 max-md:grid-cols-2">${evidenceCards}</div>
                </div>` : ''}

                ${oc.dispute_email_draft ? `
                <div class="mt-4 pt-4 border-t border-border-subtle">
                    <details class="group bg-surface/50 border border-border-medium rounded-lg transition-all">
                        <summary class="px-4 py-3 cursor-pointer text-[0.84rem] font-semibold text-gray-200 flex items-center justify-between hover:text-emerald-400">
                            <span class="flex items-center gap-2">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                Ready-to-Send Gateway Dispute Letter Draft (Click to Expand)
                            </span>
                            <span class="text-xs text-gray-500 group-open:rotate-180 transition-transform">&darr;</span>
                        </summary>
                        <div class="p-4 border-t border-border-subtle text-xs space-y-3">
                            <div class="flex justify-between items-center text-gray-400 pb-2 border-b border-border-subtle">
                                <div><strong>To:</strong> ${oc.dispute_email_draft.recipient || 'Gateway A Merchant Support'}</div>
                                <button onclick="copyDisputeEmail()" id="btnCopyEmail" class="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/30 font-medium transition-all">
                                    Copy Letter to Clipboard
                                </button>
                            </div>
                            <div class="text-gray-300"><strong>Subject:</strong> <span id="disputeEmailSubject">${oc.dispute_email_draft.subject}</span></div>
                            <pre id="disputeEmailBody" class="font-sans whitespace-pre-wrap text-[0.82rem] text-gray-300 bg-surface-card p-3 rounded border border-border-subtle leading-relaxed">${oc.dispute_email_draft.body}</pre>
                        </div>
                    </details>
                </div>` : ''}
            </div>
        `;
    }

    // 3. Savings Model Banner
    const savEl = document.getElementById('aiSavingsBanner');
    if (savEl && route.plain_english_explanation) {
        const roadmapItems = (route.implementation_roadmap || []).map(r => `
            <div class="p-3 bg-surface border border-border-subtle rounded-lg">
                <div class="text-[0.74rem] font-bold text-emerald-400 uppercase tracking-wider mb-1">${r.phase}</div>
                <div class="text-[0.82rem] text-gray-300 leading-relaxed">${r.actions}</div>
            </div>
        `).join('');

        savEl.innerHTML = `
            <div class="p-6 bg-surface-card border border-emerald-500/30 rounded-xl mb-5 shadow-lg">
                <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[0.68rem] font-bold uppercase tracking-wider bg-emerald-400/15 text-emerald-400 border border-emerald-400/30">AI Strategy</span>
                        <h3 class="text-[1.02rem] font-bold text-gray-100">${route.title || 'Smart Gateway Routing Arbitrage'}</h3>
                    </div>
                    <span class="text-[0.72rem] text-emerald-400 font-bold">Potential: ₹8.51L / month</span>
                </div>
                <p class="text-[0.86rem] text-gray-200 leading-relaxed mb-4">${route.plain_english_explanation}</p>
                <div class="p-4 bg-surface border border-border-subtle rounded-lg mb-4">
                    <h5 class="text-[0.78rem] font-semibold text-yellow-400 uppercase tracking-wider mb-1">Operational Trade-offs & Failure Risk Analysis</h5>
                    <p class="text-[0.82rem] text-gray-300 leading-relaxed">${route.root_cause_and_tradeoffs}</p>
                </div>
                ${roadmapItems ? `
                <div>
                    <h5 class="text-[0.74rem] font-semibold text-gray-400 uppercase tracking-wider mb-2">Phased Execution Roadmap</h5>
                    <div class="grid grid-cols-3 gap-3 max-md:grid-cols-1">${roadmapItems}</div>
                </div>` : ''}
            </div>
        `;
    }

    // 4. Dedicated AI Insights & Audit Section
    const fullAuditEl = document.getElementById('aiFullAuditContainer');
    if (fullAuditEl) {
        const stratRecs = (exec.strategic_recommendations || []).map(s => `
            <div class="p-4 bg-surface-card border border-border-subtle rounded-xl flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-emerald-400/15 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">#${s.priority}</span>
                <div class="flex-1">
                    <div class="text-[0.9rem] font-semibold text-gray-100 mb-1">${s.action}</div>
                    <div class="text-[0.82rem] text-gray-400 leading-relaxed mb-2">${s.rationale}</div>
                    <div class="text-[0.75rem] font-mono font-medium text-emerald-400 bg-emerald-400/10 inline-block px-2 py-0.5 rounded">Benefit: ${s.financial_benefit}</div>
                </div>
            </div>
        `).join('');

        const treasuryRecs = (fx.recommended_treasury_actions || []).map((t, idx) => `
            <li class="flex items-start gap-2 text-[0.82rem] text-gray-300">
                <span class="w-5 h-5 rounded-full bg-blue-400/10 text-blue-400 flex items-center justify-center shrink-0 text-[0.7rem] font-bold mt-0.5">${idx + 1}</span>
                <span>${t}</span>
            </li>
        `).join('');

        fullAuditEl.innerHTML = `
            <div class="mb-6 flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-border-subtle">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2 py-0.5 rounded text-[0.7rem] font-bold uppercase tracking-wider bg-emerald-400/15 text-emerald-400 border border-emerald-400/30">AI Financial Audit</span>
                        <span class="text-[0.75rem] text-gray-400 font-mono">Generated: ${new Date(AI_DATA.generated_at).toLocaleString('en-IN')}</span>
                    </div>
                    <h2 class="text-xl font-bold tracking-tight text-gray-100">LLM-Driven Payment & Tax Intelligence Audit</h2>
                    <p class="text-[0.85rem] text-gray-400 mt-1">Plain-English diagnostic narratives, root-cause deductions, and dispute recovery workflows powered by ${modelUsed}.</p>
                </div>
                <button onclick="window.print()" class="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-all flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Print Audit Report
                </button>
            </div>

            <!-- Executive Summary Card -->
            <div class="p-6 bg-surface-card border border-border-subtle rounded-xl mb-6 shadow-lg">
                <h3 class="text-[1.1rem] font-bold text-emerald-400 mb-2">${exec.headline || 'Executive Briefing'}</h3>
                <p class="text-[0.88rem] text-gray-200 leading-relaxed mb-6">${exec.plain_english_summary || ''}</p>
                
                <h4 class="text-[0.82rem] font-bold text-gray-300 uppercase tracking-wider mb-3">Strategic Priorities for Leadership</h4>
                <div class="grid grid-cols-1 gap-3 mb-4">${stratRecs}</div>
            </div>

            <!-- FX & Treasury Float Card -->
            <div class="p-6 bg-surface-card border border-border-subtle rounded-xl mb-6 shadow-lg">
                <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 class="text-[1.05rem] font-bold text-gray-100 flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b8af5" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                        ${fx.title || 'Cross-Border FX & Working Capital Velocity Audit'}
                    </h3>
                    <span class="text-[0.72rem] text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20 font-semibold">Treasury Impact</span>
                </div>
                <div class="grid grid-cols-2 gap-5 mb-5 max-lg:grid-cols-1">
                    <div class="p-4 bg-surface border border-border-subtle rounded-lg">
                        <h5 class="text-[0.78rem] font-semibold text-blue-400 uppercase tracking-wider mb-2">Cross-Border FX Markup Impact</h5>
                        <p class="text-[0.84rem] text-gray-200 leading-relaxed">${fx.fx_markup_explanation || ''}</p>
                    </div>
                    <div class="p-4 bg-surface border border-border-subtle rounded-lg">
                        <h5 class="text-[0.78rem] font-semibold text-purple-400 uppercase tracking-wider mb-2">Working Capital Float & Liquidity</h5>
                        <p class="text-[0.84rem] text-gray-200 leading-relaxed">${fx.working_capital_impact || ''}</p>
                    </div>
                </div>
                <div>
                    <h5 class="text-[0.78rem] font-semibold text-gray-300 uppercase tracking-wider mb-2">Recommended Treasury Actions</h5>
                    <ul class="space-y-2 list-none p-0">${treasuryRecs}</ul>
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
            btn.classList.add('bg-emerald-500', 'text-black');
            setTimeout(() => {
                btn.innerText = orig;
                btn.classList.remove('bg-emerald-500', 'text-black');
            }, 2500);
        }
    }).catch(err => {
        alert('Could not copy automatically. Please select and copy manually.');
    });
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
        renderAINarratives();
    }
}

function renderEmptyState() {
    const emptyHtml = `
        <div style="background:#ffffff;border:2px dashed #cbd5e1;border-radius:14px;padding:48px 24px;text-align:center;margin:20px 0;width:100%;grid-column:1/-1;">
            <div style="width:48px;height:48px;border-radius:50%;background:#f1f5f9;display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <h3 style="font-family:var(--f-display);font-size:1.15rem;font-weight:700;color:#0f172a;margin-bottom:8px;">No Dataset Loaded</h3>
            <p style="font-size:0.85rem;color:#64748b;max-width:440px;margin:0 auto 20px;line-height:1.5;">
                Data is not loaded from disk. Please select your 4 Excel files in the <strong>Upload Data</strong> tab and click <strong>Process Files</strong> to dynamically compute and view analytics.
            </p>
            <button onclick="document.querySelector('[data-section=\\'upload\\']')?.click()" style="padding:10px 24px;background:#0f172a;color:#fff;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;">
                Go to Upload Data →
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

    if (window.DATA) {
        renderAll(window.DATA);
    } else {
        // Start completely empty!
        renderEmptyState();

        // Default view to the Upload Data section
        const uploadNav = document.querySelector('[data-section="upload"]');
        if (uploadNav && (!window.location.hash || window.location.hash === '#dashboard' || window.location.hash === '#upload')) {
            uploadNav.click();
        }
    }
}

window.renderAll = renderAll;
window.renderAINarratives = renderAINarratives;
window.renderEmptyState = renderEmptyState;
document.addEventListener('DOMContentLoaded', init);


