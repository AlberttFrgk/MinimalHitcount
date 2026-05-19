class WebSocketManager {
    constructor(host) {
        this.host = host;
        this.sockets = {};
        this.createConnection = this.createConnection.bind(this);
    }

    createConnection(url, callback, filters) {
        let interval;
        const counterPath = window.COUNTER_PATH || "";
        const query = url.includes("?") ? `&l=${encodeURI(counterPath)}` : `?l=${encodeURI(counterPath)}`;
        const fullUrl = `ws://${this.host}${url}${query}`;
        this.sockets[url] = new WebSocket(fullUrl);

        this.sockets[url].onopen = () => {
            if (interval) clearInterval(interval);
            if (filters) this.sockets[url].send(`applyFilters:${JSON.stringify(filters)}`);
        };

        this.sockets[url].onclose = () => {
            delete this.sockets[url];
            interval = window.setTimeout(() => this.createConnection(url, callback, filters), 1000);
        };

        this.sockets[url].onmessage = ({ data }) => {
            try {
                const parsed = JSON.parse(data);
                if (parsed && typeof parsed === "object" && !("error" in parsed)) callback(parsed);
            } catch (e) {}
        };
    }

    api_v2(callback, filters)         { this.createConnection("/websocket/v2", callback, filters); }
    api_v2_precise(callback, filters) { this.createConnection("/websocket/v2/precise", callback, filters); }
    commands(callback)                { this.createConnection("/websocket/commands", callback); }

    sendCommand(name, command, retry = 1) {
        const socket = this.sockets["/websocket/commands"];
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(`${name}:${command}`);
        } else if (retry <= 50) {
            setTimeout(() => this.sendCommand(name, command, retry + 1), 100);
        }
    }
}

const string = {
    global: { pp: "PP", ur: "UR", ratio: "Ratio", combo: "Max Combo", early: "Early", late: "Late", miss: "Miss" },
    modes: {
        mania:  { h300g: "MAX",   h300: "Perfect",	 h200: "Great", h100: "Good", h50: "Bad" },
        catch:  {                 h300: "Fruit",                	h100: "Drop", h50: "Droplet" },
        fruits: {                 h300: "Fruit",               		h100: "Drop", h50: "Droplet" },
        taiko:  {                 h300: "Great",                	h100: "Ok" },
        osu:    {                 h300: "300",                  	h100: "100",  h50: "50" }
    }
};

const getWindows = (mode, od, modsString) => {
    let mOd = od;
    const mods = modsString || "";
    if (mode === "mania") {
        if (mods.includes("EZ")) mOd = od * 0.5;
        const hrMult = mods.includes("HR") ? 5/7 : 1;
        return [16, ((64 - 3 * mOd) * hrMult), ((97 - 3 * mOd) * hrMult), ((127 - 3 * mOd) * hrMult), ((151 - 3 * mOd) * hrMult)];
    }
    if (mods.includes("EZ")) mOd = od / 2;
    else if (mods.includes("HR")) mOd = Math.min(od * 1.4, 10);
    if (mode === "taiko") return [(50 - 3 * mOd), (mOd >= 5 ? 119.5 - 8 * mOd : 110 - 6 * mOd), (mOd >= 5 ? 135 - 8 * mOd : 120 - 5 * mOd)];
    return [(80 - 6 * mOd), (140 - 8 * mOd), (200 - 10 * mOd)];
};

function updateRow(element, label, value) {
    if (!element) return;
    element.innerHTML = `<span class="row-label">${label}</span><span class="row-val">${value}</span>`;
}

function distributeDelta(newTotal, display, preciseTally, isMiss = false) {
    const targetTotal = newTotal || 0;
    const delta = targetTotal - display.t;
    if (delta <= 0) return; 
    
    if (isMiss) {
        const availableE = Math.max(0, preciseTally.e - display.e);
        const addE = Math.min(delta, availableE);
        display.e += addE;
        display.l += (delta - addE);
    } else {
        const preciseTotal = preciseTally.e + preciseTally.l;
        if (preciseTotal === 0) {
            const half = Math.floor(delta / 2);
            display.e += half;
            display.l += (delta - half);
        } else {
            const expectedE = Math.round(targetTotal * (preciseTally.e / preciseTotal));
            let addE = expectedE - display.e;
            addE = Math.max(0, Math.min(delta, addE));
            display.e += addE;
            display.l += (delta - addE);
        }
    }
    display.t = targetTotal;
}

