const fallbackCountries = [
  { code: "PT", id: 620, name: "Portugal", count: 184211, coords: [-8.2, 39.5] },
  { code: "BR", id: 76, name: "Brazil", count: 171904, coords: [-52, -10] },
  { code: "IN", id: 356, name: "India", count: 140002, coords: [78.9, 22] },
  { code: "US", id: 840, name: "United States", count: 132881, coords: [-98.5, 39.8] },
  { code: "PK", id: 586, name: "Pakistan", count: 98504, coords: [69.3, 30.3] },
  { code: "GB", id: 826, name: "United Kingdom", count: 87510, coords: [-2.5, 54] },
  { code: "AR", id: 32, name: "Argentina", count: 84872, coords: [-64, -34] },
  { code: "ES", id: 724, name: "Spain", count: 79244, coords: [-3.7, 40.3] },
  { code: "MA", id: 504, name: "Morocco", count: 69301, coords: [-6, 32] },
  { code: "FR", id: 250, name: "France", count: 67220, coords: [2.2, 46.2] },
  { code: "SA", id: 682, name: "Saudi Arabia", count: 58840, coords: [45, 24] },
  { code: "NG", id: 566, name: "Nigeria", count: 55210, coords: [8, 9] },
  { code: "DE", id: 276, name: "Germany", count: 53414, coords: [10.4, 51.1] },
  { code: "MX", id: 484, name: "Mexico", count: 50230, coords: [-102, 23] },
  { code: "JP", id: 392, name: "Japan", count: 44720, coords: [138, 37] },
  { code: "ZA", id: 710, name: "South Africa", count: 40116, coords: [24, -29] },
  { code: "ID", id: 360, name: "Indonesia", count: 38902, coords: [113, -2] },
  { code: "EG", id: 818, name: "Egypt", count: 37220, coords: [30, 27] },
  { code: "IT", id: 380, name: "Italy", count: 35544, coords: [12.5, 42.8] },
  { code: "CA", id: 124, name: "Canada", count: 33410, coords: [-106, 57] },
];

const countryByRegion = {
  PK: "Pakistan",
  PT: "Portugal",
  BR: "Brazil",
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  AR: "Argentina",
  ES: "Spain",
  MA: "Morocco",
  FR: "France",
  SA: "Saudi Arabia",
  NG: "Nigeria",
  DE: "Germany",
  MX: "Mexico",
  JP: "Japan",
  ZA: "South Africa",
  ID: "Indonesia",
  EG: "Egypt",
  IT: "Italy",
  CA: "Canada",
};

const els = {
  button: document.querySelector("#witnessButton"),
  witnessId: document.querySelector("#witnessId"),
  total: document.querySelector("#totalWitnesses"),
  countries: document.querySelector("#countriesCount"),
  leaderboard: document.querySelector("#leaderboardList"),
  feed: document.querySelector("#activityFeed"),
  svg: document.querySelector("#worldMap"),
  tooltip: document.querySelector("#tooltip"),
  loading: document.querySelector("#mapLoading"),
  browserTime: document.querySelector("#browserTime"),
  emailForm: document.querySelector("#emailForm"),
  emailInput: document.querySelector("#emailInput"),
  emailStatus: document.querySelector("#emailStatus"),
};

const formatter = new Intl.NumberFormat("en-US");
const pressedKey = "i-was-here-pressed";
const witnessKey = "i-was-here-witness-id";
const fallbackIncrementKey = "i-was-here-fallback-increment";
const supabaseConfig = window.I_WAS_HERE_SUPABASE || {};
const hasSupabaseConfig = Boolean(supabaseConfig.url && supabaseConfig.anonKey);
const supabaseClient =
  hasSupabaseConfig && window.supabase
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;

let countryData = fallbackCountries.map((country) => ({ ...country }));
let totalWitnesses = countryData.reduce((sum, country) => sum + country.count, 0);
let pressed = localStorage.getItem(pressedKey) === "true";
let witnessId = localStorage.getItem(witnessKey) || "";
let projection;
let path;
let mapGroup;
let pointGroup;

const userCountry = getUserCountry();

init();

async function init() {
  startBrowserClock();
  renderStats();
  renderLeaderboard();
  seedFallbackActivity();
  applyPressedState();
  drawMap();

  if (supabaseClient) {
    await hydrateFromSupabase();
    subscribeToSupabase();
  } else {
    startFallbackTicker();
  }

  els.button.addEventListener("click", recordWitness);
  els.emailForm.addEventListener("submit", collectEmail);
}

function startBrowserClock() {
  const renderTime = () => {
    els.browserTime.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
  };

  renderTime();
  window.setInterval(renderTime, 1000);
}

