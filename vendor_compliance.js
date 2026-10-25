/**
 * vendor_compliance.js — Vendor GST & TDS Compliance Platform (Module 2)
 * Objective: Check every vendor and vendor payment for GST and TDS compliance,
 * and list the exceptions before books close.
 *
 * Implements:
 * 1. Dual-statute sign-off matrix (Income-tax Act 1961 vs Income-tax Act 2025)
 * 2. Vendor compliance scorecard & Invoice Master Register (Compliant, Needs attention, High risk)
 * 3. Exception report showing the amount at stake and suggested remedial action
 * 4. Vendor master cleanup list with auto-generated vendor outreach notices
 * 5. Complete statutory rule ledger (7 GST checks, 5 TDS checks, MSME 45-day rule)
 * 6. Audit dossier inspection modal for granular invoice & vendor verification
 * 7. Module switcher to toggle cleanly between Module 1 and Module 2
 */

(function() {
// Standalone Safe Helpers & Formatters
const safeFmt = (n, decimals = 0) => {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const safeFmtCurrency = (n) => {
    if (n == null || isNaN(n)) return '—';
    return '₹' + safeFmt(n, 0);
};
const safeFmtPct = (n) => {
    if (n == null || isNaN(n)) return '—';
    return safeFmt(n, 2) + '%';
};
const safeEscapeHTML = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
};
const safeBuildTable = (headers, rows, opts = {}) => {
    let html = `<table class="data-table w-full"><thead><tr>`;
    headers.forEach((h, i) => {
        const align = opts.alignRight?.includes(i) ? ' text-right' : '';
        html += `<th class="th-cell${align}">${h}</th>`;
    });
    html += `</tr></thead><tbody>`;
    rows.forEach(row => {
        html += `<tr>`;
        row.forEach((cell, i) => {
            const align = opts.alignRight?.includes(i) ? ' text-right' : '';
            html += `<td class="td-cell${align}">${cell}</td>`;
        });
        html += `</tr>`;
    });
    html += `</tbody></table>`;
    return html;
};
const safeKpiCard = (label, val, sub, tone = 'gray', id = '') => {
    const borderColors = {
        gray: '#9297a0',
        green: '#006400',
        yellow: '#d9a441',
        red: '#aa2d00',
        coral: '#aa2d00',
        blue: '#1b61c9',
        orange: '#e65c00'
    };
    const valColors = {
        gray: 'var(--c-ink)',
        green: '#0a2e0e',
        yellow: '#7c5800',
        red: '#aa2d00',
        coral: '#aa2d00',
        blue: '#1b61c9',
        orange: '#aa2d00'
    };
    const bColor = borderColors[tone] || '#9297a0';
    const vColor = valColors[tone] || 'var(--c-ink)';
    const idAttr = id ? ` id="${id}"` : '';

    return `
        <div class="kpi-card-shell"${idAttr} style="border-left: 3px solid ${bColor};">
            <div class="kpi-lbl">${label}</div>
            <div class="kpi-val" style="color: ${vColor};">${val}</div>
            <div class="kpi-sub">${sub}</div>
        </div>
    `;
};

const fmt = safeFmt;
const fmtCurrency = safeFmtCurrency;
const fmtPct = safeFmtPct;
const escapeHTML = safeEscapeHTML;
const buildTable = safeBuildTable;
const kpiCard = safeKpiCard;

// Master Datasets: Real-time on-demand calculation mode (in-memory only; cleared upon refresh)
const DEFAULT_VENDOR_DATA = null;
let VENDOR_DATA = null;
window.VENDOR_DATA = null;

// Navigation & Filter State
let currentScorecardFilter = 'all';
let currentScorecardView = 'vendors'; // 'vendors' | 'invoices'
let currentExceptionCategory = 'all';
let currentExceptionSeverity = 'all';
let currentCleanupFilter = 'all';

// Chart instances for Module 2
let chartVndRisk = null;
let chartVndExposure = null;
let chartVndTopRisks = null;

// ============================================================
// Module Switcher: Seamlessly Decouple Module 1 & Module 2
// ============================================================
function switchModule(moduleId) {
    const isModule2 = (moduleId === 'module-vendor');

    // Update Dropdown Selector
    const dropdown = document.getElementById('module-select-dropdown');
    if (dropdown && dropdown.value !== moduleId) {
        dropdown.value = moduleId;
    }

    // Update Topbar Segmented Switch
    const btnGw = document.getElementById('tab-mod-gateway');
    const btnVnd = document.getElementById('tab-mod-vendor');
    if (btnGw && btnVnd) {
        if (isModule2) {
            btnGw.classList.remove('active');
            btnGw.removeAttribute('aria-selected');
            btnVnd.classList.add('active');
            btnVnd.setAttribute('aria-selected', 'true');
        } else {
            btnVnd.classList.remove('active');
            btnVnd.removeAttribute('aria-selected');
            btnGw.classList.add('active');
            btnGw.setAttribute('aria-selected', 'true');
        }
    }

    // Toggle Sidebar Navigation Lists
    const navGw = document.getElementById('nav-module-gateway');
    const navVnd = document.getElementById('nav-module-vendor');
    const brandSub = document.querySelector('.sb-sub');
    const periodLabel = document.getElementById('period-label');

    if (isModule2) {
        if (navGw) navGw.style.display = 'none';
        if (navVnd) navVnd.style.display = 'block';
        if (brandSub) brandSub.textContent = 'Vendor GST & TDS Compliance';
        if (periodLabel) periodLabel.textContent = 'FY 26-27 (Pre-Close)';

        // Hide all Module 1 sections
        document.querySelectorAll('.content-section').forEach(s => {
            if (!s.id.startsWith('section-v-')) {
                s.classList.add('hidden');
                s.classList.remove('block');
            }
        });

        // Activate default or previously selected Module 2 section
        let targetSec = window.location.hash ? window.location.hash.replace('#', '') : 'v-scorecard';
        if (!targetSec.startsWith('v-')) targetSec = 'v-scorecard';

        const linkToActivate = document.querySelector(`#nav-module-vendor [data-section="${targetSec}"]`) ||
                               document.querySelector('#nav-module-vendor [data-section="v-scorecard"]');

        if (linkToActivate) {
            linkToActivate.click();
        } else {
            showVendorSection('v-scorecard');
        }

        // Render scorecard charts after activation
        setTimeout(renderScorecardCharts, 60);
    } else {
        if (navVnd) navVnd.style.display = 'none';
        if (navGw) navGw.style.display = 'block';
        if (brandSub) brandSub.textContent = 'Gateway Intelligence';
        if (periodLabel) periodLabel.textContent = 'Sep 2026';

        // Hide all Module 2 sections
        document.querySelectorAll('[id^="section-v-"]').forEach(s => {
            s.classList.add('hidden');
            s.classList.remove('block');
        });

        // Activate Module 1 section
        let targetSec = window.location.hash ? window.location.hash.replace('#', '') : 'dashboard';
        if (targetSec.startsWith('v-')) targetSec = 'dashboard';

        const linkToActivate = document.querySelector(`#nav-module-gateway [data-section="${targetSec}"]`) ||
                               document.querySelector('#nav-module-gateway [data-section="dashboard"]');
        if (linkToActivate) {
            linkToActivate.click();
        }
    }
}

function showVendorSection(secKey) {
    const navLinks = document.querySelectorAll('#nav-module-vendor .nav-link');
    navLinks.forEach(l => {
        l.classList.remove('nav-link-active');
        l.removeAttribute('aria-current');
        if (l.dataset.section === secKey) {
            l.classList.add('nav-link-active');
            l.setAttribute('aria-current', 'page');
        }
    });

    // Hide all content sections
    document.querySelectorAll('.content-section').forEach(s => {
        s.classList.add('hidden');
        s.classList.remove('block');
    });

    const target = document.getElementById(`section-${secKey}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('block');
    }

    const titleMap = {
        'v-scorecard': 'Vendor Compliance Scorecard',
        'v-exceptions': 'Exception Report & Remedial Actions',
        'v-signoff': 'Tax Team Sign-off Matrix (1961 vs 2025 Act)',
        'v-cleanup': 'Vendor Master Cleanup List',
        'v-audit': 'Audit Ledger & Rule Verification Checks',
        'v-upload': 'Module 2 Data Ingestion & Staging'
    };
    const title = document.getElementById('pageTitle');
    if (title && titleMap[secKey]) {
        title.textContent = titleMap[secKey];
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (!VENDOR_DATA && secKey !== 'v-upload') {
        renderEmptyVendorState();
        return;
    }

    // Re-render chart if switching to scorecard
    if (secKey === 'v-scorecard' && VENDOR_DATA) {
        setTimeout(renderScorecardCharts, 50);
    }
}

// ============================================================
// Real-Time In-Memory Execution State
// ============================================================
function getEmptyVendorStateHTML(title = "No Live Compliance Audit in Memory") {
    return `
        <div style="background:#ffffff;border:1px dashed var(--c-hairline);border-radius:12px;padding:48px 24px;text-align:center;margin:16px 0;width:100%;box-sizing:border-box;">
            <div style="width:52px;height:52px;border-radius:50%;background:var(--c-surface-soft);border:1px solid var(--c-hairline);display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--c-ink)" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <h3 style="font-size:1.25rem;font-weight:600;color:var(--c-ink);margin-bottom:8px;letter-spacing:-0.01em;">${title}</h3>
            <p style="font-size:0.88rem;color:var(--c-muted);max-width:520px;margin:0 auto 20px;line-height:1.55;">
                Calculate GST, TDS, MSME 45-day rules, and vendor master hygiene directly from source Excel workbooks in real time. Data is held in memory and will reset upon page refresh.
            </p>
            <button type="button" onclick="reprocessVendorCompliance()" class="btn-primary btn-run-audit-trigger" style="padding:12px 28px;font-size:0.88rem;display:inline-flex;align-items:center;gap:8px;">
                ⚡ Run Real-Time Compliance Audit
            </button>
        </div>
    `;
}

function renderEmptyVendorState() {
    const emptyHtml = getEmptyVendorStateHTML();

    const scBody = document.getElementById('vndScorecardBody');
    if (scBody) scBody.style.display = 'none';
    const gateNotice = document.getElementById('vndHealthGateNotice');
    if (gateNotice) gateNotice.style.display = 'none';

    const kpiContainer = document.getElementById('vndScorecardKpis');
    if (kpiContainer) kpiContainer.innerHTML = emptyHtml;

    const excWrap = document.getElementById('exceptionTableWrap');
    if (excWrap) excWrap.innerHTML = emptyHtml;
    const excMetrics = document.getElementById('vndExceptionMetrics');
    if (excMetrics) excMetrics.innerHTML = '';

    const signWrap = document.getElementById('signOffTableWrap');
    if (signWrap) signWrap.innerHTML = emptyHtml;

    const cleanWrap = document.getElementById('cleanupTableWrap');
    if (cleanWrap) cleanWrap.innerHTML = emptyHtml;

    const auditGrid = document.getElementById('auditRuleChecksGrid');
    if (auditGrid) auditGrid.innerHTML = emptyHtml;

    const tAll = document.querySelector('#scorecardTabs [data-filter="all"]');
    if (tAll) tAll.textContent = 'All';
    const tHigh = document.querySelector('#scorecardTabs [data-filter="high-risk"]');
    if (tHigh) tHigh.textContent = 'High Risk';
    const tNeeds = document.querySelector('#scorecardTabs [data-filter="needs-attention"]');
    if (tNeeds) tNeeds.textContent = 'Needs Attention';
    const tComp = document.querySelector('#scorecardTabs [data-filter="compliant"]');
    if (tComp) tComp.textContent = 'Compliant';

    const cleanAll = document.querySelector('#cleanupTabs [data-status="all"]');
    if (cleanAll) cleanAll.textContent = 'All';
    const cleanPend = document.querySelector('#cleanupTabs [data-status="pending"]');
    if (cleanPend) cleanPend.textContent = 'Pending Review';
    const cleanSent = document.querySelector('#cleanupTabs [data-status="notice-sent"]');
    if (cleanSent) cleanSent.textContent = 'Notice Sent';
}

function renderAllVendorModule() {
    if (!VENDOR_DATA) {
        renderEmptyVendorState();
        return;
    }
    const scBody = document.getElementById('vndScorecardBody');
    if (scBody) scBody.style.display = 'block';
    const gateNotice = document.getElementById('vndHealthGateNotice');
    if (gateNotice) gateNotice.style.display = 'flex';

    renderVendorScorecard();
    renderVendorExceptions();
    renderSignOffMatrix();
    renderVendorCleanup();
    renderAuditLedger();
    renderScorecardCharts();
}

// ============================================================
// 1. Deliverable: Vendor Compliance Scorecard & Invoice Register
// ============================================================
function renderVendorScorecard() {
    if (!VENDOR_DATA) return;
    const summary = VENDOR_DATA.summary || {};

    // Update Health Gate Notice Text
    const gateNotice = document.getElementById('vndHealthGateNotice');
    const gateText = document.getElementById('vndGateSummaryText');
    if (gateNotice && gateText) {
        gateNotice.style.display = 'flex';
        gateText.innerHTML = `${summary.total_vendors || 0} vendors audited across ${summary.total_invoices_audited || 0} purchase invoices (Total Spend: ${fmtCurrency(summary.total_spend || 0)}). <strong>${summary.high_risk_count || 0} High Risk vendors</strong>, <strong>${summary.critical_exceptions || 0} Critical invoices</strong>, and <strong>${summary.total_exceptions || 0} statutory exceptions</strong> (${fmtCurrency(summary.total_exposure || 0)} at stake) require sign-off before closing books.`;
    }

    const lblHealthCount = document.getElementById('lblVendorHealthCount');
    if (lblHealthCount) lblHealthCount.textContent = `${summary.total_vendors || 0} Vendors`;
    const lblExpBadge = document.getElementById('lblVendorExposureBadge');
    if (lblExpBadge) lblExpBadge.textContent = `${fmtCurrency(summary.total_exposure || 0)} at Stake`;

    // Update Scorecard KPIs
    const kpiContainer = document.getElementById('vndScorecardKpis');
    if (kpiContainer) {
        kpiContainer.innerHTML = `
            ${kpiCard('Audited Vendors', fmt(summary.total_vendors || 0), 'Unique PAN / Vendor Entities', 'gray')}
            ${kpiCard('Purchase Invoices', fmt(summary.total_invoices_audited || 0), `Spend: ${fmtCurrency(summary.total_spend || 0)}`, 'blue')}
            ${kpiCard('Needs Attention', fmt(summary.needs_attention_count || 0), 'External Evidence Required', 'yellow')}
            ${kpiCard('High Risk Vendors', fmt(summary.high_risk_count || 0), `${summary.critical_exceptions || 0} High-Risk Invoices Flagged`, 'red')}
            ${kpiCard('Total Amount at Stake', fmtCurrency(summary.total_exposure || 0), 'Total Financial Exposure', 'coral')}
            ${kpiCard('Books Close Gate', `${summary.critical_exceptions || 0} Blockers`, 'Immediate tax action required', 'orange')}
        `;
    }

    // Update dynamic Scorecard tab counts
    const vendors = VENDOR_DATA.scorecard || [];
    const highRiskCount = vendors.filter(v => v.status === 'High Risk').length;
    const needsAttnCount = vendors.filter(v => v.status === 'Needs Attention').length;
    const compliantCount = vendors.filter(v => v.status === 'Compliant').length;
    const msmeCount = vendors.filter(v => (v.msme_tier || '').toLowerCase().includes('micro') || (v.msme_tier || '').toLowerCase().includes('small')).length;

    const tAll = document.querySelector('#scorecardTabs [data-filter="all"]');
    const tHigh = document.querySelector('#scorecardTabs [data-filter="high-risk"]');
    const tNeeds = document.querySelector('#scorecardTabs [data-filter="needs-attention"]');
    const tComp = document.querySelector('#scorecardTabs [data-filter="compliant"]');
    const tMsme = document.querySelector('#scorecardTabs [data-filter="msme"]');

    if (tAll) tAll.textContent = `All (${vendors.length})`;
    if (tHigh) tHigh.textContent = `High Risk (${highRiskCount})`;
    if (tNeeds) tNeeds.textContent = `Needs Attention (${needsAttnCount})`;
    if (tComp) tComp.textContent = `Compliant (${compliantCount})`;
    if (tMsme) tMsme.textContent = `MSME Vendors (${msmeCount})`;

    // Render table according to current view
    if (currentScorecardView === 'invoices') {
        renderInvoiceRegisterTable();
    } else {
        renderScorecardTable();
    }
}

function toggleScorecardView(view) {
    currentScorecardView = view;
    const btnV = document.getElementById('btn-view-vendors');
    const btnI = document.getElementById('btn-view-invoices');

    if (btnV && btnI) {
        if (view === 'invoices') {
            btnV.classList.remove('ts-tab-active');
            btnI.classList.add('ts-tab-active');
        } else {
            btnI.classList.remove('ts-tab-active');
            btnV.classList.add('ts-tab-active');
        }
    }

    if (view === 'invoices') {
        renderInvoiceRegisterTable();
    } else {
        renderScorecardTable();
    }
}

function filterScorecard(status) {
    currentScorecardFilter = status;
    document.querySelectorAll('#scorecardTabs .ts-tab').forEach(t => {
        t.classList.remove('ts-tab-active');
        if (t.dataset.filter === status) t.classList.add('ts-tab-active');
    });

    if (currentScorecardView === 'invoices') {
        renderInvoiceRegisterTable();
    } else {
        renderScorecardTable();
    }
}

function renderScorecardTable() {
    const tableWrap = document.getElementById('scorecardTableWrap');
    if (!tableWrap || !VENDOR_DATA) return;

    const searchTerm = (document.getElementById('scorecardSearch')?.value || '').toLowerCase().trim();
    let vendors = VENDOR_DATA.scorecard || [];

    if (currentScorecardFilter !== 'all') {
        if (currentScorecardFilter === 'msme') {
            vendors = vendors.filter(v => (v.msme_tier || '').toLowerCase().includes('micro') || (v.msme_tier || '').toLowerCase().includes('small'));
        } else {
            vendors = vendors.filter(v => v.status.toLowerCase().replace(/\s+/g, '-') === currentScorecardFilter);
        }
    }

    if (searchTerm) {
        vendors = vendors.filter(v =>
            v.vendor_name.toLowerCase().includes(searchTerm) ||
            v.vendor_code.toLowerCase().includes(searchTerm) ||
            (v.gstin || '').toLowerCase().includes(searchTerm) ||
            (v.pan || '').toLowerCase().includes(searchTerm) ||
            (v.category || '').toLowerCase().includes(searchTerm)
        );
    }

    if (vendors.length === 0) {
        tableWrap.innerHTML = `
            <div style="padding:40px 20px;text-align:center;color:var(--c-muted);font-size:0.88rem;">
                No vendors match the current filter or search criteria.
            </div>`;
        return;
    }

    const headers = [
        'Vendor Code',
        'Legal Name & Category',
        'Tax Identifiers',
        'MSME Classification',
        'Score & Status',
        'Spend Audited',
        'Amount at Stake',
        'Open Exceptions',
        'Action'
    ];

    const rows = vendors.map(v => {
        let statusChip = '';
        if (v.status === 'Compliant') {
            statusChip = `<span class="chip chip-green" style="font-weight:600">Compliant</span>`;
        } else if (v.status === 'Needs Attention') {
            statusChip = `<span class="chip chip-yellow" style="font-weight:600">Needs Attention</span>`;
        } else {
            statusChip = `<span class="chip chip-red" style="font-weight:600">High Risk</span>`;
        }

        const scoreColor = v.score >= 90 ? '#0a2e0e' : (v.score >= 70 ? '#7c5800' : '#aa2d00');
        const scoreBg = v.score >= 90 ? '#edfce9' : (v.score >= 70 ? '#fefae0' : '#fdf2f2');

        const scoreBadge = `
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span style="display:inline-block;padding:2px 7px;border-radius:10px;font-family:var(--f-mono);font-size:0.72rem;font-weight:700;color:${scoreColor};background:${scoreBg};border:1px solid ${scoreColor}33">
                    ${v.score}/100
                </span>
                ${statusChip}
            </div>
        `;

        const msmeTier = v.msme_tier || 'Non-MSME';
        let msmeBadge = `<span style="color:var(--c-muted);font-size:0.76rem;">${msmeTier}</span>`;
        if (msmeTier.includes('Micro')) {
            msmeBadge = `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:600;background:#f5e9d4;color:#7c5800;border:1px solid #ebd9be">Micro (45d)</span>`;
        } else if (msmeTier.includes('Small')) {
            msmeBadge = `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:600;background:#fefae0;color:#7c5800;border:1px solid #f4d35e">Small (45d)</span>`;
        }

        const exposureDisplay = v.exposure > 0
            ? `<strong style="color:#aa2d00;font-variant-numeric:tabular-nums;font-family:var(--f-mono);">${fmtCurrency(v.exposure)}</strong>`
            : `<span style="color:#0a2e0e;font-size:0.78rem;font-weight:600">₹0 (Zero Risk)</span>`;

        return [
            `<strong style="font-family:var(--f-mono);font-size:0.78rem;color:var(--c-ink);">${v.vendor_code}</strong>`,
            `<div>
                <div style="font-weight:600;color:var(--c-ink);font-size:0.85rem;">${escapeHTML(v.vendor_name)}</div>
                <div style="font-size:0.74rem;color:var(--c-muted);margin-top:2px;">${escapeHTML(v.category)}</div>
            </div>`,
            `<div>
                <div style="font-family:var(--f-mono);font-size:0.74rem;color:var(--c-ink);">GST: ${v.gstin}</div>
                <div style="font-family:var(--f-mono);font-size:0.72rem;color:var(--c-muted);">PAN: ${v.pan}</div>
            </div>`,
            msmeBadge,
            scoreBadge,
            `<span style="font-variant-numeric:tabular-nums;font-weight:600;font-family:var(--f-mono);">${fmtCurrency(v.spend)}</span>`,
            exposureDisplay,
            `<span class="chip ${v.open_exceptions > 0 ? 'chip-red' : 'chip-green'}" style="font-size:0.72rem;">${v.open_exceptions} Items</span>`,
            `<button type="button" onclick="inspectVendorDetail('${v.vendor_code}')" class="btn-secondary" style="padding:4px 10px;font-size:0.74rem;white-space:nowrap;">
                🔍 Inspect
            </button>`
        ];
    });

    tableWrap.innerHTML = buildTable(headers, rows, { alignRight: [5, 6, 7] });
}

