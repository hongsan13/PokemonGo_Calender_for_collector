
// PoGO Collector Calendar - corrected app.js
const DATA_URL = "./data/events.json";
const FALLBACK_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json";

let allEvents = [];
let currentFilter = "all";

const $ = (selector) => document.querySelector(selector);

function getSettings() {
  const defaults = {
    ownedRegionals: false,
    ownedCostumes: false,
    ownedUnown: true,
    pvpOff: true,
    tokyoPenalty: true,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem("collectorSettings") || "{}") };
  } catch {
    return defaults;
  }
}

function eventText(event) {
  return `${event.name || ""} ${event.heading || ""} ${JSON.stringify(event.extraData || {})}`.toLowerCase();
}

function evaluate(event) {
  const text = eventText(event);
  const settings = getSettings();
  let score = 20;
  const reasons = [];
  const flags = [];
  const targets = [];
  const add = (points, reason, flag) => {
    score += points;
    reasons.push(reason);
    if (flag) flags.push(flag);
  };
  const has = (...words) => words.some((word) => text.includes(word));

  if (event.eventType === "special-research" || event.eventType === "pokemon-go-fest") {
    add(28, "幻・限定リサーチや大型イベントは再入手機会が少ない", "一度限り");
  }
  if (has("regional", "region-exclusive", "地域限定", "tropius", "bouffalant", "klefki", "torkoal", "pachirisu", "sigilyph", "stonjourner")) {
    add(38, "日本では通常入手できない地域限定候補", "海外限定");
  }
  if (has("costume", "hat", "visor", "flower crown", "衣装", "帽子", "バイザー")) {
    add(23, "衣装・帽子・装飾フォームはイベント限定", "衣装");
  }
  if (has("background", "special background", "location card", "ロケーション背景", "スペシャル背景")) {
    add(25, "限定背景は通常個体とは別枠で保存価値が高い", "限定背景");
  }
  if (has("shiny debut", "shiny release", "色違い初登場", "色違い初実装")) {
    add(24, "色違い初実装は次回復刻時期が不明", "色違い初実装");
  } else if (has("shiny", "色違い")) {
    add(10, "色違い対象あり", "色違い");
  }
  if (has("unown", "アンノーン")) {
    add(
      settings.ownedUnown ? 4 : 30,
      settings.ownedUnown ? "通常全種所持済みのため色違いだけ重視" : "文字別コレクション対象",
      "アンノーン"
    );
  }
  if (has("origin forme", "adventure effect", "spacial rend", "roar of time", "専用技", "あくうせつだん", "ときのほうこう")) {
    add(22, "専用技・フィールド効果は通常個体と別枠", "専用技");
  }
  if (has("clone", "armored", "apex", "クローン", "アーマード")) {
    add(45, "長期未復刻の特殊フォーム候補", "特殊フォーム");
  }
  if (event.eventType === "community-day") add(8, "色違い確保には効率的だが復刻されやすい", "大量発生");
  if (event.eventType === "pokemon-spotlight-hour") score -= 8;
  if (event.eventType === "raid-hour") score -= 3;

  if (settings.tokyoPenalty && has("pidgey", "zubat", "eevee", "bidoof", "ポッポ", "ズバット", "イーブイ", "ビッパ")) {
    score -= 25;
    reasons.push("東京で再入手機会が多い");
  }
  if (settings.ownedRegionals && flags.includes("海外限定")) {
    score -= 10;
    reasons.push("通常色所持済みなら色違い・交換用のみ");
  }
  if (settings.ownedCostumes && flags.includes("衣装")) {
    score -= 8;
    reasons.push("通常色を1体所持済みなら重複優先度は低い");
  }

  const walk = (value) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value === "object") {
      if (typeof value.name === "string") targets.push(value.name);
      Object.values(value).forEach(walk);
    }
  };
  walk(event.extraData || {});

  score = Math.max(0, Math.min(100, score));
  const tier = score >= 90 ? "SSS" : score >= 75 ? "SS" : score >= 60 ? "S" : score >= 42 ? "A" : score >= 25 ? "B" : "C";

  return {
    score,
    tier,
    reasons: [...new Set(reasons)],
    targets: [...new Set(targets)].slice(0, 8),
    flags: [...new Set(flags)],
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return "日時未定";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function isActive(event) {
  const now = Date.now();
  const start = parseDate(event.start)?.getTime() ?? Infinity;
  const end = parseDate(event.end)?.getTime() ?? -Infinity;
  return start <= now && now <= end;
}

function recommend(value) {
  if (value.flags.includes("限定背景")) return "背景ごとに1体。色違い背景は別枠で必ず保存。";
  if (value.flags.includes("衣装")) return "衣装ごとに通常色1体。色違いは別枠1体。交換用は余裕があれば+1。";
  if (value.flags.includes("海外限定")) return "通常色1体＋色違い1体。交換用は余裕があれば+1。";
  if (value.flags.includes("アンノーン")) return "各文字1体。全種所持後は色違い文字のみ最優先。";
  if (value.flags.includes("専用技")) return "専用技ごとに1体。背景・色違い・高個体は別枠。";
  if (value.score >= 75) return "最低1体。限定要素が異なる個体は別枠で保存。";
  return "未所持なら1体。東京で再入手可能な重複通常個体は整理候補。";
}

function render() {
  const eventsElement = $("#events");
  const summaryElement = $("#summary");
  const statusElement = $("#status");
  if (!eventsElement || !summaryElement || !statusElement) {
    throw new Error("index.html側の必要要素が見つからない");
  }

  const filtered = allEvents
    .filter((event) => {
      const value = event._eval;
      if (currentFilter === "ongoing") return isActive(event);
      if (currentFilter === "high") return value.score >= 60;
      if (currentFilter === "limited") {
        return value.flags.some((flag) =>
          ["海外限定", "衣装", "限定背景", "特殊フォーム", "一度限り", "専用技"].includes(flag)
        );
      }
      return true;
    })
    .sort((a, b) => (parseDate(a.start)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (parseDate(b.start)?.getTime() ?? Number.MAX_SAFE_INTEGER));

  eventsElement.innerHTML =
    filtered.map((event) => {
      const value = event._eval;
      const targetHtml = value.targets.length ? `<p class="targets"><b>狙い</b>${value.targets.join(" / ")}</p>` : "";
      const imageHtml = event.image ? `<img src="${event.image}" alt="" loading="lazy" onerror="this.style.display='none'">` : "";
      return `
        <article class="event">
          <div class="event-head">
            ${imageHtml}
            <div class="event-main">
              <h2>${event.name || "名称未設定"}</h2>
              <div class="when">${formatDate(event.start)} → ${formatDate(event.end)}</div>
              <span class="grade" data-tier="${value.tier}">${value.tier} / ★${Math.max(1, Math.ceil(value.score / 20))}</span>
              <span class="score">${value.score}点</span>
              <div class="badges">${value.flags.map((flag) => `<span class="badge">${flag}</span>`).join("")}</div>
            </div>
          </div>
          <div class="detail">
            ${targetHtml}
            <p><b>評価理由</b>${value.reasons.join("。") || "通常イベント。未所持・色違いだけ確認。"}</p>
            <p><b>推奨保有</b>${recommend(value)}</p>
            ${event.link ? `<a href="${event.link}" target="_blank" rel="noopener">詳細を見る</a>` : ""}
          </div>
        </article>
      `;
    }).join("") || "<p>条件に合うイベントはない。</p>";

  summaryElement.innerHTML = `
    <div class="metric"><b>${allEvents.filter(isActive).length}</b><span>開催中</span></div>
    <div class="metric"><b>${allEvents.filter((event) => event._eval.score >= 60).length}</b><span>★4以上</span></div>
    <div class="metric"><b>${allEvents.length}</b><span>掲載イベント</span></div>
  `;
  statusElement.textContent = `${filtered.length}件を表示`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} の取得に失敗: HTTP ${response.status}`);
  return response.json();
}

async function load() {
  const statusElement = $("#status");
  statusElement.textContent = "イベント情報を取得中…";
  try {
    let data;
    let source = "同梱データ";
    try {
      data = await fetchJson(DATA_URL);
    } catch (localError) {
      console.warn(localError);
      data = await fetchJson(FALLBACK_URL);
      source = "ScrapedDuck直接取得";
    }
    if (!Array.isArray(data)) throw new Error("events.jsonの形式が配列ではない");

    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    allEvents = data
      .filter((event) => {
        const end = parseDate(event.end)?.getTime();
        return !end || end > cutoff;
      })
      .map((event) => ({ ...event, _eval: evaluate(event) }));

    if ($("#updated")) {
      $("#updated").textContent = `最終表示更新: ${new Date().toLocaleString("ja-JP")} / ${source}`;
    }
    render();
  } catch (error) {
    console.error(error);
    statusElement.textContent = `読み込み失敗: ${error.message}`;
    if ($("#events")) {
      $("#events").innerHTML = `<article class="event"><div class="detail"><p><b>エラー内容</b>${error.message}</p><p>F12 → Console に詳細が表示される。</p></div></article>`;
    }
  }
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    render();
  });
});

$("#refreshBtn")?.addEventListener("click", load);

$("#settingsBtn")?.addEventListener("click", () => {
  const current = getSettings();
  Object.keys(current).forEach((key) => {
    const input = $("#" + key);
    if (input) input.checked = Boolean(current[key]);
  });
  $("#settingsDialog")?.showModal();
});

$("#saveSettings")?.addEventListener("click", () => {
  const next = {};
  ["ownedRegionals", "ownedCostumes", "ownedUnown", "pvpOff", "tokyoPenalty"].forEach((key) => {
    next[key] = Boolean($("#" + key)?.checked);
  });
  localStorage.setItem("collectorSettings", JSON.stringify(next));
  allEvents = allEvents.map((event) => ({ ...event, _eval: evaluate(event) }));
  render();
});

$("#icsBtn")?.addEventListener("click", () => {
  const escapeIcs = (value) =>
    String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;")
      .replace(/\r?\n/g, "\\n");

  const formatIcsDate = (value) => {
    const date = parseDate(value);
    if (!date) return null;
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };

  const rows = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PoGO Collector Calendar//JA",
    "CALSCALE:GREGORIAN",
  ];

  allEvents.forEach((event) => {
    const start = formatIcsDate(event.start);
    const end = formatIcsDate(event.end);
    if (!start || !end) return;

    const value = event._eval;
    rows.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.eventID || crypto.randomUUID())}@pogo-collector`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:[${value.tier}] ${escapeIcs(event.name)}`,
      `DESCRIPTION:${escapeIcs(`コレクション評価 ${value.score}点。${value.reasons.join("。")}`)}`,
      event.link ? `URL:${escapeIcs(event.link)}` : "",
      "END:VEVENT"
    );
  });

  rows.push("END:VCALENDAR");

  const blob = new Blob([rows.filter(Boolean).join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pogo-collector-calendar.ics";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});

load();
