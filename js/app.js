let athletes = [];
let meets = [];
let progressionChart = null;
let selectedGroup = "";
let meetCourseFilter = "";
let statsCourse = "SCM";
let statsGender = "";

const SQUAD_ORDER  = ["SEN", "TRN", "JUN", "DEV", "ENT"];
const COURSE_ORDER = ["SCM", "LCM", "Yards"];
const STROKE_ORDER = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];
const STROKE_BADGES = { Freestyle: "badge-scm", Backstroke: "badge-lcm", Breaststroke: "badge-yards", Butterfly: "badge-other", IM: "badge-neutral" };
const STATS_MIN_ATHLETES = 5;

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadData() {
  try {
    const [athleteData, meetData, updatedData] = await Promise.all([
      fetch("data/athletes.json").then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("data/meets.json").then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("data/last_updated.json").then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    athletes = athleteData;
    meets = meetData;

    if (updatedData?.utc) {
      const d = new Date(updatedData.utc);
      document.getElementById("last-updated").textContent =
        "Last updated: " +
        d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) +
        " at " +
        d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) +
        " UTC";
    }

    renderSquadCards();
    renderSwimmers();
    renderMeets();
    renderStats();
    navigate(location.hash || "#home");
  } catch {
    document.getElementById("tab-home").insertAdjacentHTML(
      "beforeend",
      '<p class="error-msg">Data not yet available — the first data refresh hasn\'t run yet. ' +
      "Go to the Actions tab in GitHub and click \"Run workflow\" to populate it now.</p>"
    );
  }
}

// ── Tab navigation ────────────────────────────────────────────────────────────

function switchTab(name, push = true) {
  if (push) history.pushState(null, "", "#" + name);
  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === name)
  );
  document.querySelectorAll(".tab-panel").forEach(panel =>
    panel.classList.toggle("active", panel.id === "tab-" + name)
  );
}

document.querySelectorAll(".tab-btn").forEach(btn =>
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
    if (btn.dataset.tab === "swimmers") {
      selectedGroup = "";
      document.getElementById("search-input").value = "";
      renderSquadCards();
      renderSwimmers();
      showSwimmersList(false);
    }
    if (btn.dataset.tab === "meets") {
      meetCourseFilter = "";
      renderMeets();
      showMeetsList(false);
    }
    if (btn.dataset.tab === "stats") renderStats();
  })
);

// ── Swimmers ──────────────────────────────────────────────────────────────────

function renderSquadCards() {
  const container = document.getElementById("squad-filter-cards");
  if (!container) return;
  const groups = SQUAD_ORDER.filter(g => athletes.some(a => a.group === g));
  container.innerHTML = ["", ...groups].map(g => {
    const isAll = g === "";
    const pool = isAll ? athletes : athletes.filter(a => a.group === g);
    const m = pool.filter(a => a.gender === "M").length;
    const f = pool.filter(a => a.gender === "F").length;
    const active = selectedGroup === g ? " active" : "";
    const label = isAll ? "All" : squadLabel(g).replace(" Squad", "");
    return (
      '<button class="squad-card' + active + '" onclick="selectSquad(\'' + g + '\')" aria-pressed="' + (selectedGroup === g) + '">' +
        '<span class="squad-card-name">' + esc(label) + "</span>" +
        '<span class="squad-card-count">' + pool.length + "</span>" +
        '<div class="squad-gender-chips">' +
          '<span class="squad-chip squad-chip--m">M&nbsp;' + m + "</span>" +
          '<span class="squad-chip squad-chip--f">F&nbsp;' + f + "</span>" +
        "</div>" +
      "</button>"
    );
  }).join("");
}

function selectSquad(group) {
  selectedGroup = group;
  renderSquadCards();
  renderSwimmers();
}

function filteredAthletes() {
  const query = document.getElementById("search-input").value.trim().toLowerCase();
  return athletes
    .filter(a => {
      const name = (a.first + " " + a.last).toLowerCase();
      return (!query || name.includes(query)) && (!selectedGroup || a.group === selectedGroup);
    })
    .sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
}