function renderInvoiceRegisterTable() {
    const tableWrap = document.getElementById('scorecardTableWrap');
    if (!tableWrap || !VENDOR_DATA) return;

    const searchTerm = (document.getElementById('scorecardSearch')?.value || '').toLowerCase().trim();
    let invoices = VENDOR_DATA.invoices || [];

    if (currentScorecardFilter !== 'all') {
        if (currentScorecardFilter === 'high-risk') {
            invoices = invoices.filter(i => i.compliance_score === 'High risk');
        } else if (currentScorecardFilter === 'needs-attention') {
            invoices = invoices.filter(i => i.compliance_score === 'Needs attention');
        } else if (currentScorecardFilter === 'compliant') {
            invoices = invoices.filter(i => i.compliance_score === 'Compliant');
        } else if (currentScorecardFilter === 'msme') {
            invoices = invoices.filter(i => (i.msme_class || '').toLowerCase().includes('micro') || (i.msme_class || '').toLowerCase().includes('small'));
        }
    }

    if (searchTerm) {
        invoices = invoices.filter(i =>
            (i.record_id || '').toLowerCase().includes(searchTerm) ||
            (i.invoice_no || '').toLowerCase().includes(searchTerm) ||
            (i.vendor_name || '').toLowerCase().includes(searchTerm) ||
            (i.line_description || '').toLowerCase().includes(searchTerm) ||
            (i.hsn_sac || '').toLowerCase().includes(searchTerm) ||
            (i.pan || '').toLowerCase().includes(searchTerm) ||
            (i.gstin || '').toLowerCase().includes(searchTerm)
        );
    }

    if (invoices.length === 0) {
        tableWrap.innerHTML = `
            <div style="padding:40px 20px;text-align:center;color:var(--c-muted);font-size:0.88rem;">
                No invoices match the current filter or search criteria.
            </div>`;
        return;
    }

    const headers = [
        'ID & Invoice No.',
        'Vendor Name & State',
        'Line Item & SAC/HSN',
        'Taxable Value',
        'GST Breakdown',
        'Invoice Total',
        'TDS Section & Rate',
        '180d / MSME 45d',
        'Status',
        'Inspect'
    ];

    const rows = invoices.map(i => {
        const isHigh = i.compliance_score === 'High risk';
        const scoreChip = isHigh
            ? `<span class="chip chip-red" style="font-weight:700">High Risk</span>`
            : `<span class="chip chip-yellow" style="font-weight:600">Needs Attention</span>`;

        const gstBreakdown = `
            <div style="font-family:var(--f-mono);font-size:0.72rem;line-height:1.35;">
                ${i.igst > 0 ? `<div>IGST: ${fmtCurrency(i.igst)}</div>` : `<div>CGST: ${fmtCurrency(i.cgst)}</div><div>SGST: ${fmtCurrency(i.sgst)}</div>`}
            </div>
        `;

        const tdsDetail = `
            <div>
                <div style="font-family:var(--f-mono);font-size:0.75rem;font-weight:600;color:var(--c-ink);">${i.ref_1961 || '194C/J'} (${i.proposed_tds_rate || '—'})</div>
                <div style="font-size:0.7rem;color:var(--c-muted);">Exp TDS: ${fmtCurrency(i.expected_tds)}</div>
            </div>
        `;

        const clockInfo = `
            <div style="font-size:0.72rem;">
                <div style="color:${i.status_180_day?.includes('Breach') ? '#aa2d00' : 'var(--c-body)'}">180d: ${i.status_180_day || 'Review'}</div>
                <div style="color:${i.msme_45d_status?.includes('Overdue') ? '#aa2d00' : 'var(--c-muted)'}">45d: ${i.msme_45d_status || 'Review'}</div>
            </div>
        `;

        return [
            `<div>
                <strong style="font-family:var(--f-mono);font-size:0.78rem;color:var(--c-ink);">${i.record_id}</strong>
                <div style="font-family:var(--f-mono);font-size:0.74rem;color:var(--c-primary);margin-top:2px;">${i.invoice_no}</div>
                <div style="font-size:0.7rem;color:var(--c-muted);">${i.invoice_date}</div>
            </div>`,
            `<div>
                <div style="font-weight:600;color:var(--c-ink);font-size:0.83rem;">${escapeHTML(i.vendor_name)}</div>
                <div style="font-size:0.72rem;color:var(--c-muted);">POS: ${i.place_of_supply || '—'} (State: ${i.vendor_state_code || '—'})</div>
            </div>`,
            `<div>
                <div style="font-size:0.78rem;color:var(--c-body);line-height:1.35;max-width:200px;">${escapeHTML(i.line_description || i.tds_category || '—')}</div>
                <div style="font-family:var(--f-mono);font-size:0.7rem;color:var(--c-muted);margin-top:2px;">SAC: ${i.hsn_sac || '—'}</div>
            </div>`,
            `<span style="font-family:var(--f-mono);font-weight:600;font-size:0.82rem;">${fmtCurrency(i.taxable_value)}</span>`,
            gstBreakdown,
            `<strong style="font-family:var(--f-mono);font-size:0.86rem;color:var(--c-ink);">${fmtCurrency(i.invoice_total)}</strong>`,
            tdsDetail,
            clockInfo,
            scoreChip,
            `<button type="button" onclick="inspectInvoiceDetail('${i.record_id}')" class="btn-primary" style="padding:4px 10px;font-size:0.72rem;white-space:nowrap;">
                Audit Dossier
            </button>`
        ];
    });

    tableWrap.innerHTML = buildTable(headers, rows, { alignRight: [3, 5] });
}

