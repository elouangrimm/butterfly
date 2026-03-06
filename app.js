(() => {
const SESSION_KEY = "butterfly_session";

// When running as a Tauri desktop app, the API is served by the Node.js sidecar
// on a fixed local port.  In the browser (Vercel), relative paths work fine.
const API_BASE = (typeof window !== "undefined" && window.__TAURI_INTERNALS__)
    ? "http://127.0.0.1:47291"
    : "";

function getSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function setSession(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
}

function requireAuth() {
    const session = getSession();
    if (!session || !session.auth) {
        window.location.href = "/";
        return null;
    }
    return session;
}

async function apiPost(endpoint, body) {
    const res = await fetch(API_BASE + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function subjectColor(name) {
    if (!name) return "#78716c";
    let hash = 5381;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) + hash) + name.charCodeAt(i);
        hash = hash & hash;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 52%)`;
}

function gradeClass(points) {
    if (points === null || points === undefined || isNaN(points)) return "special";
    if (points >= 14) return "good";
    if (points >= 10) return "avg";
    return "bad";
}

function gradeValue(val, outOf) {
    if (!val || val.points === null) {
        if (val?.kind !== null && val?.kind !== undefined) {
            const kinds = { 0: "Absent", 1: "Non rendu", 2: "Dispensé", 3: "Exempté", 4: "Erreur" };
            return kinds[val.kind] ?? "—";
        }
        return "—";
    }
    const pts = val.points;
    const out = outOf?.points ?? 20;
    const normalized = (pts / out) * 20;
    return out !== 20 ? `${pts}/${out}` : pts.toFixed(2).replace(/\.00$/, "");
}

function gradeNormalized(val, outOf) {
    if (!val || val.points === null) return null;
    const out = outOf?.points ?? 20;
    return (val.points / out) * 20;
}

function formatDate(isoString, opts = {}) {
    if (!isoString) return "—";
    const d = new Date(isoString);
    return d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: opts.year ?? "numeric",
        ...opts
    });
}

function formatDateShort(isoString) {
    return formatDate(isoString, { year: undefined });
}

function formatTime(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function isoWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function weekDateRange(weekNum, year) {
    const y = year ?? new Date().getFullYear();
    const jan1 = new Date(y, 0, 1);
    const daysToFirstMonday = (8 - jan1.getDay()) % 7;
    const firstMonday = new Date(jan1);
    firstMonday.setDate(jan1.getDate() + daysToFirstMonday);
    const monday = new Date(firstMonday);
    monday.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return { monday, friday };
}

function showLoading(msg = "Chargement…") {
    const overlay = document.querySelector(".loading-overlay");
    if (!overlay) return;
    const text = overlay.querySelector(".loading-text");
    if (text) text.textContent = msg;
    overlay.classList.add("visible");
}

function hideLoading() {
    const overlay = document.querySelector(".loading-overlay");
    if (overlay) overlay.classList.remove("visible");
}

function showError(message) {
    const banner = document.querySelector(".error-banner");
    if (!banner) return;
    banner.textContent = message;
    banner.classList.add("visible");
}

function hideError() {
    const banner = document.querySelector(".error-banner");
    if (banner) banner.classList.remove("visible");
}

function renderNav(activePage) {
    const session = getSession();
    if (!session) return;

    const nav = document.querySelector(".nav-links");
    if (!nav) return;

    const pages = [
        { href: "/grades/", label: "Notes" },
        { href: "/schedule/", label: "Emploi du temps" },
        { href: "/assignments/", label: "Devoirs" }
    ];

    const links = pages.map(p => {
        const isActive = p.href.includes(activePage);
        return `<li><a href="${p.href}" class="${isActive ? "active" : ""}">${p.label}</a></li>`;
    }).join("");

    nav.innerHTML = links;

    const userEl = document.querySelector(".nav-user");
    if (userEl && session.studentName) {
        userEl.textContent = session.studentName;
    }

    const logoutBtn = document.querySelector(".btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            clearSession();
            window.location.href = "/";
        });
    }
}

function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportJson(data, filename) {
    downloadBlob(JSON.stringify(data, null, 2), filename, "application/json");
}

function exportMarkdown(data, filename) {
    downloadBlob(data, filename, "text/markdown;charset=utf-8");
}

function exportHtml(html, filename) {
    downloadBlob(html, filename, "text/html;charset=utf-8");
}

function buildGradesMarkdown(overviewData, session) {
    const { period, grades, subjectsAverages, overallAverage, classAverage } = overviewData;
    const now = new Date().toLocaleDateString("fr-FR");
    const student = session.studentName ?? "Étudiant";

    let md = `# Rapport de Notes — ${student}\n\n`;
    md += `**Période** : ${period.name} | **Export** : ${now}\n\n`;
    md += `**Moyenne générale** : ${overallAverage?.toFixed(2) ?? "N/A"}/20`;
    if (classAverage) md += ` | **Moyenne classe** : ${classAverage.toFixed(2)}/20`;
    md += `\n\n---\n\n`;

    const bySubject = {};
    for (const g of grades) {
        if (!bySubject[g.subjectName]) bySubject[g.subjectName] = [];
        bySubject[g.subjectName].push(g);
    }

    for (const avg of subjectsAverages) {
        const subGrades = bySubject[avg.subjectName] ?? [];
        md += `## ${avg.subjectName}\n\n`;
        md += `- **Moyenne élève** : ${avg.student?.toFixed(2) ?? "N/A"}/20\n`;
        if (avg.classAverage) md += `- **Moyenne classe** : ${avg.classAverage.toFixed(2)}/20\n`;
        if (avg.max) md += `- **Max classe** : ${avg.max.toFixed(2)}/20\n`;
        if (avg.min) md += `- **Min classe** : ${avg.min.toFixed(2)}/20\n`;
        md += `\n`;

        if (subGrades.length > 0) {
            md += `| Date | Note | /Pts | Coef | Moy Cl. | Max Cl. | Commentaire |\n`;
            md += `|------|------|------|------|---------|---------|-------------|\n`;
            for (const g of subGrades) {
                const note = g.value?.points !== null ? g.value.points : "Abs.";
                const outOf = g.outOf?.points ?? 20;
                const coef = g.coefficient ?? 1;
                const avg_cl = g.average?.points?.toFixed(1) ?? "—";
                const max_cl = g.max?.points?.toFixed(1) ?? "—";
                const comment = g.comment ?? g.commentaireSurNote ?? "—";
                const isBest = g.max?.points !== null && g.value?.points !== null && g.value.points === g.max.points;
                const star = isBest ? " ⭐" : "";
                md += `| ${formatDateShort(g.date)} | ${note}${star} | ${outOf} | x${coef} | ${avg_cl} | ${max_cl} | ${comment} |\n`;
            }
            md += `\n`;
        }
    }

    md += `---\n\n## Chronologie complète\n\n`;
    md += `| Date | Matière | Note | Commentaire |\n`;
    md += `|------|---------|------|-------------|\n`;
    for (const g of grades) {
        const note = g.value?.points !== null ? `${g.value.points}/${g.outOf?.points ?? 20}` : "Abs.";
        md += `| ${formatDateShort(g.date)} | ${g.subjectName} | ${note} | ${g.comment ?? "—"} |\n`;
    }

    return md;
}

function buildGradesHtml(overviewData, session) {
    const { period, grades, subjectsAverages, overallAverage, classAverage } = overviewData;
    const now = new Date().toLocaleDateString("fr-FR");
    const student = session.studentName ?? "Étudiant";

    const bySubject = {};
    for (const g of grades) {
        if (!bySubject[g.subjectName]) bySubject[g.subjectName] = [];
        bySubject[g.subjectName].push(g);
    }

    const subjectRows = subjectsAverages.map(avg => {
        const subGrades = bySubject[avg.subjectName] ?? [];
        const color = subjectColor(avg.subjectName);
        const gradeRows = subGrades.map(g => {
            const note = g.value?.points !== null ? g.value.points : "Abs.";
            const outOf = g.outOf?.points ?? 20;
            const normalized = g.value?.points !== null ? ((g.value.points / outOf) * 20).toFixed(2) : null;
            const isBest = g.max?.points !== null && g.value?.points !== null && g.value.points === g.max.points;
            const cls = normalized ? (normalized >= 14 ? "#22c55e" : normalized >= 10 ? "#f59e0b" : "#ef4444") : "#78716c";
            return `<tr style="${isBest ? "background:rgba(34,197,94,0.1)" : ""}">
                <td>${formatDateShort(g.date)}</td>
                <td style="color:${cls};font-weight:700">${note}/${outOf}${isBest ? " ⭐" : ""}</td>
                <td>${g.average?.points?.toFixed(1) ?? "—"}</td>
                <td>${g.max?.points?.toFixed(1) ?? "—"}</td>
                <td>${g.min?.points?.toFixed(1) ?? "—"}</td>
                <td>x${g.coefficient ?? 1}</td>
                <td style="color:#78716c">${g.comment ?? "—"}</td>
            </tr>`;
        }).join("");

        return `<section style="margin-bottom:32px">
            <h3 style="font-family:monospace;font-size:0.9rem;padding:8px 12px;background:#1c1917;border-left:4px solid ${color};margin-bottom:0;letter-spacing:0.03em">${avg.subjectName}</h3>
            <div style="display:flex;gap:24px;padding:10px 12px;background:#292524;font-size:0.78rem;font-family:monospace;color:#a8a29e;flex-wrap:wrap">
                ${avg.student != null ? `<span>Vous : <strong style="color:#e7e5e4">${avg.student.toFixed(2)}</strong></span>` : ""}
                ${avg.classAverage != null ? `<span>Classe : <strong>${avg.classAverage.toFixed(2)}</strong></span>` : ""}
                ${avg.max != null ? `<span>Max : <strong style="color:#22c55e">${avg.max.toFixed(2)}</strong></span>` : ""}
                ${avg.min != null ? `<span>Min : <strong style="color:#ef4444">${avg.min.toFixed(2)}</strong></span>` : ""}
            </div>
            ${subGrades.length > 0 ? `<table style="width:100%;border-collapse:collapse;font-size:0.78rem">
                <thead><tr style="background:#1c1917">
                    <th style="padding:6px 12px;text-align:left;color:#78716c;font-family:monospace;font-size:0.68rem;text-transform:uppercase">Date</th>
                    <th style="padding:6px 12px;text-align:left;color:#78716c;font-family:monospace;font-size:0.68rem;text-transform:uppercase">Note</th>
                    <th style="padding:6px 12px;text-align:left;color:#78716c;font-family:monospace;font-size:0.68rem;text-transform:uppercase">Moy. Cl.</th>
                    <th style="padding:6px 12px;text-align:left;color:#78716c;font-family:monospace;font-size:0.68rem;text-transform:uppercase">Max Cl.</th>
                    <th style="padding:6px 12px;text-align:left;color:#78716c;font-family:monospace;font-size:0.68rem;text-transform:uppercase">Min Cl.</th>
                    <th style="padding:6px 12px;text-align:left;color:#78716c;font-family:monospace;font-size:0.68rem;text-transform:uppercase">Coef</th>
                    <th style="padding:6px 12px;text-align:left;color:#78716c;font-family:monospace;font-size:0.68rem;text-transform:uppercase">Commentaire</th>
                </tr></thead>
                <tbody style="color:#d6d3d1">${gradeRows}</tbody>
            </table>` : `<p style="padding:12px;color:#57534e;font-family:monospace;font-size:0.78rem">Aucune note</p>`}
        </section>`;
    }).join("");

    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rapport de Notes — ${student} — ${period.name}</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#0c0a09; color:#e7e5e4; font-family:-apple-system,BlinkMacSystemFont,sans-serif; line-height:1.6; padding:32px 24px; }
        table tr { border-bottom:1px solid #292524; }
        table tr:hover { background:#1c1917; }
    </style>
</head>
<body>
    <header style="margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid #292524">
        <h1 style="font-family:monospace;font-size:1.4rem;letter-spacing:-0.03em">Rapport de Notes — ${student}</h1>
        <p style="font-family:monospace;font-size:0.75rem;color:#78716c;margin-top:4px">${period.name} · Exporté le ${now}</p>
    </header>
    <div style="display:flex;gap:24px;margin-bottom:32px;flex-wrap:wrap">
        <div style="background:#1c1917;border:1px solid #292524;padding:16px 24px">
            <div style="font-family:monospace;font-size:0.68rem;color:#57534e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Moyenne générale</div>
            <div style="font-family:monospace;font-size:2rem;font-weight:700;color:${(overallAverage ?? 0) >= 14 ? "#22c55e" : (overallAverage ?? 0) >= 10 ? "#f59e0b" : "#ef4444"}">${overallAverage?.toFixed(2) ?? "N/A"}</div>
        </div>
        ${classAverage != null ? `<div style="background:#1c1917;border:1px solid #292524;padding:16px 24px">
            <div style="font-family:monospace;font-size:0.68rem;color:#57534e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Moyenne classe</div>
            <div style="font-family:monospace;font-size:2rem;font-weight:700;color:#a8a29e">${classAverage.toFixed(2)}</div>
        </div>` : ""}
    </div>
    ${subjectRows}
    <footer style="margin-top:48px;padding-top:16px;border-top:1px solid #292524;font-family:monospace;font-size:0.7rem;color:#57534e">
        Généré par Butterfly · ${now}
    </footer>
</body>
</html>`;
}

window.ButterflyApp = {
    API_BASE,
    getSession,
    setSession,
    clearSession,
    requireAuth,
    apiPost,
    subjectColor,
    gradeClass,
    gradeValue,
    gradeNormalized,
    formatDate,
    formatDateShort,
    formatTime,
    isoWeekNumber,
    weekDateRange,
    showLoading,
    hideLoading,
    showError,
    hideError,
    renderNav,
    exportJson,
    exportMarkdown,
    exportHtml,
    buildGradesMarkdown,
    buildGradesHtml
};
})();