async function hydrateFromSupabase() {
  try {
    const [{ data: stats }, { data: countries }, { data: events }] =
      await Promise.all([
        supabaseClient.from("app_stats").select("total_count").eq("id", true).single(),
        supabaseClient
          .from("witness_countries")
          .select("code,name,topo_id,longitude,latitude,count")
          .order("count", { ascending: false }),
        supabaseClient
          .from("witness_events")
          .select("country_name,created_at")
          .order("created_at", { ascending: false })
          .limit(7),
      ]);

    if (countries?.length) {
      countryData = countries.map((country) => ({
        code: country.code,
        id: country.topo_id,
        name: country.name,
        count: Number(country.count),
        coords: [Number(country.longitude), Number(country.latitude)],
      }));
    }

    totalWitnesses =
      Number(stats?.total_count) ||
      countryData.reduce((sum, country) => sum + country.count, 0);

    if (events?.length) {
      els.feed.innerHTML = "";
      events.forEach((event) => addActivity(event.country_name, relativeTime(event.created_at), false));
    }

    renderEverything();
  } catch (error) {
    console.warn("Supabase unavailable; using fallback data.", error);
    startFallbackTicker();
  }
}

function subscribeToSupabase() {
  supabaseClient
    .channel("witness-board")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "witness_events" },
      (payload) => {
        addActivity(payload.new.country_name, "now");
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "witness_countries" },
      (payload) => {
        const updated = payload.new;
        const country = countryData.find((item) => item.code === updated.code);
        if (!country) return;
        country.count = Number(updated.count);
        renderEverything();
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "app_stats" },
      (payload) => {
        totalWitnesses = Number(payload.new.total_count);
        renderStats();
      },
    )
    .subscribe();
}

async function recordWitness() {
  if (pressed) return;

  els.button.disabled = true;
  els.button.textContent = "Leaving mark";

  if (supabaseClient) {
    await recordWitnessWithSupabase();
  } else {
    recordWitnessLocally();
  }
}

async function recordWitnessWithSupabase() {
  try {
    const { data, error } = await supabaseClient.rpc("record_witness", {
      p_country_code: userCountry.code,
      p_country_name: userCountry.name,
    });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    totalWitnesses = Number(result.total_count);
    witnessId = `#${formatter.format(result.witness_number)}`;

    const country = countryData.find((item) => item.code === result.country_code);
    if (country) country.count = Number(result.country_count);

    commitPressedState();
  } catch (error) {
    console.error("Could not record witness in Supabase.", error);
    els.button.disabled = false;
    els.button.textContent = "I was here";
    els.witnessId.textContent = "Could not connect. Try again.";
  }
}

function recordWitnessLocally() {
  const country = countryData.find((item) => item.code === userCountry.code) || countryData[0];
  totalWitnesses += 1;
  country.count += 1;
  witnessId = `#${formatter.format(totalWitnesses)}`;
  localStorage.setItem(
    fallbackIncrementKey,
    String(Number(localStorage.getItem(fallbackIncrementKey) || 0) + 1),
  );
  commitPressedState();
}

async function collectEmail(event) {
  event.preventDefault();

  const email = els.emailInput.value.trim().toLowerCase();
  if (!email) return;

  const submitButton = els.emailForm.querySelector("button");
  submitButton.disabled = true;
  submitButton.textContent = "Joining";
  els.emailStatus.textContent = "Saving your email...";

  if (!supabaseClient) {
    localStorage.setItem("i-was-here-email", email);
    submitButton.textContent = "Joined";
    els.emailStatus.textContent =
      "Saved locally. Add Supabase config to collect emails live.";
    return;
  }

  const { error } = await supabaseClient.from("email_signups").insert({
    email,
    country_code: userCountry.code,
    country_name: userCountry.name,
    witness_number: witnessId || null,
  });

  if (error && error.code !== "23505") {
    console.error("Could not save email.", error);
    submitButton.disabled = false;
    submitButton.textContent = "Join";
    els.emailStatus.textContent = "Could not save that email. Try again.";
    return;
  }

  els.emailInput.value = "";
  submitButton.textContent = "Joined";
  els.emailStatus.textContent =
    error?.code === "23505"
      ? "You're already on the list."
      : "You're on the list for the final witness map.";
}

function commitPressedState() {
  pressed = true;
  localStorage.setItem(pressedKey, "true");
  localStorage.setItem(witnessKey, witnessId);

  document.body.classList.remove("page-pulse");
  window.requestAnimationFrame(() => document.body.classList.add("page-pulse"));
  applyPressedState();
  renderEverything();
  addActivity(userCountry.name, "now");
  pulseUserCountry();
}

function getUserCountry() {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
  const region = locale.split("-").pop()?.toUpperCase();
  const code = countryByRegion[region] ? region : "PK";
  return {
    code,
    name: countryByRegion[code] || "Pakistan",
  };
}

function applyPressedState() {
  if (!pressed) return;
  els.button.disabled = false;
  els.button.textContent = "You were here";
  els.button.classList.add("is-pressed");
  els.witnessId.textContent = `Last witness: ${witnessId || "recorded"} from ${userCountry.name}`;
}

function renderEverything() {
  renderStats();
  renderLeaderboard();
  updateMapColors();
  renderPoints();
}

function renderStats() {
  els.total.textContent = formatter.format(totalWitnesses);
  els.countries.textContent = formatter.format(countryData.filter((country) => country.count > 0).length);
}

