// 가상야구리그 로스터 매니저 - 앱 로직/화면 동작
let currentSeason = firstSeason;
let currentTeam = "KIA 타이거즈";

function parseAge(value) {
    return parseInt(String(value || "").replace("세", "").trim(), 10) || 0;
}

function parseStatValue(value) {
    const raw = String(value || "").trim();
    if (raw === "-?" || raw === "?" || raw === "") return 0;
    const num = parseInt(raw.replace("+", ""), 10);
    return Number.isNaN(num) ? 0 : num;
}

function normalizeText(value) {
    if (!value) return "X";
    const v = value.trim();
    if (v === "" || v === "-") return "X";
    return v;
}

function extractYears(value) {
    if (!value || value === "X") return [];
    const matches = String(value).match(/20\d{2}/g);
    return matches ? matches.map(Number) : [];
}

function isCurrentFA(player, stoveSeason = currentSeason) {
    const faYear = parseInt(player.fa, 10);
    return !Number.isNaN(faYear) && faYear === stoveSeason - 1;
}

function isPastFA(player, stoveSeason = currentSeason) {
    const faYear = parseInt(player.fa, 10);
    return !Number.isNaN(faYear) && faYear < stoveSeason - 1;
}

function isCurrentOptOut(player, stoveSeason = currentSeason) {
    return extractYears(player.optOut).includes(stoveSeason - 1);
}

function getFutureOptOutText(player, stoveSeason) {
    if (!player.optOut || player.optOut === "X") return "";
    const years = extractYears(player.optOut);
    if (years.includes(stoveSeason - 1)) return "Opt-out";
    return "";
}

function parseRosterText(text) {
    const db = {};
    let current = null;

    text.split("\n").forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (trimmed.startsWith("이름 /")) return;

        if (TEAM_NAMES.includes(trimmed)) {
            current = trimmed;
            db[current] = [];
            return;
        }

        if (!current) return;

        const parts = trimmed.split("/").map(v => v.trim());
        const [
            name,
            ageRaw,
            statRaw,
            throwBatRaw,
            pos,
            faRaw,
            optOutRaw,
            ...noteRest
        ] = parts;

        const optOut = normalizeText(optOutRaw);
        const note = noteRest.length ? noteRest.join(" / ").trim() : "X";

        db[current].push({
            name: name || "",
            age: parseAge(ageRaw),
            stat: parseStatValue(statRaw),
            statRaw: statRaw || "",
            throwBat: throwBatRaw || "미상",
            pos: pos || "",
            fa: normalizeText(faRaw),
            optOut,
            note: normalizeText(note)
        });
    });

    return db;
}

const database = parseRosterText(rawRosterText);

function getGrade(stat) {
    if (stat >= 201) return "S";
    if (stat >= 151) return "A";
    if (stat >= 101) return "B";
    if (stat >= 51) return "C";
    return "D";
}

function getBaseStat(player) {
    if (typeof player.stat === "number") return player.stat;
    return parseStatValue(player.stat);
}

function calculateFutureStat(player, targetYear) {
    const note = player.note || "";
    let simAge = player.age + (targetYear - baseAgeSeason);
    let simStat = getBaseStat(player);
    const statYearsPassed = targetYear - baseSeason;

    for (let i = 0; i < statYearsPassed; i++) {
        const agingAge = player.age + ((baseSeason + i) - baseAgeSeason);
        if (agingAge >= 34 && agingAge <= 36) simStat -= 10;
        else if (agingAge >= 37 && agingAge <= 40) simStat -= 25;
        else if (agingAge >= 41) simStat -= 45;
    }

    if (note.includes("신인버프 30")) {
        if (statYearsPassed >= 1) simStat -= 10;
        if (statYearsPassed >= 2) simStat -= 10;
        if (statYearsPassed >= 3) simStat -= 10;
    } else if (note.includes("신인버프 20")) {
        if (statYearsPassed >= 1) simStat -= 10;
        if (statYearsPassed >= 2) simStat -= 10;
    } else if (note.includes("신인버프 10")) {
        if (statYearsPassed >= 1) simStat -= 10;
    }

    if (note.includes("군대버프 10") || note.includes("군입대버프 10")) {
        if (statYearsPassed >= 1) simStat -= 10;
    }

    return { age: simAge, stat: Math.max(simStat, 0) };
}

const tabsContainer = document.getElementById('teamTabs');
const pList = document.getElementById('pitcher-list');
const bList = document.getElementById('batter-list');
const slider = document.getElementById('yearSlider');
const displayYear = document.getElementById('displayYear');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const resultCount = document.getElementById('result-count');

