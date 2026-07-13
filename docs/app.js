
const DATA_URL="./data/events.json";
const FALLBACK_URL="https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json";

let allEvents=[];
let filter="all";
let scoreOverrides=[];

const COLLECTOR_EVENT_RULES = [
  {
    id: "pikachu-anniversary-celebration",
    titleAll: ["pikachu"],
    titleAny: ["anniversary", "celebration", "アニバーサリー", "記念", "セレブレーション"],
    minScore: 92,
    dimensions: { rarity: 72, collectionScore: 98, trade: 70, rerun: 88 },
    flags: ["最優先", "複数限定衣装", "ピカチュウ"],
    reasons: [
      "複数の限定ピカチュウをまとめて回収できるコレクション特化イベント",
      "同じ衣装群が一括復刻する保証がなく、未所持フォーム回収を最優先すべき"
    ],
    recommendation: "各衣装の通常色を1体ずつ確保。色違いは衣装ごとに別枠。未所持衣装がある限り最優先で参加。"
  },
  {
    id: "multi-costume-event",
    textAny: [
      "multiple costumed", "different costumed", "costumed pikachu",
      "three celebrations", "various costumed", "複数の衣装", "さまざまな衣装",
      "歴代衣装", "異なる衣装"
    ],
    minScore: 88,
    dimensions: { rarity: 68, collectionScore: 95, trade: 62, rerun: 82 },
    flags: ["最優先", "複数限定衣装"],
    reasons: ["複数の衣装違いを同時に収集できるため、単体の通常出現イベントより大幅に価値が高い"],
    recommendation: "衣装ごとに通常色1体。色違いは別枠。未所持衣装を優先して埋める。"
  },
  {
    id: "fashion-costume-collection",
    titleAny: ["fashion week", "ファッションウィーク", "costume celebration", "衣装イベント"],
    minScore: 82,
    dimensions: { rarity: 60, collectionScore: 92, trade: 55, rerun: 76 },
    flags: ["衣装集中イベント"],
    reasons: ["衣装違いは通常フォームと別コレクションであり、復刻時期が不定"],
    recommendation: "新規衣装を各1体。過去衣装は未所持のみ。色違い衣装は必ず別枠保存。"
  }
];
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

const storage={
  get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},
  set(key,val){localStorage.setItem(key,JSON.stringify(val))}
};

function settings(){
  return {...{pvpOff:true,tokyoPenalty:true,duplicatePenalty:true,tradeBonus:false,rerunWeight:1},...storage.get("pogoSettings",{})};
}
function collection(){return storage.get("pogoCollection",[])}
function results(){return storage.get("pogoResults",[])}

function text(e){return `${e.name||""} ${e.heading||""} ${JSON.stringify(e.extraData||{})}`.toLowerCase()}
function hasAny(t,arr){return arr.some(x=>t.includes(x))}
function ownedMatch(e){
  const t=text(e);
  return collection().filter(x=>t.includes((x.name||"").toLowerCase()));
}

function ruleMatches(rule,e,t){
  const title=(e.name||"").toLowerCase();
  const all=(rule.titleAll||[]).every(x=>title.includes(x.toLowerCase()));
  const titleAny=!rule.titleAny?.length||(rule.titleAny||[]).some(x=>title.includes(x.toLowerCase()));
  const textAny=!rule.textAny?.length||(rule.textAny||[]).some(x=>t.includes(x.toLowerCase()));
  return all&&titleAny&&textAny;
}

function findManualOverride(e){
  const name=(e.name||"").toLowerCase();
  const id=String(e.eventID||"").toLowerCase();
  return scoreOverrides.find(o=>{
    if(o.eventID&&String(o.eventID).toLowerCase()===id)return true;
    if(o.nameIncludes&&name.includes(String(o.nameIncludes).toLowerCase()))return true;
    if(Array.isArray(o.nameIncludesAny)&&o.nameIncludesAny.some(x=>name.includes(String(x).toLowerCase())))return true;
    return false;
  });
}

