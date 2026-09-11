/* Family Calendar / Foundry 4. Calendar-only UI; read-only existing API. ES5 syntax. */
(function () {
  'use strict';
  if (window.__familyCalendarFoundry4) return;
  window.__familyCalendarFoundry4 = true;
  var ENDPOINT = 'https://jacijznifstuwxylgvth.supabase.co/functions/v1/family-calendar';
  var PIN_KEY = 'family-calendar-pin';
  var month, events = [], synced = null, loadedMonth = '', requestId = 0, activeRequest = null;
  var standalone = false, root, panel, content, detail, status, returnFocus = null;
  function byId(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function key(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function fromKey(k) { var p = String(k).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function plus(d, n) { return new Date(d.getTime() + n * 86400000); }
  function today() { return fromKey(key(new Date(Date.now() + 36000000))); }
  function monday(d) { return plus(d, -(d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1)); }
  function shift(iso) { return new Date(new Date(iso).getTime() + 36000000); }
  function dateLabel(d) { return d.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]; }
  function dayName(d) { return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getUTCDay()]; }
  function time(iso) { var d = shift(iso), h = d.getUTCHours(); return (h % 12 || 12) + ':' + pad(d.getUTCMinutes()) + (h >= 12 ? ' pm' : ' am'); }
  function owner(ev) { return ev.owner_label === 'Mich' ? 'mich' : ev.owner_label === 'Family' ? 'family' : 'shaun'; }
  function rosterClass(ev) {
  // Exact roster titles only: do not recolour ordinary appointments.
  if (ev.owner_label !== 'Mich') return '';
  var t = String(ev.title || '').replace(/\./g, '').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ').toUpperCase();
  if (/^(AM|AM SHIFT|DAY|DAY SHIFT|DAY DUTY)$/.test(t)) return ' fc4-shift-day';
  if (/^(PM|PM SHIFT|AFTERNOON|AFTERNOON SHIFT)$/.test(t)) return ' fc4-shift-pm';
  if (/^(ND|ND SHIFT|NIGHT|NIGHT SHIFT|NIGHT DUTY)$/.test(t)) return ' fc4-shift-nd';
  return '';
}
  function pin() { try { return localStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; } }
  function savePin(p) { try { if (p) localStorage.setItem(PIN_KEY, p); else localStorage.removeItem(PIN_KEY); } catch (e) {} }
  function setStatus(text) { if (status) status.textContent = text; }
  function calendarIcon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3M14 18h3"/></svg>'; }
  function range(ev) {
    if (ev.all_day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.all_day_start || '')) return null;
      var end = ev.all_day_end || key(plus(fromKey(ev.all_day_start), 1));
      if (end <= ev.all_day_start) end = key(plus(fromKey(ev.all_day_start), 1));
      return { start: ev.all_day_start, end: end };
    }
    var s = new Date(ev.start_at).getTime(), e = new Date(ev.end_at || ev.start_at).getTime();
    if (!isFinite(s)) return null;
    if (!isFinite(e) || e <= s) e = s + 1;
    return { start: key(shift(new Date(s).toISOString())), end: key(plus(fromKey(key(shift(new Date(e - 1).toISOString()))), 1)) };
  }
  function overlaps(ev, start, end) { var r = range(ev); return r && r.start < end && r.end > start; }
  function multi(ev) { var r = range(ev); return r && (fromKey(r.end) - fromKey(r.start)) > 86400000; }
  function when(ev) {
    var r = range(ev);
    if (!r) return '';
    if (ev.all_day) {
      var last = plus(fromKey(r.end), -1);
      return dateLabel(fromKey(r.start)) + (key(last) === r.start ? '' : ' to ' + dateLabel(last)) + ' | All day';
    }
    var startText = dateLabel(shift(ev.start_at)) + ', ' + time(ev.start_at);
    if (!ev.end_at) return startText;
    return startText + ' to ' + (key(shift(ev.start_at)) === key(shift(ev.end_at)) ? '' : dateLabel(shift(ev.end_at)) + ', ') + time(ev.end_at);
  }
  function sortEvents(a, b) {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
    var as = a.start_at || a.all_day_start || '', bs = b.start_at || b.all_day_start || '';
    return as < bs ? -1 : as > bs ? 1 : String(a.title || '').localeCompare(String(b.title || ''));
  }
  function firstMonth(d, offset) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (offset || 0), 1)); }
  function monthLabel(d) { return ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function monthBounds(d) {
    var start = monday(firstMonth(d)), next = firstMonth(d, 1);
    var rows = Math.ceil((next.getTime() - start.getTime()) / (7 * 86400000));
    return { start: start, end: plus(start, rows * 7), rows: rows };
  }
  function inMonth() {
    var list = [], i;
    for (i = 0; i < events.length; i++) if (overlaps(events[i], key(month), key(firstMonth(month, 1)))) list.push(events[i]);
    return list.sort(sortEvents);
  }
  function monthPill(ev, extraClass, style) {
    return '<button type="button" class="fc4-event fc4-monthPill ' + owner(ev) + rosterClass(ev) + (extraClass ? ' ' + extraClass : '') + '" data-event="' + events.indexOf(ev) + '"' + (style ? ' style="' + style + '"' : '') + ' title="' + esc((ev.owner_label || 'Family') + ': ' + (ev.title || 'Untitled event') + ' | ' + when(ev)) + '"><span>' + esc(ev.title || 'Untitled event') + '</span></button>';
  }
  function eventButton(ev, longEvent) {
    var idx = events.indexOf(ev);
    return '<button type="button" class="fc4-event ' + owner(ev) + rosterClass(ev) + (longEvent ? ' fc4-long' : '') + '" data-event="' + idx + '" title="' + esc(ev.title) + '">' +
      '<span class="fc4-eventTop"><span class="fc4-time">' + esc(longEvent ? when(ev) : ev.all_day ? 'ALL DAY' : time(ev.start_at)) + '</span>' +
      '<span class="fc4-owner">' + esc(ev.owner_label || 'Family') + '</span></span>' +
      '<span class="fc4-eventTitle">' + esc(ev.title || 'Untitled event') + '</span><span class="fc4-chevron" aria-hidden="true">›</span></button>';
  }
  function wireEvents(parent) {
    var buttons = parent.querySelectorAll('[data-event]'), i;
    for (i = 0; i < buttons.length; i++) buttons[i].onclick = function () { var e = events[+this.getAttribute('data-event')]; if (e) showEvent(e); };
  }
  function showDialog(title, html) {
    returnFocus = document.activeElement;
    detail.innerHTML = '<div class="fc4-dialogCard"><div class="fc4-dialogTitle">' + esc(title) + '</div>' + html + '<button type="button" class="fc4-btn fc4-dialogClose">Close</button></div>';
    detail.style.display = 'flex';
    detail.setAttribute('aria-hidden', 'false');
    var close = detail.querySelector('.fc4-dialogClose');
    close.onclick = closeDialog; close.focus();
  }
  function closeDialog() { detail.style.display = 'none'; detail.setAttribute('aria-hidden', 'true'); if (returnFocus && document.documentElement.contains(returnFocus)) returnFocus.focus(); }
  function showEvent(ev) {
    showDialog(ev.title || 'Event details', '<div class="fc4-dialogOwner ' + owner(ev) + '">' + esc(ev.owner_label || 'Family') + '</div><p class="fc4-dialogWhen">' + esc(when(ev)) + '</p>' + (ev.location ? '<p class="fc4-dialogWhere">' + esc(ev.location) + '</p>' : ''));
  }
  function showEventList(title, list) { var html = '<div class="fc4-dialogList">', i; for (i = 0; i < list.length; i++) html += eventButton(list[i], true); html += '</div>'; showDialog(title, html); wireEvents(detail); }
  function render() {
    var bounds = monthBounds(month), all = events.slice().sort(sortEvents), now = key(today());
    var html = '<div class="fc4-monthBoard rows-' + bounds.rows + '"><div class="fc4-monthWeekdays">';
    var i, j, w, d, dk, from, to, ev, r, spans, chosen, occupied, a, z, list, hidden, maxShown, style;
    for (i = 0; i < 7; i++) html += '<span>' + ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i] + '</span>';
    html += '</div><div class="fc4-monthWeeks">';
    for (w = 0; w < bounds.rows; w++) {
      from = plus(bounds.start, w * 7); to = plus(from, 7); spans = []; chosen = []; occupied = -1;
      for (i = 0; i < all.length; i++) {
        ev = all[i];
        if (multi(ev) && overlaps(ev, key(from), key(to))) {
          r = range(ev);
          a = Math.max(0, Math.round((fromKey(r.start) - from) / 86400000));
          z = Math.min(7, Math.round((fromKey(r.end) - from) / 86400000));
          spans.push({ ev: ev, start: a, end: z, before: r.start < key(from), after: r.end > key(to) });
        }
      }
      spans.sort(function(a,b) { return a.start - b.start || b.end - a.end; });
      // One compact spanning lane. Additional overlaps remain in each day's popup.
      for (i = 0; i < spans.length; i++) if (spans[i].start >= occupied) { chosen.push(spans[i]); occupied = spans[i].end; }
      html += '<div class="fc4-monthWeek"><div class="fc4-monthCells">';
      for (j = 0; j < 7; j++) {
        d = plus(from, j); dk = key(d); list = []; hidden = 0;
        for (i = 0; i < all.length; i++) if (overlaps(all[i], dk, key(plus(d,1)))) {
          var alreadyShown = false, c;
          for (c = 0; c < chosen.length; c++) if (chosen[c].ev === all[i]) alreadyShown = true;
          if (!alreadyShown) list.push(all[i]);
        }
        maxShown = chosen.length ? 1 : 2;
        html += '<section class="fc4-monthCell' + (d.getUTCMonth() !== month.getUTCMonth() ? ' is-other' : '') + (dk === now ? ' is-today' : '') + '" data-date="' + dk + '">';
        html += '<button type="button" class="fc4-monthDate" data-month-day="' + dk + '" aria-label="View ' + dayName(d) + ' ' + dateLabel(d) + ' ' + d.getUTCFullYear() + '"' + (dk === now ? ' aria-current="date"' : '') + '><b>' + d.getUTCDate() + '</b>' + (d.getUTCDate() === 1 ? '<small>' + dateLabel(d).split(' ')[1] + '</small>' : '') + '</button>';
        html += '<div class="fc4-monthDayEvents"' + (chosen.length ? ' style="padding-top:18px"' : '') + '>';
        for (i = 0; i < list.length && i < maxShown; i++) html += monthPill(list[i], '', '');
        hidden = Math.max(0, list.length - maxShown);
        if (hidden) html += '<button type="button" class="fc4-monthMore" data-month-day="' + dk + '" aria-label="View all events for ' + dateLabel(d) + '">+' + hidden + ' more</button>';
        html += '</div></section>';
      }
      html += '</div>';
      if (chosen.length) {
        html += '<div class="fc4-monthLongLayer">';
        for (i = 0; i < chosen.length; i++) {
          a = chosen[i];
          style = 'left:calc(' + (a.start * 100 / 7).toFixed(5) + '% + 3px);width:calc(' + ((a.end - a.start) * 100 / 7).toFixed(5) + '% - 6px)';
          html += monthPill(a.ev, 'fc4-monthLong' + (a.before ? ' continues-before' : '') + (a.after ? ' continues-after' : ''), style);
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div><div class="fc4-monthHint">Tap a date for all events. Tap a card for details.</div></div>';
    content.innerHTML = html; wireEvents(content);
    var days = content.querySelectorAll('[data-month-day]');
    for (i = 0; i < days.length; i++) days[i].onclick = function() {
      var day = fromKey(this.getAttribute('data-month-day')), list = [], j;
      for (j = 0; j < all.length; j++) if (overlaps(all[j], key(day), key(plus(day,1)))) list.push(all[j]);
      if (list.length) showEventList(dayName(day) + ' ' + dateLabel(day), list);
      else showDialog(dayName(day) + ' ' + dateLabel(day), '<p class="fc4-dialogWhen">No synced events for this date.</p>');
    };
    var count = inMonth().length;
    byId('fc4Total').textContent = count + (count === 1 ? ' event this month' : ' events this month');
  }
  function showPin(error) {
    closeDialog(); detail.innerHTML = '';
    content.innerHTML = '<div class="fc4-lockWrap"><form class="fc4-pinBox" id="fc4PinForm"><div class="fc4-sectionTitle">PRIVATE FAMILY CALENDAR</div><h2>Welcome home.</h2><p>Enter your existing family PIN.</p><input id="fc4Pin" class="fc4-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" aria-label="Six digit family PIN"><button class="fc4-btn fc4-unlock" type="submit">Unlock calendar</button><div class="fc4-pinError" id="fc4PinError" role="status">' + esc(error || '') + '</div></form></div>';
    byId('fc4Total').textContent = 'Shaun / Mich / Family';
    setStatus('Calendar locked');
    byId('fc4PinForm').onsubmit = function (e) { e.preventDefault(); var p = byId('fc4Pin').value; if (!/^\d{6}$/.test(p)) { byId('fc4PinError').textContent = 'Enter the six digit PIN.'; return; } savePin(p); load(); };
  }
  function load(silent) {
    byId('fc4Range').textContent = monthLabel(month);
    if (!pin()) { if (!byId('fc4PinForm') || !silent) showPin(); return; }
    var id = ++requestId, targetMonth = key(month), bounds = monthBounds(month), p = pin();
    if (activeRequest) { try { activeRequest.abort(); } catch (e) {} }
    if (!silent) setStatus('Loading family calendar…');
    if (loadedMonth !== targetMonth) { content.innerHTML = '<div class="fc4-lockWrap">Loading month…</div>'; byId('fc4Total').textContent = ''; }
    var x = new XMLHttpRequest(), completed = false; activeRequest = x;
    function finish(error, data, code) {
      if (completed || id !== requestId) return;
      completed = true; activeRequest = null;
      if (error) {
        if (code === 401) { savePin(''); events = []; loadedMonth = ''; showPin('That PIN was not accepted.'); }
        else { if (loadedMonth !== targetMonth) content.innerHTML = '<div class="fc4-lockWrap"><div class="fc4-pinBox"><h2>Connection interrupted</h2><p>Your calendars have not been changed.</p><button type="button" class="fc4-btn" id="fc4Retry">Try again</button></div></div>'; setStatus('Offline. Retrying automatically.'); if (byId('fc4Retry')) byId('fc4Retry').onclick = function () { load(); }; }
        return;
      }
      events = data && Array.isArray(data.events) ? data.events : [];
      synced = data && data.synced_at; loadedMonth = targetMonth;
      render();
      setStatus(synced && isFinite(new Date(synced).getTime()) ? 'Calendar sync ' + dateLabel(shift(synced)) + ', ' + time(synced) : 'Connected. Google syncs hourly.');
    }
    try {
      x.open('GET', ENDPOINT + '?from=' + encodeURIComponent(key(bounds.start)) + '&to=' + encodeURIComponent(key(bounds.end)), true);
      x.timeout = 20000; x.setRequestHeader('x-family-pin', p);
      x.onreadystatechange = function () { if (x.readyState !== 4) return; var data = null; try { data = JSON.parse(x.responseText); } catch (e) {} finish(x.status < 200 || x.status >= 300 || !data, data, x.status); };
      x.ontimeout = x.onerror = function () { finish(true, null, 0); };
      x.send();
    } catch (e) { finish(true, null, 0); }
  }
  function navigate(n) { closeDialog(); month = n === 0 ? firstMonth(today()) : firstMonth(month, n); load(); }
  function open() { root.style.display = 'flex'; root.setAttribute('aria-hidden','false'); load(); }
  function close() { closeDialog(); root.style.display = 'none'; root.setAttribute('aria-hidden','true'); var b = byId('familyCalendarLaunch'); if (b) b.focus(); }
  function init() {
    standalone = !!byId('calendarStandalone'); month = firstMonth(today());
    if (standalone) { root = byId('calendarStandalone'); root.className = 'fc4-standalone'; document.body.className = 'fc4-standaloneBody'; }
    else {
      var app = document.querySelector('.app'), right = document.querySelector('.topRight'), gear = byId('settings');
      if (!app || !right) return;
      var launch = byId('familyCalendarLaunch');
      if (!launch) { launch = document.createElement('button'); launch.id = 'familyCalendarLaunch'; launch.className = 'familyCalendarLaunch'; launch.type = 'button'; launch.setAttribute('aria-label','Family Calendar'); launch.innerHTML = calendarIcon(); if (gear) right.insertBefore(launch, gear); else right.appendChild(launch); }
      launch.onclick = open;
      root = document.createElement('div'); root.className = 'fc4-overlay'; root.id = 'fc4Overlay'; root.setAttribute('aria-hidden','true'); app.appendChild(root);
    }
    root.innerHTML = '<div class="fc4-panel" data-version="foundry-4"><header class="fc4-head"><div class="fc4-sign"><div class="fc4-kicker">THE FAMILY / MONTHLY PLANNER</div><h1>Family Calendar</h1><div class="fc4-sub">Good plans. More family time.</div></div><button type="button" class="fc4-close" id="fc4Close" aria-label="' + (standalone ? 'Lock calendar' : 'Close calendar') + '">' + (standalone ? 'Lock' : '×') + '</button><div class="fc4-headArt" aria-hidden="true"></div></header><nav class="fc4-controls" aria-label="Calendar month"><div class="fc4-nav"><button type="button" class="fc4-btn" id="fc4Prev" aria-label="Previous month">‹</button><button type="button" class="fc4-btn fc4-todayBtn" id="fc4Today">Today</button><button type="button" class="fc4-btn" id="fc4Next" aria-label="Next month">›</button></div><div class="fc4-range" id="fc4Range"></div></nav><div class="fc4-legend"><span><i class="shaun"></i>Shaun</span><span><i class="mich"></i>Mich</span><span><i class="family"></i>Family</span><span class="fc4-total" id="fc4Total"></span></div><main class="fc4-content fc4-monthContent" id="fc4Content"></main><footer class="fc4-footer"><div class="fc4-footArt" aria-hidden="true"></div><div class="fc4-bottom"><span class="fc4-status" id="fc4Status" role="status"></span><span class="fc4-version">FOUNDRY 4 · MONTH</span></div></footer><div class="fc4-detail" id="fc4Detail" role="dialog" aria-modal="true" aria-label="Calendar details" aria-hidden="true"></div></div>';
    panel = root.querySelector('.fc4-panel'); content = byId('fc4Content'); detail = byId('fc4Detail'); status = byId('fc4Status');
    byId('fc4Prev').onclick = function () { navigate(-1); }; byId('fc4Next').onclick = function () { navigate(1); }; byId('fc4Today').onclick = function () { navigate(0); };
    byId('fc4Close').onclick = standalone ? function () { requestId++; if (activeRequest) activeRequest.abort(); savePin(''); events = []; loadedMonth = ''; closeDialog(); showPin(); } : close;
    detail.onclick = function (e) { if (e.target === detail) closeDialog(); };
    document.addEventListener('keydown', function (e) { if (e.keyCode === 27) { if (detail.style.display === 'flex') closeDialog(); else if (!standalone) close(); } });
    if (standalone) load();
    setInterval(function () { if (pin() && (standalone || root.style.display === 'flex') && detail.style.display !== 'flex') load(true); }, 300000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