function renderLeaderboard() {
  const topCountries = [...countryData]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  els.leaderboard.innerHTML = topCountries
    .map(
      (country, index) => `
        <li>
          <span class="rank">${index + 1}</span>
          <span class="country-name">${country.name}</span>
          <span class="country-count">${formatter.format(country.count)}</span>
        </li>
      `,
    )
    .join("");
}

function seedFallbackActivity() {
  els.feed.innerHTML = "";
  ["Portugal", "Brazil", "Pakistan", "India", "Argentina", "Morocco"].forEach(
    (country, index) => addActivity(country, `${index + 1}m ago`, false),
  );
}

function startFallbackTicker() {
  const fallbackNames = ["Portugal", "Brazil", "Pakistan", "India", "Argentina", "Morocco", "United States", "Nigeria"];

  window.setInterval(() => {
    const countryName = fallbackNames[Math.floor(Math.random() * fallbackNames.length)];
    const match = countryData.find((item) => item.name === countryName);
    if (match) {
      match.count += 1;
      totalWitnesses += 1;
      renderEverything();
    }
    addActivity(countryName, "now");
  }, 5200);
}

function addActivity(country, time = "now", prepend = true) {
  const item = document.createElement("li");
  item.innerHTML = `
    <span class="feed-dot"></span>
    <span class="activity-copy">Someone in ${country} was here</span>
    <span class="feed-time">${time}</span>
  `;

  if (prepend) {
    els.feed.prepend(item);
  } else {
    els.feed.append(item);
  }

  while (els.feed.children.length > 7) {
    els.feed.lastElementChild.remove();
  }
}

async function drawMap() {
  const width = els.svg.clientWidth || 820;
  const height = els.svg.clientHeight || 500;
  els.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  projection = d3.geoNaturalEarth1().fitExtent(
    [
      [18, 20],
      [width - 18, height - 20],
    ],
    { type: "Sphere" },
  );
  path = d3.geoPath(projection);

  mapGroup = d3.select(els.svg).append("g");
  pointGroup = d3.select(els.svg).append("g");

  try {
    const response = await fetch("https://unpkg.com/world-atlas@2/countries-110m.json");
    const world = await response.json();
    const countries = topojson.feature(world, world.objects.countries).features;

    mapGroup
      .selectAll("path")
      .data(countries)
      .join("path")
      .attr("class", "country")
      .attr("data-id", (d) => Number(d.id))
      .attr("d", path)
      .style("fill", (d) => countryFill(Number(d.id)))
      .on("mousemove", showTooltip)
      .on("mouseleave", hideTooltip);

    renderPoints();
    els.loading.classList.add("is-hidden");
  } catch (error) {
    els.loading.textContent = "Map data unavailable";
  }
}

function renderPoints() {
  if (!pointGroup || !projection) return;
  const topPoints = [...countryData]
    .filter((country) => country.coords[0] || country.coords[1])
    .sort((a, b) => b.count - a.count)
    .slice(0, 13);

  pointGroup
    .selectAll("circle")
    .data(topPoints, (d) => d.code)
    .join("circle")
    .attr("class", (d) =>
      d.code === userCountry.code ? "pulse-point user-country" : "pulse-point",
    )
    .attr("cx", (d) => projection(d.coords)[0])
    .attr("cy", (d) => projection(d.coords)[1])
    .attr("r", 4)
    .style("animation-delay", (_, index) => `${index * 120}ms`);
}

function countryFill(id) {
  const country = countryData.find((item) => item.id === id);
  if (!country) return "rgba(255,255,255,0.095)";

  const max = Math.max(...countryData.map((item) => item.count));
  const intensity = country.count / max;
  const alpha = 0.22 + intensity * 0.68;
  return `rgba(224, 7, 24, ${alpha})`;
}

function updateMapColors() {
  if (!mapGroup) return;
  mapGroup
    .selectAll(".country")
    .style("fill", (d) => countryFill(Number(d.id)));
}

function pulseUserCountry() {
  const country = countryData.find((item) => item.code === userCountry.code);
  if (!country) return;
  const userPath = document.querySelector(`path[data-id="${country.id}"]`);
  if (!userPath) return;
  userPath.style.fill = "#ffffff";
  window.setTimeout(() => {
    userPath.style.fill = countryFill(country.id);
  }, 240);
}

function showTooltip(event, feature) {
  const id = Number(feature.id);
  const country = countryData.find((item) => item.id === id);
  if (!country) {
    hideTooltip();
    return;
  }

  const percent = totalWitnesses
    ? ((country.count / totalWitnesses) * 100).toFixed(1)
    : "0.0";
  els.tooltip.innerHTML = `
    <strong>${country.name}</strong>
    <span>${formatter.format(country.count)} witnesses · ${percent}%</span>
  `;
  els.tooltip.style.left = `${event.clientX}px`;
  els.tooltip.style.top = `${event.clientY}px`;
  els.tooltip.style.opacity = "1";
}

function hideTooltip() {
  els.tooltip.style.opacity = "0";
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 45) return "now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

window.addEventListener("resize", () => {
  d3.select(els.svg).selectAll("*").remove();
  drawMap();
});