function evaluate(e){
  const t=text(e),s=settings(),owned=ownedMatch(e);
  let rarity=20,collectionScore=20,trade=10,rerun=50;
  let scoreFloor=0;
  let forcedRecommendation="";
  const reasons=[],flags=[],targets=[];
  const add=(dim,n,reason,flag)=>{
    if(dim==="rarity")rarity+=n;
    if(dim==="collection")collectionScore+=n;
    if(dim==="trade")trade+=n;
    if(dim==="rerun")rerun+=n;
    reasons.push(reason); if(flag)flags.push(flag);
  };

  if(e.eventType==="special-research"||e.eventType==="pokemon-go-fest"){
    add("rarity",25,"幻・限定リサーチや大型イベント","一度限り");
    add("rerun",22,"同条件での復刻時期が読みづらい");
  }
  if(hasAny(t,["regional","region-exclusive","地域限定","tropius","bouffalant","klefki","torkoal","pachirisu","sigilyph","stonjourner"])){
    add("rarity",38,"日本では通常入手できない地域限定候補","海外限定");
    add("trade",28,"交換材料として需要が出やすい");
  }
  if(hasAny(t,["costume","costumed","outfit","hat","visor","flower crown","衣装","帽子","バイザー"])){
    add("collection",27,"衣装・装飾フォームは別枠コレクション","衣装");
    add("rerun",12,"同じ衣装の復刻時期は不定");
  }
  if(hasAny(t,["background","special background","location card","ロケーション背景","スペシャル背景"])){
    add("collection",32,"限定背景は通常個体と別枠","限定背景");
    add("trade",22,"背景付きは交換価値が上がりやすい");
    add("rerun",25,"同一背景は再入手困難");
  }
  if(hasAny(t,["shiny debut","shiny release","色違い初登場","色違い初実装"])){
    add("collection",28,"色違い初実装","色違い初実装");
    add("rarity",15,"初回イベントは狙い目");
  }else if(hasAny(t,["shiny","色違い"])){
    add("collection",12,"色違い対象あり","色違い");
  }
  if(hasAny(t,["unown","アンノーン"])){
    add("collection",14,"文字別・色違い別の収集対象","アンノーン");
    if(collection().some(x=>x.name.includes("アンノーン通常全28種")))collectionScore-=12;
  }
  if(hasAny(t,["origin forme","adventure effect","spacial rend","roar of time","専用技","あくうせつだん","ときのほうこう"])){
    add("collection",24,"専用技・フィールド効果は別枠","専用技");
    add("rerun",18,"技付き復刻は限定される");
  }
  if(hasAny(t,["clone","armored","apex","クローン","アーマード"])){
    add("rarity",45,"長期未復刻の特殊フォーム","特殊フォーム");
    add("collection",34,"通常フォームと明確に別枠");
    add("rerun",35,"再登場保証がない");
  }
  if(e.eventType==="community-day"){collectionScore+=8;rarity-=8;reasons.push("色違いは集めやすいが復刻されやすい")}
  if(e.eventType==="pokemon-spotlight-hour"){rarity-=12;rerun-=10}
  if(e.eventType==="raid-hour"){rarity-=4}

  if(s.tokyoPenalty&&hasAny(t,["pidgey","zubat","eevee","bidoof","ポッポ","ズバット","イーブイ","ビッパ"])){
    rarity-=28;reasons.push("東京で再入手機会が多い");
  }
  if(s.duplicatePenalty&&owned.length){
    collectionScore-=18;reasons.push(`所持済み一致: ${owned.map(x=>x.name).join(" / ")}`);
  }
  if(s.tradeBonus)trade+=10;

  const walk=o=>{
    if(!o)return;
    if(Array.isArray(o))return o.forEach(walk);
    if(typeof o==="object"){if(typeof o.name==="string")targets.push(o.name);Object.values(o).forEach(walk)}
  };walk(e.extraData||{});

  // Fail-safe collector rules: title-only dataでも大型衣装イベントを低評価にしない。
  for(const rule of COLLECTOR_EVENT_RULES){
    if(!ruleMatches(rule,e,t))continue;
    scoreFloor=Math.max(scoreFloor,rule.minScore||0);
    rarity=Math.max(rarity,rule.dimensions?.rarity||0);
    collectionScore=Math.max(collectionScore,rule.dimensions?.collectionScore||0);
    trade=Math.max(trade,rule.dimensions?.trade||0);
    rerun=Math.max(rerun,rule.dimensions?.rerun||0);
    reasons.push(...(rule.reasons||[]));
    flags.push(...(rule.flags||[]));
    if(rule.recommendation)forcedRecommendation=rule.recommendation;
  }

  // User-editable manual overrides. New collector events can be corrected without changing app.js.
  const override=findManualOverride(e);
  if(override){
    scoreFloor=Math.max(scoreFloor,Number(override.minScore)||0);
    rarity=Math.max(rarity,Number(override.dimensions?.rarity)||0);
    collectionScore=Math.max(collectionScore,Number(override.dimensions?.collectionScore)||0);
    trade=Math.max(trade,Number(override.dimensions?.trade)||0);
    rerun=Math.max(rerun,Number(override.dimensions?.rerun)||0);
    reasons.push(...(override.reasons||[]));
    flags.push(...(override.flags||["手動補正"]));
    if(override.recommendation)forcedRecommendation=override.recommendation;
  }

  rarity=Math.max(0,Math.min(100,rarity));
  collectionScore=Math.max(0,Math.min(100,collectionScore));
  trade=Math.max(0,Math.min(100,trade));
  rerun=Math.max(0,Math.min(100,rerun*s.rerunWeight));
  let score=Math.round(rarity*.35+collectionScore*.4+trade*.1+rerun*.15);
  score=Math.max(score,scoreFloor);
  const tier=score>=90?"SSS":score>=75?"SS":score>=60?"S":score>=42?"A":score>=25?"B":"C";

  return {
    score,tier,rarity,collectionScore,trade,rerun,
    reasons:[...new Set(reasons)],
    flags:[...new Set(flags)],
    targets:[...new Set(targets)].slice(0,8),
    owned,
    forcedRecommendation,
    scoreFloor
  };
}

