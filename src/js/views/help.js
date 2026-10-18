// In-app guide. Short, task-first, in the team's own words.
import { STATUSES } from '../config.js';
import { esc } from '../util.js';
import { icon } from '../ui.js';

export function renderHelp() {
  return `<div class="help">
  <h2>How the tracker works</h2>
  <p>Every enquiry or tender the team works on is one <b>bid</b>. A bid moves through stages from the day it arrives until the client decides. The dashboard shows what is due, what needs a follow-up, and how the year is going.</p>
  <table><thead><tr><th style="width:170px">Stage</th><th>When to use it</th></tr></thead><tbody>
  ${STATUSES.map((s) => `<tr><td><span class="chip st-${s.key}">${esc(s.label)}</span></td><td>${esc(s.help)}</td></tr>`).join('')}
  </tbody></table>

  <h2>Your daily routine</h2>
  <ol>
    <li>Open the <b>Dashboard</b>. The strip at the top shows every submission due in the next 14 days, with how much of each checklist is done.</li>
    <li>Work through <b>Needs attention</b>. Each line has a button that takes you straight to what needs doing: mark a bid submitted, add a follow-up note, update an EMD.</li>
    <li>When something happens on a bid (a call, a clarification, a meeting), open it and <b>add a note</b>. Notes are how the rest of the team, and the MD, know where things stand.</li>
    <li>Move the bid to its new stage with the stage bar at the top of the bid, or by dragging its card on the <b>Board</b>.</li>
  </ol>

  <h2>Adding a bid</h2>
  <p>Press <b>New bid</b> (or the <kbd>N</kbd> key). First pick the company the bid is for: <b>Tejash Electrical Projects Pvt. Limited</b> or <b>Tejas Electrical Proprietorship Projects</b>. Each company has its own bid numbers (TEJ/26-27/001 and TEP/26-27/001). Only the name, client and enquiry date are needed; add the rest when you know it. If a similar bid for the same client already exists, the tracker tells you before you create a duplicate.</p>
  <p>Fill in the <b>Client contact</b> section with the person you deal with on this enquiry. If the client already has saved contacts, pick one from the list. The contact shows on the bid's Details tab, with buttons to call or email.</p>
  <h3>Typing amounts</h3>
  <p>Type amounts the way you say them: <b>4.5 cr</b>, <b>85 L</b>, <b>85 lakh</b>, <b>8500000</b> or <b>85,00,000</b> all work. The box shows what you typed in lakh or crore underneath.</p>
  <h3>Everything saves by itself</h3>
  <p>There is no Save button on a bid. Each field saves as soon as you leave it, and reaches everyone on the team within a few seconds. The bottom left shows "All changes saved" once the server has it.</p>

  <h2>Looking at one company, or one year</h2>
  <p>The <b>company filter</b> (on Bids, Board, Dashboard and Reports) shows both companies or only one. It stays as you left it on this computer. The <b>year list</b> always has every financial year from 2026-27 up to the current one, so from April 2027 you can still pick 2026-27 to see last year's bids.</p>

  <h2>Offers and revisions</h2>
  <p>The <b>Offers</b> tab keeps every price you quoted. The first one is R0. Each time the client asks for a better price, add a revised offer (R1, R2 and so on) with the reason. The latest offer is the bid's current value everywhere in the tracker, and the change from R0 shows how much was given in negotiation.</p>

  <h2>NT (non-tendered) items</h2>
  <p>When the client asks for work that was not in the tender, at any stage, add it on the bid's <b>NT items</b> tab. Enter a description and either an amount, or a quantity and rate. Several items can go in at once.</p>
  <ul>
    <li>Adding NT items creates a <b>new offer revision</b> straight away: the current offer plus the NT cost. For example, with R1 at ₹2.10 Cr and NT items of ₹12 L, R2 becomes ₹2.22 Cr.</li>
    <li>Changing an NT item's amount, or marking it <b>Rejected by client</b>, makes another revision with the difference. Deleting one takes its cost off the same way.</li>
    <li>On a won bid you can also add the NT cost to the order value.</li>
  </ul>

  <h2>Checklist</h2>
  <p>Each bid has the same checklist of tender steps, from downloading documents to saving the submission acknowledgement. Tick steps as they are done, or mark a step "Not needed" (for example, no site visit). The progress shows on the dashboard and on the board. Admins change the steps in <a href="#" data-act="go" data-view="settings" data-tab="lists">Settings</a>.</p>

  <h2>Commercial terms, EMD and bank guarantees</h2>
  <p>On the <b>Commercial Terms</b> tab, record the EMD (amount, form, number and expiry) and the payment terms, advance, retention, guarantees and penalty clause. The tracker reminds you when a bank guarantee is about to expire, when an EMD is still not arranged close to the deadline, and when a bid is lost but the EMD has not come back. The <b>EMD register</b> under Reports lists everything still with clients.</p>

  <h2>Deleting a bid</h2>
  <p>Open the bid, press <b>⋯</b> at the top and choose <b>Delete bid</b>. To make sure it is not a slip, you type <b>DELETE BID</b> before the button works. The deletion is recorded in Activity with your name, and an admin can bring the bid back from there.</p>

  <h2>Activity</h2>
  <p>The <b>Activity</b> screen lists everything anyone has done: bids added, edited, moved or deleted, offers and NT items, notes, clients, sign-ins and changes to accounts and settings. Each line shows the person's name and email and the time. Use the buttons at the top to see one kind of activity (for example <b>Deletions and restores</b>), and the lists to pick a person or a period. Press <b>Details</b> to see exactly what changed, before and after. Entries are written by the server and nobody can edit or remove them.</p>

  <h2>Reports</h2>
  <ul>
    <li><b>Weekly status report</b>: deadlines, bids waiting for a decision, new enquiries, wins and losses since a date you pick. Press <b>Print or save as PDF</b> and choose "Save as PDF" as the printer to email it.</li>
    <li><b>Win and loss</b>: win rate by sector, client and person, why bids were lost, and how much was given away in negotiation.</li>
    <li><b>Export</b>: everything as a formatted Excel workbook, including NT items.</li>
  </ul>

  <h2>Your account</h2>
  <p>Everyone signs in with their own work email and a password only they know. To join, open the tracker and choose <b>Create an account</b>, with your name and position. An admin approves the account before it can be used. Change your name, position or password under <a href="#" data-act="go" data-view="settings" data-tab="account">Settings, My account</a>. Forgotten your password? Ask an admin for a reset link.</p>
  <p>Admins approve new people, make others admins, turn accounts off when someone leaves, change the lists and settings, and restore backups or deleted bids. Members do everything else.</p>

  <h2>Backups</h2>
  <p>The server saves a copy of everything once a day and keeps 90 days. It also saves one just before anyone restores a backup or deletes everything. Admins find them under <a href="#" data-act="go" data-view="settings" data-tab="data">Settings, Import, export and backups</a>, where they can also save one by hand, download it, or restore it.</p>

  <h2>Keyboard shortcuts</h2>
  <table><tbody>
    <tr><td style="width:120px"><kbd>N</kbd></td><td>New bid</td></tr>
    <tr><td><kbd>/</kbd></td><td>Search bids and clients</td></tr>
    <tr><td><kbd>Esc</kbd></td><td>Close the open bid or window</td></tr>
    <tr><td><kbd>G</kbd> then <kbd>D</kbd>, <kbd>B</kbd>, <kbd>K</kbd>, <kbd>C</kbd></td><td>Go to Dashboard, Bids, Board (kanban), Calendar</td></tr>
    <tr><td><kbd>G</kbd> then <kbd>L</kbd>, <kbd>R</kbd>, <kbd>A</kbd>, <kbd>S</kbd></td><td>Go to Clients, Reports, Activity, Settings</td></tr>
  </tbody></table>

  <h2>If something looks wrong</h2>
  <table><tbody>
    <tr><td style="width:250px"><b>"Offline" at the bottom left</b></td><td>The internet connection dropped. Keep working and keep the tab open; your changes are saved as soon as the connection is back.</td></tr>
    <tr><td><b>Cannot sign in</b></td><td>Check the email is the one you signed up with. After 5 wrong passwords, wait 15 minutes. A new account must be approved by an admin first. Forgotten password: ask an admin for a reset link.</td></tr>
    <tr><td><b>A bid was deleted by mistake</b></td><td>An admin opens <b>Activity</b>, picks <b>Deletions and restores</b>, and presses <b>Restore bid</b> on that line. The bid comes back with its offers, notes and NT items.</td></tr>
    <tr><td><b>A teammate's change is not showing</b></td><td>Changes arrive within about 10 seconds. If the bottom left says "Offline", the connection is the problem. Reloading the page always fetches the latest.</td></tr>
    <tr><td><b>Two bids got the same number</b></td><td>This can happen if two people create a bid at the same moment. The tracker renumbers the later one automatically and adds a note to it.</td></tr>
  </tbody></table>
  <p class="small muted" style="margin-top:28px">${icon('info')} Tejas Bid Tracker 2.0. The bids are kept in Tejas Group's own database on the tracker's server and are only visible to people with an approved account.</p>
  </div>`;
}
