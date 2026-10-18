// Fixed vocabulary of the app. Lists the team can change live in Settings (stored as the shared "settings" record).

export const APP_NAME = 'Tejas Bid Tracker';
export const APP_VERSION = '1.0';
export const COMPANY = {
  name: 'Tejash Electricals Project Pvt. Ltd.',
  group: 'Tejas Group',
  address: 'Plot No. 45, Sector 7, PCNTDA, MIDC Bhosari, Pune 411026',
  phone: '+91 20 27130290',
  email: 'info@tejaselectricals.com',
  web: 'www.tejaselectricals.com',
};

// The bid pipeline. Order matters: it is the left-to-right order of the board and the stage stepper.
export const STATUSES = [
  { key: 'inquiry', label: 'Inquiry received', short: 'Inquiry', open: true, prob: 10, help: 'Enquiry or tender invitation received. Decide whether to bid.' },
  { key: 'working', label: 'Working', short: 'Working', open: true, prob: 25, help: 'Preparing the offer: site visit, vendor quotes, BOQ pricing.' },
  { key: 'submitted', label: 'Submitted', short: 'Submitted', open: true, prob: 40, help: 'Offer sent to the client. Waiting for evaluation.' },
  { key: 'negotiation', label: 'In negotiation', short: 'Negotiation', open: true, prob: 65, help: 'Client has come back for clarifications or a better price.' },
  { key: 'won', label: 'Won', short: 'Won', open: false, prob: 100, help: 'LOI, work order or PO received.' },
  { key: 'lost', label: 'Lost', short: 'Lost', open: false, prob: 0, help: 'Client gave the order to someone else.' },
  { key: 'regret', label: 'Not bidding', short: 'Not bidding', open: false, prob: 0, help: 'We decided not to bid (regret letter sent).' },
  { key: 'dropped', label: 'Dropped by client', short: 'Dropped', open: false, prob: 0, help: 'Client cancelled the tender or put it on hold.' },
];
export const STATUS = Object.fromEntries(STATUSES.map((s, i) => [s.key, { ...s, i }]));
export const OPEN_KEYS = STATUSES.filter((s) => s.open).map((s) => s.key);
export const PIPELINE_KEYS = ['inquiry', 'working', 'submitted', 'negotiation'];
export const PRE_SUBMIT = ['inquiry', 'working'];
export const AWAITING = ['submitted', 'negotiation'];
export const CLOSED_KEYS = ['won', 'lost', 'regret', 'dropped'];

export const REVISION_STATUSES = ['Under discussion', 'Sent to client', 'Accepted', 'Rejected'];
export const EMD_FORMS = ['Demand draft (DD)', 'Bank guarantee (BG)', 'Online transfer', 'Fixed deposit (FDR)', 'Insurance surety bond'];
export const EMD_STATUSES = ['To arrange', 'Submitted', 'Returned', 'Adjusted in contract', 'Forfeited'];
export const RANKS = ['L1', 'L2', 'L3', 'L4', 'L5 or lower', 'Not known'];

export const DEFAULT_SETTINGS = {
  id: 'main',
  // The two companies a bid can belong to. Names and bid-number prefixes can be changed in Settings.
  companies: [
    { key: 'pvt', name: 'Tejash Electrical Projects Pvt. Limited', short: 'Pvt. Ltd.', prefix: 'TEJ' },
    { key: 'prop', name: 'Tejas Electrical Proprietorship Projects', short: 'Proprietorship', prefix: 'TEP' },
  ],
  sectors: ['Data centre', 'Automobile and EV', 'Electronics manufacturing', 'Engineering and components', 'Pharma and healthcare', 'Food processing', 'Warehousing and logistics', 'IT park and commercial', 'Power and substation', 'Infrastructure', 'Other'],
  scopes: ['LT electrical', 'HT and substation', 'Transmission line', 'Lighting and power distribution', 'Earthing and lightning protection', 'HVAC', 'Fire fighting', 'Fire alarm', 'ELV (CCTV, access, data)', 'Compressed air', 'Mechanical piping', 'Solar', 'Annual maintenance (AMC)'],
  tenderTypes: ['Open tender', 'Limited enquiry', 'Single vendor', 'Repeat order', 'Budgetary quote', 'Variation or extra work'],
  lossReasons: ['Price (lost to a lower bid)', 'Technical evaluation', 'Delivery or timeline', 'Qualification criteria', 'Client relationship', 'Payment or commercial terms', 'Other'],
  regretReasons: ['Not in our scope', 'Too little time to prepare', 'Low margin expected', 'Client payment record', 'Team at full capacity', 'Location too far', 'Other'],
  revisionReasons: ['Client requested reduction', 'Competitive pricing', 'Scope change', 'Value engineering', 'Revised specification', 'Internal correction', 'Client requested increase', 'Other'],
  checklist: [
    'Tender documents downloaded and filed',
    'Go or no-go decided',
    'Site visit done',
    'Pre-bid queries sent',
    'Vendor quotes received',
    'BOQ priced',
    'Technical compliance and deviations listed',
    'Commercial terms reviewed (payment, retention, PBG, LD)',
    'MD approval on final price',
    'EMD or bid security arranged',
    'Documents signed, stamped and checked',
    'Offer submitted and acknowledgement saved',
  ],
  validityDays: 90,
  followUpDays: 14,
  probabilities: Object.fromEntries(STATUSES.map((s) => [s.key, s.prob])),
};

// Which checklist line is ticked automatically by a status change
export const AUTO_TICK_ON_SUBMIT = 'Offer submitted and acknowledgement saved';

export const NT_STATUSES = ['Quoted', 'Approved by client', 'Rejected by client'];
export const NT_UNITS = ['Nos', 'm', 'Rmt', 'Sqm', 'Set', 'Lot', 'Lump sum', 'kg', 'Pair'];
// The first financial year the tracker was used. Year lists always run from here to the current year.
export const FIRST_FY = 2026;
