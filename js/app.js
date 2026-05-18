let athletes = [];
let meets = [];

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
    opt.textContent = g;
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
    const meta = [a.group, a.subgroup, genderLabel(a.gender)].filter(Boolean).join(" · ");
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
  const meta  = [ath.group, ath.subgroup, genderLabel(ath.gender)].filter(Boolean).join(" · ");

  document.getElementById("swimmer-detail").innerHTML =
    '<div class="detail-header">' +
      '<div class="detail-name">' + esc(ath.first + " " + ath.last) + "</div>" +
      '<div class="detail-meta">' + esc(meta) + "</div>" +
    "</div>" +
    (scm.length || lcm.length || other.length
      ? pbSection(scm, "SCM", "badge-scm") +
        pbSection(lcm, "LCM", "badge-lcm") +
        (other.length ? pbSection(other, other[0].course, "badge-other") : "")
      : '<p class="no-pbs">No personal best times recorded yet.</p>');

  document.getElementById("swimmers-list-view").classList.add("hidden");
  document.getElementById("swimmer-detail-view").classList.remove("hidden");
  window.scrollTo(0, 0);
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
      '<span class="course-label ' + badgeClass + '">' + label + "</span>" +
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

function showMeet(id) {
  const meet = meets.find(m => m.id === id);
  if (!meet) return;

  // Find all PBs set at this meet across all athletes
  const results = [];
  athletes.forEach(ath => {
    ath.pbs.forEach(pb => {
      if (pb.meet === meet.name) {
        results.push({ ath, pb });
      }
    });
  });

  results.sort((a, b) =>
    a.pb.event.localeCompare(b.pb.event) ||
    a.ath.last.localeCompare(b.ath.last)
  );

  const badge = courseBadge(meet.course);
  const rows = results.map(({ ath, pb }) =>
    "<tr>" +
      '<td><button class="link-btn" onclick="switchTab(\'swimmers\'); setTimeout(() => showSwimmer(' + ath.id + '), 50)">' +
        esc(ath.first + " " + ath.last) +
      "</button></td>" +
      "<td>" + esc(pb.event) + "</td>" +
      '<td class="pb-time">' + esc(pb.time) + "</td>" +
    "</tr>"
  ).join("");

  document.getElementById("meet-detail").innerHTML =
    '<div class="detail-header">' +
      '<div class="detail-name">' + esc(meet.name) + "</div>" +
      '<div class="detail-meta">' +
        esc(formatDate(meet.date)) +
        ' &middot; <span class="course-label ' + badge.cls + '">' + badge.label + "</span>" +
      "</div>" +
    "</div>" +
    (results.length
      ? '<p class="results-count">' + results.length + " personal best" + (results.length !== 1 ? "s" : "") + " set at this meet</p>" +
        '<table class="pb-table">' +
          "<thead><tr><th>Swimmer</th><th>Event</th><th>Time</th></tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>"
      : '<p class="no-pbs">No personal bests recorded at this meet.</p>');

  document.getElementById("meets-list-view").classList.add("hidden");
  document.getElementById("meet-detail-view").classList.remove("hidden");
  window.scrollTo(0, 0);
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