function renderSwimmers() {
  const list = filteredAthletes();
  document.getElementById("swimmers-count").textContent =
    list.length + " swimmer" + (list.length !== 1 ? "s" : "");

  const container = document.getElementById("swimmers-list");
  if (!list.length) {
    container.innerHTML = '<p class="no-pbs">No swimmers match your search.</p>';
    return;
  }
  container.innerHTML = list.map(a => {
    const meta = [squadLabel(a.group), a.subgroup, genderLabel(a.gender)].filter(Boolean).join(" · ");
    return (
      '<button class="swimmer-item" onclick="showSwimmer(' + a.id + ')">' +
        "<div>" +
          '<div class="swimmer-name">' + esc(a.first + " " + a.last) + "</div>" +
          '<div class="swimmer-meta">' + esc(meta) + "</div>" +
        "</div>" +
        '<span class="swimmer-arrow" aria-hidden="true">&#8250;</span>' +
      "</button>"
    );
  }).join("");
}

let debounce;
document.getElementById("search-input").addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(renderSwimmers, 180);
});

function showSwimmersList(push = true) {
  if (push) history.pushState(null, "", "#swimmers");
  document.getElementById("swimmers-list-view").classList.remove("hidden");
  document.getElementById("swimmer-detail-view").classList.add("hidden");
}

function showSwimmer(id, push = true) {
  const ath = athletes.find(a => a.id === id);
  if (!ath) return;
  if (push) history.pushState(null, "", "#swimmer-" + id);

  const scm   = ath.pbs.filter(p => p.course === "SCM");
  const lcm   = ath.pbs.filter(p => p.course === "LCM");
  const other = ath.pbs.filter(p => p.course !== "SCM" && p.course !== "LCM");
  const meta  = [squadLabel(ath.group), ath.subgroup, genderLabel(ath.gender)].filter(Boolean).join(" · ");

  document.getElementById("swimmer-detail").innerHTML =
    '<div class="detail-header">' +
      '<div class="detail-name">' + esc(ath.first + " " + ath.last) + "</div>" +
      '<div class="detail-meta">' + esc(meta) + "</div>" +
      '<div id="detail-dates" class="detail-dates"></div>' +
      '<div class="detail-stats" id="detail-stats"></div>' +
    "</div>" +
    (scm.length || lcm.length || other.length
      ? pbSection(scm, "SCM", "badge-scm") +
        pbSection(lcm, "LCM", "badge-lcm") +
        (other.length ? pbSection(other, other[0].course, "badge-other") : "")
      : '<p class="no-pbs">No personal best times recorded yet.</p>') +
    '<div id="progression-section" class="progression-wrap">' +
      '<div class="progression-header">' +
        '<h3 class="progression-title">Time Progression</h3>' +
        '<div class="progression-controls">' +
          '<select id="progression-event" class="progression-select"></select>' +
          '<div class="chart-toggles">' +
            '<button class="course-label badge-scm chart-toggle" id="toggle-scm" onclick="toggleCourse(0,this)">SCM</button>' +
            '<button class="course-label badge-lcm chart-toggle" id="toggle-lcm" onclick="toggleCourse(1,this)">LCM</button>' +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="chart-wrap"><canvas id="progression-canvas"></canvas></div>' +
      '<p class="chart-note">★ personal best at the time of the swim</p>' +
    "</div>";

  document.getElementById("swimmers-list-view").classList.add("hidden");
  document.getElementById("swimmer-detail-view").classList.remove("hidden");
  window.scrollTo(0, 0);

  loadProgressionSection(ath);
}

