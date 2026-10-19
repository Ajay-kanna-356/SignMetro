/**
 * frontend/js/views.js
 * ---------------------
 * All screen template functions.
 * Ported from the original prototype's V object — same HTML output,
 * same data logic, reorganized for readability.
 *
 * Static train/map data is identical to the prototype; fetch from the
 * backend API would replace the inline arrays in a future phase.
 */

/* global window, State, IntentRouter */

(function (global) {
  "use strict";

  // ── i18n labels ────────────────────────────────────────────────────────
  const L = {
    en: ["Train", "Where", "Help", "Touch the screen or sign to begin"],
    ta: ["ரயில்", "எங்கே", "உதவி", "தொடங்க திரையைத் தொடவும் அல்லது சைகை செய்யவும்"],
    hi: ["ट्रेन", "कहाँ", "मदद", "शुरू करने के लिए स्क्रीन छुएँ या संकेत करें"],
  };
  const WL = {
    en: "How can we help you?",
    ta: "நாங்கள் எவ்வாறு உதவலாம்?",
    hi: "हम आपकी कैसे सहायता करें?",
  };

  // ── SVG icon paths ─────────────────────────────────────────────────────
  const PA = {
    train:     '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l2-4M15 21l-2-4M9 14h.01M15 14h.01"/>',
    where:     '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
    help:      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
    lift:      '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/>',
    escalator: '<path d="M3 20h5v-4h5v-4h5V8h3"/>',
    washroom:  '<circle cx="7" cy="5" r="2"/><path d="M7 8v6M4 21v-5h6v5"/><circle cx="17" cy="5" r="2"/><path d="M17 8v13M14 14l3-6 3 6"/>',
    exit:      '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
    medical:   '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
    security:  '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    lost:      '<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>',
    person:    '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>',
    item:      '<rect x="4" y="8" width="16" height="13" rx="1"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    alert:     '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    hand:      '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 6-5 6s-4-1.5-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 13"/>',
    when:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    dest:      '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><path d="M9.5 10l2 2 3-3.5"/>',
    route:     '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
    ticket:    '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 12h4M18 12h4"/>',
  };

  /** Return an inline SVG string for icon key k */
  function ic(k) {
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PA[k] || ""}</svg>`;
  }

  // ── Simulated train data (identical to prototype; labelled DEMO) ────────
  const TR = [
    ["12635","Vaigai Express",    "Madurai",          "06:40","1","On time"],
    ["16127","Guruvayur Express", "Guruvayur",         "15:20","4","On time"],
    ["12661","Pothigai Express",  "Sengottai",         "19:15","6","Platform changed"],
    ["12631","Nellai Express",    "Tirunelveli",       "19:50","5","On time"],
    ["16101","Boat Mail",         "Rameswaram",        "20:35","8","On time"],
    ["16179","Mannai Express",    "Mannargudi",        "21:00","7","Delayed 30 min"],
    ["12637","Pandian Express",   "Madurai",           "21:40","3","Delayed 15 min"],
    ["12653","Rockfort Express",  "Tiruchirappalli",   "22:30","2","On time"],
  ];
  const MID = {
    Madurai:         ["Tiruchirappalli","Dindigul"],
    Tirunelveli:     ["Tiruchirappalli","Madurai","Kovilpatti"],
    Sengottai:       ["Tiruchirappalli","Madurai","Rajapalayam"],
    Rameswaram:      ["Tiruchirappalli","Karaikudi","Ramanathapuram"],
    Mannargudi:      ["Kumbakonam","Thanjavur"],
    Guruvayur:       ["Tiruchirappalli","Madurai","Kollam"],
  };

  // ── Station paths & directions (identical to prototype) ────────────────
  const P = {
    lift:      [[300,200],[300,165],[110,165],[110,180]],
    escalator: [[300,200],[300,165],[490,165],[490,180]],
    washroom:  [[300,200],[300,215],[540,215],[540,230]],
    exit:      [[300,200],[300,262]],
  };
  const ST = {
    lift:      ["Walk straight to the concourse crossing","Turn left along the blue floor line","Lift is beside the Platform 1 gate"],
    escalator: ["Walk straight to the concourse crossing","Turn right along the blue floor line","Escalator is at the Platform 9–11 side"],
    washroom:  ["Walk straight, then turn right","Follow the floor signs to the east corner","Washroom is on your right"],
    exit:      ["Walk straight ahead","Main entrance is directly in front of you"],
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const mn  = (s) => +s.slice(0,2)*60 + +s.slice(3);
  const T0  = Date.now();
  const now = () => (18*60+30 + Math.floor((Date.now()-T0)/60000)) % 1440;
  const clk = (m) => String(Math.floor(m/60)).padStart(2,"0") + ":" + String(m%60).padStart(2,"0");
  const up  = ()  => TR.filter(x => mn(x[3]) >= now()).sort((a,b) => mn(a[3])-mn(b[3]));
  const wc  = (s) => s === "On time" ? "ok" : "warn";
  const DS  = ()  => [...new Set(TR.map(x => x[2]))].sort();

  function rows(q) {
    q = (q||"").toLowerCase();
    const r = TR.filter(x => (x[1]+x[2]+x[0]).toLowerCase().includes(q));
    return r.length
      ? r.map(x => `<tr data-a="td" data-v="${x[0]}"><td>${x[0]}<td>${x[1]}<td>${x[2]}<td>${x[3]}<td><b>${x[4]}</b><td class="${wc(x[5])}">${x[5]}`).join("")
      : `<tr><td colspan="6">No trains found for "${q}".`;
  }

  function chips(a, k, cur) {
    return a.map(x =>
      `<button class="ch ${cur===x?"on":""}" data-a="${k}" data-v="${x}">${x}</button>`
    ).join(" ");
  }

  function trk(steps, s) {
    return `<div class="tk">${steps.map((x,i) =>
      `<div class="st ${i<=s?"on":""}"><b>${i<s?"✓":i+1}</b>${x}</div>`
    ).join("")}</div>`;
  }

  function svgMap(path, pin) {
    const platforms = [0,1,2,3,4].map(i =>
      `<rect x="60" y="${14+i*24}" width="480" height="18" rx="4" fill="var(--soft)" stroke="var(--bd)"/>
       <text x="66" y="${27+i*24}" font-size="11" fill="var(--mu)">${["P1–2","P3–4","P5–6","P7–8","P9–11"][i]}</text>`
    ).join("");

    const icons = [["L",110,180],["E",490,180],["W",540,230],["X",300,262]].map(([l,x,y]) =>
      `<circle cx="${x}" cy="${y}" r="11" fill="var(--cd)" stroke="var(--ac)" stroke-width="2"/>
       <text x="${x}" y="${y+4}" font-size="11" text-anchor="middle" fill="var(--fg)">${l}</text>`
    ).join("");

    const line = path
      ? `<polyline points="${path.map(q=>q.join(",")).join(" ")}" fill="none" stroke="var(--ac)" stroke-width="5" stroke-dasharray="10 7" stroke-linecap="round"/>`
      : "";

    const pinEl = pin
      ? `<text x="${pin[0]}" y="${pin[1]}" font-size="22" text-anchor="middle">📍</text>`
      : "";

    return `<svg id="mp" viewBox="0 0 600 300" width="100%">
      ${platforms}
      <rect x="60" y="145" width="480" height="100" rx="8" fill="var(--soft)" stroke="var(--bd)"/>
      <text x="70" y="160" font-size="11" fill="var(--mu)">Main concourse</text>
      <rect x="240" y="255" width="120" height="36" rx="6" fill="var(--bd)"/>
      <text x="268" y="277" font-size="11" fill="var(--fg)">Main entrance</text>
      ${icons}${line}
      <circle cx="300" cy="200" r="9" fill="var(--rd)"/>
      <text x="300" y="224" font-size="11" text-anchor="middle" fill="var(--fg)">You are here</text>
      ${pinEl}
    </svg>`;
  }

  function rmap(r) {
    const s = ["Chennai Egmore","Chengalpattu","Villupuram",...(MID[r[2]]||[]),r[2]];
    const n  = s.length;
    const pt = s.map((_,i) => [50+i*(500/(n-1)), 115+Math.sin(i*1.1)*38]);
    return `<div class="g2"><div class="card">
      <svg viewBox="0 0 600 230" width="100%" class="mp">
        <text x="560" y="22" font-size="11" text-anchor="end" fill="var(--mu)" font-style="italic">Bay of Bengal</text>
        <polyline points="${pt.map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--ac)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        ${pt.map((p,i) =>
          `<circle cx="${p[0]}" cy="${p[1]}" r="${i===0||i===n-1?9:6}"
            fill="${i===0?"var(--rd)":i===n-1?"var(--ac)":"var(--cd)"}" stroke="var(--ac)" stroke-width="3"/>
           <text x="${p[0]}" y="${p[1]+(i%2?28:-17)}" font-size="11" text-anchor="middle" fill="var(--fg)">${s[i]}</text>`
        ).join("")}
      </svg>
      <small>Schematic map — not to scale (simulated route, not verified)</small>
      </div><div class="card"><b>${r[0]} · ${r[1]}</b><ol>${s.map(x=>`<li>${x}`).join("")}</ol></div></div>`;
  }

  function rl(q, cur) {
    q = (q||"").trim().toLowerCase();
    const l = TR.filter(x => (x[0]+" "+x[1]+" "+x[2]).toLowerCase().includes(q));
    return l.length
      ? l.map(x => `<button class="ch ${cur===x[0]?"on":""}" style="margin:4px" data-a="rt" data-v="${x[0]}">${x[0]} · ${x[1]}</button>`).join(" ")
      : "No train found. Check the name or number and try again.";
  }

  function dl(q) {
    const res = DS().filter(x => x.toLowerCase().includes((q||"").toLowerCase()))
      .map(x => `<button class="ch" style="margin:4px" data-a="pick" data-v="${x}">${x} <small>(${up().filter(t=>t[2]===x).length} upcoming)</small></button>`)
      .join("");
    return res || "No destination matches.";
  }

  function tbl(list) {
    return list.length
      ? `<div class="card"><table><thead><tr><th>Code<th>Train<th>To<th>Dep<th>Plat<th>Status</thead><tbody>${
          list.map(x=>`<tr data-a="td" data-v="${x[0]}"><td>${x[0]}<td>${x[1]}<td>${x[2]}<td>${x[3]}<td><b>${x[4]}</b><td class="${wc(x[5])}">${x[5]}`).join("")
        }</tbody></table></div><small>Tap a train for platform, coach position and route. <em>Simulated data.</em></small>`
      : `<div class="card">No upcoming trains found.</div>`;
  }

  // ── Screen views ────────────────────────────────────────────────────────
  const V = {
    idle() {
      const s = State.get();
      return `<div class="idle" data-a="home">
        <div class="hand">${ic("hand")}</div>
        <h1>${L[s.lang][3]}</h1>
        <p class="mu">Chennai Egmore · Indian Sign Language help kiosk</p>
      </div>`;
    },

    home() {
      const s = State.get();
      return `<h1>${WL[s.lang]}</h1>
        <div class="tl">${["train","where","help"].map((k,i)=>
          `<button class="t ${k==="help"?"rd":""}" data-a="go" data-v="${k}">
            <span>${ic(k)}</span>${L[s.lang][i]}
            <small>ISL sign: ${k.toUpperCase()}</small>
          </button>`
        ).join("")}</div>`;
    },

    train() {
      return `<h2>${ic("train")} Train information</h2>
        <div class="tl">${[
          ["when",  "When",        "Upcoming trains"],
          ["dest",  "Destination", "Trains to a place"],
          ["route", "Route",       "Stops of a train"],
        ].map(([k, n, s]) =>
          `<button class="t" data-a="go" data-v="${k}">
            <span>${ic(k)}</span>${n}
            <small>${s} · ISL sign: ${n.toUpperCase()}</small>
          </button>`
        ).join("")}</div>
        <div class="card" style="margin-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <b>Looking for the full timetable or train search?</b><br>
            <small class="mu">View all scheduled departures, search by number or PNR</small>
          </div>
          <button class="ch" data-a="go" data-v="board">Open Train Board →</button>
        </div>`;
    },

    board() {
      const d = State.get().d;
      return `<h2>${ic("train")} Trains from Egmore <small>(simulated data)</small></h2>
        <div class="tabs">${[["board","Train board"],["my","My train / Route"]].map(([k,n])=>
          `<button class="ch ${(d.tab||"board")===k?"on":""}" data-a="tab" data-v="${k}">${n}</button>`
        ).join("")}</div>
        ${(d.tab||"board")==="board"
          ? `<input id="q" list="dl" placeholder="Type destination or train name… (Madurai, Trichy)" value="${d.q||""}" autocomplete="off">
             <datalist id="dl">${[...new Set(TR.map(x=>x[2]))].map(x=>`<option value="${x}">`).join("")}</datalist>
             <div class="card"><table><thead><tr><th>Code<th>Train<th>To<th>Dep<th>Plat<th>Status</thead><tbody id="tb">${rows(d.q||"")}</tbody></table></div>
             <small>Tap a train for details. <em>Simulated data — not live.</em></small>`
          : `<p>Enter train number (5 digits) or PNR (10 digits)</p>
             <div class="row"><input id="tn" inputmode="numeric" maxlength="10" placeholder="e.g. 12637"><button class="btn" data-a="find">Show</button></div>
             <p class="er" id="er"></p>`
        }`;
    },

    td() {
      const { d } = State.get();
      const r  = TR.find(x => x[0] === d.c);
      if (!r) return `<p class="er">Train not found.</p>`;
      const st = ["Chennai Egmore","Tambaram","Villupuram","Tiruchirappalli",r[2]].filter((v,i,a)=>a.indexOf(v)===i);
      return `<h2>${r[0]} · ${r[1]}</h2>
        <div class="g2">
          <div class="card"><div class="big">Platform ${r[4]}</div>
            <p class="${wc(r[5])}">${r[5]==="Platform changed"?"Platform changed – check the board":r[5]}</p>
            <p>Departs ${r[3]} · To ${r[2]}</p>
            <b>Coach position (simulated)</b>
            <div class="co">${["ENG","GS","S1","S2","S3","S4","B1","B2","A1","H1","GS","SLR"].map(c=>`<i>${c}</i>`).join("")}</div>
            <small>◀ Engine end is toward the Platform 1 side</small></div>
          <div class="card"><b>Route (simulated)</b><ol>${st.map(s=>`<li>${s}`).join("")}</ol></div>
        </div>
        <div class="card"><b>SMS / WhatsApp alerts</b> for platform changes and delays
          <div class="row"><input type="tel" id="ph" inputmode="tel" maxlength="10" placeholder="10-digit mobile">
          <label><input type="checkbox" id="cs"> I consent</label>
          <button class="btn" data-a="sub">Alert me</button></div>
          <p id="er" class="er"></p></div>`;
    },

    when() {
      return `<h2>${ic("when")} Upcoming trains</h2>
        <p class="mu">Station time ${clk(now())} (simulated) · trains yet to depart, earliest first</p>
        ${tbl(up())}`;
    },

    dest() {
      const { d } = State.get();
      return `<h2>${ic("dest")} Trains by destination</h2>
        ${d.p
          ? `<div class="row"><b>Destination: ${d.p}</b><button class="ch" data-a="chg">Change</button></div>${tbl(up().filter(x=>x[2]===d.p))}`
          : `<input id="dq" placeholder="Type to search destinations" value="${d.q||""}" autocomplete="off"><div class="card" id="dl2">${dl(d.q||"")}</div>`
        }`;
    },

    route() {
      const { d } = State.get();
      const r = TR.find(x => x[0] === d.c);
      return `<h2>${ic("route")} Train route</h2>
        <p class="mu">Type a train name or number, or select one below.</p>
        <input id="rq" placeholder="Train name or number (e.g. 12637 or Pandian)" value="${d.q||""}" autocomplete="off">
        <div class="card" id="rs">${rl(d.q, d.c)}</div>
        ${r ? rmap(r) : ""}`;
    },

    where() {
      const { w } = State.get();
      return `<h2>${ic("where")} Where do you want to go?</h2>
        <div class="row"><button class="ch ${w?"on":""}" data-a="acc">Step-free route: ${w?"ON":"OFF"}</button></div>
        <div class="tl" style="margin-top:12px">
          ${["lift","escalator","washroom","exit"].map(k=>
            `<button class="t" data-a="to" data-v="${k}"><span>${ic(k)}</span>${k[0].toUpperCase()+k.slice(1)}</button>`
          ).join("")}
        </div>`;
    },

    map() {
      const s = State.get();
      let k = s.d.to, note = "";
      if (k === "escalator" && s.w) {
        k = "lift";
        note = `<p class="wn">Step-free mode is on — escalator not accessible, showing the lift.</p>`;
      }
      const p = P[k];
      return `<h2>${ic(k)} Route to ${k}</h2>${note}
        <div class="g2">
          <div class="card">${svgMap(p)}
            <small>L Lift · E Escalator · W Washroom · X Exit — <em>simulated schematic layout, not to scale</em></small>
          </div>
          <div class="card"><b>Directions</b>
            <ol>${ST[k].map(s=>`<li>${s}`).join("")}</ol>
            <p>≈ ${p.length*20} m · about ${p.length*15} sec</p>
          </div>
        </div>`;
    },

    help() {
      return `<h2>${ic("help")} What do you need?</h2>
        <div class="tl">${["medical","security","lost"].map(k=>
          `<button class="t ${k!=="lost"?"rd":""}" data-a="go" data-v="${k}">
            <span>${ic(k)}</span>${k[0].toUpperCase()+k.slice(1)}
            <small>ISL sign: ${k.toUpperCase()}</small>
          </button>`
        ).join("")}</div>`;
    },

    medical() {
      const { d } = State.get();
      return `<h2>${ic("medical")} Medical assistance requested</h2>
        <p class="ok"><b>Your location has been recorded:</b> Egmore · Concourse · Kiosk K-03</p>
        <p class="er"><small>⚠ SIMULATED — No real medical services have been notified.</small></p>
        ${d.request_id ? `<small>Request ID: ${d.request_id}</small>` : ""}
        ${trk(["Request recorded","Staff notified (sim.)","Staff arrived (sim.)"], d.step||0)}
        <div class="card"><b>Stay where you are. Help is on the way (simulated).</b><br>
          ${d.more?"<span class='er'>Additional help requested (simulated).</span>":""}</div>
        <div class="card"><b>Optional: where is the problem?</b><br>
          ${chips(["Head","Chest","Stomach","Arm","Leg","Not sure"],"body",d.body)}</div>
        <div class="row">
          <button class="btn" data-a="more">I need more help</button>
          ${d.cf
            ? `<span>Cancel the request? <button class="ch" data-a="cxy">Yes, cancel</button> <button class="ch" data-a="cxn">No</button></span>`
            : `<button class="ch" data-a="cx">I'm okay – cancel request</button>`
          }
        </div>`;
    },

    security() {
      const { d, dis } = State.get();
      if (!d.sent) {
        return `<h2>${ic("security")} Security</h2>
          <p>A silent record will be created. Nothing loud will happen here.</p>
          <label><input type="checkbox" ${dis?"checked":""} data-a="dis"> Discreet mode (neutral screen text)</label>
          <div class="tl" style="margin-top:12px">
            ${["Being followed","Harassment","Theft","Unsafe person nearby","Other"].map(x=>
              `<button class="t" style="min-height:90px;font-size:1.2em" data-a="sec" data-v="${x}">${x}</button>`
            ).join("")}
          </div>`;
      }
      return `<h2>${dis?"Request received":ic("security")+" Security request recorded (simulated)"}</h2>
        <p class="ok">Location: Egmore · Concourse · Kiosk K-03</p>
        <p class="er"><small>⚠ SIMULATED — No real security services have been notified.</small></p>
        ${trk(dis?["Received","Coming","Here"]:["Request recorded","Security notified (sim.)","Security arrived (sim.)"], d.step||0)}
        <p>${dis?"Please wait here.":"Stay in a well-lit, busy spot if you can."}</p>
        <div class="row">
          <button class="btn" data-a="more">I need further help</button>
          <button class="ch" data-a="hide">Quick hide screen</button>
          <button class="ch" data-a="home">I'm safe – done</button>
        </div>
        ${d.more?"<p class='er'>Additional support requested (simulated).</p>":""}`;
    },

    lost() {
      return `<h2>${ic("lost")} What is lost?</h2>
        <div class="tl">
          <button class="t" data-a="lp"><span>${ic("person")}</span>A person<small>my companion</small></button>
          <button class="t" data-a="li"><span>${ic("item")}</span>An item<small>bag, phone, documents…</small></button>
        </div>`;
    },

    lostp() {
      const { d } = State.get();
      const v = d.f || {};
      if (d.sent) {
        return `<h2>Report received</h2>
          <p class="er"><small>⚠ SIMULATED — No real announcement has been made.</small></p>
          ${d.request_id ? `<small>Request ID: ${d.request_id}</small>` : ""}
          ${trk(["Report recorded","Staff approval (sim.)","Announcement (sim.)"], d.step||0)}
          <div class="card"><b>Announcement text (simulated)</b>
            <p>"${v.n||"—"}, ${v.a||"—"} years, ${v.d||"no description"}: your companion is waiting at ${v.w||"the Platform 1 bench"}. Please go to them."</p>
          </div>
          ${v.dk?`<div class="board">MESSAGE FOR ${(v.n||"").toUpperCase()}: YOUR COMPANION IS AT ${(v.w||"PLATFORM 1 BENCH").toUpperCase()} · SIMULATED DISPLAY</div>`:""}
          <div class="row" style="margin-top:12px">
            <button class="btn" data-a="arr">My companion has arrived</button>
            <button class="ch" data-a="go" data-v="help">I need further help</button>
          </div>`;
      }
      return `<h2>${ic("person")} Lost person</h2>
        <div class="g2"><div>
          <input data-f="n" placeholder="Name of lost person" value="${v.n||""}">
          <input data-f="a" inputmode="numeric" placeholder="Age" value="${v.a||""}">
          <input data-f="d" placeholder="Clothes / description" value="${v.d||""}">
          <select data-f="w"><option value="">Where will you wait?
            <option>Platform 1 bench<option>Main entrance<option>Enquiry counter</select>
          <label><input type="checkbox" data-f="dk" ${v.dk?"checked":""}> The lost person is deaf / hard of hearing</label>
        </div>
        <div class="card"><b>Tap the map where you last saw them</b>
          <div id="mw">${svgMap(null, d.pin)}</div>
        </div></div>
        <p class="er" id="er"></p>
        <button class="btn" data-a="subp">Send to staff</button>`;
    },

    losti() {
      const { d } = State.get();
      const v = d.f || {};
      if (d.sent) {
        return `<h2>Report submitted</h2>
          <div class="card">
            <p>Reference <b>${d.request_id || "LI-DEMO"}</b>. We will contact you if the item is found.</p>
            <small>⚠ SIMULATED — Not connected to a real lost property system.</small>
          </div>
          <button class="btn" data-a="home">Done</button>`;
      }
      return `<h2>${ic("item")} Lost item</h2>
        <b>Category</b><br>${chips(["Bag","Phone","Wallet","Documents","Other"],"cat",v.cat)}
        <input data-f="c" placeholder="Colour / brand" value="${v.c||""}">
        <input data-f="t" placeholder="Train number / coach (optional)" value="${v.t||""}">
        <input data-f="d" placeholder="Describe the item" value="${v.d||""}">
        <input data-f="ct" placeholder="Phone or email for updates (optional)" value="${v.ct||""}">
        <label><input type="checkbox" data-f="cs" ${v.cs?"checked":""}> I consent to being contacted</label>
        <p class="er" id="er"></p>
        <button class="btn" data-a="subi">Submit report</button>`;
    },

    sos() {
      const { d } = State.get();
      return `<h2>${ic("alert")} Alert recorded — station staff</h2>
        <p class="ok"><b>Your location:</b> Egmore · Concourse · Kiosk K-03</p>
        <p class="er"><small>⚠ SIMULATED — No real staff or emergency services have been notified. In a real emergency, use the physical emergency call button beside this kiosk.</small></p>
        ${d.request_id ? `<small>Request ID: ${d.request_id}</small>` : ""}
        ${trk(["Alert recorded","Staff notified (sim.)","Staff arrived (sim.)"], d.step||0)}
        <div class="card"><b>Stay where you are. Help is coming (simulated).</b></div>
        <div class="card"><b>Optional: tell staff what kind of help you need</b><br>
          ${chips(["Medical","Security","Lost person","Other"],"kind",d.kind)}
          ${d.kind?`<p class="ok">Staff have been told: ${d.kind} (simulated).</p>`:""}
        </div>
        <div class="row">
          <button class="btn" data-a="more">I need more help</button>
          ${d.cf
            ? `<span>Cancel? <button class="ch" data-a="cxy">Yes, cancel</button> <button class="ch" data-a="cxn">No</button></span>`
            : `<button class="ch" data-a="cx">I'm okay – cancel</button>`
          }
          ${d.more?"<span class='er'>Extra staff requested (simulated).</span>":""}
        </div>`;
    },

    ticket() {
      return `<h2>${ic("ticket")} Ticket counter</h2>
        <div class="card">
          <p>Ticket counters are located near the main entrance (Platform 1 side).</p>
          <p>For unreserved tickets, use the <b>UTS mobile app</b> or the <b>UTS counter</b> near Entrance 1.</p>
          <p class="mu"><small>⚠ This is a simulated direction notice. Verify at the station enquiry counter.</small></p>
        </div>
        <button class="btn" data-a="home">Back to home</button>`;
    },

    done() {
      const { d } = State.get();
      return `<div class="card" style="text-align:center"><h2>${d.m}</h2>
        <button class="btn" data-a="home">Home</button></div>`;
    },
  };

  // ── Header + nav + sim bar ─────────────────────────────────────────────

  const SIM_GESTURES = [
    "train","when","destination","route","where","help","medical","security","lost","back","cancel"
  ];

  function hd() {
    const s = State.get();
    return `<div class="hd">
      <div><b>Chennai Egmore (MS)</b> <small>· Southern Railway · Kiosk K-03</small></div>
      <div class="r">
        ${["en","ta","hi"].map(l =>
          `<button class="ch ${s.lang===l?"on":""}" data-a="lang" data-v="${l}">${{en:"EN",ta:"தமிழ்",hi:"हिं"}[l]}</button>`
        ).join("")}
        <button class="ch" data-a="fs" aria-label="Larger text">A+</button>
        <button class="sos" data-a="sos">SOS – Alert staff</button>
      </div>
    </div>`;
  }

  function nav() {
    const scr = State.get().scr;
    if (["idle","home"].includes(scr)) return "";
    return `<div class="nav">
      <button class="ch" data-a="back">← Back</button>
      <button class="ch" data-a="home">Home</button>
    </div>`;
  }

  function sim() {
    return `<div class="sim">
      <b>Sign simulator (demo):</b>
      ${SIM_GESTURES.map(s => `<button data-a="sg" data-v="${s}">${s}</button>`).join("")}
    </div>`;
  }

  function modal() {
    const s = State.get();
    if (s.to) {
      return `<div class="mod"><div><h2>Still there?</h2>
        <p>Session ends in 10 seconds. Touch the screen or raise your hand to continue.</p>
      </div></div>`;
    }
    if (s.m) {
      return `<div class="mod"><div>
        <div class="hand">${ic("hand")}</div>
        <h2>Did you sign "${s.m.toUpperCase()}"?</h2>
        <p class="mu">Confirm with a thumbs-up, or tap.</p>
        <div class="row" style="justify-content:center">
          <button class="btn" data-a="sy">Yes</button>
          <button class="ch" data-a="sn">No</button>
        </div>
      </div></div>`;
    }
    return "";
  }

  function render() {
    const s   = State.get();
    const app = document.getElementById("app");
    if (!app) return;
    const viewFn = V[s.scr];
    if (!viewFn) {
      app.innerHTML = hd() + nav() + `<main><p class="er">Unknown screen: ${s.scr}</p></main>` + sim() + modal();
      return;
    }
    app.innerHTML = hd() + nav() + `<main>${viewFn()}</main>` + sim() + modal();
  }

  global.Views  = { render, V, ic, rows, dl, rl };
  global._TR    = TR;  // expose for app.js action handlers
}(window));