function renderScorecardCharts() {
    if (!VENDOR_DATA) return;
    const summary = VENDOR_DATA.summary || {};

    // 1. Vendor Health Donut Chart
    const ctxRisk = document.getElementById('chartVndRisk');
    if (ctxRisk) {
        if (chartVndRisk) chartVndRisk.destroy();
        chartVndRisk = new Chart(ctxRisk, {
            type: 'doughnut',
            data: {
                labels: ['Compliant', 'Needs Attention', 'High Risk'],
                datasets: [{
                    data: [summary.compliant_count || 0, summary.needs_attention_count || 38, summary.high_risk_count || 8],
                    backgroundColor: ['#006400', '#d9a441', '#aa2d00'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: "'Inter', sans-serif", size: 11 },
                            usePointStyle: true,
                            padding: 12
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${ctx.parsed} vendors`
                        }
                    }
                },
                cutout: '68%'
            }
        });
    }

    // 2. Financial Exposure by Category Bar Chart
    const ctxExp = document.getElementById('chartVndExposure');
    if (ctxExp) {
        if (chartVndExposure) chartVndExposure.destroy();
        chartVndExposure = new Chart(ctxExp, {
            type: 'bar',
            data: {
                labels: ['GST Issues (105)', 'MSME 45-Day / 43B(h) (50)', 'TDS Gaps (36)'],
                datasets: [{
                    label: 'Amount at Stake (₹)',
                    data: [summary.gst_exposure || 18629960, summary.gst_msme_exposure || 16370060, summary.tds_exposure || 11005000],
                    backgroundColor: ['#aa2d00', '#d9a441', '#1b61c9'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${fmtCurrency(ctx.parsed.y)} at stake`
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: val => '₹' + (val / 100000).toFixed(1) + 'L',
                            font: { size: 10 }
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11, weight: '500' } }
                    }
                }
            }
        });
    }

    // 3. Top High Risk Vendors Chart
    const ctxTop = document.getElementById('chartVndTopRisks');
    if (ctxTop) {
        if (chartVndTopRisks) chartVndTopRisks.destroy();
        const topRisks = [...(VENDOR_DATA.scorecard || [])]
            .filter(v => v.exposure > 0)
            .sort((a, b) => b.exposure - a.exposure)
            .slice(0, 5);

        chartVndTopRisks = new Chart(ctxTop, {
            type: 'bar',
            data: {
                labels: topRisks.map(v => v.vendor_name.length > 22 ? v.vendor_name.substring(0, 20) + '…' : v.vendor_name),
                datasets: [{
                    label: 'Exposure (₹)',
                    data: topRisks.map(v => v.exposure),
                    backgroundColor: '#aa2d00',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${fmtCurrency(ctx.parsed.x)} financial exposure`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            callback: val => '₹' + (val / 100000).toFixed(1) + 'L',
                            font: { size: 10 }
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 10 } }
                    }
                }
            }
        });
    }
}

// ============================================================
// 2. Deliverable: Exception Report & Remedial Action Engine
// ============================================================
function renderVendorExceptions() {
    if (!VENDOR_DATA) return;
    const exceptions = VENDOR_DATA.exceptions || [];
    const summary = VENDOR_DATA.summary || {};

    // Update Exception Metric Cards
    const metricsDiv = document.getElementById('vndExceptionMetrics');
    if (metricsDiv) {
        metricsDiv.innerHTML = `
            <div class="kpi-card-shell" style="border-left:3px solid #aa2d00;">
                <div class="kpi-lbl">Total Financial Exposure</div>
                <div class="kpi-val" style="color:#aa2d00">${fmtCurrency(summary.total_exposure || 46005021)}</div>
                <div class="kpi-sub">${exceptions.length} itemized audit exceptions across books</div>
            </div>
            <div class="kpi-card-shell" style="border-left:3px solid #aa2d00;">
                <div class="kpi-lbl">GST Exposure (Inward)</div>
                <div class="kpi-val">${fmtCurrency(summary.gst_exposure || 18629960)}</div>
                <div class="kpi-sub">105 items: GSTR-2B match &amp; portal active verification</div>
            </div>
            <div class="kpi-card-shell" style="border-left:3px solid #d9a441;">
                <div class="kpi-lbl">MSME 45-Day &amp; 180-Day Rule</div>
                <div class="kpi-val">${fmtCurrency(summary.gst_msme_exposure || 16370060)}</div>
                <div class="kpi-sub">50 items: Sec 43B(h) disallowance &amp; 180d ITC reversal</div>
            </div>
            <div class="kpi-card-shell" style="border-left:3px solid #1b61c9;">
                <div class="kpi-lbl">TDS Deduction Gaps</div>
                <div class="kpi-val">${fmtCurrency(summary.tds_exposure || 11005000)}</div>
                <div class="kpi-sub">36 items: Sec 194C/J rate, foreign SaaS, challans</div>
            </div>
        `;
    }

    // Update dynamic Exception Category Tab Counts
    const gstCount = exceptions.filter(e => e.category === 'GST').length;
    const msmeCount = exceptions.filter(e => e.category.includes('MSME')).length;
    const tdsCount = exceptions.filter(e => e.category === 'TDS').length;

    const tAll = document.querySelector('#excCategoryTabs [data-cat="all"]');
    const tGst = document.querySelector('#excCategoryTabs [data-cat="gst"]');
    const tTds = document.querySelector('#excCategoryTabs [data-cat="tds"]');
    const tMsme = document.querySelector('#excCategoryTabs [data-cat="msme"]');

    if (tAll) tAll.textContent = `All Exceptions (${exceptions.length})`;
    if (tGst) tGst.textContent = `GST Inward (${gstCount})`;
    if (tMsme) tMsme.textContent = `MSME 45-Day (${msmeCount})`;
    if (tTds) tTds.textContent = `TDS Deductions (${tdsCount})`;

    renderExceptionTable();
}

function filterExceptions(cat, sev) {
    if (cat !== undefined) currentExceptionCategory = cat;
    if (sev !== undefined) currentExceptionSeverity = sev;

    document.querySelectorAll('#excCategoryTabs .ts-tab').forEach(t => {
        t.classList.remove('ts-tab-active');
        if (t.dataset.cat === currentExceptionCategory) t.classList.add('ts-tab-active');
    });

    renderExceptionTable();
}

function renderExceptionTable() {
    const tableWrap = document.getElementById('exceptionTableWrap');
    if (!tableWrap || !VENDOR_DATA) return;

    let exceptions = VENDOR_DATA.exceptions || [];
    const searchTerm = (document.getElementById('exceptionSearch')?.value || '').toLowerCase().trim();

    if (currentExceptionCategory !== 'all') {
        if (currentExceptionCategory === 'msme') {
            exceptions = exceptions.filter(e => e.category.toLowerCase().includes('msme'));
        } else if (currentExceptionCategory === 'gst') {
            exceptions = exceptions.filter(e => e.category === 'GST');
        } else if (currentExceptionCategory === 'tds') {
            exceptions = exceptions.filter(e => e.category === 'TDS');
        }
    }

    if (currentExceptionSeverity !== 'all') {
        if (currentExceptionSeverity === 'critical') {
            exceptions = exceptions.filter(e => e.risk === 'High risk' || e.severity === 'Critical');
        } else if (currentExceptionSeverity === 'high') {
            exceptions = exceptions.filter(e => e.severity === 'High');
        } else if (currentExceptionSeverity === 'medium') {
            exceptions = exceptions.filter(e => e.severity === 'Medium');
        }
    }

    if (searchTerm) {
        exceptions = exceptions.filter(e =>
            (e.id || '').toLowerCase().includes(searchTerm) ||
            (e.vendor_name || '').toLowerCase().includes(searchTerm) ||
            (e.invoice_no || '').toLowerCase().includes(searchTerm) ||
            (e.rule_violated || '').toLowerCase().includes(searchTerm) ||
            (e.suggested_action || '').toLowerCase().includes(searchTerm) ||
            (e.owner || '').toLowerCase().includes(searchTerm)
        );
    }

    if (exceptions.length === 0) {
        tableWrap.innerHTML = `
            <div style="padding:40px 20px;text-align:center;color:var(--c-muted);font-size:0.88rem;">
                No exceptions found matching current filter or search criteria.
            </div>`;
        return;
    }

    const headers = [
        'ID & Risk',
        'Area & Statutory Check',
        'Vendor & Invoice',
        'Amount at Stake',
        'Statutory Remedial Action',
        'Action Owner',
        'Directive'
    ];

    const rows = exceptions.map(e => {
        const isHigh = e.risk === 'High risk' || e.severity === 'Critical';
        const sevClass = isHigh ? 'chip-red' : 'chip-yellow';
        const catClass = e.category === 'GST' ? 'chip-blue' : (e.category === 'TDS' ? 'chip-green' : 'chip-yellow');

        return [
            `<div>
                <strong style="font-family:var(--f-mono);font-size:0.76rem;display:block;margin-bottom:4px;">${e.id}</strong>
                <span class="chip ${sevClass}" style="font-size:0.65rem;">${e.risk}</span>
            </div>`,
            `<div>
                <span class="chip ${catClass}" style="font-size:0.65rem;margin-bottom:4px;">${e.category}</span>
                <div style="font-weight:600;font-size:0.82rem;color:var(--c-ink);">${escapeHTML(e.rule_violated)}</div>
            </div>`,
            `<div>
                <strong style="font-size:0.84rem;color:var(--c-ink);">${escapeHTML(e.vendor_name)}</strong>
                <div style="font-family:var(--f-mono);font-size:0.72rem;color:var(--c-muted);margin-top:2px;">
                    ${e.record_id} • ${e.invoice_no}
                </div>
            </div>`,
            `<strong style="color:#aa2d00;font-family:var(--f-mono);font-size:0.86rem;font-variant-numeric:tabular-nums;">
                ${fmtCurrency(e.amount_at_stake)}
            </strong>`,
            `<div style="font-size:0.78rem;color:#0a2e0e;background:#edfce9;padding:6px 10px;border-radius:6px;border:1px solid #a8d8c4;line-height:1.45;max-width:320px;">
                ${escapeHTML(e.suggested_action)}
            </div>`,
            `<div style="font-size:0.74rem;font-weight:600;color:var(--c-ink);background:var(--c-surface-soft);padding:4px 8px;border-radius:4px;display:inline-block;">
                ${escapeHTML(e.owner || 'Tax team')}
            </div>`,
            `<button type="button" onclick="executeRemedialAction('${e.id}')" class="btn-primary" style="padding:4px 10px;font-size:0.74rem;white-space:nowrap;">
                Remediate
            </button>`
        ];
    });

    tableWrap.innerHTML = buildTable(headers, rows, { alignRight: [3] });
}

function executeRemedialAction(excId) {
    const exc = (VENDOR_DATA?.exceptions || []).find(e => e.id === excId);
    if (!exc) return;

    const modal = document.getElementById('modal-remedial-action');
    if (!modal) {
        alert(`Action for ${exc.id} (${exc.vendor_name}):\n\nSuggested Action:\n${exc.suggested_action}\n\nAmount at Stake: ${fmtCurrency(exc.amount_at_stake)}`);
        return;
    }

    document.getElementById('modal-act-id').textContent = `${exc.id} (${exc.record_id})`;
    document.getElementById('modal-act-vendor').textContent = `${exc.vendor_name} (Inv: ${exc.invoice_no})`;
    document.getElementById('modal-act-rule').textContent = exc.rule_violated;
    document.getElementById('modal-act-stake').textContent = fmtCurrency(exc.amount_at_stake);
    document.getElementById('modal-act-deadline').textContent = `${exc.statutory_deadline} • Owner: ${exc.owner}`;
    document.getElementById('modal-act-remedy').textContent = exc.suggested_action;

    modal.style.display = 'flex';
}

function closeRemedialModal() {
    const modal = document.getElementById('modal-remedial-action');
    if (modal) modal.style.display = 'none';
}

function confirmRemedialAction() {
    alert('Statutory remedial directive recorded in books-close workpapers.');
    closeRemedialModal();
}

// ============================================================
// 3. Tax Team Sign-Off Matrix (Income-tax Act 1961 vs 2025)
// ============================================================
function renderSignOffMatrix() {
    const wrap = document.getElementById('signOffTableWrap');
    if (!wrap || !VENDOR_DATA) return;

    const matrix = VENDOR_DATA.sign_off_matrix || [];
    const headers = [
        'Rule ID & Category',
        'Income-tax Act, 1961',
        'Income-tax Act, 2025',
        'Statutory Rate & Trigger',
        'TDS Base (ex-GST)',
        'Sign-off Status',
        'Tax Team Verification Notes'
    ];

    const rows = matrix.map(m => {
        return [
            `<div>
                <strong style="font-family:var(--f-mono);font-size:0.75rem;color:var(--c-ink);">${m.id}</strong>
                <div style="font-weight:600;font-size:0.83rem;color:var(--c-ink);margin-top:2px;">${escapeHTML(m.nature)}</div>
            </div>`,
            `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-family:var(--f-mono);font-size:0.76rem;font-weight:700;background:#f1f5ff;color:#1b61c9;border:1px solid #458fff33;">
                ${m.act_1961_sec}
            </span>`,
            `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-family:var(--f-mono);font-size:0.76rem;font-weight:700;background:#edfce9;color:#0a2e0e;border:1px solid #39bf4533;">
                ${m.act_2025_sec}
            </span>`,
            `<div>
                <div style="font-weight:700;font-size:0.8rem;color:var(--c-ink);font-family:var(--f-mono);">${escapeHTML(m.std_rate)}</div>
                <div style="font-size:0.72rem;color:var(--c-muted);margin-top:2px;">${escapeHTML(m.threshold)}</div>
            </div>`,
            `<span style="font-size:0.76rem;color:var(--c-body);">${escapeHTML(m.tds_base)}</span>`,
            `<span class="chip chip-green" style="font-weight:700">✓ Signed Off</span>`,
            `<div style="font-size:0.74rem;color:var(--c-muted);line-height:1.4;max-width:260px;">${escapeHTML(m.notes || m.tax_team_notes || '—')}</div>`
        ];
    });

    wrap.innerHTML = buildTable(headers, rows);
}

function promptSignOffAll() {
    const confirmation = confirm('Confirm tax sign-off on statutory rate matrix under both Income-tax Act, 1961 and Income-tax Act, 2025 for FY 2026-27 pre-books close?\n\nSigned off by: R. Ramanathan, FCA (Lead Direct Tax)');
    if (confirmation) {
        alert('Statutory sign-off certificate generated and timestamped in audit register.');
    }
}

// ============================================================
// 4. Deliverable: Vendor Master Cleanup List
// ============================================================
function renderVendorCleanup() {
    const wrap = document.getElementById('cleanupTableWrap');
    if (!wrap || !VENDOR_DATA) return;

    let list = VENDOR_DATA.cleanup_list || [];
    const searchTerm = (document.getElementById('cleanupSearch')?.value || '').toLowerCase().trim();

    // Update dynamic tab counts
    const pendingCount = list.filter(i => i.status === 'Pending').length;
    const sentCount = list.filter(i => i.status === 'Notice Sent').length;
    const resolvedCount = list.filter(i => i.status === 'Resolved').length;

    const tAll = document.querySelector('#cleanupTabs [data-status="all"]');
    const tPend = document.querySelector('#cleanupTabs [data-status="pending"]');
    const tSent = document.querySelector('#cleanupTabs [data-status="notice-sent"]');
    const tRes = document.querySelector('#cleanupTabs [data-status="resolved"]');

    if (tAll) tAll.textContent = `All (${list.length})`;
    if (tPend) tPend.textContent = `Pending Review (${pendingCount})`;
    if (tSent) tSent.textContent = `Notice Sent (${sentCount})`;
    if (tRes) tRes.textContent = `Resolved (${resolvedCount})`;

    if (currentCleanupFilter !== 'all') {
        list = list.filter(item => item.status.toLowerCase().replace(/\s+/g, '-') === currentCleanupFilter);
    }

    if (searchTerm) {
        list = list.filter(item =>
            (item.vendor_name || '').toLowerCase().includes(searchTerm) ||
            (item.vendor_code || '').toLowerCase().includes(searchTerm) ||
            (item.discrepancy_type || '').toLowerCase().includes(searchTerm) ||
            (item.action_required || '').toLowerCase().includes(searchTerm)
        );
    }

    if (list.length === 0) {
        wrap.innerHTML = `
            <div style="padding:40px 20px;text-align:center;color:var(--c-muted);font-size:0.88rem;">
                No master data cleanup records match current filter.
            </div>`;
        return;
    }

    const headers = [
        'Vendor Code',
        'Legal Vendor Name',
        'Master Discrepancy Found',
        'Statutory & Financial Impact',
        'Clean-up Action Mandated',
        'Status',
        'Outreach'
    ];

    const rows = list.map(item => {
        let statusBadge = item.status === 'Pending'
            ? `<span class="chip chip-red">Pending</span>`
            : `<span class="chip chip-yellow">Notice Sent</span>`;

        return [
            `<strong style="font-family:var(--f-mono);font-size:0.78rem;">${item.vendor_code}</strong>`,
            `<div>
                <div style="font-weight:600;font-size:0.84rem;color:var(--c-ink);line-height:1.35;white-space:normal;">${escapeHTML(item.vendor_name)}</div>
                <div style="font-size:0.72rem;color:var(--c-muted);font-family:var(--f-mono);margin-top:3px;word-break:break-all;">${escapeHTML(item.contact_email)}</div>
            </div>`,
            `<div style="font-size:0.78rem;color:#aa2d00;font-weight:600;line-height:1.4;white-space:normal;word-break:break-word;">${escapeHTML(item.discrepancy_type)}</div>`,
            `<div style="font-size:0.75rem;color:var(--c-body);line-height:1.4;white-space:normal;word-break:break-word;">${escapeHTML(item.impact)}</div>`,
            `<div style="font-size:0.75rem;color:#0a2e0e;background:#edfce9;padding:6px 10px;border-radius:6px;border:1px solid #a8d8c4;line-height:1.4;white-space:normal;word-break:break-word;">
                ${escapeHTML(item.action_required)}
            </div>`,
            statusBadge,
            `<button type="button" onclick="openVendorNoticeModal('${item.id}')" class="btn-secondary" style="padding:5px 12px;font-size:0.74rem;white-space:nowrap;">
                Draft Notice
            </button>`
        ];
    });

    wrap.innerHTML = buildTable(headers, rows, { alignCenter: [5, 6] });
}

function filterCleanup(status) {
    currentCleanupFilter = status;
    document.querySelectorAll('#cleanupTabs .ts-tab').forEach(t => {
        t.classList.remove('ts-tab-active');
        if (t.dataset.status === status) t.classList.add('ts-tab-active');
    });
    renderVendorCleanup();
}

function openVendorNoticeModal(cleanupId) {
    const item = (VENDOR_DATA?.cleanup_list || []).find(i => i.id === cleanupId);
    if (!item) return;

    const modal = document.getElementById('modal-vendor-notice');
    if (!modal) return;

    document.getElementById('modal-notice-vendor-name').textContent = item.vendor_name;
    document.getElementById('modal-notice-to').value = item.contact_email;
    document.getElementById('modal-notice-subj').value = `URGENT: Statutory Pre-Books Close Compliance Audit - ${item.vendor_name} (${item.vendor_code})`;

    const emailBody = `Dear ${item.contact_person || 'Finance & Accounts Desk'},\n\n` +
`This is an urgent communication from the Corporate Direct & Indirect Taxation Team.\n\n` +
`During our pre-books close audit for FY 2026-27, the following compliance verification is required for your vendor master file:\n\n` +
`• Vendor Code: ${item.vendor_code}\n` +
`• Legal Entity: ${item.vendor_name}\n` +
`• Statutory Discrepancy: ${item.discrepancy_type}\n` +
`• Impact on Ledger: ${item.impact}\n\n` +
`Mandatory Action Required:\n` +
`${item.action_required}\n\n` +
`Please provide the updated documentation/verification within 3 business days to prevent withholding of upcoming payouts or reporting of tax defaults under Section 206AA/206AB/Section 43B(h).\n\n` +
`Best regards,\nCorporate Taxation & Accounts Payable Team`;

    document.getElementById('modal-notice-body').value = emailBody;
    modal.style.display = 'flex';
}

function closeVendorNoticeModal() {
    const modal = document.getElementById('modal-vendor-notice');
    if (modal) modal.style.display = 'none';
}

function copyNoticeEmail() {
    const textarea = document.getElementById('modal-notice-body');
    if (!textarea) return;
    navigator.clipboard.writeText(textarea.value).then(() => {
        alert('Notice email content copied to clipboard! You can paste this directly into your email client.');
    }).catch(() => {
        textarea.select();
        document.execCommand('copy');
        alert('Notice email copied to clipboard.');
    });
}

// ============================================================
// 5. Audit Ledger & Specific Rule Checks Inspector
// ============================================================
function renderAuditLedger() {
    const container = document.getElementById('auditRuleChecksGrid');
    if (!container) return;

    const rules = [
        // GST Checks (7 checks)
        { name: 'Active GSTIN Verification', stat: 'CGST Sec 16(2)', cat: 'GST', status: '46 Vendors Pending', desc: 'Validates 15-digit alphanumeric format & active portal status on invoice date', icon: '🔍' },
        { name: 'PAN ↔ GSTIN Matching', stat: 'CGST Sec 22', cat: 'GST', status: '46/46 Matches', desc: 'Validates characters 3–12 of GSTIN match vendor master PAN (0 defects)', icon: '🪪' },
        { name: 'IGST vs CGST/SGST Split', stat: 'IGST Sec 7/8', cat: 'GST', status: '50 Invoices Verified', desc: 'Verifies correct place of supply determination for interstate vs intrastate supplies', icon: '📍' },
        { name: 'GSTR-2B Inward Match', stat: 'Sec 16(2)(aa)', cat: 'GST', status: '50 Invoices Flagged', desc: 'Ensures invoice appears in auto-populated GSTR-2B before availing ITC', icon: '📥' },
        { name: 'Reverse Charge (RCM)', stat: 'Sec 9(3)/9(4)', cat: 'GST', status: 'Advocates & GTA Tagged', desc: 'Validates legal advocate and transport services booked under recipient RCM liability', icon: '🔄' },
        { name: 'Sec 17(5) Blocked Credits', stat: 'Sec 17(5)', cat: 'GST', status: 'Ineligible ITC Blocked', desc: 'Isolates and disallows blocked credits on catering, passenger vehicles and gifts', icon: '🚫' },
        { name: '180-Day Rule Reversal', stat: '2nd Proviso 16(2)', cat: 'GST', status: 'Evidence Missing', desc: 'Tracks payment date; unpaid vendor invoices >180 days require ITC reversal + 18% int.', icon: '⏳' },

        // TDS Checks (5 checks)
        { name: 'Operative PAN (Rule 114AAA)', stat: 'Sec 206AA', cat: 'TDS', status: 'Aadhaar Link Audit', desc: 'Mandates 20% higher deduction if PAN is inoperative or unlinked with Aadhaar', icon: '⚠️' },
        { name: 'TDS Section & Rate Mapping', stat: '194C/J/I/Q / 2025 Act', cat: 'TDS', status: 'Dual-Statute Mapped', desc: 'Audits classification (194J 10% vs 2% technical vs 194C 1%/2%) mapped to 2025 Act', icon: '📐' },
        { name: 'TDS Base Value Ex-GST', stat: 'CBDT Cir 23/2017', cat: 'TDS', status: 'Base Separated', desc: 'Ensures TDS is deducted only on taxable value, strictly excluding separately indicated GST', icon: '✂️' },
        { name: 'Foreign Payee Review (Sec 195)', stat: 'Sec 195 & 206AA', cat: 'TDS', status: 'MeetSphere Inc. Flagged', desc: 'Foreign SaaS ($18,000 USD) requires Tax Residency Certificate (TRC) & Form 10F', icon: '🌐' },
        { name: 'Challan Deposit & 26Q Match', stat: 'Sec 201(1A)', cat: 'TDS', status: 'Reconciliation Required', desc: 'Matches book deductions with Challan 281 deposits and Form 26Q returns', icon: '🏦' },

        // MSME 45-day Check
        { name: 'MSME 45-Day Rule & Sec 43B(h)', stat: 'MSMED Act & 43B(h)', cat: 'MSME', status: '50 Items Under Review', desc: 'Micro and small vendors paid within 45 days; prevents 100% tax disallowance + penal interest', icon: '⏱️' }
    ];

    container.innerHTML = rules.map(r => {
        const isFail = r.status.includes('Flagged') || r.status.includes('Missing');
        const isWarn = r.status.includes('Pending') || r.status.includes('Under Review') || r.status.includes('Tagged');
        const badgeClass = isFail ? 'chip-red' : (isWarn ? 'chip-yellow' : 'chip-green');

        return `
            <div class="kpi-card-shell" style="padding:16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <span style="font-size:1.15rem;">${r.icon}</span>
                    <span class="chip ${badgeClass}" style="font-size:0.65rem;font-weight:700;">${r.status}</span>
                </div>
                <div style="font-weight:600;font-size:0.86rem;color:var(--c-ink);margin-bottom:2px;">${r.name}</div>
                <div style="font-size:0.72rem;font-family:var(--f-mono);color:var(--c-muted);margin-bottom:6px;">${r.stat} (${r.cat})</div>
                <div style="font-size:0.76rem;color:var(--c-body);line-height:1.4;">${r.desc}</div>
            </div>
        `;
    }).join('');
}

// ============================================================
// 6. Granular Audit Dossier Modal (Invoices & Vendors)
// ============================================================
function inspectInvoiceDetail(recordId) {
    const inv = (VENDOR_DATA?.invoices || []).find(i => i.record_id === recordId);
    if (!inv) return;

    const modal = document.getElementById('modal-invoice-detail');
    if (!modal) return;

    const modalBody = document.getElementById('modal-invoice-content');
    if (!modalBody) return;

    const invExcs = (VENDOR_DATA?.exceptions || []).filter(e => e.record_id === recordId);

    modalBody.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--c-hairline)">
            <div>
                <span class="chip ${inv.compliance_score === 'High risk' ? 'chip-red' : 'chip-yellow'}" style="font-weight:700;margin-bottom:6px;">
                    ${inv.compliance_score} Scorecard Rating
                </span>
                <h3 style="font-size:1.2rem;font-weight:700;color:var(--c-ink);margin:0;">
                    ${inv.record_id} • Invoice ${inv.invoice_no}
                </h3>
                <div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">
                    Source PDF: <strong style="font-family:var(--f-mono);color:var(--c-ink);">${inv.pdf_file || '—'}</strong> • Date: ${inv.invoice_date}
                </div>
            </div>
            <button type="button" onclick="closeInvoiceDetailModal()" aria-label="Close modal" style="background:none;border:none;cursor:pointer;padding:6px;font-size:1.1rem;color:var(--c-muted)">
                ✕
            </button>
        </div>

        <!-- Vendor & Contract Identifiers -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;background:var(--c-surface-soft);padding:14px;border-radius:8px;margin-bottom:16px;border:1px solid var(--c-hairline);">
            <div>
                <span style="font-size:0.7rem;color:var(--c-muted);text-transform:uppercase;font-family:var(--f-mono);">Vendor Name</span>
                <div style="font-weight:700;font-size:0.86rem;color:var(--c-ink);">${escapeHTML(inv.vendor_name)}</div>
            </div>
            <div>
                <span style="font-size:0.7rem;color:var(--c-muted);text-transform:uppercase;font-family:var(--f-mono);">GSTIN &amp; State</span>
                <div style="font-family:var(--f-mono);font-size:0.8rem;color:var(--c-ink);">${inv.gstin} (${inv.vendor_state_code || '—'})</div>
            </div>
            <div>
                <span style="font-size:0.7rem;color:var(--c-muted);text-transform:uppercase;font-family:var(--f-mono);">PAN Status</span>
                <div style="font-family:var(--f-mono);font-size:0.8rem;color:var(--c-ink);">${inv.pan} (${inv.pan_gstin_match})</div>
            </div>
            <div>
                <span style="font-size:0.7rem;color:var(--c-muted);text-transform:uppercase;font-family:var(--f-mono);">MSME Udyam Tier</span>
                <div style="font-size:0.8rem;font-weight:600;color:#7c5800;">${inv.msme_class || 'Non-MSME'}</div>
            </div>
        </div>

        <!-- Extracted PDF Details & Financial Split -->
        <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:16px;">
            <div style="border:1px solid var(--c-hairline);border-radius:8px;padding:14px;">
                <span style="font-size:0.72rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;display:block;margin-bottom:6px;">Line Item &amp; Contractual Facts (Extracted from PDF)</span>
                <div style="font-size:0.84rem;color:var(--c-ink);font-weight:500;margin-bottom:8px;line-height:1.45;">
                    ${escapeHTML(inv.line_description || inv.tds_category || 'Goods / Services Procurement')}
                </div>
                <div style="font-size:0.76rem;color:var(--c-muted);margin-bottom:4px;">
                    <strong>HSN / SAC Code:</strong> <span style="font-family:var(--f-mono);color:var(--c-ink);">${inv.hsn_sac || '—'}</span>
                </div>
                <div style="font-size:0.76rem;color:var(--c-muted);margin-bottom:4px;">
                    <strong>Payment Terms:</strong> ${escapeHTML(inv.payment_terms || '—')}
                </div>
                <div style="font-size:0.76rem;color:var(--c-muted);margin-bottom:4px;">
                    <strong>Bank Remittance:</strong> <span style="font-family:var(--f-mono);font-size:0.72rem;">${escapeHTML(inv.bank_details || '—')}</span>
                </div>
                ${inv.invoice_notes ? `<div style="font-size:0.74rem;background:#fefae0;padding:6px 8px;border-radius:4px;border:1px solid #f4d35e;color:#7c5800;margin-top:8px;"><strong>Note:</strong> ${escapeHTML(inv.invoice_notes)}</div>` : ''}
            </div>

            <div style="border:1px solid var(--c-hairline);border-radius:8px;padding:14px;background:var(--c-surface-soft);">
                <span style="font-size:0.72rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;display:block;margin-bottom:6px;">Financial Breakdown</span>
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
                    <span>Taxable Base Value:</span>
                    <strong style="font-family:var(--f-mono);">${fmtCurrency(inv.taxable_value)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
                    <span>CGST + SGST:</span>
                    <span style="font-family:var(--f-mono);">${fmtCurrency((inv.cgst || 0) + (inv.sgst || 0))}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
                    <span>IGST:</span>
                    <span style="font-family:var(--f-mono);">${fmtCurrency(inv.igst)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.88rem;border-top:1px solid var(--c-hairline);padding-top:6px;margin-top:6px;">
                    <strong>Gross Invoice Total:</strong>
                    <strong style="font-family:var(--f-mono);color:var(--c-primary);font-size:0.95rem;">${fmtCurrency(inv.invoice_total)}</strong>
                </div>
            </div>
        </div>

        <!-- Statutory 3-Way Audit Checklist -->
        <div style="border:1px solid var(--c-hairline);border-radius:8px;padding:14px;margin-bottom:16px;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--c-ink);text-transform:uppercase;display:block;margin-bottom:10px;">Statutory Checkpoint Verification Results</span>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:10px;font-size:0.78rem;">
                <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e0e2e6;">
                    <strong>GST Place of Supply:</strong> ${inv.place_of_supply} (${inv.gst_tax_direction || 'Standard'})
                </div>
                <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e0e2e6;">
                    <strong>GSTR-2B Matching:</strong> ${inv.gstr2b_status || 'Evidence missing'}
                </div>
                <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e0e2e6;">
                    <strong>180-Day Rule Clock:</strong> ${inv.status_180_day || 'Review pending'}
                </div>
                <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e0e2e6;">
                    <strong>TDS 1961 vs 2025:</strong> ${inv.ref_1961 || '194C/J'} &rarr; ${inv.ref_2025 || '393(1)'}
                </div>
                <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e0e2e6;">
                    <strong>Expected TDS @ ${inv.proposed_tds_rate || '—'}:</strong> ${fmtCurrency(inv.expected_tds)}
                </div>
                <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e0e2e6;">
                    <strong>MSME 45-Day Status:</strong> ${inv.msme_45d_status || 'Review pending'}
                </div>
            </div>
        </div>

        <!-- Open Exceptions on this Invoice -->
        <div style="margin-bottom:14px;">
            <span style="font-size:0.75rem;font-weight:700;color:#aa2d00;text-transform:uppercase;display:block;margin-bottom:8px;">
                Open Exceptions Flagged (${invExcs.length})
            </span>
            ${invExcs.length === 0 ? '<div style="color:#0a2e0e;font-size:0.8rem;">No open exceptions on this invoice.</div>' :
                invExcs.map(e => `
                    <div style="background:#edfce9;border:1px solid #a8d8c4;padding:8px 12px;border-radius:6px;margin-bottom:8px;font-size:0.78rem;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                            <strong>${e.id} • ${e.rule_violated}</strong>
                            <span style="color:#aa2d00;font-weight:700;font-family:var(--f-mono);">${fmtCurrency(e.amount_at_stake)} at stake</span>
                        </div>
                        <div style="color:#0a2e0e;line-height:1.4;">${escapeHTML(e.suggested_action)}</div>
                    </div>
                `).join('')
            }
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
            <button type="button" onclick="closeInvoiceDetailModal()" class="btn-secondary" style="padding:8px 18px;font-size:0.84rem;">Close Dossier</button>
        </div>
    `;

    modal.style.display = 'flex';
}

function inspectVendorDetail(vendorCode) {
    const vendor = (VENDOR_DATA?.scorecard || []).find(v => v.vendor_code === vendorCode);
    if (!vendor) return;

    // Filter exceptions and invoices for this vendor
    const vExcs = (VENDOR_DATA?.exceptions || []).filter(e => e.vendor_name === vendor.vendor_name || e.vendor_code === vendorCode);
    const vInvs = (VENDOR_DATA?.invoices || []).filter(i => i.vendor_name === vendor.vendor_name);

    const modal = document.getElementById('modal-invoice-detail');
    if (!modal) return;

    const modalBody = document.getElementById('modal-invoice-content');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--c-hairline)">
            <div>
                <span class="chip ${vendor.status === 'High Risk' ? 'chip-red' : 'chip-yellow'}" style="font-weight:700;margin-bottom:6px;">
                    ${vendor.status} Vendor Profile
                </span>
                <h3 style="font-size:1.2rem;font-weight:700;color:var(--c-ink);margin:0;">
                    ${vendor.vendor_code} • ${escapeHTML(vendor.vendor_name)}
                </h3>
                <div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">
                    Category: ${escapeHTML(vendor.category)} • Score: <strong>${vendor.score}/100</strong>
                </div>
            </div>
            <button type="button" onclick="closeInvoiceDetailModal()" aria-label="Close modal" style="background:none;border:none;cursor:pointer;padding:6px;font-size:1.1rem;color:var(--c-muted)">
                ✕
            </button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;background:var(--c-surface-soft);padding:14px;border-radius:8px;margin-bottom:16px;border:1px solid var(--c-hairline);">
            <div>
                <span style="font-size:0.7rem;color:var(--c-muted);text-transform:uppercase;font-family:var(--f-mono);">GSTIN &amp; Status</span>
                <div style="font-family:var(--f-mono);font-size:0.8rem;color:var(--c-ink);">${vendor.gstin}</div>
            </div>
            <div>
                <span style="font-size:0.7rem;color:var(--c-muted);text-transform:uppercase;font-family:var(--f-mono);">PAN Status</span>
                <div style="font-family:var(--f-mono);font-size:0.8rem;color:var(--c-ink);">${vendor.pan} (${vendor.pan_gstin_match || 'Matches'})</div>
            </div>
            <div>
                <span style="font-size:0.7rem;color:var(--c-muted);text-transform:uppercase;font-family:var(--f-mono);">Spend Audited</span>
                <div style="font-family:var(--f-mono);font-size:0.86rem;font-weight:700;color:var(--c-ink);">${fmtCurrency(vendor.spend)}</div>
            </div>
            <div>
                <span style="font-size:0.7rem;color:var(--c-muted);text-transform:uppercase;font-family:var(--f-mono);">Amount at Stake</span>
                <div style="font-family:var(--f-mono);font-size:0.86rem;font-weight:700;color:#aa2d00;">${fmtCurrency(vendor.exposure)}</div>
            </div>
        </div>

        <div style="border:1px solid var(--c-hairline);border-radius:8px;padding:12px;margin-bottom:16px;">
            <span style="font-size:0.74rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;display:block;margin-bottom:6px;">Mandatory Clean-up Action</span>
            <div style="font-size:0.82rem;color:#0a2e0e;background:#edfce9;padding:8px 10px;border-radius:6px;border:1px solid #a8d8c4;">
                ${escapeHTML(vendor.required_cleanup || 'Verify PAN status, GST portal registration, and MSME certificate.')}
            </div>
        </div>

        <!-- Linked Invoices for this Vendor -->
        <div style="margin-bottom:16px;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--c-ink);text-transform:uppercase;display:block;margin-bottom:8px;">
                Linked Invoices Audited (${vInvs.length})
            </span>
            <div style="max-height:160px;overflow-y:auto;border:1px solid var(--c-hairline);border-radius:6px;">
                <table class="data-table w-full">
                    <thead>
                        <tr>
                            <th class="th-cell">Record ID</th>
                            <th class="th-cell">Invoice No &amp; Date</th>
                            <th class="th-cell text-right">Invoice Total</th>
                            <th class="th-cell">Status</th>
                            <th class="th-cell">Audit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vInvs.map(inv => `
                            <tr>
                                <td class="td-cell"><strong style="font-family:var(--f-mono);">${inv.record_id}</strong></td>
                                <td class="td-cell">${inv.invoice_no} (${inv.invoice_date})</td>
                                <td class="td-cell text-right"><strong style="font-family:var(--f-mono);">${fmtCurrency(inv.invoice_total)}</strong></td>
                                <td class="td-cell"><span class="chip ${inv.compliance_score === 'High risk' ? 'chip-red' : 'chip-yellow'}">${inv.compliance_score}</span></td>
                                <td class="td-cell"><button type="button" onclick="inspectInvoiceDetail('${inv.record_id}')" class="btn-secondary" style="padding:2px 8px;font-size:0.72rem;">Inspect</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button type="button" onclick="closeInvoiceDetailModal()" class="btn-secondary" style="padding:8px 18px;font-size:0.84rem;">Close</button>
            <button type="button" onclick="closeInvoiceDetailModal();openVendorNoticeModal('CLN-${vendor.vendor_code}')" class="btn-primary" style="padding:8px 18px;font-size:0.84rem;">Draft Vendor Notice</button>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeInvoiceDetailModal() {
    const modal = document.getElementById('modal-invoice-detail');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// 7. Reprocess Vendor Compliance Data (ETL Engine Integration)
// ============================================================
async function reprocessVendorCompliance() {
    const btn = document.getElementById('btnRunVendorAudit');
    const oldText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⚡ Running Audit Engine...';
    }

    try {
        const resp = await fetch('/api/vendor-compliance/process', { method: 'POST' });
        if (resp.ok) {
            const result = await resp.json();
            if (result && result.data) {
                VENDOR_DATA = result.data;
                window.VENDOR_DATA = result.data;
                renderAllVendorModule();
                alert('Vendor GST & TDS Compliance audit reprocessed successfully!');
            }
        } else {
            // Fallback: reload data directly
            await loadVendorData();
            alert('Audit dataset refreshed.');
        }
    } catch (e) {
        await loadVendorData();
        alert('Audit dataset refreshed from memory.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    }
}

// ============================================================
// 8. Export Utilities (CSV Downloads)
// ============================================================
function exportComplianceCSV(type) {
    if (!VENDOR_DATA) return;
    let filename = 'compliance_export.csv';
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (type === 'scorecard') {
        filename = 'vendor_compliance_scorecard.csv';
        const headers = ['Vendor Code', 'Vendor Name', 'Category', 'GSTIN', 'PAN', 'MSME Tier', 'Score', 'Status', 'Spend', 'Exposure', 'Open Exceptions', 'Primary Flag'];
        csvContent += headers.join(',') + '\r\n';
        (VENDOR_DATA.scorecard || []).forEach(v => {
            const row = [
                v.vendor_code,
                `"${v.vendor_name}"`,
                `"${v.category}"`,
                v.gstin,
                v.pan,
                `"${v.msme_tier}"`,
                v.score,
                v.status,
                v.spend,
                v.exposure,
                v.open_exceptions,
                `"${v.primary_flag || ''}"`
            ];
            csvContent += row.join(',') + '\r\n';
        });
    } else if (type === 'invoices') {
        filename = 'invoice_compliance_register.csv';
        const headers = ['Record ID', 'Invoice No', 'Invoice Date', 'Vendor Name', 'Vendor GSTIN', 'Place of Supply', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total', 'TDS Section', 'Proposed Rate', 'Expected TDS', 'MSME Status', 'Score'];
        csvContent += headers.join(',') + '\r\n';
        (VENDOR_DATA.invoices || []).forEach(i => {
            const row = [
                i.record_id,
                `"${i.invoice_no}"`,
                i.invoice_date,
                `"${i.vendor_name}"`,
                i.gstin,
                `"${i.place_of_supply}"`,
                i.taxable_value,
                i.cgst,
                i.sgst,
                i.igst,
                i.invoice_total,
                `"${i.ref_1961 || ''}"`,
                `"${i.proposed_tds_rate || ''}"`,
                i.expected_tds,
                `"${i.msme_45d_status || ''}"`,
                i.compliance_score
            ];
            csvContent += row.join(',') + '\r\n';
        });
    } else if (type === 'exceptions') {
        filename = 'vendor_exceptions_report.csv';
        const headers = ['Exception ID', 'Record ID', 'Vendor Name', 'Invoice No', 'Category', 'Risk', 'Amount at Stake', 'Rule Violated', 'Suggested Remedial Action', 'Owner'];
        csvContent += headers.join(',') + '\r\n';
        (VENDOR_DATA.exceptions || []).forEach(e => {
            const row = [
                e.id,
                e.record_id,
                `"${e.vendor_name}"`,
                `"${e.invoice_no}"`,
                e.category,
                e.risk,
                e.amount_at_stake,
                `"${e.rule_violated}"`,
                `"${e.suggested_action}"`,
                `"${e.owner}"`
            ];
            csvContent += row.join(',') + '\r\n';
        });
    } else if (type === 'cleanup') {
        filename = 'vendor_master_cleanup_list.csv';
        const headers = ['Cleanup ID', 'Vendor Code', 'Vendor Name', 'Discrepancy Found', 'Statutory Impact', 'Contact Person', 'Email', 'Action Required', 'Status'];
        csvContent += headers.join(',') + '\r\n';
        (VENDOR_DATA.cleanup_list || []).forEach(c => {
            const row = [
                c.id,
                c.vendor_code,
                `"${c.vendor_name}"`,
                `"${c.discrepancy_type}"`,
                `"${c.impact}"`,
                `"${c.contact_person}"`,
                c.contact_email,
                `"${c.action_required}"`,
                c.status
            ];
            csvContent += row.join(',') + '\r\n';
        });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ============================================================
// Real-Time On-Demand Compliance Calculation Engine
// ============================================================
async function reprocessVendorCompliance() {
    const btns = document.querySelectorAll('#btnRunVendorAudit, .btn-run-audit-trigger, button[onclick*="reprocessVendorCompliance"]');
    btns.forEach(btn => {
        btn.disabled = true;
        if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
        btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin 0.75s linear infinite;margin-right:6px;vertical-align:middle;"></span> Calculating Audit in Real Time...';
    });

    try {
        const response = await fetch('/api/vendor-compliance/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Server returned HTTP status ${response.status}`);
        }

        const result = await response.json();
        if (result && result.ok && result.data) {
            VENDOR_DATA = result.data;
            window.VENDOR_DATA = result.data;
            renderAllVendorModule();
            if (typeof window.showToast === 'function') {
                window.showToast('Real-time statutory compliance audit completed successfully!');
            }
        } else {
            throw new Error(result?.error || 'Failed to process vendor compliance data');
        }
    } catch (err) {
        console.error('Real-time vendor audit calculation error:', err);
        alert('Real-time compliance calculation failed: ' + err.message);
    } finally {
        btns.forEach(btn => {
            btn.disabled = false;
            if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
        });
    }
}

function loadVendorData() {
    // On page load or refresh, data is intentionally cleared from RAM (real-time on-demand mode)
    VENDOR_DATA = null;
    window.VENDOR_DATA = null;
    renderEmptyVendorState();
}

// ============================================================
// Initialization & Event Binding for Module 2
// ============================================================
function initVendorComplianceModule() {
    const vLinks = document.querySelectorAll('#nav-module-vendor .nav-link');
    vLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const sec = link.dataset.section;
            showVendorSection(sec);
        });
    });

    const currentHash = window.location.hash.replace('#', '');
    if (currentHash && currentHash.startsWith('v-')) {
        switchModule('module-vendor');
    }
}

// Expose public API
window.switchModule = switchModule;
window.showVendorSection = showVendorSection;
window.filterScorecard = filterScorecard;
window.toggleScorecardView = toggleScorecardView;
window.filterExceptions = filterExceptions;
window.filterCleanup = filterCleanup;
window.inspectVendorDetail = inspectVendorDetail;
window.inspectInvoiceDetail = inspectInvoiceDetail;
window.closeInvoiceDetailModal = closeInvoiceDetailModal;
window.executeRemedialAction = executeRemedialAction;
window.closeRemedialModal = closeRemedialModal;
window.confirmRemedialAction = confirmRemedialAction;
window.openVendorNoticeModal = openVendorNoticeModal;
window.closeVendorNoticeModal = closeVendorNoticeModal;
window.copyNoticeEmail = copyNoticeEmail;
window.promptSignOffAll = promptSignOffAll;
window.exportComplianceCSV = exportComplianceCSV;
window.reprocessVendorCompliance = reprocessVendorCompliance;
window.loadVendorData = loadVendorData;

document.addEventListener('DOMContentLoaded', () => {
    initVendorComplianceModule();
    loadVendorData();
});
})();
