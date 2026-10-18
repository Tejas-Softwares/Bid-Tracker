// Excel in and out: import the team's existing tracker workbook, export everything as a formatted workbook.
import { store } from './store.js';
import { derived, sortRevisions, companyOf, companyInfo, view } from './derive.js';
import { STATUS, REVISION_STATUSES } from './config.js';
import { readWorkbook, writeWorkbook } from './xlsx.js';
import { esc, today, fyOf, fyShort, parseMoney, normName, plural, download, pickFile, inrShort, fmtDate, addDays } from './util.js';
import { modal, toast, fld } from './ui.js';
import { api } from './server.js';
import { clientRows } from './views/clients.js';
import { logEvent } from './actions.js';

// ---------------- export ----------------
export function buildWorkbook(bidList) {
  const d = derived();
  const bids = (bidList || d.bids).slice().sort((a, b) => String(a.no || '').localeCompare(String(b.no || '')));
  const I = (b) => d.info.get(b.id);
  const st = (b) => STATUS[b.status]?.label || b.status;
  const asOf = `As on ${fmtDate(today())}. Exported from the Tejas Bid Tracker by ${store.me || 'the team'}.`;

  const bidCols = [
    ['No.', 12], ['Tejas company', 22], ['Bid or tender name', 42], ['Client', 26], ['Client contact', 20], ['Contact role', 16], ['Contact phone', 15], ['Contact email', 24], ['Site or location', 16], ['Sector', 18], ['Scope of work', 28], ['Tender type', 14], ['Consultant or PMC', 18], ["Client's enquiry ref.", 16], ['Bid owner', 12],
    ['Enquiry received', 13, 'date'], ['Pre-bid meeting', 13, 'date'], ['Site visit', 13, 'date'], ['Submission deadline', 13, 'date'], ['Submitted on', 13, 'date'], ['Offer valid till', 13, 'date'],
    ['Status', 15], ['First offer (R0)', 15, 'money'], ['Current offer', 15, 'money'], ['Change from R0', 10, 'pct'], ['Revisions', 9, 'int'], ['NT items', 14, 'money'], ['Order value', 15, 'money'], ['LOI or PO number', 16], ['LOI or PO date', 13, 'date'], ['Decision date', 13, 'date'],
    ['Loss reason', 22], ['Our position', 10], ['Order went to', 18], ['Their price', 15, 'money'], ['Chance of winning', 10, 'pct'], ['Checklist done', 10, 'pct'],
    ['EMD required', 9], ['EMD amount', 13, 'money'], ['EMD form', 16], ['EMD number', 16], ['EMD status', 14], ['Payment terms', 30], ['Remarks', 34], ['Documents link', 30],
  ];
  const bidRows = bids.map((b) => {
    const i = I(b);
    return [b.no, companyInfo(companyOf(b), d.settings).name, b.name, b.client, b.contactName, b.contactRole, b.contactPhone, b.contactEmail, b.location, b.sector, (b.scopes || []).join(', '), b.tenderType, b.consultant, b.enquiryRef, b.owner,
      b.receivedDate, b.preBidDate, b.siteVisitDate, b.dueDate, b.submittedDate, i.validTill,
      st(b), i.first, i.current, i.change, i.revs.length ? i.revs.length - 1 : null, i.ntTotal || null, b.orderValue, b.poNo, b.poDate, b.decisionDate,
      b.status === 'lost' ? b.lossReason : b.status === 'regret' ? b.regretReason : '', b.rank, b.winner, b.winnerPrice, STATUS[b.status]?.open ? i.prob / 100 : null, i.applicable ? i.readiness : null,
      b.emdRequired, b.emdAmount, b.emdForm, b.emdNo, b.emdStatus, b.payTerms, b.remarks, b.docLink];
  });
  const coTitle = view.company ? companyInfo(view.company, d.settings).name : 'Tejas Group';
  const sheetBids = {
    name: 'Bids', title: `${coTitle}, bid tracker`, subtitle: asOf,
    columns: bidCols.map(([header, width, type]) => ({ header, width, type })),
    rows: bidRows,
    totals: bidCols.map(([h], k) => (k === 0 ? 'Total' : h === 'Current offer' ? bids.reduce((s, b) => s + (I(b).current || 0), 0) : h === 'Order value' ? bids.reduce((s, b) => s + (b.orderValue || 0), 0) : '')),
  };

  const revRows = [];
  for (const b of bids) {
    const i = I(b);
    i.revs.forEach((r, k) => revRows.push([b.no, b.name, b.client, 'R' + k, r.date, r.value, k ? r.value - i.first : null, k && i.first ? (r.value - i.first) / i.first : null, r.reason, r.status, r.remark]));
  }
  const sheetRevs = { name: 'Offer revisions', title: 'Offer revisions', subtitle: 'Every offer value sent for each bid, R0 being the first offer.', columns: [['No.', 12], ['Bid or tender name', 40], ['Client', 24], ['Rev.', 6], ['Date', 13, 'date'], ['Offer value', 15, 'money'], ['Change vs R0', 14, 'change'], ['Change vs R0 %', 11, 'pct'], ['Reason', 24], ['Status', 15], ['Remark', 36]].map(([header, width, type]) => ({ header, width, type })), rows: revRows };

  const cr = clientRows(d).sort((a, b) => a.c.name.localeCompare(b.c.name));
  const clientSheetRows = [];
  for (const r of cr) {
    const cts = (r.c.contacts || []).length ? r.c.contacts : [{}];
    cts.forEach((ct, k) => clientSheetRows.push([r.c.name, r.c.sector, r.c.city, r.c.owner, ct.name, ct.role, ct.phone, ct.email, k ? null : r.bids.length, k ? null : r.s.open.length, k ? null : r.s.won.length, k ? null : r.s.lost.length, k ? null : r.s.winRate, k ? null : r.quoted, k ? null : r.s.wonValue]));
  }
  const sheetClients = { name: 'Clients', title: 'Clients', subtitle: 'Bid counts and values use each bid\'s current offer (or order value when won).', columns: [['Client', 30], ['Sector', 18], ['City', 14], ['Relationship owner', 14], ['Contact', 20], ['Role', 18], ['Phone', 15], ['Email', 26], ['Bids', 7, 'int'], ['Open', 7, 'int'], ['Won', 7, 'int'], ['Lost', 7, 'int'], ['Win rate', 9, 'pct'], ['Total quoted', 15, 'money'], ['Won value', 15, 'money']].map(([header, width, type]) => ({ header, width, type })), rows: clientSheetRows };

  const emd = bids.filter((b) => b.emdRequired === 'Yes');
  const sheetEmd = { name: 'EMD register', title: 'EMD register', subtitle: asOf, columns: [['No.', 12], ['Bid or tender name', 40], ['Client', 24], ['Bid status', 14], ['Amount', 14, 'money'], ['Form', 18], ['Number', 18], ['Bank', 16], ['Issued on', 13, 'date'], ['Valid till', 13, 'date'], ['EMD status', 16], ['Returned on', 13, 'date']].map(([header, width, type]) => ({ header, width, type })),
    rows: emd.map((b) => [b.no, b.name, b.client, st(b), b.emdAmount, b.emdForm, b.emdNo, b.emdBank, b.emdIssue, b.emdExpiry, b.emdStatus, b.emdReturnedOn]),
    totals: emd.length ? ['Still with clients', '', '', '', emd.filter((b) => b.emdStatus === 'Submitted').reduce((s, b) => s + (b.emdAmount || 0), 0), '', '', '', '', '', '', ''] : null };

  const ids = new Set(bids.map((b) => b.id));
  const notes = store.all('notes').filter((n) => ids.has(n.bidId)).sort((a, b) => (b.at || 0) - (a.at || 0));
  const byId = new Map(bids.map((b) => [b.id, b]));
  const sheetNotes = { name: 'Notes and history', title: 'Notes and history', columns: [['Date', 13, 'date'], ['No.', 12], ['Bid or tender name', 36], ['By', 12], ['Type', 9], ['Note', 80, 'wrap']].map(([header, width, type]) => ({ header, width, type })),
    rows: notes.map((n) => { const b = byId.get(n.bidId); const dt = new Date(n.at || n._ts); return [`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`, b.no, b.name, n.by || n._by, n.kind === 'event' ? 'Change' : 'Note', n.text]; }) };

  const nts = store.all('nt').filter((n) => ids.has(n.bidId)).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const revLabel = (n) => { const i = d.info.get(n.bidId); const k = i ? i.revs.findIndex((r) => r.id === n.revId) : -1; return k >= 0 ? 'R' + k : ''; };
  const sheetNt = nts.length ? { name: 'NT items', title: 'Non-tendered (NT) items', subtitle: 'Extra items the client asked for that were not in the tender. Rejected items are not counted in the offer.', columns: [['No.', 12], ['Bid or tender name', 36], ['Client', 22], ['Date', 13, 'date'], ['Description', 44, 'wrap'], ['Unit', 8], ['Qty', 8], ['Rate', 13, 'money'], ['Amount', 15, 'money'], ['Status', 16], ['Client reference', 18], ['In offer', 8], ['Added by', 14]].map(([header, width, type]) => ({ header, width, type })),
    rows: nts.map((n) => { const b = byId.get(n.bidId); return [b.no, b.name, b.client, n.date, n.desc, n.unit, n.qty, n.rate, n.amount, n.status, n.ref, revLabel(n), n.by || n._by]; }),
    totals: ['Total counted', '', '', '', '', '', '', '', nts.filter((n) => n.status !== 'Rejected by client').reduce((t, n) => t + (Number(n.amount) || 0), 0), '', '', '', ''] } : null;

  // Summary by status
  const sumRows = Object.values(STATUS).map((s) => { const l = bids.filter((b) => b.status === s.key); return [s.label, l.length, l.reduce((t, b) => t + (I(b).value || 0), 0)]; });
  const sheetSummary = { name: 'Summary', title: 'Bid summary by status', subtitle: asOf, columns: [['Status', 24], ['Bids', 10, 'int'], ['Value', 18, 'money']].map(([header, width, type]) => ({ header, width, type })), rows: sumRows, totals: ['Total', bids.length, sumRows.reduce((t, r) => t + r[2], 0)] };

  return writeWorkbook([sheetSummary, sheetBids, sheetRevs, sheetNt, sheetClients, sheetEmd, sheetNotes].filter(Boolean), { title: `${coTitle} bid tracker`, author: store.me });
}