function pbSection(pbs, label, badgeClass) {
  if (!pbs.length) return "";
  const rows = pbs
    .slice()
    .sort((a, b) => a.event.localeCompare(b.event))
    .map(p =>
      "<tr>" +
        "<td>" + esc(p.event) + "</td>" +
        '<td class="pb-time">' + esc(p.time) + "</td>" +
        "<td>" + esc(formatDate(p.date)) + "</td>" +
        "<td>" + esc(p.meet) + "</td>" +
      "</tr>"
    ).join("");
  return (
    '<details class="course-section" open>' +
      '<summary class="course-label ' + badgeClass + '">' + label + "</summary>" +
      '<table class="pb-table">' +
        "<thead><tr><th>Event</th><th>Time</th><th>Date</th><th>Meet</th></tr></thead>" +
        "<tbody>" + rows + "</tbody>" +
      "</table>" +
    "</details>"
  );
}

// ── Meets ─────────────────────────────────────────────────────────────────────

function selectMeetCourse(course) {
  meetCourseFilter = course;
  renderMeets();
}

function renderMeets() {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [...meets].filter(m => m.date > today).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const allPast  = [...meets].filter(m => m.date <= today).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const upcomingSection = document.getElementById("upcoming-meets-section");
  const upcomingList    = document.getElementById("upcoming-meets-list");
  const filterEl        = document.getElementById("meet-course-filter");
  const pastList        = document.getElementById("meets-list");

  if (upcomingSection) upcomingSection.classList.toggle("hidden", upcoming.length === 0);

  // Course filter buttons — only show if more than one course type exists
  if (filterEl) {
    const courses = COURSE_ORDER.filter(c => allPast.some(m => m.course === c));
    const extras  = [...new Set(allPast.map(m => m.course))].filter(c => !COURSE_ORDER.includes(c));
    const all = [...courses, ...extras];
    if (all.length > 1) {
      filterEl.innerHTML = ["", ...all].map(c => {
        const isAll   = c === "";
        const active  = meetCourseFilter === c;
        const badge   = isAll ? "badge-neutral" : courseBadge(c).cls;
        const label   = isAll ? "All" : c;
        return (
          '<button class="course-label ' + badge + ' chart-toggle' + (active ? "" : " inactive") + '" onclick="selectMeetCourse(\'' + c + '\')">' +
            label +
          "</button>"
        );
      }).join("");
    } else {
      filterEl.innerHTML = "";
    }
  }

  if (upcomingList) {
    upcomingList.innerHTML = upcoming.map(m => {
      const badge = courseBadge(m.course);
      return (
        '<div class="meet-item meet-item--upcoming">' +
          "<div>" +
            '<div class="meet-name">' + esc(m.name) + "</div>" +
            '<div class="meet-date">' + esc(formatDate(m.date)) + "</div>" +
          "</div>" +
          '<div class="meet-item-right">' +
            '<span class="meet-badge ' + badge.cls + '">' + badge.label + "</span>" +
            '<span class="meet-badge meet-badge--upcoming">Upcoming</span>' +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  const past = meetCourseFilter ? allPast.filter(m => m.course === meetCourseFilter) : allPast;

  if (!past.length) {
    pastList.innerHTML = '<p class="no-pbs">No meets available yet.</p>';
    return;
  }
  pastList.innerHTML = past.map(m => {
    const badge = courseBadge(m.course);
    return (
      '<button class="meet-item" onclick="showMeet(' + m.id + ')">' +
        "<div>" +
          '<div class="meet-name">' + esc(m.name) + "</div>" +
          '<div class="meet-date">' + esc(formatDate(m.date)) + "</div>" +
        "</div>" +
        '<div class="meet-item-right">' +
          '<span class="meet-badge ' + badge.cls + '">' + badge.label + "</span>" +
          '<span class="meet-arrow" aria-hidden="true">&#8250;</span>' +
        "</div>" +
      "</button>"
    );
  }).join("");
}

function showMeetsList(push = true) {
  if (push) history.pushState(null, "", "#meets");
  document.getElementById("meets-list-view").classList.remove("hidden");
  document.getElementById("meet-detail-view").classList.add("hidden");
}

async function showMeet(id, push = true) {
  const meet = meets.find(m => m.id === id);
  if (!meet) return;
  if (push) history.pushState(null, "", "#meet-" + id);

  const badge = courseBadge(meet.course);
  const detailEl = document.getElementById("meet-detail");

  detailEl.innerHTML =
    '<div class="detail-header">' +
      '<div class="detail-name">' + esc(meet.name) + "</div>" +
      '<div class="detail-meta">' +
        esc(formatDate(meet.date)) +
        ' &middot; <span class="course-label ' + badge.cls + '">' + badge.label + "</span>" +
      "</div>" +
    "</div>" +
    '<p class="loading">Loading results…</p>';

  document.getElementById("meets-list-view").classList.add("hidden");
  document.getElementById("meet-detail-view").classList.remove("hidden");
  window.scrollTo(0, 0);

  let results = [];
  try {
    const r = await fetch("data/meet_results/" + id + ".json");
    if (r.ok) results = await r.json();
  } catch { /* file not yet generated */ }

  if (!results.length) {
    detailEl.querySelector(".loading").outerHTML =
      '<p class="no-pbs">No results available for this meet yet — re-run the data refresh.</p>';
    return;
  }

  const byEvent = {};
  results.forEach(row => {
    (byEvent[row.event] = byEvent[row.event] || []).push(row);
  });

  const eventSections = Object.keys(byEvent).sort().map(event => {
    const rows = byEvent[event]
      .sort((a, b) => {
        const ta = timeToSeconds(a.time);
        const tb = timeToSeconds(b.time);
        return (ta !== null ? ta : Infinity) - (tb !== null ? tb : Infinity);
      })
      .map(row =>
        "<tr>" +
          "<td>" + esc(row.first + " " + row.last) + "</td>" +
          '<td class="pb-time">' + esc(row.time) + "</td>" +
          "<td>" + esc(row.place) + "</td>" +
        "</tr>"
      ).join("");
    return (
      '<div class="course-section">' +
        '<span class="course-label badge-scm">' + esc(event) + "</span>" +
        '<table class="pb-table">' +
          "<thead><tr><th>Swimmer</th><th>Time</th><th>Place</th></tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>" +
      "</div>"
    );
  }).join("");

  detailEl.innerHTML =
    '<div class="detail-header">' +
      '<div class="detail-name">' + esc(meet.name) + "</div>" +
      '<div class="detail-meta">' +
        esc(formatDate(meet.date)) +
        ' &middot; <span class="course-label ' + badge.cls + '">' + badge.label + "</span>" +
      "</div>" +
    "</div>" +
    '<p class="results-count">' + results.length + " result" + (results.length !== 1 ? "s" : "") + " across " + Object.keys(byEvent).length + " events</p>" +
    eventSections;
}

// ── Progression chart ─────────────────────────────────────────────────────────

function timeToSeconds(t) {
  if (!t || /^(DQ|NS|NT|SCR|DNF|DNS)$/i.test(t.trim())) return null;
  const parts = t.trim().split(":");
  return parts.length === 2
    ? parseFloat(parts[0]) * 60 + parseFloat(parts[1])
    : parseFloat(parts[0]);
}

function secondsToTime(s) {
  if (s === null || isNaN(s)) return "";
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2).padStart(5, "0");
    return m + ":" + sec;
  }
  return s.toFixed(2);
}

function drawProgressionChart(history, event) {
  const toTs = d => new Date(d + "T00:00:00").getTime();

  const PB_COLOR = "#f59e0b";

  const makeDataset = (course, color) => {
    const rows = history
      .filter(r => r.event === event && r.course === course && timeToSeconds(r.time) !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    let best = Infinity;
    const data = rows.map(r => {
      const secs = timeToSeconds(r.time);
      const pb = secs < best;
      if (pb) best = secs;
      return { x: toTs(r.date), y: secs, meet: r.meet, date: r.date, pb };
    });

    return {
      rows,
      dataset: {
        label: course,
        data,
        borderColor: color,
        backgroundColor: color.replace(")", ",0.08)").replace("rgb", "rgba"),
        pointStyle:           data.map(p => p.pb ? "star" : "circle"),
        pointRadius:          data.map(p => p.pb ? 9 : 4),
        pointHoverRadius:     data.map(p => p.pb ? 11 : 6),
        pointBackgroundColor: data.map(p => p.pb ? PB_COLOR : color),
        pointBorderColor:     data.map(p => p.pb ? "#d97706" : color),
        tension: 0.2,
        fill: false,
      }
    };
  };

  const scm = makeDataset("SCM", "#0369a1");
  const lcm = makeDataset("LCM", "#166534");

  const scmToggle = document.getElementById("toggle-scm");
  const lcmToggle = document.getElementById("toggle-lcm");
  if (scmToggle) { scmToggle.style.display = scm.rows.length ? "" : "none"; scmToggle.classList.remove("inactive"); }
  if (lcmToggle) { lcmToggle.style.display = lcm.rows.length ? "" : "none"; lcmToggle.classList.remove("inactive"); }

  if (progressionChart) progressionChart.destroy();
  const canvas = document.getElementById("progression-canvas");
  if (!canvas) return;

  progressionChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { datasets: [scm.dataset, lcm.dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => formatDate(ctx[0].raw.date),
            label: ctx => ctx.dataset.label + ": " + secondsToTime(ctx.raw.y) + "  —  " + ctx.raw.meet + (ctx.raw.pb ? "  ★ PB" : ""),
          }
        }
      },
      scales: {
        x: {
          type: "linear",
          ticks: {
            callback: v => new Date(v).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
            maxTicksLimit: 8,
          }
        },
        y: {
          ticks: { callback: v => secondsToTime(v) },
          title: { display: true, text: "Time" },
        }
      }
    }
  });
}

