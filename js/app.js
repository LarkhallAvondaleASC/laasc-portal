let athletes = [];
let meets = [];
let progressionChart = null;

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

    initGroupFilter();
    renderSwimmers();
    renderMeets();
  } catch {
    document.getElementById("tab-home").insertAdjacentHTML(
      "beforeend",
      '<p class="error-msg">Data not yet available — the first data refresh hasn\'t run yet. ' +
      "Go to the Actions tab in GitHub and click \"Run workflow\" to populate it now.</p>"
    );
  }
}

// ── Tab navigation ────────────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === name)
  );
  document.querySelectorAll(".tab-panel").forEach(panel =>
    panel.classList.toggle("active", panel.id === "tab-" + name)
  );
}

document.querySelectorAll(".tab-btn").forEach(btn =>
  btn.addEventListener("click", () => switchTab(btn.dataset.tab))
);

// ── Swimmers ──────────────────────────────────────────────────────────────────

function initGroupFilter() {
  const groups = [...new Set(athletes.map(a => a.group).filter(Boolean))].sort();
  const select = document.getElementById("group-filter");
  groups.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = squadLabel(g);
    select.appendChild(opt);
  });
}

function filteredAthletes() {
  const query = document.getElementById("search-input").value.trim().toLowerCase();
  const group = document.getElementById("group-filter").value;
  return athletes
    .filter(a => {
      const name = (a.first + " " + a.last).toLowerCase();
      return (!query || name.includes(query)) && (!group || a.group === group);
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
        '<div>' +
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
document.getElementById("group-filter").addEventListener("change", renderSwimmers);

function showSwimmersList() {
  document.getElementById("swimmers-list-view").classList.remove("hidden");
  document.getElementById("swimmer-detail-view").classList.add("hidden");
}

function showSwimmer(id) {
  const ath = athletes.find(a => a.id === id);
  if (!ath) return;

  const scm   = ath.pbs.filter(p => p.course === "SCM");
  const lcm   = ath.pbs.filter(p => p.course === "LCM");
  const other = ath.pbs.filter(p => p.course !== "SCM" && p.course !== "LCM");
  const meta  = [squadLabel(ath.group), ath.subgroup, genderLabel(ath.gender)].filter(Boolean).join(" · ");

  document.getElementById("swimmer-detail").innerHTML =
    '<div class="detail-header">' +
      '<div class="detail-name">' + esc(ath.first + " " + ath.last) + "</div>" +
      '<div class="detail-meta">' + esc(meta) + "</div>" +
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
        '<select id="progression-event" class="progression-select"></select>' +
      '</div>' +
      '<div class="chart-wrap"><canvas id="progression-canvas"></canvas></div>' +
    '</div>';

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
    '<div class="course-section">' +
      '<button class="course-label ' + badgeClass + '" onclick="toggleSection(this)" aria-expanded="true">' +
        label + '<span class="section-chevron" aria-hidden="true">&#8963;</span>' +
      "</button>" +
      '<table class="pb-table">' +
        "<thead><tr><th>Event</th><th>Time</th><th>Date</th><th>Meet</th></tr></thead>" +
        "<tbody>" + rows + "</tbody>" +
      "</table>" +
    "</div>"
  );
}

// ── Meets ─────────────────────────────────────────────────────────────────────

function renderMeets() {
  const sorted = [...meets].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const container = document.getElementById("meets-list");
  if (!sorted.length) {
    container.innerHTML = '<p class="no-pbs">No meets available yet.</p>';
    return;
  }
  container.innerHTML = sorted.map(m => {
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

function showMeetsList() {
  document.getElementById("meets-list-view").classList.remove("hidden");
  document.getElementById("meet-detail-view").classList.add("hidden");
}

async function showMeet(id) {
  const meet = meets.find(m => m.id === id);
  if (!meet) return;

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

  // Group by event
  const byEvent = {};
  results.forEach(row => {
    (byEvent[row.event] = byEvent[row.event] || []).push(row);
  });

  const eventSections = Object.keys(byEvent).sort().map(event => {
    const rows = byEvent[event]
      .sort((a, b) => a.time.localeCompare(b.time))
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
  const rows = history
    .filter(r => r.event === event && timeToSeconds(r.time) !== null)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const labels = rows.map(r => formatDate(r.date));
  const data   = rows.map(r => timeToSeconds(r.time));
  const meets  = rows.map(r => r.meet + (r.course ? " (" + r.course + ")" : ""));

  if (progressionChart) progressionChart.destroy();
  const canvas = document.getElementById("progression-canvas");
  if (!canvas) return;

  progressionChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        data,
        borderColor: "#1e3a5f",
        backgroundColor: "rgba(30,58,95,0.08)",
        pointBackgroundColor: "#1e3a5f",
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.2,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => secondsToTime(ctx.parsed.y) + "  —  " + meets[ctx.dataIndex],
          }
        }
      },
      scales: {
        y: {
          ticks: { callback: v => secondsToTime(v) },
          title: { display: true, text: "Time" },
        }
      }
    }
  });
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
  const uniqueMeets = new Set(history.map(r => r.meet_id)).size;
  const strokeCounts = {};
  validRaces.forEach(r => {
    const stroke = r.event.split(" ").pop();
    strokeCounts[stroke] = (strokeCounts[stroke] || 0) + 1;
  });
  const strokeOrder = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];
  const statsEl = document.getElementById("detail-stats");
  if (statsEl) {
    const statItems = [
      { value: uniqueMeets,         label: "Meets" },
      { value: validRaces.length,   label: "Swims" },
      ...strokeOrder.filter(s => strokeCounts[s]).map(s => ({ value: strokeCounts[s], label: s })),
    ];
    statsEl.innerHTML = statItems.map(s =>
      '<div class="stat-item">' +
        '<span class="stat-value">' + s.value + "</span>" +
        '<span class="stat-label">' + s.label + "</span>" +
      "</div>"
    ).join("");
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
  // YYYY-MM-DD (from scraper) or M/D/YYYY (raw from site)
  const d = str.includes("/")
    ? new Date(str)
    : new Date(str + "T00:00:00");
  if (isNaN(d)) return str;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function toggleSection(btn) {
  const section = btn.closest(".course-section");
  const collapsed = section.classList.toggle("collapsed");
  btn.setAttribute("aria-expanded", String(!collapsed));
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
  if (course === "SCM") return { cls: "badge-scm",   label: "SCM" };
  if (course === "LCM") return { cls: "badge-lcm",   label: "LCM" };
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

// ── Boot ──────────────────────────────────────────────────────────────────────

loadData();