const wsManager = new WebSocketManager(window.location.host);

const hitcountBox = document.getElementById("hitcount_box");
const elPp = document.getElementById("pp");
const elUr = document.getElementById("ur");
const elRatio = document.getElementById("ratio");
const elMaxCombo = document.getElementById("maxCombo");
const elEarly = document.getElementById("earlyCount");
const elLate = document.getElementById("lateCount");
const el300g = document.getElementById("h300g");
const el300 = document.getElementById("h300");
const el200 = document.getElementById("h200");
const el100 = document.getElementById("h100");
const el50 = document.getElementById("h50");
const elMiss = document.getElementById("miss");
const brHits = document.getElementById("brHits");
const brEarlyLate = document.getElementById("brEarlyLate");

let activeSettings = {
    hidePP: false, hideUR: false, hideRatio: false,
    hideHitCounts: false, hideEarlyLate: false, showMaxCombo: false
};

wsManager.commands((data) => {
    try {
        if (data.command !== "getSettings") return;
        Object.assign(activeSettings, data.message);
        applySettingsToUI();
    } catch (e) {}
});

wsManager.sendCommand("getSettings", window.COUNTER_PATH ? encodeURI(window.COUNTER_PATH) : "");

function applySettingsToUI() {
    activeSettings.hidePP ? elPp.classList.add("hidden") : elPp.classList.remove("hidden");
    activeSettings.hideUR ? elUr.classList.add("hidden") : elUr.classList.remove("hidden");
    activeSettings.hideRatio ? elRatio.classList.add("hidden") : elRatio.classList.remove("hidden");
    if (elMaxCombo) activeSettings.showMaxCombo ? elMaxCombo.classList.remove("hidden") : elMaxCombo.classList.add("hidden");

    if (activeSettings.hideHitCounts) {
        [el300g, el300, el200, el100, el50, elMiss].forEach(el => el.classList.add("hidden"));
        if (brHits) brHits.classList.add("hidden");
    } else {
        elMiss.classList.remove("hidden");
        if (brHits) brHits.classList.remove("hidden");
    }

    if (activeSettings.hideEarlyLate) {
        elEarly.classList.add("hidden"); elLate.classList.add("hidden");
        if (brEarlyLate) brEarlyLate.classList.add("hidden");
    } else {
        elEarly.classList.remove("hidden"); elLate.classList.remove("hidden");
        if (brEarlyLate) brEarlyLate.classList.remove("hidden");
    }
}

let cache = { state: "", mode: "osu", od: 0, mods: "", processedHits: 0, curTotalHits: 0, lastTime: 0 };
let hitTally = { mania: [ {e:0, l:0}, {e:0, l:0}, {e:0, l:0}, {e:0, l:0}, {e:0, l:0} ], taiko: [ {e:0, l:0}, {e:0, l:0} ], std: [ {e:0, l:0}, {e:0, l:0}, {e:0, l:0} ] };
let displayTally = { mania: [ {e:0, l:0, t:0}, {e:0, l:0, t:0}, {e:0, l:0, t:0}, {e:0, l:0, t:0}, {e:0, l:0, t:0} ], taiko: [ {e:0, l:0, t:0}, {e:0, l:0, t:0} ], std: [ {e:0, l:0, t:0}, {e:0, l:0, t:0}, {e:0, l:0, t:0} ] };

function resetCounters() {
    if (!activeSettings.hideUR) updateRow(elUr, string.global.ur, "0.00");
    if (!activeSettings.hideRatio) updateRow(elRatio, string.global.ratio, "0:1");
    if (!activeSettings.hideEarlyLate) {
        updateRow(elEarly, string.global.early, "0");
        updateRow(elLate, string.global.late, "0");
    }
    
    hitTally.mania.forEach(t => { t.e = 0; t.l = 0; }); hitTally.taiko.forEach(t => { t.e = 0; t.l = 0; }); hitTally.std.forEach(t => { t.e = 0; t.l = 0; });
    displayTally.mania.forEach(t => { t.e = 0; t.l = 0; t.t = 0; }); displayTally.taiko.forEach(t => { t.e = 0; t.l = 0; t.t = 0; }); displayTally.std.forEach(t => { t.e = 0; t.l = 0; t.t = 0; });
    cache.processedHits = 0; cache.curTotalHits = 0;
}