function toggleCourse(datasetIdx, btn) {
  if (!progressionChart) return;
  const visible = progressionChart.isDatasetVisible(datasetIdx);
  progressionChart.setDatasetVisibility(datasetIdx, !visible);
  progressionChart.update();
  btn.classList.toggle("inactive", visible);
}

async function loadProgressionSection(ath) {
  const section = document.getElementById("progression-section");
  if (!section) return;

  let history;
  try {
    const r = await fetch("data/athlete_results/" + ath.id + ".json");
    if (!r.ok) throw new Error();
    history = await r.json();
  } catch {
    section.remove();
    return;
  }

  const validRaces = history.filter(r => timeToSeconds(r.time) !== null);

  const raceDates = history.map(r => r.date).filter(Boolean).sort();
  const datesEl = document.getElementById("detail-dates");
  if (datesEl && raceDates.length) {
    const first = formatDate(raceDates[0]);
    const last  = formatDate(raceDates[raceDates.length - 1]);
    datesEl.textContent = first === last
      ? "Competed: " + first
      : "Competed: " + first + " – " + last;
  }

  const meetMap = {};
  history.forEach(r => { if (!meetMap[r.meet_id]) meetMap[r.meet_id] = { name: r.meet, course: r.course }; });
  const uniqueMeets = Object.values(meetMap);
  const isTimeTrial = m => /time trial/i.test(m.name);
  const totalMeets = uniqueMeets.length;
  const timeTrials = uniqueMeets.filter(m => isTimeTrial(m)).length;
  const scmMeets   = uniqueMeets.filter(m => !isTimeTrial(m) && m.course === "SCM").length;
  const lcmMeets   = uniqueMeets.filter(m => !isTimeTrial(m) && m.course === "LCM").length;

  const strokeCounts = {};
  validRaces.forEach(r => {
    const stroke = r.event.split(" ").pop();
    strokeCounts[stroke] = (strokeCounts[stroke] || 0) + 1;
  });
  const strokeOrder = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];
  const statsEl = document.getElementById("detail-stats");
  if (statsEl) {
    const renderItems = items =>
      items.map(s =>
        '<div class="stat-item">' +
          '<span class="stat-value">' + s.value + "</span>" +
          '<span class="stat-label">' + s.label + "</span>" +
        "</div>"
      ).join("");

    const competitionStats = [
      { value: totalMeets, label: "Total" },
      { value: timeTrials, label: "Time Trials" },
      { value: scmMeets,   label: "SCM" },
      { value: lcmMeets,   label: "LCM" },
    ];
    const strokeStats = [
      { value: validRaces.length, label: "Total" },
      ...strokeOrder.filter(s => strokeCounts[s]).map(s => ({ value: strokeCounts[s], label: s })),
    ];

    statsEl.innerHTML =
      '<div class="stats-group">' +
        '<span class="stats-group-label">Competitions</span>' +
        '<div class="stats-items">' + renderItems(competitionStats) + "</div>" +
      "</div>" +
      '<div class="stats-group">' +
        '<span class="stats-group-label">Strokes</span>' +
        '<div class="stats-items">' + renderItems(strokeStats) + "</div>" +
      "</div>";
  }

  const events = [...new Set(validRaces.map(r => r.event))].sort();

  if (!events.length) { section.remove(); return; }

  const select = document.getElementById("progression-event");
  events.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e;
    select.appendChild(opt);
  });

  drawProgressionChart(history, events[0]);
  select.addEventListener("change", () => drawProgressionChart(history, select.value));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(str) {
  if (!str) return "";
  const d = str.includes("/")
    ? new Date(str)
    : new Date(str + "T00:00:00");
  if (isNaN(d)) return str;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function squadLabel(g) {
  const labels = { SEN: "Senior", TRN: "Transition", JUN: "Junior", DEV: "Development", ENT: "Entry" };
  return (labels[g] ? labels[g] + " Squad" : g) || "";
}

function genderLabel(g) {
  if (g === "M") return "Male";
  if (g === "F") return "Female";
  return g || "";
}

function courseBadge(course) {
  if (course === "SCM")   return { cls: "badge-scm",   label: "SCM" };
  if (course === "LCM")   return { cls: "badge-lcm",   label: "LCM" };
  if (course === "Yards") return { cls: "badge-yards", label: "Yards" };
  return { cls: "badge-other", label: course || "?" };
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function goToSwimmer(id) {
  switchTab("swimmers", false);
  showSwimmer(id);
}

function selectStatsCourse(c) { statsCourse = c; renderStats(); }
function selectStatsGender(g) { statsGender = g; renderStats(); }

function renderStats() {
  const pool = statsGender ? athletes.filter(a => a.gender === statsGender) : athletes;

  // Filter toggles
  const courseEl = document.getElementById("stats-course-filter");
  if (courseEl) {
    courseEl.innerHTML = ["SCM", "LCM"].map(c => {
      const badge = courseBadge(c).cls;
      return '<button class="course-label ' + badge + ' chart-toggle' + (statsCourse === c ? "" : " inactive") + '" onclick="selectStatsCourse(\'' + c + '\')">' + c + "</button>";
    }).join("");
  }

  const genderEl = document.getElementById("stats-gender-filter");
  if (genderEl) {
    genderEl.innerHTML = [["", "All"], ["M", "Male"], ["F", "Female"]].map(([val, label]) =>
      '<button class="course-label badge-neutral chart-toggle' + (statsGender === val ? "" : " inactive") + '" onclick="selectStatsGender(\'' + val + '\')">' + label + "</button>"
    ).join("");
  }

  // Date range for current course + gender filter
  const dateRangeEl = document.getElementById("stats-date-range");
  if (dateRangeEl) {
    const dates = pool.flatMap(a =>
      (a.pbs || []).filter(pb => pb.course === statsCourse && pb.date).map(pb => pb.date)
    ).sort();
    if (dates.length) {
      const first = formatDate(dates[0]);
      const last  = formatDate(dates[dates.length - 1]);
      dateRangeEl.textContent = "Personal bests: " + (first === last ? first : first + " – " + last);
    } else {
      dateRangeEl.textContent = "";
    }
  }

  // Build event map: event → [{seconds, time, athlete}]
  const eventMap = {};
  pool.forEach(ath => {
    (ath.pbs || []).forEach(pb => {
      if (pb.course !== statsCourse) return;
      const secs = timeToSeconds(pb.time);
      if (secs === null) return;
      if (!eventMap[pb.event]) eventMap[pb.event] = [];
      eventMap[pb.event].push({ seconds: secs, time: pb.time, athlete: ath });
    });
  });
  Object.keys(eventMap).forEach(e => { if (eventMap[e].length < STATS_MIN_ATHLETES) delete eventMap[e]; });

  // Compute per-event stats
  const eventStats = {};
  Object.keys(eventMap).forEach(event => {
    const entries = eventMap[event].slice().sort((a, b) => a.seconds - b.seconds);
    const times   = entries.map(e => e.seconds);
    const avg     = times.reduce((s, t) => s + t, 0) / times.length;
    eventStats[event] = {
      fastest:    entries[0].time,
      fastestAth: entries[0].athlete,
      avgSeconds: avg,
      avg:        secondsToTime(avg),
      count:      times.length,
      fasterCount: times.filter(t => t < avg).length,
    };
  });

  // Overview chips
  const overviewEl = document.getElementById("stats-overview");
  if (overviewEl) {
    const items = [
      { value: pool.length,                                    label: "Swimmers" },
      { value: pool.filter(a => a.gender === "M").length,     label: "Male" },
      { value: pool.filter(a => a.gender === "F").length,     label: "Female" },
      { value: Object.keys(eventStats).length,                label: "Events" },
    ];
    overviewEl.innerHTML = items.map(s =>
      '<div class="stat-item">' +
        '<span class="stat-value">' + s.value + "</span>" +
        '<span class="stat-label">' + s.label + "</span>" +
      "</div>"
    ).join("");
  }

  // Event stats table grouped by stroke
  const eventsEl = document.getElementById("stats-events");
  if (eventsEl) {
    const eventKeys = Object.keys(eventStats);
    if (!eventKeys.length) {
      eventsEl.innerHTML = '<p class="no-pbs">No events with ' + STATS_MIN_ATHLETES + '+ athletes for ' + statsCourse + (statsGender ? " · " + genderLabel(statsGender) : "") + ".</p>";
    } else {
      const byStroke = {};
      eventKeys.forEach(event => {
        const stroke = event.replace(/^\d+\s+/, "");
        (byStroke[stroke] = byStroke[stroke] || []).push(event);
      });
      Object.keys(byStroke).forEach(s => byStroke[s].sort((a, b) => parseInt(a) - parseInt(b)));
      const orderedStrokes = [
        ...STROKE_ORDER.filter(s => byStroke[s]),
        ...Object.keys(byStroke).filter(s => !STROKE_ORDER.includes(s)),
      ];
      eventsEl.innerHTML = orderedStrokes.map(stroke => {
        const badge = STROKE_BADGES[stroke] || "badge-neutral";
        const rows = byStroke[stroke].map(event => {
          const s = eventStats[event];
          const pct = Math.round(s.fasterCount / s.count * 100);
          return "<tr>" +
            "<td>" + esc(event) + "</td>" +
            '<td class="pb-time">' + esc(s.fastest) + "</td>" +
            '<td><button class="link-btn" onclick="goToSwimmer(' + s.fastestAth.id + ')">' + esc(s.fastestAth.first + " " + s.fastestAth.last) + "</button></td>" +
            '<td class="pb-time">' + esc(s.avg) + "</td>" +
            "<td>" + s.count + "</td>" +
            '<td class="faster-pct">' + s.fasterCount + " (" + pct + "%)</td>" +
          "</tr>";
        }).join("");
        return '<details class="course-section" open>' +
          '<summary class="course-label ' + badge + '">' + stroke + "</summary>" +
          '<div style="overflow-x:auto">' +
          '<table class="pb-table">' +
            "<thead><tr><th>Event</th><th>Fastest</th><th>Held by</th><th>Average</th><th>Swimmers</th><th>Faster than avg</th></tr></thead>" +
            "<tbody>" + rows + "</tbody>" +
          "</table>" +
          "</div>" +
        "</details>";
      }).join("");
    }
  }

  // Squad vs club average comparison
  const squadEl = document.getElementById("stats-squad-comparison");
  if (!squadEl) return;

  const squads = SQUAD_ORDER.filter(g => pool.some(a => a.group === g));
  const activeStrokes = STROKE_ORDER.filter(s =>
    Object.keys(eventStats).some(e => e.replace(/^\d+\s+/, "") === s)
  );

  if (squads.length < 2 || !activeStrokes.length) { squadEl.innerHTML = ""; return; }

  const strokeEvents = {};
  activeStrokes.forEach(stroke => {
    strokeEvents[stroke] = Object.keys(eventStats).filter(e => e.replace(/^\d+\s+/, "") === stroke);
  });

  const headerCells = activeStrokes.map(s => "<th>" + esc(s) + "</th>").join("");
  const bodyRows = squads.map(squad => {
    const squadPool = pool.filter(a => a.group === squad);
    const cells = activeStrokes.map(stroke => {
      const events = strokeEvents[stroke];
      let faster = 0, total = 0;
      squadPool.forEach(ath => {
        const pbs = (ath.pbs || []).filter(pb => pb.course === statsCourse && events.includes(pb.event) && timeToSeconds(pb.time) !== null);
        if (!pbs.length) return;
        total++;
        if (pbs.some(pb => timeToSeconds(pb.time) < eventStats[pb.event].avgSeconds)) faster++;
      });
      if (total < 2) return '<td class="cell-empty">—</td>';
      const pct = faster / total;
      const cls = pct >= 0.6 ? "cell-green" : pct >= 0.4 ? "cell-amber" : "cell-red";
      return '<td class="' + cls + '">' + faster + "/" + total + "</td>";
    }).join("");
    return "<tr><td>" + esc(squadLabel(squad).replace(" Squad", "")) + "</td>" + cells + "</tr>";
  }).join("");

  squadEl.innerHTML =
    '<h3 class="progression-title" style="margin:1.5rem 0 .35rem">Squad vs Club Average</h3>' +
    '<p class="chart-note" style="text-align:left;margin-bottom:.6rem">Swimmers with a PB faster than the club average · ' + statsCourse + (statsGender ? " · " + genderLabel(statsGender) : "") + "</p>" +
    '<div style="overflow-x:auto">' +
      '<table class="squad-comparison-grid">' +
        "<thead><tr><th>Squad</th>" + headerCells + "</tr></thead>" +
        "<tbody>" + bodyRows + "</tbody>" +
      "</table>" +
    "</div>";
}

// ── Routing ───────────────────────────────────────────────────────────────────

function navigate(hash) {
  const h = (hash || "").replace(/^#/, "");
  if (!h || h === "home") {
    switchTab("home", false);
  } else if (h === "swimmers") {
    switchTab("swimmers", false);
    showSwimmersList(false);
  } else if (h.startsWith("swimmer-")) {
    const id = parseInt(h.slice(8), 10);
    switchTab("swimmers", false);
    showSwimmer(id, false);
  } else if (h === "meets") {
    switchTab("meets", false);
    showMeetsList(false);
  } else if (h === "stats") {
    switchTab("stats", false);
  } else if (h.startsWith("meet-")) {
    const id = parseInt(h.slice(5), 10);
    switchTab("meets", false);
    showMeet(id, false);
  } else {
    switchTab("home", false);
  }
}

window.addEventListener("popstate", () => navigate(location.hash));

// ── Boot ──────────────────────────────────────────────────────────────────────

loadData();
