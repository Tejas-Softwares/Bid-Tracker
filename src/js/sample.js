// Made-up bids for practice. Every sample record carries sample: true so it can be removed in one go.
import { store } from './store.js';
import { today, addDays, fyOf, fyShort, uid } from './util.js';
import { companyInfo } from './derive.js';

export function hasSample() { return store.all('bids').some((b) => b.sample); }

export function loadSample() {
  const t = today();
  const D = (n) => addDays(t, n);
  const s = store.settings();
  // owners are people with accounts, so "My bids" and the owner filters work on the samples too
  const team = (store.users || []).filter((u) => u.status !== 'disabled').map((u) => ({ name: u.name, id: u.id }));
  if (!team.length) team.push({ name: store.me, id: store.user?.id || '' });
  const [A, B, C] = [team[0], team[1] || team[0], team[2] || team[0]];
  const clients = {
    sah: { name: 'Sahyadri Auto Components (sample)', sector: 'Automobile and EV', city: 'Chakan', contacts: [{ name: 'Rahul Kulkarni', role: 'Purchase manager', phone: '+91 90000 00001', email: 'rahul@example.com' }] },
    ind: { name: 'Indrayani Data Parks (sample)', sector: 'Data centre', city: 'Talegaon', contacts: [{ name: 'Meera Joshi', role: 'Project head', phone: '+91 90000 00002', email: 'meera@example.com' }] },
    dec: { name: 'Deccan Logistics Parks (sample)', sector: 'Warehousing and logistics', city: 'Bhiwandi', contacts: [] },
    mul: { name: 'Mulshi Pharma Labs (sample)', sector: 'Pharma and healthcare', city: 'Pirangut', contacts: [{ name: 'Anil Deshpande', role: 'Engineering manager', phone: '+91 90000 00003', email: '' }] },
    bhi: { name: 'Bhima Engineering Works (sample)', sector: 'Engineering and components', city: 'Ranjangaon', contacts: [] },
    kri: { name: 'Krishna Food Products (sample)', sector: 'Food processing', city: 'Shirwal', contacts: [] },
  };
  const ids = {};
  const list = [];
  for (const [k, c] of Object.entries(clients)) { ids[k] = uid('c'); list.push(['clients', { id: ids[k], ...c, sample: true }]); }
  const cl = (k) => ({ client: clients[k].name, clientId: ids[k], sector: clients[k].sector });
  const allDone = (n) => Object.fromEntries((s.checklist || []).slice(0, n).map((x) => [x, { s: 'done', by: A, ts: Date.now() - 86400000 }]));
  const fyNo = {};
  const no = (date, co) => { const p = companyInfo(co, s).prefix || 'TEJ'; const tag = fyShort(fyOf(date)); const k = p + tag; fyNo[k] = (fyNo[k] || 900) + 1; return `${p}/${tag}/${fyNo[k]}`; };
  const bids = [
    { k: 'sah', name: 'LT electrical and lighting, Assembly Hall 2', location: 'Chakan, Pune', status: 'working', receivedDate: D(-12), preBidDate: D(-6), dueDate: D(3), dueTime: '15:00', owner: B, scopes: ['LT electrical', 'Lighting and power distribution'], tenderType: 'Limited enquiry', consultant: 'Archway Consultants (sample)', checklist: allDone(6), revs: [[D(-2), 28500000, 'First offer', 'Under discussion']], emdRequired: 'No' },
    { k: 'ind', name: 'HT substation 33/0.433 kV, 2 x 2500 kVA', location: 'Talegaon', status: 'inquiry', receivedDate: D(-3), siteVisitDate: D(2), dueDate: D(9), owner: A, scopes: ['HT and substation'], tenderType: 'Open tender', emdRequired: 'Yes', emdAmount: 500000, emdStatus: 'To arrange', checklist: allDone(1), revs: [] },
    { k: 'dec', name: 'Fire alarm and PA system, Warehouse W3', location: 'Bhiwandi', status: 'submitted', receivedDate: D(-30), dueDate: D(-12), submittedDate: D(-12), validityDays: 90, owner: B, scopes: ['Fire alarm'], emdRequired: 'Yes', emdAmount: 100000, emdForm: 'Bank guarantee (BG)', emdNo: 'BG/0042/SAMPLE', emdBank: 'Sample Bank', emdStatus: 'Submitted', emdExpiry: D(11), checklist: allDone(12), revs: [[D(-12), 4800000, 'First offer', 'Sent to client']] },
    { k: 'mul', name: 'Cleanroom electrical and HVAC power, Phase 2', location: 'Pirangut', status: 'negotiation', receivedDate: D(-55), dueDate: D(-35), submittedDate: D(-35), validityDays: 60, expectedDecision: D(6), owner: A, scopes: ['LT electrical', 'HVAC'], consultant: 'Archway Consultants (sample)', checklist: allDone(12), revs: [[D(-35), 46000000, 'First offer', 'Sent to client'], [D(-20), 44200000, 'Client requested reduction', 'Sent to client'], [D(-4), 43500000, 'Competitive pricing', 'Under discussion']] },
    { k: 'bhi', name: 'Solar rooftop 750 kWp', location: 'Ranjangaon', status: 'won', receivedDate: D(-80), dueDate: D(-60), submittedDate: D(-60), decisionDate: D(-21), poNo: 'WO/SAMPLE/118', poDate: D(-21), orderValue: 19200000, owner: C, scopes: ['Solar'], checklist: allDone(12), revs: [[D(-60), 19900000, 'First offer', 'Sent to client'], [D(-30), 19200000, 'Client requested reduction', 'Accepted']] },
    { k: 'sah', name: 'Utility building electrical, Block C', location: 'Chakan, Pune', status: 'lost', receivedDate: D(-70), dueDate: D(-50), submittedDate: D(-50), decisionDate: D(-18), lossReason: s.lossReasons[0], rank: 'L2', winner: 'Shree Electricals (sample)', winnerPrice: 12450000, owner: B, scopes: ['LT electrical'], checklist: allDone(12), revs: [[D(-50), 13500000, 'First offer', 'Sent to client'], [D(-28), 12900000, 'Competitive pricing', 'Rejected']] },
    { k: 'kri', name: 'Point wiring and DBs, Admin block', location: 'Shirwal', status: 'regret', receivedDate: D(-15), dueDate: D(-5), decisionDate: D(-10), regretReason: 'Low margin expected', owner: A, scopes: ['LT electrical'], revs: [] },
    { k: 'ind', name: 'ELV: CCTV, access control and data, Tower B', location: 'Talegaon', status: 'working', receivedDate: D(-10), dueDate: D(0), dueTime: '17:00', owner: A, scopes: ['ELV (CCTV, access, data)'], checklist: allDone(5), revs: [[D(-1), 9200000, 'First offer', 'Under discussion']] },
    { k: 'bhi', name: 'Earthing and lightning protection, Plant 4', location: 'Ranjangaon', status: 'submitted', receivedDate: D(-40), dueDate: D(-26), submittedDate: D(-26), validityDays: 30, owner: C, scopes: ['Earthing and lightning protection'], checklist: allDone(12), revs: [[D(-26), 3800000, 'First offer', 'Sent to client']], quiet: true },
    { k: 'sah', name: 'Compressed air piping and power, Paint shop', location: 'Chakan, Pune', status: 'inquiry', receivedDate: D(-8), dueDate: D(-1), owner: B, scopes: ['Compressed air', 'LT electrical'], revs: [] },
    { k: 'mul', name: 'DG synchronisation panel and cabling', location: 'Pirangut', status: 'won', receivedDate: D(-120), dueDate: D(-100), submittedDate: D(-100), decisionDate: D(-75), poNo: 'PO/SAMPLE/7731', poDate: D(-75), orderValue: 8600000, owner: A, scopes: ['LT electrical'], checklist: allDone(12), revs: [[D(-100), 9100000, 'First offer', 'Sent to client'], [D(-85), 8600000, 'Value engineering', 'Accepted']], emdRequired: 'Yes', emdAmount: 200000, emdForm: 'Demand draft (DD)', emdStatus: 'Submitted' },
    { k: 'ind', name: 'HVAC power distribution, Data hall 1', location: 'Talegaon', status: 'lost', receivedDate: D(-95), dueDate: D(-72), submittedDate: D(-72), decisionDate: D(-40), lossReason: s.lossReasons[1] || 'Technical evaluation', rank: 'Not known', owner: A, scopes: ['HVAC', 'LT electrical'], checklist: allDone(12), revs: [[D(-72), 31000000, 'First offer', 'Sent to client']], emdRequired: 'Yes', emdAmount: 300000, emdForm: 'Bank guarantee (BG)', emdStatus: 'Submitted' },
  ];
  const notes = {
    0: ['Pre-bid meeting attended. Client wants Polycab or KEI cables only.', 'Vendor quotes received for LT panels from three vendors.'],
    3: ['Technical evaluation cleared. Commercial meeting fixed for next week.', 'Client asked for a further 1.5% reduction; MD agreed to 1.6% with revised payment terms.'],
    4: ['LOI received. Kick-off meeting on site next Monday.'],
    5: ['Lost on price. L1 was about 3.5% lower than our revised offer.'],
  };
  bids.forEach((b, n) => {
    const id = uid('b');
    const { k, revs, quiet, owner, ...rest } = b;
    const createdAt = quiet ? Date.now() - 40 * 86400000 : Date.now() - n * 60000;
    const company = n % 3 === 2 ? 'prop' : 'pvt';
    const ct = clients[k].contacts[0];
    list.push(['bids', { id, no: no(b.receivedDate, company), company, ...cl(k), ...rest, owner: owner.name, ownerUid: owner.id, ...(ct ? { contactName: ct.name, contactRole: ct.role, contactPhone: ct.phone, contactEmail: ct.email } : {}), checklist: rest.checklist || {}, sample: true, createdAt, statusChangedAt: quiet ? createdAt : Date.now() - 86400000 * 2 }]);
    revs.forEach(([date, value, reason, status], seq) => list.push(['revisions', { bidId: id, date, value, reason, status, remark: '', seq, sample: true, _created: createdAt }]));
    // one won order with extra work the client added later
    if (n === 4) {
      list.find(([c, r]) => c === 'bids' && r.id === id)[1].orderValue += 2350000;
      list.push(['nt', { bidId: id, desc: 'Additional 100 kWp on the canteen roof', unit: 'Lot', qty: 1, rate: 2350000, amount: 2350000, date: D(-7), ref: 'Client email (sample)', status: 'Approved by client', sample: true }]);
      list.push(['revisions', { bidId: id, date: D(-7), value: 19200000 + 2350000, reason: 'NT item added', status: 'Accepted', remark: 'NT: Additional 100 kWp on the canteen roof', seq: revs.length, fromNt: true, sample: true }]);
    }
    if (!quiet) list.push(['notes', { bidId: id, kind: 'event', text: 'Sample bid added for practice.', at: Date.now() - 3600000 * (n + 1), by: store.me, sample: true }]);
    (notes[n] || []).forEach((text, j) => list.push(['notes', { bidId: id, kind: 'note', text, at: Date.now() - 86400000 * (3 - j) - n * 1000, by: (j % 2 ? A : B).name, sample: true }]));
  });
  store.createMany(list, 'sample');
}

export function clearSample() {
  const pairs = [];
  for (const c of ['bids', 'revisions', 'notes', 'clients', 'nt']) for (const r of store.all(c)) if (r.sample) pairs.push([c, r.id]);
  store.removeMany(pairs, 'clear-sample');
}