wsManager.api_v2((data) => {
    if (!data.state?.name) return;
    const state = data.state.name;

    if (cache.state !== state) {
        if (hitcountBox) hitcountBox.style.opacity = (state === "play") ? 1 : 0;
        if (state !== "play") resetCounters();
    }

    if (!activeSettings.hidePP) {
        let ppValue = (state === 'play' || state === 'resultScreen') ? (data.play?.pp?.current || 0) : (data.performance?.pp?.current || data.play?.pp?.current || 0);
        updateRow(elPp, string.global.pp, Math.round(ppValue) + 'pp');
    }

    if (state === "play") {
        const mode = data.play?.mode?.name ?? cache.mode;
        
        if (activeSettings.showMaxCombo && elMaxCombo) {
            updateRow(elMaxCombo, string.global.combo, data.play?.combo?.max || 0);
        }

        let od = cache.od;
        if (data.beatmap?.stats?.od !== undefined) {
            if (typeof data.beatmap.stats.od === "object" && data.beatmap.stats.od.original !== undefined) od = data.beatmap.stats.od.original;
            else if (typeof data.beatmap.stats.od === "number") od = data.beatmap.stats.od;
        }

        let mods = cache.mods;
        if (data.play?.mods) {
            if (typeof data.play.mods === "string") mods = data.play.mods;
            else if (typeof data.play.mods.name === "string") mods = data.play.mods.name;
            else if (Array.isArray(data.play.mods)) mods = data.play.mods.join("");
        }

        if (cache.mode !== mode || cache.od !== od || cache.mods !== mods) {
            cache.mode = mode; cache.od = od; cache.mods = mods;
            cache.windows = getWindows(cache.mode, cache.od, cache.mods || "");
            resetCounters();
            applySettingsToUI();
        }

        const hits = data.play?.hits || {};
        const h300g = hits.geki || 0, h300 = hits[300] || 0, h200 = hits.katu || 0, h100 = hits[100] || 0, h50 = hits[50] || 0, h0 = hits[0] || 0;

        let ratioText = "0:1";
        if (mode === "mania") {
            const totalMania = h300g + h300 + h200 + h100 + h50 + h0;
            if (totalMania > 0) ratioText = (totalMania - h300g) === 0 ? "∞:1" : `${(h300g / (totalMania - h300g)).toFixed(1)}:1`;
        } else if (mode === "catch" || mode === "fruits") {
            const totalCatch = h300 + h100 + h50 + h0;
            if (totalCatch > 0) ratioText = (h100 + h50 + h0) === 0 ? "∞:1" : `${(h300 / (h100 + h50 + h0)).toFixed(1)}:1`;
        } else if (mode === "taiko") {
            const totalTaiko = h300 + h100 + h0;
            if (totalTaiko > 0) ratioText = (h100 + h0) === 0 ? "∞:1" : `${(h300 / (h100 + h0)).toFixed(1)}:1`;
        } else {
            const totalStd = h300 + h100 + h50 + h0;
            if (totalStd > 0) ratioText = (h100 + h50 + h0) === 0 ? "∞:1" : `${(h300 / (h100 + h50 + h0)).toFixed(1)}:1`;
        }

        const modeLabels = string.modes[mode] || string.modes.osu;
        
        const updateHitRow = (el, key, val) => {
            if (activeSettings.hideHitCounts) return;
            if (modeLabels[key]) {
                el.classList.remove("hidden");
                updateRow(el, modeLabels[key], val);
            } else {
                el.classList.add("hidden");
            }
        };

        updateHitRow(el300g, 'h300g', h300g);
        updateHitRow(el300,  'h300',  h300);
        updateHitRow(el200,  'h200',  h200);
        updateHitRow(el100,  'h100',  h100);
        updateHitRow(el50,   'h50',   h50);
        
        if (!activeSettings.hideHitCounts) updateRow(elMiss, string.global.miss, h0);
        if (!activeSettings.hideRatio) updateRow(elRatio, string.global.ratio, ratioText);

        if (mode === "catch" || mode === "fruits") {
            elEarly.classList.add("hidden"); elLate.classList.add("hidden");
            if (brEarlyLate) brEarlyLate.classList.add("hidden");
        } else if (!activeSettings.hideEarlyLate) {
            elEarly.classList.remove("hidden"); elLate.classList.remove("hidden");
            if (brEarlyLate) brEarlyLate.classList.remove("hidden");
        }

        const totalHits = h300g + h300 + h200 + h100 + h50 + h0;
        if (totalHits === 0 && cache.curTotalHits > 0) resetCounters();

        if (totalHits >= cache.curTotalHits) {
            cache.curTotalHits = totalHits;
            if (mode === "mania") {
                distributeDelta(hits[300], displayTally.mania[0], hitTally.mania[0]); distributeDelta(hits.katu, displayTally.mania[1], hitTally.mania[1]); distributeDelta(hits[100], displayTally.mania[2], hitTally.mania[2]); distributeDelta(hits[50], displayTally.mania[3], hitTally.mania[3]); distributeDelta(hits[0], displayTally.mania[4], hitTally.mania[4], true);
            } else if (mode === "taiko") {
                distributeDelta(hits[100], displayTally.taiko[0], hitTally.taiko[0]); distributeDelta(hits[0], displayTally.taiko[1], hitTally.taiko[1], true);
            } else {
                distributeDelta(hits[100], displayTally.std[0], hitTally.std[0]); distributeDelta(hits[50], displayTally.std[1], hitTally.std[1]); distributeDelta(hits[0], displayTally.std[2], hitTally.std[2], true);
            }

            let totalEarly = 0, totalLate = 0;
            const currentTallyArr = mode === "mania" ? displayTally.mania : (mode === "taiko" ? displayTally.taiko : displayTally.std);
            currentTallyArr.forEach(t => { totalEarly += t.e; totalLate += t.l; });

            if (!activeSettings.hideEarlyLate) {
                updateRow(elEarly, string.global.early, totalEarly);
                updateRow(elLate, string.global.late, totalLate);
            }
        }
    }
    cache.state = state;
}, ["state", { field: "play", keys: ["mode", "mods", "hits", "combo", "pp"] }, { field: "beatmap", keys: ["mode", "stats"] }, { field: "performance", keys: ["pp"] }]);