export function exportExcel(bidList, label = '') {
  const bytes = buildWorkbook(bidList);
  const name = `Tejas Bid Tracker${label ? ' - ' + label : ''} - ${today()}.xlsx`;
  download(name, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  toast(`Downloaded ${name}`);
  const n = (bidList || derived().bids).length;
  api('activity', { method: 'POST', body: { action: 'log', event: 'data.export', summary: `Exported ${plural(n, 'bid')} to Excel${label ? ` (${label})` : ''}` } }).catch(() => {});
}

// ---------------- import ----------------
const H = (s) => String(s || '').toLowerCase().replace(/\(₹\)|₹|\(%\)/g, '').replace(/[^a-z0-9]+/g, '');
const BID_MAP = {
  sno: 'legacyNo', no: 'no', bidno: 'no', bidnumber: 'no', tejascompany: 'ourCompany', ourcompany: 'ourCompany', biddingcompany: 'ourCompany',
  clientcontact: 'contactName', contactperson: 'contactName', contactrole: 'contactRole', contactphone: 'contactPhone', contactemail: 'contactEmail',
  bidtendername: 'name', bidortendername: 'name', tendername: 'name', bidname: 'name', projectname: 'name',
  clientcompany: 'client', client: 'client', clientname: 'client', company: 'client',
  location: 'location', siteorlocation: 'location', site: 'location',
  sector: 'sector', scopeofwork: 'scopes', scope: 'scopes', tendertype: 'tenderType',
  consultantpmc: 'consultant', consultantorpmc: 'consultant', consultant: 'consultant', pmc: 'consultant',
  clientsenquiryref: 'enquiryRef', enquiryref: 'enquiryRef', rfqno: 'enquiryRef',
  bidowner: 'owner', owner: 'owner', assignedto: 'owner',
  offerreceiveddate: 'receivedDate', enquiryreceived: 'receivedDate', enquiryreceivedon: 'receivedDate', inquiryreceived: 'receivedDate', receiveddate: 'receivedDate',
  prebidmeeting: 'preBidDate', sitevisit: 'siteVisitDate', submissiondeadline: 'dueDate', deadline: 'dueDate', duedate: 'dueDate', submittedon: 'submittedDate',
  originalbidvalue: 'firstValue', firstofferr0: 'firstValue', firstoffer: 'firstValue', originalvalue: 'firstValue',
  finalbidvalue: 'finalValue', currentoffer: 'finalValue', finalvalue: 'finalValue',
  status: 'status', remark: 'remarks', remarks: 'remarks',
  emdapplicable: 'emdRequired', emdrequired: 'emdRequired', emdamount: 'emdAmount', emdddbgnumber: 'emdNo', emdnumber: 'emdNo', emdform: 'emdForm', emdstatus: 'emdStatus',
  paymentterms: 'payTerms', ordervalue: 'orderValue', loiorponumber: 'poNo', ponumber: 'poNo', loiorpodate: 'poDate', podate: 'poDate', decisiondate: 'decisionDate',
  lossreason: 'lossReason', ourposition: 'rank', orderwentto: 'winner', theirprice: 'winnerPrice', documentslink: 'docLink',
};
const REV_MAP = { bidid: 'legacyNo', no: 'no', bidortendername: 'name', bidtendername: 'name', rev: 'rev', revisionno: 'revNo', revisiondate: 'date', date: 'date', revisedoffervalue: 'value', offervalue: 'value', reasonforrevision: 'reason', reason: 'reason', revisionstatus: 'status', status: 'status', remark: 'remark' };
const CLIENT_MAP = { clientcompanyname: 'name', client: 'name', clientname: 'name', contactperson: 'contact', contact: 'contact', designation: 'role', role: 'role', phone: 'phone', email: 'email', city: 'city', relationshipowner: 'owner', sector: 'sector' };

function mapStatus(s) {
  const x = String(s || '').toLowerCase().trim();
  if (!x) return 'inquiry';
  if (/^(win|won)/.test(x)) return 'won';
  if (/^lost|^loss/.test(x)) return 'lost';
  if (/negotiat/.test(x)) return 'negotiation';
  if (/submit/.test(x)) return 'submitted';
  if (/work|estimat|prepar/.test(x)) return 'working';
  if (/regret|not bid|no bid|declin/.test(x)) return 'regret';
  if (/drop|cancel|hold/.test(x)) return 'dropped';
  return 'inquiry';
}
function asDate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const ms = Math.round(v * 86400000) + Date.UTC(1899, 11, 30); const dt = new Date(ms); return dt.toISOString().slice(0, 10); }
  const m = String(v).trim().match(/^(\d{1,2})[-/. ](\d{1,2}|[A-Za-z]{3,})[-/. ](\d{2,4})$/);
  if (m) {
    const mon = isNaN(m[2]) ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].slice(0, 3).toLowerCase()) + 1 : +m[2];
    let y = +m[3]; if (y < 100) y += 2000;
    if (mon >= 1 && mon <= 12) return `${y}-${String(mon).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  }
  return '';
}
function asMoney(v) { if (typeof v === 'number') return Math.round(v); const n = parseMoney(v); return n === null || isNaN(n) ? null : n; }
function matchOption(v, options) { const x = String(v || '').trim(); if (!x) return ''; return options.find((o) => o.toLowerCase() === x.toLowerCase()) || x; }

function findTable(sheet, map, mustHave) {
  for (let r = 0; r < Math.min(sheet.rows.length, 30); r++) {
    const row = sheet.rows[r] || [];
    const cols = {};
    row.forEach((h, c) => { const k = map[H(h)]; if (k && cols[k] === undefined) cols[k] = c; });
    if (mustHave.every((k) => cols[k] !== undefined)) return { headerRow: r, cols };
  }
  return null;
}

export function parseTrackerWorkbook(buf) {
  const wb = readWorkbook(buf);
  const out = { bids: [], revisions: [], clients: [], sheets: wb.sheets.map((s) => s.name) };
  for (const sh of wb.sheets) {
    const t = findTable(sh, BID_MAP, ['name', 'client']);
    if (t && !out.bids.length) {
      for (let r = t.headerRow + 1; r < sh.rows.length; r++) {
        const row = sh.rows[r] || [];
        const g = (k) => (t.cols[k] === undefined ? '' : row[t.cols[k]]);
        const name = String(g('name') ?? '').trim();
        if (!name || /^total/i.test(name) || /original\s*→/i.test(String(row.join(' ')))) continue;
        out.bids.push({
          legacyNo: g('legacyNo'), no: String(g('no') || '').trim(), name, client: String(g('client') || '').trim(), location: String(g('location') || '').trim(),
          sector: String(g('sector') || '').trim(), scopes: String(g('scopes') || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean), tenderType: String(g('tenderType') || '').trim(),
          consultant: String(g('consultant') || '').trim(), enquiryRef: String(g('enquiryRef') || '').trim(), owner: String(g('owner') || '').trim(),
          receivedDate: asDate(g('receivedDate')), preBidDate: asDate(g('preBidDate')), siteVisitDate: asDate(g('siteVisitDate')), dueDate: asDate(g('dueDate')), submittedDate: asDate(g('submittedDate')),
          firstValue: asMoney(g('firstValue')), finalValue: asMoney(g('finalValue')), statusRaw: g('status'), status: mapStatus(g('status')), remarks: String(g('remarks') || '').trim(),
          emdRequired: /^y/i.test(String(g('emdRequired') || '')) ? 'Yes' : /^n/i.test(String(g('emdRequired') || '')) ? 'No' : /exempt/i.test(String(g('emdRequired') || '')) ? 'Exempt' : '',
          emdAmount: asMoney(g('emdAmount')), emdNo: String(g('emdNo') || '').trim(), emdForm: String(g('emdForm') || '').trim(), emdStatus: String(g('emdStatus') || '').trim(), payTerms: String(g('payTerms') || '').trim(),
          orderValue: asMoney(g('orderValue')), poNo: String(g('poNo') || '').trim(), poDate: asDate(g('poDate')), decisionDate: asDate(g('decisionDate')),
          lossReason: String(g('lossReason') || '').trim(), rank: String(g('rank') || '').trim(), winner: String(g('winner') || '').trim(), winnerPrice: asMoney(g('winnerPrice')), docLink: String(g('docLink') || '').trim(),
          ourCompany: String(g('ourCompany') || '').trim(),
          contactName: String(g('contactName') || '').trim(), contactRole: String(g('contactRole') || '').trim(), contactPhone: String(g('contactPhone') || '').trim(), contactEmail: String(g('contactEmail') || '').trim(),
          example: /^example\b/i.test(name),
        });
      }
      continue;
    }
    const rv = findTable(sh, REV_MAP, ['value']);
    if (rv && (rv.cols.legacyNo !== undefined || rv.cols.no !== undefined) && /revis|offer/i.test(sh.name)) {
      const seen = new Set();
      for (let r = rv.headerRow + 1; r < sh.rows.length; r++) {
        const row = sh.rows[r] || [];
        const g = (k) => (rv.cols[k] === undefined ? '' : row[rv.cols[k]]);
        const value = asMoney(g('value'));
        const key = String(g('legacyNo') ?? '') + '|' + String(g('no') ?? '');
        if (!value || key === '|') continue;
        const sig = [key, asDate(g('date')), value, g('reason'), g('status'), g('remark')].join('|');
        const dup = seen.has(sig); seen.add(sig);
        out.revisions.push({ legacyNo: g('legacyNo'), no: String(g('no') || '').trim(), rev: String(g('rev') || '').trim(), date: asDate(g('date')), value, reason: String(g('reason') || '').trim(), status: String(g('status') || '').trim(), remark: String(g('remark') || '').trim(), dup });
      }
      continue;
    }
    const ct = findTable(sh, CLIENT_MAP, ['name']);
    if (ct && /crm|client/i.test(sh.name)) {
      for (let r = ct.headerRow + 1; r < sh.rows.length; r++) {
        const row = sh.rows[r] || [];
        const g = (k) => (ct.cols[k] === undefined ? '' : String(row[ct.cols[k]] ?? '').trim());
        if (!g('name')) continue;
        out.clients.push({ name: g('name'), contact: g('contact'), role: g('role'), phone: g('phone'), email: g('email'), city: g('city'), owner: g('owner'), sector: g('sector') });
      }
    }
  }
  return out;
}

export async function importExcelFlow() {
  const file = await pickFile('.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!file) return;
  let parsed;
  try { parsed = parseTrackerWorkbook(await file.arrayBuffer()); } catch (e) {
    console.error(e);
    modal({ title: 'Could not read that file', body: `<p>${esc(file.name)} could not be opened as an Excel workbook. Save it as .xlsx in Excel and try again.</p>`, actions: [{ label: 'OK', cls: 'btn-primary' }] });
    return;
  }
  const d = derived();
  const existing = new Set(d.allBids.map((b) => normName(b.name) + '|' + normName(b.client)));
  const cos = d.settings.companies;
  const withCo = parsed.bids.filter((b) => companyKey(b.ourCompany, cos)).length;
  const examples = parsed.bids.filter((b) => b.example).length;
  const already = parsed.bids.filter((b) => existing.has(normName(b.name) + '|' + normName(b.client))).length;
  const dupRevs = parsed.revisions.filter((r) => r.dup).length;
  if (!parsed.bids.length && !parsed.clients.length) {
    modal({ title: 'No bids found', body: `<p>${esc(file.name)} has no sheet with a "Bid / Tender Name" and "Client" column. Sheets found: ${esc(parsed.sheets.join(', '))}.</p>`, actions: [{ label: 'OK', cls: 'btn-primary' }] });
    return;
  }
  modal({
    title: 'Import from Excel', sub: esc(file.name),
    body: `<ul style="margin:0 0 14px;padding-left:20px;line-height:1.7">
      <li><b>${plural(parsed.bids.length, 'bid')}</b>${already ? `, ${already} already in the tracker (these are skipped)` : ''}</li>
      <li><b>${plural(parsed.revisions.length - dupRevs, 'offer revision')}</b>${dupRevs ? ` (${plural(dupRevs, 'exact duplicate')} skipped)` : ''}</li>
      <li><b>${plural(parsed.clients.length, 'client')}</b> with contact details</li></ul>
      ${examples ? `<label class="check"><input type="checkbox" name="skipEx" checked> Skip the ${plural(examples, 'row')} starting with "Example". These are the template's sample rows; if you bring them in for practice, "Remove sample bids" in Settings clears them later.</label>` : ''}
      ${examples && examples === parsed.bids.length ? '<p class="small muted" style="margin:10px 0 0">Every bid in this file is a template example. Untick the box to bring them in for practice; you can delete them later.</p>' : ''}
      <div style="margin-top:14px">${fld({ label: withCo ? `Company for bids without a "Tejas company" column value (${withCo} of ${parsed.bids.length} have one)` : 'Which company are these bids for?', name: 'company', type: 'select', options: cos.map((c) => ({ v: c.key, l: c.name })), value: view.company || 'pvt', blank: false, hint: 'Bid numbers are given with that company\'s prefix when the file has none.' })}</div>`,
    actions: [{ label: 'Cancel' }, { label: 'Import', cls: 'btn-primary', onClick: (root) => {
      const skipEx = root.querySelector('[name=skipEx]')?.checked ?? false;
      const r = applyImport(parsed, { skipEx, existing, company: root.querySelector('[name=company]')?.value || 'pvt' });
      toast(`Imported ${plural(r.bids, 'bid')}, ${plural(r.revs, 'revision')} and ${plural(r.clients, 'new client')}`);
    } }],
  });
}

// "Tejas Electrical Proprietorship Projects", "Proprietorship", "TEP" or "prop" all mean the same company
export function companyKey(v, cos) {
  const x = String(v || '').trim().toLowerCase();
  if (!x) return '';
  const hit = cos.find((c) => [c.key, c.name, c.short, c.prefix].some((y) => String(y || '').trim().toLowerCase() === x));
  if (hit) return hit.key;
  if (/propriet/.test(x)) return 'prop';
  if (/pvt|private|limited|ltd/.test(x)) return 'pvt';
  return '';
}

export function applyImport(parsed, { skipEx, existing, company = 'pvt' }) {
  const s = store.settings();
  const counters = {};
  for (const b of store.all('bids')) { const m = String(b.no || '').match(/^(.*)\/(\d{2}-\d{2})\/(\d+)$/); if (m) { const k = m[1] + '|' + m[2]; counters[k] = Math.max(counters[k] || 0, +m[3]); } }
  const list = [];
  const clientIds = new Map(store.all('clients').map((c) => [normName(c.name), c.id]));
  // Clients that appear only on the template's "Example" rows are marked as samples, so "Remove sample bids" clears them too
  const realClients = new Set(parsed.bids.filter((b) => !b.example).map((b) => normName(b.client)));
  const exampleClients = new Set(parsed.bids.filter((b) => b.example && !skipEx).map((b) => normName(b.client)).filter((k) => !realClients.has(k)));
  let newClients = 0;
  const clientId = (name, extra = {}) => {
    const k = normName(name); if (!k) return null;
    if (clientIds.has(k)) return clientIds.get(k);
    const id = 'c' + Math.random().toString(36).slice(2, 12);
    list.push(['clients', { id, name: name.trim(), contacts: [], ...extra, ...(exampleClients.has(k) ? { sample: true } : {}) }]);
    clientIds.set(k, id); newClients++;
    return id;
  };
  // clients first, so contacts land on them
  for (const c of parsed.clients) {
    const id = clientId(c.name, { city: c.city, owner: c.owner, sector: c.sector });
    const rec = list.find(([coll, r]) => coll === 'clients' && r.id === id);
    if (c.contact || c.phone || c.email) {
      const contact = { name: c.contact, role: c.role, phone: c.phone, email: c.email };
      if (rec) rec[1].contacts.push(contact);
      else { const ex = store.get('clients', id); if (ex && !(ex.contacts || []).some((x) => normName(x.name) === normName(c.contact))) store.update('clients', id, { contacts: [...(ex.contacts || []), contact] }); }
    }
  }
  const legacy = new Map(); const byNo = new Map();
  let nb = 0, nr = 0;
  for (const b of parsed.bids) {
    if (skipEx && b.example) continue;
    if (existing.has(normName(b.name) + '|' + normName(b.client))) continue;
    const id = 'b' + Math.random().toString(36).slice(2, 14);
    const received = b.receivedDate || b.dueDate || today();
    const co = companyKey(b.ourCompany, s.companies) || company;
    let no = b.no && /\/\d+$/.test(b.no) ? b.no : '';
    if (!no) { const prefix = (companyInfo(co, s).prefix || 'TEJ').trim(); const tag = fyShort(fyOf(received)); const k = prefix + '|' + tag; counters[k] = (counters[k] || 0) + 1; no = `${prefix}/${tag}/${String(counters[k]).padStart(3, '0')}`; }
    const cid = clientId(b.client || 'Unknown client');
    const rec = { id, no, company: co, name: b.name, client: b.client || 'Unknown client', clientId: cid, contactName: b.contactName, contactRole: b.contactRole, contactPhone: b.contactPhone, contactEmail: b.contactEmail, location: b.location, sector: matchOption(b.sector, s.sectors), scopes: b.scopes, tenderType: b.tenderType, consultant: b.consultant, enquiryRef: b.enquiryRef, owner: b.owner,
      receivedDate: received, preBidDate: b.preBidDate, siteVisitDate: b.siteVisitDate, dueDate: b.dueDate, submittedDate: b.submittedDate || (['submitted', 'negotiation', 'won', 'lost'].includes(b.status) ? '' : ''),
      status: b.status, remarks: b.remarks, emdRequired: b.emdRequired, emdAmount: b.emdAmount, emdNo: b.emdNo, emdForm: b.emdForm, emdStatus: b.emdStatus || (b.emdRequired === 'Yes' && b.emdNo ? 'Submitted' : ''), payTerms: b.payTerms,
      orderValue: b.orderValue, poNo: b.poNo, poDate: b.poDate, decisionDate: b.decisionDate, lossReason: b.lossReason, rank: b.rank, winner: b.winner, winnerPrice: b.winnerPrice, docLink: b.docLink,
      checklist: {}, imported: true, statusChangedAt: Date.now(), ...(b.example ? { sample: true } : {}) };
    // no contact column: use the client's first contact from the CRM sheet, if there is one
    if (!rec.contactName) { const c = parsed.clients.find((x) => normName(x.name) === normName(rec.client) && x.contact); if (c) Object.assign(rec, { contactName: c.contact, contactRole: c.role, contactPhone: c.phone, contactEmail: c.email }); }
    if (b.owner) { const u = (store.users || []).find((x) => x.name.toLowerCase() === b.owner.toLowerCase() || x.name.split(' ')[0].toLowerCase() === b.owner.toLowerCase()); if (u) { rec.owner = u.name; rec.ownerUid = u.id; } }
    for (const k of Object.keys(rec)) if (rec[k] === '' || rec[k] === null || rec[k] === undefined) delete rec[k];
    list.push(['bids', rec]);
    list.push(['notes', { bidId: id, kind: 'event', at: Date.now(), by: store.me, text: `Imported from Excel${b.statusRaw ? ` with status "${b.statusRaw}"` : ''}.`, ...(b.example ? { sample: true } : {}) }]);
    if (b.legacyNo !== '' && b.legacyNo !== null && b.legacyNo !== undefined) legacy.set(String(b.legacyNo), { id, b, rec });
    byNo.set(no, { id, b, rec }); if (b.no) byNo.set(b.no, { id, b, rec });
    nb++;
  }
  // revisions
  const revsFor = new Map();
  for (const r of parsed.revisions) {
    if (r.dup) continue;
    const t = (r.no && byNo.get(r.no)) || legacy.get(String(r.legacyNo));
    if (!t) continue;
    if (!revsFor.has(t.id)) revsFor.set(t.id, []);
    revsFor.get(t.id).push(r);
  }
  for (const [, t] of byNo) {
    if (t._done) continue; t._done = true;
    const revs = revsFor.get(t.id) || [];
    const hasR0 = revs.some((r) => /^r0$/i.test(r.rev));
    let seq = 0;
    const sm = t.b.example ? { sample: true } : {};
    if (!hasR0 && t.b.firstValue) { list.push(['revisions', { bidId: t.id, date: t.rec.receivedDate, value: t.b.firstValue, reason: 'First offer', status: 'Sent to client', remark: '', seq: seq++, ...sm }]); nr++; }
    for (const r of revs) {
      list.push(['revisions', { bidId: t.id, date: r.date || t.rec.receivedDate, value: r.value, reason: matchOption(r.reason, ['First offer', ...s.revisionReasons]), status: matchOption(r.status, REVISION_STATUSES), remark: r.remark, seq: seq++, ...sm }]);
      nr++;
    }
    if (!revs.length && !t.b.firstValue && t.b.finalValue) { list.push(['revisions', { bidId: t.id, date: t.rec.receivedDate, value: t.b.finalValue, reason: 'First offer', status: 'Sent to client', remark: '', seq: 0, ...sm }]); nr++; }
  }
  store.createMany(list, 'import');
  return { bids: nb, revs: nr, clients: newClients };
}
export { logEvent, addDays, inrShort };
