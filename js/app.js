let athletes = [];
let meets = [];
let progressionChart = null;
let selectedGroup = "";
let meetCourseFilter = "";
let statsCourse = "SCM";
let statsGender = "";
let rankingsCourse = "SCM";
let rankingsGender = "";
let rankings = {};

const SQUAD_ORDER  = ["SEN", "TRN", "JUN", "DEV", "ENT"];
const COURSE_ORDER = ["SCM", "LCM", "Yards"];
const STROKE_ORDER = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];
const STROKE_BADGES = { Freestyle: "badge-scm", Backstroke: "badge-lcm", Breaststroke: "badge-yards", Butterfly: "badge-other", IM: "badge-neutral" };
const STATS_MIN_ATHLETES = 5;
const AGE_GROUPS = [
  { label: "10 & Under", min: 0,        max: 10       },
  { label: "11–12",      min: 11,       max: 12       },
  { label: "13–14",      min: 13,       max: 14       },
  { label: "15 & Over",  min: 15,       max: Infinity },
];

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadData() {
  try {
    const [athleteData, meetData, updatedData, meetFlags] = await Promise.all([
      fetch("data/athletes.json").then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("data/meets.json").then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("data/last_updated.json").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("data/meet_flags.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]);

    athletes = athleteData;
    meets = meetData.map(m => ({ ...m, ...(meetFlags[m.id] || {}) }));

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
    buildRankings();
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

function openSwimmersTab() {
  switchTab("swimmers");
  selectedGroup = "";
  document.getElementById("search-input").value = "";
  renderSquadCards();
  renderSwimmers();
  showSwimmersList(false);
}

function openMeetsTab() {
  switchTab("meets");
  meetCourseFilter = "";
  renderMeets();
  showMeetsList(false);
}

function openStatsTab() {
  switchTab("stats");
  renderStats();
}

document.querySelectorAll(".tab-btn").forEach(btn =>
  btn.addEventListener("click", () => {
    if (btn.dataset.tab === "swimmers")  openSwimmersTab();
    else if (btn.dataset.tab === "meets")    openMeetsTab();
    else if (btn.dataset.tab === "stats")    openStatsTab();
    else if (btn.dataset.tab === "rankings") openRankingsTab();
    else if (btn.dataset.tab === "compare")  openCompareTab();
    else switchTab(btn.dataset.tab);
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
  const headingEl = document.getElementById("swimmers-heading");
  if (headingEl) {
    headingEl.textContent = selectedGroup
      ? squadLabel(selectedGroup).replace(" Squad", "")
      : "All";
  }
  document.getElementById("swimmers-count").textContent =
    list.length + " swimmer" + (list.length !== 1 ? "s" : "");

  const container = document.getElementById("swimmers-list");
  if (!list.length) {
    container.innerHTML = '<p class="no-pbs">No swimmers match your search.</p>';
    return;
  }
  container.innerHTML = list.map(a => {
    const meta = [squadLabel(a.group), a.subgroup, genderLabel(a.gender)].filter(Boolean).join(" · ");
    const thumb = swimmerThumbHtml(a, "swimmer-thumb");
    return (
      '<button class="swimmer-item" onclick="showSwimmer(' + a.id + ')">' +
        thumb +
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
    '<div class="profile-card">' +
      swimmerThumbHtml(ath, "detail-thumb") +
      '<div class="profile-card-text">' +
        '<div class="detail-name">' + esc(ath.first + " " + ath.last) + "</div>" +
        '<div class="detail-meta">' + esc(meta) + "</div>" +
        '<div id="detail-dates" class="detail-dates"></div>' +
      "</div>" +
    "</div>" +
    '<div class="detail-stats-card"><div class="detail-stats" id="detail-stats"></div></div>' +
    (scm.length || lcm.length || other.length
      ? pbSection(scm, "SCM", "badge-scm", ath) +
        pbSection(lcm, "LCM", "badge-lcm", ath) +
        (other.length ? pbSection(other, other[0].course, "badge-other", ath) : "") +
        '<p class="rank-note">Club ranking is based on personal bests currently held in the data set — not historical club records.</p>'
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

function pbSection(pbs, label, badgeClass, ath) {
  if (!pbs.length) return "";
  const showRank = !!ath && Object.keys(rankings).length > 0;
  const rows = pbs
    .slice()
    .sort((a, b) => a.event.localeCompare(b.event))
    .map(p => {
      let rankCell = "";
      if (showRank) {
        const clubR  = getRank(ath.id, p.event, p.course, ath.gender);
        const squadR = getSquadRank(ath.id, ath.group, p.event, p.course, ath.gender);
        const ageR   = getAgeGroupRankForAthlete(ath, p.event, p.course);
        if (clubR) {
          const sub = [
            squadR && squadR.total >= 2 ? ordinal(squadR.rank) + " squad" : null,
            ageR   && ageR.total >= 2   ? ordinal(ageR.rank)   + " age grp" : null,
          ].filter(Boolean).join(" · ");
          rankCell =
            '<td>' +
              '<div class="rank-primary">' + clubR.rank + " / " + clubR.total + "</div>" +
              (sub ? '<div class="rank-sub">' + esc(sub) + "</div>" : "") +
            "</td>";
        } else {
          rankCell = '<td style="color:var(--text-muted)">—</td>';
        }
      }
      return (
        '<tr data-event="' + esc(p.event) + '" data-course="' + esc(p.course) + '">' +
          "<td>" + esc(p.event) + "</td>" +
          '<td class="pb-time">' + esc(p.time) + "</td>" +
          (showRank ? rankCell : "") +
          "<td>" + esc(formatDate(p.date)) + "</td>" +
          "<td>" + esc(p.meet) + "</td>" +
          '<td class="pb-improvement" data-col="overall">—</td>' +
          '<td class="pb-improvement" data-col="latest">—</td>' +
        "</tr>"
      );
    }).join("");
  const rankTh = showRank ? "<th>Club Rank</th>" : "";
  return (
    '<details class="course-section" open>' +
      '<summary class="course-label ' + badgeClass + '">' + label + "</summary>" +
      '<div style="overflow-x:auto">' +
      '<table class="pb-table">' +
        "<thead><tr><th>Event</th><th>Time</th>" + rankTh + "<th>Date</th><th>Meet</th><th>Overall ↓</th><th>Latest ↓</th></tr></thead>" +
        "<tbody>" + rows + "</tbody>" +
      "</table>" +
      "</div>" +
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
            (m.disability ? '<span class="meet-badge meet-badge--disability">Disability</span>' : "") +
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
          (m.disability ? '<span class="meet-badge meet-badge--disability">Disability</span>' : "") +
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
        (meet.disability ? ' &middot; <span class="course-label meet-badge--disability">Disability Meet</span>' : "") +
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
        (meet.disability ? ' &middot; <span class="course-label meet-badge--disability">Disability Meet</span>' : "") +
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

  // Patch PB table with improvement columns
  const detail = document.getElementById("swimmer-detail");
  if (detail) {
    ath.pbs.forEach(pb => {
      const currentSecs = timeToSeconds(pb.time);
      if (currentSecs === null) return;
      const races = validRaces
        .filter(r => r.event === pb.event && r.course === pb.course)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (races.length < 2) return;
      const firstSecs = timeToSeconds(races[0].time);
      if (firstSecs === null) return;
      // Build chronological PB history
      let runningBest = Infinity;
      const pbHistory = [];
      races.forEach(r => {
        const t = timeToSeconds(r.time);
        if (t !== null && t < runningBest) { runningBest = t; pbHistory.push(t); }
      });
      const prevPBSecs = pbHistory.length >= 2 ? pbHistory[pbHistory.length - 2] : null;
      const row = detail.querySelector('[data-event="' + pb.event + '"][data-course="' + pb.course + '"]');
      if (!row) return;
      const fmt = (delta, base) =>
        delta > 0.005
          ? '<span class="improvement-val">↓' + secondsToTime(delta) + "</span>" +
            '<span class="improvement-pct"> (' + Math.round(delta / base * 100) + "%)</span>"
          : "—";
      const overallCell = row.querySelector('[data-col="overall"]');
      if (overallCell) overallCell.innerHTML = fmt(firstSecs - currentSecs, firstSecs);
      const latestCell = row.querySelector('[data-col="latest"]');
      if (latestCell && prevPBSecs !== null) latestCell.innerHTML = fmt(prevPBSecs - currentSecs, prevPBSecs);
    });
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

function swimmerThumbHtml(ath, cssClass) {
  const slug = ath.first.toLowerCase() + "_" + ath.last.toLowerCase();
  const src  = "images/swimmers/" + slug + ".png";
  return '<img class="' + cssClass + '" src="' + src + '" alt="" onerror="this.style.display=\'none\'">';
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

  // Shared: stroke groupings + squads (used by all three render sections below)
  const byStroke = {};
  Object.keys(eventStats).forEach(event => {
    const stroke = event.replace(/^\d+\s+/, "");
    (byStroke[stroke] = byStroke[stroke] || []).push(event);
  });
  Object.keys(byStroke).forEach(s => byStroke[s].sort((a, b) => parseInt(a) - parseInt(b)));
  const orderedStrokes = [
    ...STROKE_ORDER.filter(s => byStroke[s]),
    ...Object.keys(byStroke).filter(s => !STROKE_ORDER.includes(s)),
  ];
  const squads = SQUAD_ORDER.filter(g => pool.some(a => a.group === g));

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
    if (!orderedStrokes.length) {
      eventsEl.innerHTML = '<p class="no-pbs">No events with ' + STATS_MIN_ATHLETES + '+ athletes for ' + statsCourse + (statsGender ? " · " + genderLabel(statsGender) : "") + ".</p>";
    } else {
      eventsEl.innerHTML = '<h3 class="progression-title" style="margin:0 0 .75rem">Event Statistics</h3>' +
      orderedStrokes.map(stroke => {
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
  if (squadEl) {
    if (squads.length < 2 || !orderedStrokes.length) {
      squadEl.innerHTML = "";
    } else {
      const headerCells = orderedStrokes.map(s => "<th>" + esc(s) + "</th>").join("");
      const bodyRows = squads.map(squad => {
        const squadPool = pool.filter(a => a.group === squad);
        const cells = orderedStrokes.map(stroke => {
          const events = byStroke[stroke];
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
  }

  // Squad averages by event
  const squadAvgEl = document.getElementById("stats-squad-averages");
  if (squadAvgEl) {
    if (!squads.length || !orderedStrokes.length) {
      squadAvgEl.innerHTML = "";
    } else {
      const squadAvgHeaderCells =
        "<th>Club avg</th>" +
        squads.map(g => "<th>" + esc(squadLabel(g).replace(" Squad", "")) + "</th>").join("");
      squadAvgEl.innerHTML =
        '<h3 class="progression-title" style="margin:1.5rem 0 .35rem">Squad Averages by Event</h3>' +
        '<p class="chart-note" style="text-align:left;margin-bottom:.6rem">Average personal best per squad · green = faster than club average · ' +
        statsCourse + (statsGender ? " · " + genderLabel(statsGender) : "") + "</p>" +
        orderedStrokes.map(stroke => {
          const badge = STROKE_BADGES[stroke] || "badge-neutral";
          const rows = byStroke[stroke].map(event => {
            const clubAvg = eventStats[event].avgSeconds;
            const squadCells = squads.map(squad => {
              const times = pool
                .filter(a => a.group === squad)
                .flatMap(a => (a.pbs || []).filter(pb => pb.course === statsCourse && pb.event === event))
                .map(pb => timeToSeconds(pb.time))
                .filter(t => t !== null);
              if (times.length < 2) return '<td class="cell-empty">—</td>';
              const avg = times.reduce((s, t) => s + t, 0) / times.length;
              const ratio = avg / clubAvg;
              const cls = ratio <= 1.0 ? "cell-green" : ratio <= 1.15 ? "cell-amber" : "cell-red";
              return '<td class="' + cls + ' pb-time">' + secondsToTime(avg) + "</td>";
            }).join("");
            return "<tr>" +
              "<td>" + esc(event) + "</td>" +
              '<td class="pb-time">' + secondsToTime(clubAvg) + "</td>" +
              squadCells +
            "</tr>";
          }).join("");
          return '<details class="course-section">' +
            '<summary class="course-label ' + badge + '">' + stroke + "</summary>" +
            '<div style="overflow-x:auto">' +
            '<table class="squad-comparison-grid">' +
              "<thead><tr><th>Event</th>" + squadAvgHeaderCells + "</tr></thead>" +
              "<tbody>" + rows + "</tbody>" +
            "</table>" +
            "</div>" +
          "</details>";
        }).join("");
    }
  }

  if (!orderedStrokes.length) return;

  // Active age groups (only those with at least one athlete in the pool)
  const activeAgeGroups = AGE_GROUPS.filter(g =>
    pool.some(a => a.age >= g.min && a.age <= g.max)
  );

  // Age Group vs Club Average
  const ageCompEl = document.getElementById("stats-age-comparison");
  if (ageCompEl) {
    if (!activeAgeGroups.length) {
      ageCompEl.innerHTML = "";
    } else {
      const headerCells = orderedStrokes.map(s => "<th>" + esc(s) + "</th>").join("");
      const bodyRows = activeAgeGroups.map(group => {
        const groupPool = pool.filter(a => a.age >= group.min && a.age <= group.max);
        const cells = orderedStrokes.map(stroke => {
          const events = byStroke[stroke];
          let faster = 0, total = 0;
          groupPool.forEach(ath => {
            const pbs = (ath.pbs || []).filter(pb =>
              pb.course === statsCourse && events.includes(pb.event) && timeToSeconds(pb.time) !== null
            );
            if (!pbs.length) return;
            total++;
            if (pbs.some(pb => timeToSeconds(pb.time) < eventStats[pb.event].avgSeconds)) faster++;
          });
          if (total < 2) return '<td class="cell-empty">—</td>';
          const pct = faster / total;
          const cls = pct >= 0.6 ? "cell-green" : pct >= 0.4 ? "cell-amber" : "cell-red";
          return '<td class="' + cls + '">' + faster + "/" + total + "</td>";
        }).join("");
        return "<tr><td>" + esc(group.label) + "</td>" + cells + "</tr>";
      }).join("");
      ageCompEl.innerHTML =
        '<h3 class="progression-title" style="margin:1.5rem 0 .35rem">Age Group vs Club Average</h3>' +
        '<p class="chart-note" style="text-align:left;margin-bottom:.6rem">Swimmers with a PB faster than the club average · ' +
        statsCourse + (statsGender ? " · " + genderLabel(statsGender) : "") + "</p>" +
        '<div style="overflow-x:auto">' +
          '<table class="squad-comparison-grid">' +
            "<thead><tr><th>Age group</th>" + headerCells + "</tr></thead>" +
            "<tbody>" + bodyRows + "</tbody>" +
          "</table>" +
        "</div>";
    }
  }

  // Age Group Averages by Event
  const ageAvgEl = document.getElementById("stats-age-averages");
  if (!ageAvgEl || !activeAgeGroups.length) return;

  const ageAvgHeaderCells =
    "<th>Club avg</th>" +
    activeAgeGroups.map(g => "<th>" + esc(g.label) + "</th>").join("");

  ageAvgEl.innerHTML =
    '<h3 class="progression-title" style="margin:1.5rem 0 .35rem">Age Group Averages by Event</h3>' +
    '<p class="chart-note" style="text-align:left;margin-bottom:.6rem">Average personal best per age group · green = faster than club average · ' +
    statsCourse + (statsGender ? " · " + genderLabel(statsGender) : "") + "</p>" +
    orderedStrokes.map(stroke => {
      const badge = STROKE_BADGES[stroke] || "badge-neutral";
      const rows = byStroke[stroke].map(event => {
        const clubAvg = eventStats[event].avgSeconds;
        const groupCells = activeAgeGroups.map(group => {
          const times = pool
            .filter(a => a.age >= group.min && a.age <= group.max)
            .flatMap(a => (a.pbs || []).filter(pb => pb.course === statsCourse && pb.event === event))
            .map(pb => timeToSeconds(pb.time))
            .filter(t => t !== null);
          if (times.length < 2) return '<td class="cell-empty">—</td>';
          const avg = times.reduce((s, t) => s + t, 0) / times.length;
          const ratio = avg / clubAvg;
          const cls = ratio <= 1.0 ? "cell-green" : ratio <= 1.15 ? "cell-amber" : "cell-red";
          return '<td class="' + cls + ' pb-time">' + secondsToTime(avg) + "</td>";
        }).join("");
        return "<tr>" +
          "<td>" + esc(event) + "</td>" +
          '<td class="pb-time">' + secondsToTime(clubAvg) + "</td>" +
          groupCells +
        "</tr>";
      }).join("");
      return '<details class="course-section">' +
        '<summary class="course-label ' + badge + '">' + stroke + "</summary>" +
        '<div style="overflow-x:auto">' +
        '<table class="squad-comparison-grid">' +
          "<thead><tr><th>Event</th>" + ageAvgHeaderCells + "</tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>" +
        "</div>" +
      "</details>";
    }).join("");
}

// ── Rankings ──────────────────────────────────────────────────────────────────

function buildRankings() {
  rankings = {};
  athletes.forEach(ath => {
    (ath.pbs || []).forEach(pb => {
      const secs = timeToSeconds(pb.time);
      if (secs === null) return;
      if (!rankings[pb.event])                        rankings[pb.event]                        = {};
      if (!rankings[pb.event][pb.course])             rankings[pb.event][pb.course]             = {};
      if (!rankings[pb.event][pb.course][ath.gender]) rankings[pb.event][pb.course][ath.gender] = [];
      rankings[pb.event][pb.course][ath.gender].push({ ath, secs, time: pb.time });
    });
  });
  Object.values(rankings).forEach(byCourse =>
    Object.values(byCourse).forEach(byGender =>
      Object.values(byGender).forEach(list => list.sort((a, b) => a.secs - b.secs))
    )
  );
}

function getRank(athleteId, event, course, gender) {
  const list = rankings[event]?.[course]?.[gender];
  if (!list) return null;
  const idx = list.findIndex(e => e.ath.id === athleteId);
  return idx === -1 ? null : { rank: idx + 1, total: list.length };
}

function getSquadRank(athleteId, squad, event, course, gender) {
  const list = rankings[event]?.[course]?.[gender];
  if (!list) return null;
  const sub = list.filter(e => e.ath.group === squad);
  const idx = sub.findIndex(e => e.ath.id === athleteId);
  return idx === -1 ? null : { rank: idx + 1, total: sub.length };
}

function getAgeGroupRankForAthlete(ath, event, course) {
  const list = rankings[event]?.[course]?.[ath.gender];
  if (!list) return null;
  const age   = parseInt(ath.age);
  const group = AGE_GROUPS.find(g => age >= g.min && age <= g.max);
  if (!group) return null;
  const sub = list.filter(e => { const a = parseInt(e.ath.age); return a >= group.min && a <= group.max; });
  const idx = sub.findIndex(e => e.ath.id === ath.id);
  return idx === -1 ? null : { rank: idx + 1, total: sub.length };
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function openRankingsTab() {
  switchTab("rankings");
  renderRankings();
}

function selectRankingsCourse(c) { rankingsCourse = c; renderRankings(); }
function selectRankingsGender(g) { rankingsGender = g; renderRankings(); }

function renderRankings() {
  const pool = rankingsGender ? athletes.filter(a => a.gender === rankingsGender) : athletes;

  const courseEl = document.getElementById("rankings-course-filter");
  if (courseEl) {
    courseEl.innerHTML = ["SCM", "LCM"].map(c => {
      const badge = courseBadge(c).cls;
      return '<button class="course-label ' + badge + ' chart-toggle' + (rankingsCourse === c ? "" : " inactive") + '" onclick="selectRankingsCourse(\'' + c + '\')">' + c + "</button>";
    }).join("");
  }

  const genderEl = document.getElementById("rankings-gender-filter");
  if (genderEl) {
    genderEl.innerHTML = [["", "All"], ["M", "Male"], ["F", "Female"]].map(([val, label]) =>
      '<button class="course-label badge-neutral chart-toggle' + (rankingsGender === val ? "" : " inactive") + '" onclick="selectRankingsGender(\'' + val + '\')">' + label + "</button>"
    ).join("");
  }

  const dateEl = document.getElementById("rankings-date-range");
  if (dateEl) {
    const dates = pool.flatMap(a =>
      (a.pbs || []).filter(pb => pb.course === rankingsCourse && pb.date).map(pb => pb.date)
    ).sort();
    if (dates.length) {
      const first = formatDate(dates[0]);
      const last  = formatDate(dates[dates.length - 1]);
      dateEl.textContent = "Personal bests: " + (first === last ? first : first + " – " + last);
    } else {
      dateEl.textContent = "";
    }
  }

  // Build event map for current pool + course
  const eventMap = {};
  pool.forEach(ath => {
    (ath.pbs || []).forEach(pb => {
      if (pb.course !== rankingsCourse) return;
      const secs = timeToSeconds(pb.time);
      if (secs === null) return;
      if (!eventMap[pb.event]) eventMap[pb.event] = [];
      eventMap[pb.event].push({ secs, time: pb.time, ath });
    });
  });
  Object.keys(eventMap).forEach(event => {
    eventMap[event].sort((a, b) => a.secs - b.secs);
    if (eventMap[event].length < 3) delete eventMap[event];
  });

  const byStroke = {};
  Object.keys(eventMap).forEach(event => {
    const stroke = event.replace(/^\d+\s+/, "");
    (byStroke[stroke] = byStroke[stroke] || []).push(event);
  });
  Object.keys(byStroke).forEach(s => byStroke[s].sort((a, b) => parseInt(a) - parseInt(b)));
  const orderedStrokes = [
    ...STROKE_ORDER.filter(s => byStroke[s]),
    ...Object.keys(byStroke).filter(s => !STROKE_ORDER.includes(s)),
  ];

  const eventsEl = document.getElementById("rankings-events");
  if (!eventsEl) return;

  if (!orderedStrokes.length) {
    eventsEl.innerHTML = '<p class="no-pbs">No events with 3 or more recorded times for ' + rankingsCourse + (rankingsGender ? " · " + genderLabel(rankingsGender) : "") + ".</p>";
    return;
  }

  eventsEl.innerHTML = orderedStrokes.map(stroke => {
    const badge = STROKE_BADGES[stroke] || "badge-neutral";
    const rows = byStroke[stroke].map(event => {
      const top = eventMap[event].slice(0, 3);
      const podiumCells = [0, 1, 2].map(i => {
        const e = top[i];
        if (!e) return '<td class="rank-podium-cell rank-empty">—</td>';
        const cls = ["rank-gold", "rank-silver", "rank-bronze"][i];
        return (
          '<td class="rank-podium-cell ' + cls + '">' +
            '<div class="pb-time">' + esc(e.time) + "</div>" +
            '<button class="link-btn" onclick="goToSwimmer(' + e.ath.id + ')">' +
              esc(e.ath.first[0] + ". " + e.ath.last) +
            "</button>" +
            '<div class="rank-squad-badge">' + esc(squadLabel(e.ath.group).replace(" Squad", "")) + "</div>" +
          "</td>"
        );
      }).join("");
      return "<tr><td>" + esc(event) + "</td>" + podiumCells + "</tr>";
    }).join("");

    return (
      '<details class="course-section" open>' +
        '<summary class="course-label ' + badge + '">' + stroke + "</summary>" +
        '<div style="overflow-x:auto">' +
        '<table class="pb-table rankings-table">' +
          "<thead><tr><th>Event</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>" +
        "</div>" +
      "</details>"
    );
  }).join("");
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
  } else if (h === "rankings") {
    openRankingsTab();
  } else if (h === "compare") {
    if (isCoachMode()) openCompareTab();
    else switchTab("home", false);
  } else if (h.startsWith("meet-")) {
    const id = parseInt(h.slice(5), 10);
    switchTab("meets", false);
    showMeet(id, false);
  } else {
    switchTab("home", false);
  }
}

window.addEventListener("popstate", () => navigate(location.hash));

// ── Coach PIN ─────────────────────────────────────────────────────────────────

const COACH_PIN = "1968";

function isCoachMode() {
  return sessionStorage.getItem("coachMode") === "1";
}

function setCoachMode(active) {
  if (active) {
    sessionStorage.setItem("coachMode", "1");
  } else {
    sessionStorage.removeItem("coachMode");
  }
  const btn  = document.getElementById("coach-btn");
  const tab  = document.querySelector(".tab-btn--compare");
  if (btn)  btn.classList.toggle("active", active);
  if (tab)  tab.classList.toggle("hidden", !active);
}

function openCoachModal() {
  if (isCoachMode()) {
    setCoachMode(false);
    if (document.querySelector(".tab-btn.active")?.dataset.tab === "compare") {
      switchTab("home");
    }
    return;
  }
  const modal = document.getElementById("coach-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  const pin = document.getElementById("coach-pin");
  if (pin) { pin.value = ""; pin.focus(); }
  const err = document.getElementById("coach-pin-error");
  if (err) err.classList.add("hidden");
}

function closeCoachModal() {
  const modal = document.getElementById("coach-modal");
  if (modal) modal.classList.add("hidden");
}

function submitCoachPin() {
  const pin = document.getElementById("coach-pin");
  const err = document.getElementById("coach-pin-error");
  if (!pin) return;
  if (pin.value === COACH_PIN) {
    closeCoachModal();
    setCoachMode(true);
    openCompareTab();
  } else {
    if (err) err.classList.remove("hidden");
    pin.classList.add("shake");
    pin.addEventListener("animationend", () => pin.classList.remove("shake"), { once: true });
    pin.value = "";
    pin.focus();
  }
}

document.getElementById("coach-pin")?.addEventListener("keydown", e => {
  if (e.key === "Enter") submitCoachPin();
  if (e.key === "Escape") closeCoachModal();
});

document.getElementById("coach-modal")?.addEventListener("click", e => {
  if (e.target === document.getElementById("coach-modal")) closeCoachModal();
});

// ── Compare tab ───────────────────────────────────────────────────────────────

let compareSlots    = [null, null, null]; // athlete objects
let allSwimResults  = {};                 // id → results array, loaded lazily
let allSwimLoaded   = false;
let compareDebounce = [null, null, null];

const COMPARE_EXCLUDED_DISTANCES = new Set([75]);

let compareTabInited = false;

function openCompareTab() {
  if (!isCoachMode()) { openCoachModal(); return; }
  switchTab("compare");
  if (!compareTabInited) { initCompareTab(); compareTabInited = true; }
}

function initCompareTab() {
  populateCompareSelects();
}

function populateCompareSelects() {
  const courseEl = document.getElementById("cmp-course");
  const eventEl  = document.getElementById("cmp-event");
  if (!courseEl || !eventEl) return;

  // Gather all unique course+event combos from athlete PBs
  const courseSet = new Set();
  const eventSet  = new Set();
  athletes.forEach(a => (a.pbs || []).forEach(pb => {
    courseSet.add(pb.course);
    eventSet.add(pb.event);
  }));

  const courses = COURSE_ORDER.filter(c => courseSet.has(c));
  courseEl.innerHTML = courses.map(c => `<option value="${c}">${c}</option>`).join("");

  const updateEventList = () => {
    const course = courseEl.value;
    const events = [...new Set(
      athletes.flatMap(a => (a.pbs || []).filter(pb => pb.course === course).map(pb => pb.event))
    )].filter(e => !COMPARE_EXCLUDED_DISTANCES.has(parseInt(e)))
    .sort((a, b) => {
      const strokeA = a.replace(/^\d+\s*/, "");
      const strokeB = b.replace(/^\d+\s*/, "");
      const siA = STROKE_ORDER.indexOf(strokeA);
      const siB = STROKE_ORDER.indexOf(strokeB);
      if (siA !== siB) return siA - siB;
      return parseInt(a) - parseInt(b);
    });
    eventEl.innerHTML = events.map(e => `<option value="${e}">${e}</option>`).join("");
    renderCompareResult();
  };

  courseEl.addEventListener("change", updateEventList);
  eventEl.addEventListener("change", renderCompareResult);
  updateEventList();
}

function filterCompareSearch(slot, query) {
  clearTimeout(compareDebounce[slot]);
  compareDebounce[slot] = setTimeout(() => {
    const dropdown = document.getElementById("dropdown-" + slot);
    if (!dropdown) return;
    const q = query.trim().toLowerCase();
    if (!q) { dropdown.classList.add("hidden"); return; }
    const matches = athletes
      .filter(a => (a.first + " " + a.last).toLowerCase().includes(q))
      .sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first))
      .slice(0, 12);
    if (!matches.length) { dropdown.classList.add("hidden"); return; }
    dropdown.innerHTML = matches.map(a =>
      `<div class="compare-dropdown-item" onmousedown="selectCompareAthlete(${slot},${a.id})">${esc(a.last + ", " + a.first)} <span style="color:var(--text-muted);font-size:.75rem">${squadLabel(a.group).replace(" Squad","")}</span></div>`
    ).join("");
    dropdown.classList.remove("hidden");
  }, 150);
}

function showCompareDropdown(slot) {
  const input = document.querySelector(`#slot-${slot} .compare-search`);
  if (input?.value.trim()) filterCompareSearch(slot, input.value);
}

function hideCompareDropdown(slot) {
  setTimeout(() => {
    const dropdown = document.getElementById("dropdown-" + slot);
    if (dropdown) dropdown.classList.add("hidden");
  }, 200);
}

function selectCompareAthlete(slot, id) {
  const ath = athletes.find(a => a.id === id);
  if (!ath) return;
  compareSlots[slot] = ath;

  const searchWrap = document.querySelector(`#slot-${slot} .compare-search-wrap`);
  const selectedEl = document.getElementById("selected-" + slot);
  const nameEl     = document.getElementById("selected-name-" + slot);
  const dropdown   = document.getElementById("dropdown-" + slot);

  if (searchWrap) searchWrap.classList.add("hidden");
  if (selectedEl) selectedEl.classList.remove("hidden");
  if (nameEl)     nameEl.textContent = ath.first + " " + ath.last;
  if (dropdown)   dropdown.classList.add("hidden");

  renderCompareResult();
}

function clearCompareSlot(slot) {
  compareSlots[slot] = null;

  const searchWrap = document.querySelector(`#slot-${slot} .compare-search-wrap`);
  const selectedEl = document.getElementById("selected-" + slot);
  const input      = document.querySelector(`#slot-${slot} .compare-search`);

  if (searchWrap) searchWrap.classList.remove("hidden");
  if (selectedEl) selectedEl.classList.add("hidden");
  if (input)      { input.value = ""; input.focus(); }

  renderCompareResult();
}

async function ensureAllSwimResults() {
  if (allSwimLoaded) return;
  document.getElementById("compare-loading")?.classList.remove("hidden");
  await Promise.all(athletes.map(async a => {
    if (allSwimResults[a.id]) return;
    try {
      const r = await fetch("data/athlete_results/" + a.id + ".json");
      allSwimResults[a.id] = r.ok ? await r.json() : [];
    } catch { allSwimResults[a.id] = []; }
  }));
  allSwimLoaded = true;
  document.getElementById("compare-loading")?.classList.add("hidden");
}

function avgSeconds(times) {
  const valid = times.filter(t => t !== null);
  if (!valid.length) return null;
  return valid.reduce((s, t) => s + t, 0) / valid.length;
}

function swimmerAvgForEvent(athleteId, event, course) {
  const results = allSwimResults[athleteId] || [];
  const times = results
    .filter(r => r.event === event && r.course === course)
    .map(r => timeToSeconds(r.time))
    .filter(t => t !== null);
  return { avg: avgSeconds(times), count: times.length };
}

function clubAvgForEvent(event, course) {
  const times = athletes.flatMap(a =>
    (allSwimResults[a.id] || [])
      .filter(r => r.event === event && r.course === course)
      .map(r => timeToSeconds(r.time))
      .filter(t => t !== null)
  );
  return avgSeconds(times);
}

function squadAvgForEvent(squad, event, course) {
  const squadAthletes = athletes.filter(a => a.group === squad);
  const times = squadAthletes.flatMap(a =>
    (allSwimResults[a.id] || [])
      .filter(r => r.event === event && r.course === course)
      .map(r => timeToSeconds(r.time))
      .filter(t => t !== null)
  );
  return avgSeconds(times);
}

function ageGroupAvgForEvent(group, event, course) {
  const groupAthletes = athletes.filter(a => a.age >= group.min && a.age <= group.max);
  const times = groupAthletes.flatMap(a =>
    (allSwimResults[a.id] || [])
      .filter(r => r.event === event && r.course === course)
      .map(r => timeToSeconds(r.time))
      .filter(t => t !== null)
  );
  return avgSeconds(times);
}

function ragClass(val, ordered) {
  // ordered = [fastest, ..., slowest] seconds values for selected swimmers only
  if (val === null) return "";
  const rank = ordered.indexOf(val);
  if (ordered.length === 1) return "cmp-green";
  if (rank === 0) return "cmp-green";
  if (rank === ordered.length - 1) return "cmp-red";
  return "cmp-amber";
}

function ragVsAvg(swimmerSecs, avgSecs) {
  if (swimmerSecs === null || avgSecs === null) return "";
  const ratio = swimmerSecs / avgSecs;
  if (ratio <= 1.0)  return "cmp-green";
  if (ratio <= 1.10) return "cmp-amber";
  return "cmp-red";
}

function barWidth(val, fastest, slowest) {
  if (val === null || fastest === null || slowest === null) return 0;
  if (fastest === slowest) return 100;
  // fastest = 100%, slowest = 60%
  return Math.round(60 + 40 * (1 - (val - fastest) / (slowest - fastest)));
}

async function renderCompareResult() {
  const active = compareSlots.filter(Boolean);
  const resultEl = document.getElementById("compare-result");
  if (!resultEl) return;
  if (!active.length) { resultEl.innerHTML = ""; return; }

  await ensureAllSwimResults();

  const event  = document.getElementById("cmp-event")?.value;
  const course = document.getElementById("cmp-course")?.value;
  if (!event || !course) return;

  const swimmers = compareSlots; // keep nulls for column alignment

  // Per-swimmer data
  const swimData = swimmers.map(ath => {
    if (!ath) return null;
    const pb    = (ath.pbs || []).find(p => p.event === event && p.course === course);
    const { avg, count } = swimmerAvgForEvent(ath.id, event, course);
    return { ath, pbSecs: pb ? timeToSeconds(pb.time) : null, pbStr: pb?.time ?? null, avg, count };
  });

  // RAG: rank only active swimmers on PB
  const activePBs = swimData.filter(d => d !== null && d.pbSecs !== null).map(d => d.pbSecs).sort((a, b) => a - b);
  const fastestPB = activePBs[0] ?? null;
  const slowestPB = activePBs[activePBs.length - 1] ?? null;

  const activeAvgs = swimData.filter(d => d !== null && d.avg !== null).map(d => d.avg).sort((a, b) => a - b);
  const fastestAvg = activeAvgs[0] ?? null;
  const slowestAvg = activeAvgs[activeAvgs.length - 1] ?? null;

  // Club + squad + age group averages
  const clubAvg  = clubAvgForEvent(event, course);

  // Unique squads among selected swimmers
  const uniqueSquads = [...new Set(active.map(a => a.group))];
  const squadAvgs    = Object.fromEntries(uniqueSquads.map(sq => [sq, squadAvgForEvent(sq, event, course)]));

  // Age groups for selected swimmers
  const uniqueAgeGroups = AGE_GROUPS.filter(g =>
    active.some(a => a.age >= g.min && a.age <= g.max)
  );
  const ageAvgs = Object.fromEntries(uniqueAgeGroups.map(g => [g.label, ageGroupAvgForEvent(g, event, course)]));

  // Build header
  const headerCols = swimmers.map((ath, i) =>
    ath
      ? `<th class="col-swimmer">${esc(ath.first + " " + ath.last)}<br><span style="font-weight:400;font-size:.7rem;opacity:.8">${squadLabel(ath.group).replace(" Squad","")}</span></th>`
      : `<th class="col-swimmer" style="opacity:.35">Swimmer ${i + 1}</th>`
  ).join("");

  // PB row
  const pbCells = swimData.map((d, i) => {
    if (!d) return `<td style="color:var(--text-muted);font-style:italic">—</td>`;
    if (!d.pbStr) return `<td style="color:var(--text-muted);font-style:italic">No PB</td>`;
    const cls = ragClass(d.pbSecs, activePBs);
    const bw  = barWidth(d.pbSecs, fastestPB, slowestPB);
    return `<td class="${cls}">
      <div class="compare-time">${esc(d.pbStr)}</div>
      <div class="compare-bar-wrap"><div class="compare-bar" style="width:${bw}%"></div></div>
    </td>`;
  }).join("");

  // Avg row
  const avgCells = swimData.map(d => {
    if (!d) return `<td style="color:var(--text-muted)">—</td>`;
    if (d.avg === null) return `<td style="color:var(--text-muted);font-style:italic">No data</td>`;
    const cls = ragClass(d.avg, activeAvgs);
    const bw  = barWidth(d.avg, fastestAvg, slowestAvg);
    return `<td class="${cls}">
      <div class="compare-time">${esc(secondsToTime(d.avg))}</div>
      <div class="compare-sub">${d.count} swim${d.count !== 1 ? "s" : ""}</div>
      <div class="compare-bar-wrap"><div class="compare-bar" style="width:${bw}%"></div></div>
    </td>`;
  }).join("");

  // Club avg row
  const clubAvgDisplay = clubAvg !== null ? secondsToTime(clubAvg) : "—";
  const clubAvgCells = swimData.map(d => {
    const cls = d ? ragVsAvg(d.pbSecs, clubAvg) : "";
    return `<td class="${cls}"><span class="compare-time">${esc(clubAvgDisplay)}</span></td>`;
  }).join("");

  // Squad avg rows (one per unique squad)
  const squadRows = uniqueSquads.map(sq => {
    const avg = squadAvgs[sq];
    const display = avg !== null ? secondsToTime(avg) : "—";
    const cells = swimData.map(d => {
      if (!d || d.ath.group !== sq) return `<td style="color:var(--text-muted)">—</td>`;
      const cls = ragVsAvg(d.pbSecs, avg);
      return `<td class="${cls}"><span class="compare-time">${esc(display)}</span></td>`;
    }).join("");
    return `<tr class="row-avg">
      <td class="row-label">${esc(squadLabel(sq).replace(" Squad",""))} Squad avg</td>
      ${cells}
    </tr>`;
  }).join("");

  // Age group avg rows
  const ageRows = uniqueAgeGroups.map(g => {
    const avg = ageAvgs[g.label];
    const display = avg !== null ? secondsToTime(avg) : "—";
    const cells = swimData.map(d => {
      if (!d) return `<td style="color:var(--text-muted)">—</td>`;
      const inGroup = d.ath.age >= g.min && d.ath.age <= g.max;
      if (!inGroup) return `<td style="color:var(--text-muted)">—</td>`;
      const cls = ragVsAvg(d.pbSecs, avg);
      return `<td class="${cls}"><span class="compare-time">${esc(display)}</span></td>`;
    }).join("");
    return `<tr class="row-avg">
      <td class="row-label">Age ${esc(g.label)} avg</td>
      ${cells}
    </tr>`;
  }).join("");

  const colSpan = swimmers.length + 1;

  resultEl.innerHTML =
    `<p class="chart-note" style="text-align:left;margin-bottom:.6rem">
      <span style="color:#166534;font-weight:700">Green = fastest</span> ·
      <span style="color:#854d0e;font-weight:700">amber = middle</span> ·
      <span style="color:#dc2626;font-weight:700">red = slowest</span> among selected swimmers
    </p>` +
    `<div class="compare-table-wrap">
      <table class="compare-table">
        <thead><tr><th></th>${headerCols}</tr></thead>
        <tbody>
          <tr>
            <td class="row-label">PB</td>
            ${pbCells}
          </tr>
          <tr>
            <td class="row-label">All swims avg</td>
            ${avgCells}
          </tr>
          <tr class="row-section-header">
            <td colspan="${colSpan}">Benchmarks</td>
          </tr>
          <tr class="row-section-legend">
            <td colspan="${colSpan}">
              <span style="color:#166534;font-weight:700">Green = faster than benchmark</span> ·
              <span style="color:#854d0e;font-weight:700">amber = within 10%</span> ·
              <span style="color:#dc2626;font-weight:700">red = &gt;10% slower</span>
            </td>
          </tr>
          <tr class="row-avg">
            <td class="row-label">Club avg</td>
            ${clubAvgCells}
          </tr>
          ${squadRows}
          ${ageRows}
        </tbody>
      </table>
    </div>`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

loadData();

// Restore coach mode UI across page refreshes (athletes not yet loaded here)
if (isCoachMode()) setCoachMode(true);
