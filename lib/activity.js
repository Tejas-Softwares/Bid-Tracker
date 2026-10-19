// The activity log. Every entry is written by the server from what actually changed, with the signed-in
// person's name and email, so it cannot be edited or faked from a browser.
import { clientIp } from './http.js';

export const CATEGORIES = {
  bids_added: { label: 'Bids added', actions: ['bid.create'] },
  bids_changed: { label: 'Bids edited', actions: ['bid.update', 'bid.file.add', 'bid.file.delete'] },
  status: { label: 'Stage changes', actions: ['bid.status'] },
  offers: { label: 'Offers and NT items', actions: ['offer.add', 'offer.edit', 'offer.delete', 'nt.add', 'nt.edit', 'nt.delete'] },
  notes: { label: 'Notes', actions: ['note.add', 'note.delete'] },
  deletes: { label: 'Deletions and restores', actions: ['bid.delete', 'bid.restore', 'offer.delete', 'nt.delete', 'note.delete', 'client.delete', 'data.erase'] },
  clients: { label: 'Clients', actions: ['client.create', 'client.update', 'client.delete'] },
  signins: { label: 'Sign-ins', actions: ['auth.signin', 'auth.signout', 'auth.failed'] },
  users: { label: 'Users and access', actions: ['user.setup', 'user.signup', 'user.approve', 'user.decline', 'user.role', 'user.disable', 'user.enable', 'user.update', 'user.reset', 'auth.reset', 'auth.password'] },
  data: { label: 'Settings and data', actions: ['settings.update', 'data.import', 'data.export', 'data.sample', 'data.restore', 'data.erase', 'data.backup'] },
};

// entries: [{ action, summary, entity, entityId, bidId, bidNo, bidName, details }]
export async function logActivity(q, req, user, entries) {
  if (!entries.length) return;
  const cols = { user_id: [], user_name: [], user_email: [], action: [], entity: [], entity_id: [], bid_id: [], bid_no: [], bid_name: [], summary: [], details: [], ip: [] };
  const ip = req ? clientIp(req) : '';
  for (const e of entries) {
    const u = e.user || user || {};
    cols.user_id.push(u.id || null); cols.user_name.push(u.name || ''); cols.user_email.push(u.email || e.email || '');
    cols.action.push(e.action); cols.entity.push(e.entity || null); cols.entity_id.push(e.entityId || null);
    cols.bid_id.push(e.bidId || null); cols.bid_no.push(e.bidNo || null); cols.bid_name.push(e.bidName || null);
    cols.summary.push(String(e.summary || '').slice(0, 500)); cols.details.push(JSON.stringify(e.details || {})); cols.ip.push(ip);
  }
  await q(`insert into activity (user_id, user_name, user_email, action, entity, entity_id, bid_id, bid_no, bid_name, summary, details, ip)
    select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::jsonb[], $12::text[])`,
  [cols.user_id, cols.user_name, cols.user_email, cols.action, cols.entity, cols.entity_id, cols.bid_id, cols.bid_no, cols.bid_name, cols.summary, cols.details, cols.ip]);
}

// ---------- turning a change into words ----------
const STATUS_LABEL = { inquiry: 'Inquiry received', working: 'Working', submitted: 'Submitted', negotiation: 'In negotiation', won: 'Won', lost: 'Lost', regret: 'Not bidding', dropped: 'Dropped by client' };
const FIELD = {
  name: 'name', client: 'client', company: 'company', location: 'location', sector: 'sector', scopes: 'scope of work', tenderType: 'tender type',
  enquiryRef: 'enquiry reference', consultant: 'consultant or PMC', owner: 'bid owner', docLink: 'documents link', remarks: 'remarks',
  contactName: 'client contact', contactRole: 'client contact', contactPhone: 'client contact', contactEmail: 'client contact', contact: 'client contact',
  receivedDate: 'enquiry date', preBidDate: 'pre-bid meeting', siteVisitDate: 'site visit', dueDate: 'submission deadline', dueTime: 'deadline time',
  submittedDate: 'submission date', validityDays: 'offer validity', expectedDecision: 'expected decision date', prob: 'chance of winning', estCost: 'estimated cost',
  emdRequired: 'EMD', emdAmount: 'EMD amount', emdForm: 'EMD form', emdNo: 'EMD number', emdBank: 'EMD bank', emdIssue: 'EMD issue date', emdExpiry: 'EMD expiry', emdStatus: 'EMD status', emdReturnedOn: 'EMD return date',
  payTerms: 'payment terms', advancePct: 'advance', retentionPct: 'retention', pbgPct: 'performance guarantee', completionMonths: 'completion period', dlpMonths: 'defect liability', ldTerms: 'penalty clause', otherTerms: 'other terms',
  poNo: 'order number', poDate: 'order date', orderValue: 'order value', decisionDate: 'decision date', lossReason: 'loss reason', rank: 'our position', winner: 'winning bidder', winnerPrice: 'winning price',
  regretReason: 'reason for not bidding', competitors: 'other bidders', lessons: 'lessons', checklist: 'checklist',
};
const SKIP = new Set(['_v', '_ts', '_by', '_uid', '_dev', '_del', '_c', '_restored', 'id', 'statusChangedAt', 'createdAt', 'createdBy', 'createdUid', 'createdDev', 'ownerUid', 'imported', 'sample', 'status']);

const short = (v) => {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.join(', ').slice(0, 120);
  if (typeof v === 'object') return '';
  return String(v).slice(0, 120);
};
export const inr = (n) => {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  const s = String(Math.round(Math.abs(n)));
  const g = s.length <= 3 ? s : s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
  return (n < 0 ? '-₹' : '₹') + g;
};

export function bidChanges(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const changes = [];
  for (const k of keys) {
    if (SKIP.has(k)) continue;
    if (JSON.stringify(a?.[k] ?? '') === JSON.stringify(b?.[k] ?? '')) continue;
    if (k === 'checklist') {
      const before = a?.checklist || {}, after = b?.checklist || {};
      for (const item of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const s1 = before[item]?.s || '', s2 = after[item]?.s || '';
        if (s1 !== s2) changes.push({ f: 'checklist', label: 'checklist', from: s1 ? `${item}: ${s1 === 'na' ? 'not needed' : 'done'}` : '', to: s2 ? `${item}: ${s2 === 'na' ? 'not needed' : 'done'}` : `${item}: not done` });
      }
      continue;
    }
    changes.push({ f: k, label: FIELD[k] || k, from: short(a?.[k]), to: short(b?.[k]) });
  }
  return changes;
}

export function describeBidUpdate(no, changes) {
  const labels = [...new Set(changes.map((c) => c.label))];
  const list = labels.length > 4 ? `${labels.slice(0, 4).join(', ')} and ${labels.length - 4} more` : labels.join(', ');
  return `Edited ${no}: ${list}`;
}
export const statusLabel = (s) => STATUS_LABEL[s] || s || '';