wsManager.api_v2_precise((data) => {
    if (cache.state !== "play") return;
    const hitErrors = data.hitErrors || [];
    
    if (data.currentTime < (cache.lastTime || 0) - 50) {
        resetCounters(); cache.lastTime = data.currentTime; cache.processedHits = hitErrors.length; return;
    }
    cache.lastTime = data.currentTime;

    if (hitErrors.length < cache.processedHits) {
        if (hitErrors.length === 0 || (cache.processedHits - hitErrors.length > 5)) { resetCounters(); cache.processedHits = hitErrors.length; }
        return;
    }

    if (hitErrors.length > cache.processedHits) {
        const newHits = hitErrors.slice(cache.processedHits);
        cache.processedHits = hitErrors.length;
        const mode = cache.mode, windows = cache.windows;

        newHits.forEach(err => {
            const ms = err, msAbs = Math.abs(ms);
            if (mode === "mania") {
                if (msAbs <= windows[0]) {} else if (msAbs <= windows[1]) { ms < 0 ? hitTally.mania[0].e++ : hitTally.mania[0].l++; } else if (msAbs <= windows[2]) { ms < 0 ? hitTally.mania[1].e++ : hitTally.mania[1].l++; } else if (msAbs <= windows[3]) { ms < 0 ? hitTally.mania[2].e++ : hitTally.mania[2].l++; } else if (msAbs <= windows[4]) { ms < 0 ? hitTally.mania[3].e++ : hitTally.mania[3].l++; } else { ms < 0 ? hitTally.mania[4].e++ : hitTally.mania[4].l++; }
            } else if (mode === "taiko") {
                if (msAbs <= windows[0]) {} else if (msAbs <= windows[1]) { ms < 0 ? hitTally.taiko[0].e++ : hitTally.taiko[0].l++; } else { ms < 0 ? hitTally.taiko[1].e++ : hitTally.taiko[1].l++; }
            } else {
                if (msAbs <= windows[0]) {} else if (msAbs <= windows[1]) { ms < 0 ? hitTally.std[0].e++ : hitTally.std[0].l++; } else if (msAbs <= windows[2]) { ms < 0 ? hitTally.std[1].e++ : hitTally.std[1].l++; } else { ms < 0 ? hitTally.std[2].e++ : hitTally.std[2].l++; }
            }
        });
    }

    if (!activeSettings.hideUR) {
        if (hitErrors.length > 0) {
            const mean = hitErrors.reduce((a, b) => a + b, 0) / hitErrors.length;
            const variance = hitErrors.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / hitErrors.length;
            const ur = Math.sqrt(variance) * 10;
            updateRow(elUr, string.global.ur, ur.toFixed(2));
        } else {
            updateRow(elUr, string.global.ur, "0.00");
        }
    }
}, ["hitErrors", "currentTime"]);