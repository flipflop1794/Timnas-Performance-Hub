import { ACTION_STATUSES, NOTE_LIMIT, canWriteSession, dailySession, isOverdue, sessionOverview, updateFollowUp } from '../core/daily_sessions.js';
import { localDay } from '../core/dates.js';
import { dailyText } from './daily_sessions_strings.js';

export const dailyLink = (key, value) => `#daily-sessions?${key}=${encodeURIComponent(value)}`;
export const recordLink = (tab, id) => `#${tab}?record=${encodeURIComponent(id)}`;
const statusLabel = (status) => status === 'Open' ? 'Action open' : status;

export function dailySessionsUi({ S, user, owners, titles, titleVisible, esc, params, render, setMsg, reportTab }) {
  const writable = titles.filter((title) => canWriteSession(user, title));
  const visible = titles.filter(titleVisible);
  const T = (text) => esc(dailyText(text, S.lang));
  let draftId;
  const pending = new Set();
  const options = (rows, selected) => rows.map(([value, label]) =>
    `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const sourceLink = (record, label) => `<a href="${esc(dailyLink('session', record.id))}">${label}</a>`;
  const display = (value) => `<span data-no-tr>${esc(value)}</span>`;
  const sessionLabel = (record) => `${esc(record.date)}${record.time ? ` · ${esc(record.time.replace(/\s*WIB$/i, ''))} WIB` : ''}`;
  const message = '<span class="msg" id="dailyMsg" role="status"></span>';
  const unavailable = () => `<p class="note">${T('Session records could not be loaded. Reload to try again.')}</p>`;
  const refreshFailed = () => `<p class="note" role="status">${T('Session records could not refresh. Check your connection for the latest updates.')}</p>`;
  const loading = () => `<p class="note">${T('Loading session records…')}</p>`;
  const field = (key, label, attrs) => `<label class="field" for="daily-${key}"><span>${T(label)}</span><input id="daily-${key}" name="${key}" ${attrs}></label>`;
  const notes = (key, label) => `<label class="field" for="daily-${key}"><span>${T(label)}</span><textarea id="daily-${key}" name="${key}" rows="2" maxlength="${NOTE_LIMIT}" required></textarea></label>`;
  const select = (key, label, choices) => `<label class="field" for="daily-${key}"><span>${T(label)}</span><select id="daily-${key}" name="${key}">${choices}</select></label>`;

  function newForm(today) {
    const title = params().get('title');
    return `<div class="panel"><h2 data-session-heading tabindex="-1">${T('Log a session')}</h2><form id="daily-new">
      <div class="form">
        ${select('title', 'Discipline', options(writable.map((t) => [t, t]), title))}
        ${field('date', 'Session date (WIB)', `type="date" required value="${today}" max="${today}"`)}
        ${select('kind', 'Session type', options([['team practice', dailyText('Team practice', S.lang)], ['scrim', 'Scrim']], 'team practice'))}
        ${field('partner', 'Scrim opponent (blank for internal)', 'maxlength="120"')}
      </div>
      <div class="daily-notes">
        ${notes('objective', 'Objective')}${notes('outcome', 'Outcome')}
        ${notes('issue', 'Main issue')}${notes('nextAction', 'Next action')}
      </div>
      <p class="note">${T('The next action is assigned to you and due tomorrow (WIB). Staff with discipline write access can update it.')}</p>
      <div class="toolbar"><button class="btn primary" type="submit" ${pending.has('new') ? 'disabled' : ''}>${T('Save session')}</button>${message}</div>
    </form></div>`;
  }

  function actionLine(session, today) {
    const action = session.followUp;
    return `<span class="note">${display(action.ownerName)} · <span>${T('Due (WIB)')}</span> ${esc(action.due)} · <span>${T(statusLabel(action.status))}</span></span>
      ${isOverdue(action, today) ? `<strong class="tag c-Blocked">${T('Overdue')}</strong>` : ''}`;
  }

  function detail(session, today) {
    const { dailyReport, followUp } = session;
    const choices = owners.filter((person) => canWriteSession(person, session.title)).map((person) => [person.id, person.name]);
    const selected = choices.some(([id]) => id === followUp.ownerId) ? followUp.ownerId : '';
    if (!selected) choices.unshift(['', dailyText('Choose an owner', S.lang)]);
    return `<div class="panel"><a href="#daily-sessions">${T('Back to daily sessions')}</a><h2 data-session-heading tabindex="-1">${esc(session.title)} · ${sessionLabel(session)}</h2>
      ${S.scrimRefreshFailed ? refreshFailed() : ''}
      <p><span>${T(session.kind === 'scrim' ? 'Scrim' : 'Team practice')}</span>${session.partner && session.kind === 'scrim' ? ` · ${display(session.partner)}` : ''} · ${display(session.result.by)}</p>
      <dl class="kv daily-context"><dt>${T('Objective')}</dt><dd>${display(dailyReport.objective)}</dd><dt>${T('Outcome')}</dt><dd>${display(dailyReport.outcome)}</dd>
        <dt>${T('Main issue')}</dt><dd>${display(dailyReport.issue)}</dd><dt>${T('Next action')}</dt><dd>${display(dailyReport.nextAction)}</dd></dl></div>
      <div class="panel"><h2>${T('Follow-up')}</h2><p>${actionLine(session, today)}</p>
        ${canWriteSession(user, session.title) && session._version ? `<form id="daily-edit" data-session-id="${esc(session.id)}">
          <input type="hidden" id="daily-version" name="version" value="${esc(session._version)}">
          <div class="form">
            ${select('ownerId', 'Action owner', options(choices, selected))}
            ${field('due', 'Due date (WIB)', `type="date" required min="${esc(session.date)}" value="${esc(followUp.due)}"`)}
            ${select('status', 'Status', options(ACTION_STATUSES.map((status) => [status, dailyText(statusLabel(status), S.lang)]), followUp.status))}
          </div><div class="toolbar"><button class="btn primary" type="submit" ${pending.has(session.id) ? 'disabled' : ''}>${T('Save follow-up')}</button>${message}</div></form>` : ''}
      </div>`;
  }

  function overview(rows) {
    return `<div class="panel"><h2>${T('Discipline readiness')}</h2><div class="daily-grid">
      ${rows.map(({ title, latest, overdue, next }) => `<section class="obj daily-card"><h3>${esc(title)}</h3>
        <div><b>${T('Latest report')}</b><br>${latest ? `<a href="${esc(latest.kind === 'session' ? dailyLink('session', latest.record.id) : recordLink(reportTab[title], latest.record.id))}">${sessionLabel(latest.record)}</a>` : `<span class="note">${T('No report filed')}</span>`}</div>
        <div><b>${T('Overdue actions')}</b>${overdue.length ? `<ul class="plain">${overdue.map((s) => `<li>${sourceLink(s, display(s.dailyReport.nextAction))}</li>`).join('')}</ul>` : ' · 0'}</div>
        <div><b>${T('Next planned session')}</b><br>${next ? `<a href="${esc(recordLink(reportTab[title].replace(/-reports$/, '-scrims'), next.id))}">${sessionLabel(next)}</a>` : `<span class="note">${T('No session planned')}</span>`}</div>
      </section>`).join('')}
    </div></div>`;
  }

  function page() {
    if (S.mode === 'demo') return `<div class="panel"><h2>${T('Daily sessions')}</h2><p>${T('Leave the demo sandbox to log or view daily sessions.')}</p></div>`;
    const today = localDay();
    const id = params().get('session');
    const loaded = S.scrimLoad === 'ready';
    const loadMessage = S.scrimLoad === 'error' || S.dbState === 'off' ? unavailable : loading;
    const back = `<a href="#daily-sessions">${T('Back to daily sessions')}</a>`;
    if (id) {
      if (!loaded) return `<div class="panel">${back}${loadMessage()}</div>`;
      const session = S.scrims.find((s) => s.id === id && s.dailyReport && titleVisible(s.title));
      return session ? detail(session, today) : `<div class="panel">${back}<p class="note">${T('Session unavailable.')}</p></div>`;
    }
    if (!loaded) return `<div class="panel"><h2>${T('Daily sessions')}</h2>${loadMessage()}</div>`;
    const rows = sessionOverview(visible, S.scrims, S.reports, today);
    const open = rows.flatMap((row) => row.open).sort((a, b) => a.followUp.due.localeCompare(b.followUp.due));
    const history = S.scrims.filter((s) => s.dailyReport && titleVisible(s.title))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const board = user.seesAllTitles
      ? (S.reportLoad === 'ready' ? overview(rows) : `<div class="panel"><h2>${T('Discipline readiness')}</h2>${S.reportLoad === 'error' ? unavailable() : loading()}</div>`) : '';
    const formTitle = params().get('title');
    const entry = writable.includes(formTitle) || (!user.seesAllTitles && writable.length);
    return `${entry ? newForm(today) : `<div class="panel"><h2 data-session-heading tabindex="-1">${T('Daily sessions')}</h2>
      ${writable.length ? `<div class="toolbar"><a class="btn primary" href="${esc(dailyLink('title', writable[0]))}">${T('Log a session')}</a></div>` : ''}</div>`}
      ${S.scrimRefreshFailed ? `<div class="panel">${refreshFailed()}</div>` : ''}${board}
      <div class="panel"><h2>${T('Open follow-ups')}</h2>${open.length ? `<div class="daily-grid">${open.map((s) => `<div class="obj daily-card">
        <b>${sourceLink(s, display(s.dailyReport.nextAction))}</b><span class="note">${esc(s.title)} · ${sessionLabel(s)}</span>
        <div>${actionLine(s, today)}</div></div>`).join('')}</div>` : `<p class="empty">${T('No open follow-ups.')}</p>`}</div>
      <div class="panel"><h2>${T('Session history')}</h2>${history.length ? `<ul class="plain">${history.map((s) =>
        `<li>${sourceLink(s, `${sessionLabel(s)} · ${esc(s.title)} · ${display(s.dailyReport.objective)}`)}</li>`).join('')}</ul>` : `<p class="empty">${T('No daily sessions logged.')}</p>`}</div>`;
  }

  async function submit(event) {
    const form = event.target;
    if (!['daily-new', 'daily-edit'].includes(form.id)) return;
    event.preventDefault();
    const id = form.dataset.sessionId;
    const key = id || 'new';
    const route = location.hash;
    if (S.mode !== 'live' || S.scrimLoad !== 'ready' || pending.has(key)) return;
    const values = Object.fromEntries(new FormData(form));
    pending.add(key);
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    setMsg('dailyMsg', 'Saving session changes…');
    try {
      const current = id && S.scrims.find((s) => s.id === id);
      if (id && (!current || !canWriteSession(user, current.title))) throw new Error('Session unavailable.');
      const session = id ? updateFollowUp(current, values, owners)
        : dailySession(values, user, draftId ||= `SC-${crypto.randomUUID()}`);
      // If a response was lost after commit, the snapshot can already contain this submission.
      const saved = !id && S.scrims.find((s) => s.id === session.id);
      const version = saved?._version ?? await S.db.collection('scrims').doc(session.id).set(session, id ? values.version : undefined);
      if (!saved) S.scrims = [...S.scrims.filter((s) => s.id !== session.id), { ...session, _version: version }];
      pending.delete(key);
      if (!id) {
        draftId = undefined;
        if (location.hash === route) location.hash = dailyLink('session', session.id);
      } else if (location.hash === route) {
        document.getElementById(form.id)?.reset();
        render();
        setMsg('dailyMsg', 'Follow-up saved.', 'ok');
      }
    } catch (error) {
      if (location.hash !== route) return;
      if (error.code === 'conflict' && id) {
        document.getElementById(form.id)?.reset();
        render();
      }
      setMsg('dailyMsg', error.message, 'err');
    } finally {
      pending.delete(key);
      const active = document.getElementById(form.id)?.querySelector('button[type=submit]');
      if (active && active.form.dataset.sessionId === id) active.disabled = false;
    }
  }

  return { page, submit };
}