function d(v){if(!v)return null;const x=new Date(v);return Number.isNaN(x.getTime())?null:x}
function fmt(v){const x=d(v);return x?new Intl.DateTimeFormat("ja-JP",{month:"numeric",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Tokyo"}).format(x):"日時未定"}
function active(e){const n=Date.now(),a=d(e.start)?.getTime()??Infinity,b=d(e.end)?.getTime()??-Infinity;return a<=n&&n<=b}

function recommend(v){
  if(v.forcedRecommendation)return v.forcedRecommendation;
  if(v.flags.includes("限定背景"))return "背景ごとに1体。色違い背景は別枠で保存。";
  if(v.flags.includes("衣装"))return "衣装ごとに通常色1体。色違いは別枠1体。";
  if(v.flags.includes("海外限定"))return "通常色1体＋色違い1体。交換用は余裕があれば+1。";
  if(v.flags.includes("アンノーン"))return "通常文字は各1体。全種所持後は色違いだけ優先。";
  if(v.flags.includes("専用技"))return "専用技ごとに1体。背景・色違いは別枠。";
  return v.score>=75?"最低1体。限定要素が違う個体は別枠。":"未所持なら1体。東京で再入手できる重複通常個体は不要。";
}

function passes(e){
  const v=e._eval;
  if(filter==="ongoing")return active(e);
  if(filter==="high")return v.score>=60;
  if(filter==="regional")return v.flags.includes("海外限定");
  if(filter==="background")return v.flags.includes("限定背景");
  if(filter==="costume")return v.flags.includes("衣装");
  if(filter==="shiny")return v.flags.some(x=>x.includes("色違い"));
  if(filter==="special")return v.flags.some(x=>["専用技","特殊フォーム","一度限り"].includes(x));
  return true;
}

function renderEvents(){
  const list=allEvents.filter(passes).sort((a,b)=>(d(a.start)?.getTime()||9e15)-(d(b.start)?.getTime()||9e15));
  $("#events").innerHTML=list.map(e=>{
    const v=e._eval;
    return `<article class="event">
      <div class="event-head">
        ${e.image?`<img src="${e.image}" alt="" loading="lazy" onerror="this.style.display='none'">`:""}
        <div class="event-main">
          <h2>${e.name}</h2>
          <div class="when">${fmt(e.start)} → ${fmt(e.end)}</div>
          <span class="grade">${v.tier} / ★${Math.max(1,Math.ceil(v.score/20))}</span><span class="score">${v.score}点</span>
          <div class="badges">${v.flags.map(x=>`<span class="badge">${x}</span>`).join("")}</div>
        </div>
      </div>
      <div class="detail">
        <div class="scores">
          <div class="dimension"><b>${v.rarity}</b><span>希少性</span></div>
          <div class="dimension"><b>${v.collectionScore}</b><span>収集価値</span></div>
          <div class="dimension"><b>${v.trade}</b><span>交換価値</span></div>
          <div class="dimension"><b>${v.rerun}</b><span>復刻困難度</span></div>
        </div>
        ${v.targets.length?`<p><b>狙い</b>${v.targets.join(" / ")}</p>`:""}
        <p><b>評価理由</b>${v.reasons.join("。")||"通常イベント。未所持・色違いのみ確認。"}</p>
        <p><b>推奨保有</b>${recommend(v)}</p>
        ${e.link?`<a href="${e.link}" target="_blank" rel="noopener">詳細を見る</a>`:""}
      </div>
    </article>`;
  }).join("")||"<p>条件に合うイベントはない。</p>";
  $("#status").textContent=`${list.length}件を表示`;
}

function renderSummary(){
  $("#summary").innerHTML=`
    <div class="metric"><b>${allEvents.filter(active).length}</b><span>開催中</span></div>
    <div class="metric"><b>${allEvents.filter(x=>x._eval.score>=60).length}</b><span>優先イベント</span></div>
    <div class="metric"><b>${collection().length}</b><span>所持登録</span></div>
    <div class="metric"><b>${results().length}</b><span>成果記録</span></div>`;
}
function renderDashboard(){
  const upcoming=allEvents.filter(e=>(d(e.end)?.getTime()||0)>Date.now()).sort((a,b)=>b._eval.score-a._eval.score).slice(0,6);
  $("#dashboardCards").innerHTML=upcoming.map(e=>`<div class="task-card">
    <h3>${e.name}</h3><div class="big">${e._eval.tier}</div>
    <p>${fmt(e.start)}開始</p><p>${e._eval.reasons.slice(0,2).join("。")}</p>
    <p><b>狙い:</b> ${e._eval.targets.slice(0,4).join(" / ")||"未所持・色違い・限定要素"}</p>
  </div>`).join("")||"<p>予定なし。</p>";
}
function renderCollection(){
  const items=collection();
  $("#collectionList").innerHTML=items.map((x,i)=>`<div class="collection-row">
    <div><b>${x.name}</b><br><small>${x.type} / ${x.count}体 ${x.note?"/ "+x.note:""}</small></div>
    <button class="delete-btn" data-delete-collection="${i}">削除</button>
  </div>`).join("")||"<p class='muted'>まだ登録がない。</p>";
  $$("[data-delete-collection]").forEach(b=>b.onclick=()=>{const a=collection();a.splice(+b.dataset.deleteCollection,1);storage.set("pogoCollection",a);recalc()});
}
function renderResults(){
  const items=results().sort((a,b)=>b.date.localeCompare(a.date));
  $("#resultsList").innerHTML=items.map((x,i)=>`<div class="result-row">
    <div><b>${x.name}</b><br><small>${x.date} / 色違い${x.shiny}・背景${x.background}・地域限定${x.regional}・専用技${x.move}</small><br>${x.note||""}</div>
    <button class="delete-btn" data-delete-result="${i}">削除</button>
  </div>`).join("")||"<p class='muted'>まだ記録がない。</p>";
  $$("[data-delete-result]").forEach(b=>b.onclick=()=>{const a=items;a.splice(+b.dataset.deleteResult,1);storage.set("pogoResults",a);renderResults();renderSummary()});
}
function recalc(){allEvents=allEvents.map(e=>({...e,_eval:evaluate(e)}));renderSummary();renderEvents();renderDashboard();renderCollection()}

async function fetchJson(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json()}
async function load(){
  $("#status").textContent="イベント情報を取得中…";
  try{
    let data,src="同梱データ";
    try{data=await fetchJson(DATA_URL)}catch{data=await fetchJson(FALLBACK_URL);src="ScrapedDuck直接取得"}
    try{scoreOverrides=await fetchJson("./data/score-overrides.json")}catch{scoreOverrides=[]}
    const cutoff=Date.now()-3*864e5;
    allEvents=data.filter(e=>!e.end||(d(e.end)?.getTime()||0)>cutoff).map(e=>({...e,_eval:evaluate(e)}));
    $("#updated").textContent=`最終更新: ${new Date().toLocaleString("ja-JP")} / ${src}`;
    renderSummary();renderEvents();renderDashboard();renderCollection();renderResults();
  }catch(err){console.error(err);$("#status").textContent=`読み込み失敗: ${err.message}`}
}

$$("[data-view]").forEach(b=>b.onclick=()=>{$$("[data-view]").forEach(x=>x.classList.remove("active"));b.classList.add("active");$$(".view").forEach(x=>x.classList.remove("active"));$("#"+b.dataset.view+"View").classList.add("active")});
$$("[data-filter]").forEach(b=>b.onclick=()=>{$$("[data-filter]").forEach(x=>x.classList.remove("active"));b.classList.add("active");filter=b.dataset.filter;renderEvents()});
$("#refreshBtn").onclick=load;
$("#settingsBtn").onclick=()=>{const s=settings();Object.keys(s).forEach(k=>{const el=$("#"+k);if(!el)return;if(el.type==="checkbox")el.checked=s[k];else el.value=s[k]});$("#settingsDialog").showModal()};
$("#saveSettings").onclick=()=>{storage.set("pogoSettings",{pvpOff:$("#pvpOff").checked,tokyoPenalty:$("#tokyoPenalty").checked,duplicatePenalty:$("#duplicatePenalty").checked,tradeBonus:$("#tradeBonus").checked,rerunWeight:+$("#rerunWeight").value});recalc()};
$("#addCollectionBtn").onclick=()=>$("#collectionDialog").showModal();
$$("[data-preset]").forEach(b=>b.onclick=()=>{const a=collection();if(!a.some(x=>x.name===b.dataset.preset)){a.push({name:b.dataset.preset,type:"プリセット",count:1,note:""});storage.set("pogoCollection",a);recalc()}});
$("#saveCollection").onclick=()=>{const a=collection();a.push({name:$("#collectionName").value.trim(),type:$("#collectionType").value,count:+$("#collectionCount").value,note:$("#collectionNote").value.trim()});storage.set("pogoCollection",a);$("#collectionForm").reset();recalc()};
$("#addResultBtn").onclick=()=>{$("#resultDate").value=new Date().toISOString().slice(0,10);$("#resultDialog").showModal()};
$("#saveResult").onclick=()=>{const a=results();a.push({name:$("#resultName").value.trim(),date:$("#resultDate").value,shiny:+$("#resultShiny").value,background:+$("#resultBackground").value,regional:+$("#resultRegional").value,move:+$("#resultMove").value,note:$("#resultNote").value.trim()});storage.set("pogoResults",a);$("#resultForm").reset();renderResults();renderSummary()};

$("#icsBtn").onclick=()=>{
  const esc=s=>String(s||"").replace(/\\/g,"\\\\").replace(/,/g,"\\,").replace(/;/g,"\\;").replace(/\r?\n/g,"\\n");
  const fd=v=>{const x=d(v);return x?x.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,""):null};
  const rows=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//PoGO Collector Calendar v2//JA"];
  allEvents.forEach(e=>{const a=fd(e.start),b=fd(e.end);if(!a||!b)return;rows.push("BEGIN:VEVENT",`UID:${esc(e.eventID||crypto.randomUUID())}@pogo-v2`,`DTSTART:${a}`,`DTEND:${b}`,`SUMMARY:[${e._eval.tier}] ${esc(e.name)}`,`DESCRIPTION:${esc(`評価${e._eval.score}点。${e._eval.reasons.join("。")}`)}`,e.link?`URL:${esc(e.link)}`:"","END:VEVENT")});
  rows.push("END:VCALENDAR");const blob=new Blob([rows.filter(Boolean).join("\r\n")],{type:"text/calendar;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="pogo-collector-v2.ics";a.click();URL.revokeObjectURL(url);
};
load();