function switchMode(mode) {
    const viewList = document.getElementById('view-list');
    const viewDepth = document.getElementById('view-depth');
    const btnList = document.getElementById('btn-list');
    const btnDepth = document.getElementById('btn-depth');

    if (mode === 'list') {
        viewList.classList.remove('hidden');
        viewDepth.classList.add('hidden');
        btnList.classList.add('active');
        btnDepth.classList.remove('active');
    } else {
        viewList.classList.add('hidden');
        viewDepth.classList.remove('hidden');
        btnList.classList.remove('active');
        btnDepth.classList.add('active');
    }
}

const modalOverlay = document.getElementById('playerModal');
const modalName = document.getElementById('modal-name');
const modalDetail = document.getElementById('modal-detail');
const modalNote = document.getElementById('modal-note');
const modalTableBody = document.getElementById('modal-table-body');
const chartContainer = document.getElementById('chart-container');
const faModal = document.getElementById('faModal');
const faYearTitle = document.getElementById('fa-year-title');
const faListBody = document.getElementById('fa-list-body');

function closeModal(e, id) {
    const modal = document.getElementById(id);
    if (e.target === modal || e.target.classList.contains('close-btn')) modal.classList.remove('active');
}

function drawChart(data) {
    const width = chartContainer.clientWidth - 20;
    const height = 180;
    const padding = 20;
    const maxStat = Math.max(...data.map(d => d.stat), 200);
    const xStep = (width - padding * 2) / (data.length - 1);
    let svgContent = `<svg width="${width}" height="${height}" style="overflow:visible;">`;
    svgContent += `<line x1="${padding}" y1="${height-padding}" x2="${width}" y2="${height-padding}" stroke="#444" stroke-width="1" />`;

    let statPath = "";
    data.forEach((d, i) => {
        const x = padding + i * xStep;
        const y = (height - padding) - (d.stat / maxStat) * (height - padding * 2);
        statPath += (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
        svgContent += `<circle cx="${x}" cy="${y}" r="3" fill="#ff5e5e" />`;
        svgContent += `<text x="${x}" y="${height}" fill="#aaa" font-size="10" text-anchor="middle">${d.year}</text>`;
        if (i % 2 === 0 || i === data.length - 1) {
            svgContent += `<text x="${x}" y="${y-5}" fill="#ff5e5e" font-size="10" text-anchor="middle">${d.stat}</text>`;
        }
    });
    svgContent += `<path d="${statPath}" fill="none" stroke="#ff5e5e" stroke-width="2" />`;
    svgContent += `</svg>`;
    chartContainer.innerHTML = svgContent;
}

function getContractTextForSeason(player, stoveSeason) {
    const labels = [];
    if (isCurrentFA(player, stoveSeason)) labels.push("FA");
    const optText = getFutureOptOutText(player, stoveSeason);
    if (optText) labels.push(optText);
    return labels.length ? labels.join(" / ") : "-";
}

function openPlayerModal(player) {
    modalName.innerText = player.name;
    const currentSim = calculateFutureStat(player, currentSeason);
    const optOutDisplay = player.optOut !== 'X' ? ` | 옵트아웃 ${player.optOut}` : '';
    modalDetail.innerText = `${player.pos} | ${player.throwBat || '미상'} | ${currentSim.age}세 | FA ${player.fa}${optOutDisplay}`;
    modalNote.innerText = player.note !== 'X' ? player.note : '특이사항 없음';

    modalTableBody.innerHTML = '';
    const chartData = [];

    for (let y = firstSeason; y <= lastSeason; y++) {
        const sim = calculateFutureStat(player, y);
        const grade = getGrade(sim.stat);
        chartData.push({ year: y, stat: sim.stat });
        const contractText = getContractTextForSeason(player, y);
        const row = document.createElement('tr');
        if (y === currentSeason) row.classList.add('current-season');
        row.innerHTML = `
            <td>${y}</td>
            <td>${sim.age}</td>
            <td>${sim.stat}</td>
            <td class="cell-${grade.toLowerCase()}">${grade}</td>
            <td class="${contractText.includes('FA') ? 'cell-fa' : (contractText.includes('Opt-out') ? 'cell-opt' : '')}">${contractText}</td>
        `;
        modalTableBody.appendChild(row);
    }

    modalOverlay.classList.add('active');
    setTimeout(() => drawChart(chartData), 50);
}

function openFAModal() {
    faYearTitle.innerText = `${currentSeason} 스토브리그`;
    faListBody.innerHTML = '';
    let marketPlayers = [];

    Object.keys(database).forEach(team => {
        database[team].forEach(p => {
            if (isCurrentFA(p, currentSeason) || isCurrentOptOut(p, currentSeason)) {
                const sim = calculateFutureStat(p, currentSeason);
                marketPlayers.push({ ...p, team, currentStat: sim.stat, marketType: isCurrentFA(p, currentSeason) ? 'FA' : 'Opt-out' });
            }
        });
    });

    marketPlayers.sort((a, b) => b.currentStat - a.currentStat);

    if (marketPlayers.length === 0) {
        faListBody.innerHTML = '<div style="padding:20px; text-align:center; color:#777;">해당 스토브리그에 예정된 FA/옵트아웃 선수가 없습니다.</div>';
    } else {
        marketPlayers.forEach(p => {
            const grade = getGrade(p.currentStat);
            const div = document.createElement('div');
            div.className = 'fa-item';
            div.style.cursor = 'pointer';
            div.onclick = () => openPlayerModal(p);
            div.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <span class="fa-team-logo">${p.team}</span>
                    <span style="font-weight:bold; margin-right:5px;">${p.name}</span>
                    <span class="grade-badge bg-${grade}">${grade}</span>
                    <span class="tag ${p.marketType === 'FA' ? 'tag-fa-urgent' : 'tag-opt-urgent'}" style="margin-left:6px;">${p.marketType}</span>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.8rem; color:#aaa;">${p.pos} | ${p.throwBat || '미상'} | ${calculateFutureStat(p, currentSeason).age}세</div>
                    <div style="font-weight:bold;">Stat: ${p.currentStat}</div>
                </div>
            `;
            faListBody.appendChild(div);
        });
    }
    faModal.classList.add('active');
}

Object.keys(database).forEach(team => {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${team === currentTeam ? 'active' : ''}`;
    btn.innerText = team;
    btn.onclick = () => { currentTeam = team; loadTeam(); };
    tabsContainer.appendChild(btn);
});

slider.addEventListener('input', e => {
    currentSeason = parseInt(e.target.value, 10);
    displayYear.innerText = currentSeason;
    loadTeam();
});

if (searchInput) searchInput.addEventListener('input', loadTeam);
if (sortSelect) sortSelect.addEventListener('change', loadTeam);

function loadTeam() {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.innerText === currentTeam));
    pList.innerHTML = '';
    bList.innerHTML = '';

    const roster = database[currentTeam];
    if (!roster || roster.length === 0) {
        pList.innerHTML = '<p style="color:#aaa; text-align:center;">데이터가 없습니다.</p>';
        return;
    }

    let simulatedRoster = roster.map(p => {
        const simData = calculateFutureStat(p, currentSeason);
        return { ...p, simAge: simData.age, simStat: simData.stat, _origin: p };
    });

    const query = ((searchInput && searchInput.value) || '').trim().toLowerCase();
    simulatedRoster = simulatedRoster.filter(p => {
        return !query || p.name.toLowerCase().includes(query);
    });

    const sortValue = (sortSelect && sortSelect.value) || 'stat_desc';
    simulatedRoster.sort((a, b) => {
        if (sortValue === 'stat_asc') return a.simStat - b.simStat;
        if (sortValue === 'age_asc') return a.simAge - b.simAge;
        if (sortValue === 'age_desc') return b.simAge - a.simAge;
        if (sortValue === 'name_asc') return a.name.localeCompare(b.name, 'ko');
        return b.simStat - a.simStat;
    });

    if (resultCount) resultCount.innerText = `표시: ${simulatedRoster.length} / 전체: ${roster.length}`;

    if (simulatedRoster.length === 0) {
        pList.innerHTML = '<p style="color:#aaa; text-align:center;">조건에 맞는 선수가 없습니다.</p>';
        bList.innerHTML = '<p style="color:#aaa; text-align:center;">조건에 맞는 선수가 없습니다.</p>';
        document.getElementById('dash-age').innerText = '-세';
        document.getElementById('dash-dist').innerHTML = `
            <span class="dist-box bg-S text-black">S 0</span>
            <span class="dist-box bg-A text-black">A 0</span>
            <span class="dist-box bg-B text-black">B 0</span>
            <span class="dist-box bg-C text-black">C 0</span>
            <span class="dist-box bg-D text-black">D 0</span>
        `;
        return;
    }

    let totalAge = 0;
    const gradeCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    simulatedRoster.forEach(p => {
        totalAge += p.simAge;
        gradeCounts[getGrade(p.simStat)]++;
    });

    const avgAge = (totalAge / simulatedRoster.length).toFixed(1);
    document.getElementById('dash-age').innerText = `${avgAge}세`;
    document.getElementById('dash-dist').innerHTML = `
        <span class="dist-box bg-S text-black">S ${gradeCounts.S}</span>
        <span class="dist-box bg-A text-black">A ${gradeCounts.A}</span>
        <span class="dist-box bg-B text-black">B ${gradeCounts.B}</span>
        <span class="dist-box bg-C text-black">C ${gradeCounts.C}</span>
        <span class="dist-box bg-D text-black">D ${gradeCounts.D}</span>
    `;


    simulatedRoster.forEach(player => {
        const grade = getGrade(player.simStat);
        const isPitcher = player.pos && player.pos.includes('P');
        let faTag = '';
        if (player.fa && player.fa !== 'X') {
            const faYear = parseInt(player.fa, 10);
            if (isCurrentFA(player, currentSeason)) faTag = `<span class="tag tag-fa-urgent">🚨 현재 FA</span>`;
            else if (isPastFA(player, currentSeason)) faTag = `<span class="tag tag-fa-past">FA 지남</span>`;
            else if (!Number.isNaN(faYear)) faTag = `<span class="tag tag-fa">FA: ${player.fa}</span>`;
        }

        let optTag = '';
        if (player.optOut && player.optOut !== 'X') {
            if (isCurrentOptOut(player, currentSeason)) {
                optTag = `<span class="tag tag-opt-urgent">🚨 현재 옵트아웃</span>`;
            } else {
                optTag = `<span class="tag tag-fa">옵트: ${player.optOut}</span>`;
            }
        }

        let changeText = '';
        const diff = player.simStat - getBaseStat(player._origin);
        if (diff > 0) changeText = `<span class="stat-change-up">▲${diff}</span>`;
        else if (diff < 0) changeText = `<span class="stat-change-down">▼${Math.abs(diff)}</span>`;

        const card = document.createElement('div');
        card.className = `player-card border-${grade}`;
        card.onclick = () => openPlayerModal(player._origin);
        card.innerHTML = `
            <div class="info">
                <div class="header-row">
                    <span class="name">${player.name}</span>
                    <span class="grade-badge bg-${grade}">${grade}</span>
                    ${changeText}
                </div>
                <div class="detail">${player.pos} | ${player.throwBat || '미상'} | ${player.simAge}세</div>
                <div class="notes">${player.note !== 'X' ? player.note : ''}</div>
                <div class="contract-tags">${faTag}${optTag}</div>
                <div class="stat-bar-bg"><div class="stat-bar-fill bg-${grade}" style="width: ${Math.min(player.simStat / 2.5, 100)}%"></div></div>
            </div>
            <div class="stat-box"><span class="stat-value text-${grade}">${player.simStat}</span></div>
        `;
        if (isPitcher) pList.appendChild(card);
        else bList.appendChild(card);
    });

    const positions = { 'P': [], 'C': [], '1B': [], '2B': [], '3B': [], 'SS': [], 'LF': [], 'CF': [], 'RF': [] };
    simulatedRoster.forEach(p => {
        if (p.pos.includes('P')) positions['P'].push(p);
        else p.pos.split(',').map(s => s.trim()).forEach(pos => { if (positions[pos]) positions[pos].push(p); });
    });

    Object.keys(positions).forEach(posKey => {
        const boxList = document.querySelector(`#depth-${posKey} .list`);
        const boxContainer = document.querySelector(`#depth-${posKey}`);
        if (!boxList) return;
        boxList.innerHTML = '';
        const players = positions[posKey].sort((a, b) => b.simStat - a.simStat);
        if (players.length === 0) {
            boxContainer.classList.add('danger');
            boxList.innerHTML = '<span style="color:#aaa; font-size:0.7rem;">없음</span>';
        } else {
            boxContainer.classList.remove('danger');
            players.slice(0, 3).forEach(p => {
                const pGrade = getGrade(p.simStat);
                const div = document.createElement('div');
                div.className = 'pos-player';
                div.style.cursor = 'pointer';
                div.onclick = e => { e.stopPropagation(); openPlayerModal(p._origin); };
                div.innerHTML = `<span class="pos-name text-${pGrade}">${p.name}</span><span class="pos-stat text-${pGrade}">${p.simStat}</span>`;
                boxList.appendChild(div);
            });
            if (players.length > 3) {
                const moreTrigger = document.createElement('div');
                moreTrigger.className = 'more-trigger';
                moreTrigger.innerHTML = `+${players.length - 3}명`;
                const popup = document.createElement('div');
                popup.className = 'more-popup';
                players.slice(3).forEach(p => {
                    const pGrade = getGrade(p.simStat);
                    const pDiv = document.createElement('div');
                    pDiv.className = 'pos-player';
                    pDiv.style.cursor = 'pointer';
                    pDiv.onclick = e => { e.stopPropagation(); openPlayerModal(p._origin); };
                    pDiv.innerHTML = `<span class="pos-name text-${pGrade}">${p.name}</span><span class="pos-stat text-${pGrade}">${p.simStat}</span>`;
                    popup.appendChild(pDiv);
                });
                moreTrigger.appendChild(popup);
                boxList.appendChild(moreTrigger);
            }
        }
    });
}

loadTeam();
