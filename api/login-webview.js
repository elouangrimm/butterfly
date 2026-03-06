// Authenticates a Pawnote session using a WebView-obtained refresh token.
// The loginState emitted by PRONOTE's mobile page contains:
//   - login  → username for Pawnote
//   - mdp    → refresh token (NOT the password — a Pawnote-compatible one-time token)
// This mirrors api/login.js but skips the interactive credential step.

import * as pronote from "pawnote";

function serializePeriod(p) {
    return { id: p.id, name: p.name, kind: p.kind };
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { login, mdp, pronoteURL, deviceUUID } = req.body || {};

    if (!login || !mdp || !pronoteURL) {
        return res.status(400).json({ error: "login, mdp, and pronoteURL are required" });
    }

    const base = pronoteURL.replace(/\/$/, "");
    // Pawnote loginToken needs the eleve.html URL, not the base
    const loginUrl = base.endsWith("eleve.html") ? base : `${base}/eleve.html`;

    const uuid = deviceUUID || crypto.randomUUID();

    try {
        const session = pronote.createSessionHandle();
        const refresh = await pronote.loginToken(session, {
            url: loginUrl,
            kind: pronote.AccountKind.STUDENT,
            username: login,
            token: mdp,
            deviceUUID: uuid
        });

        const gradeTab = session.userResource.tabs.get(pronote.TabLocation.GradesOverview);
        const timetableTab = session.userResource.tabs.get(pronote.TabLocation.Timetable);
        const assignmentsTab = session.userResource.tabs.get(pronote.TabLocation.Homeworks);

        const periods = gradeTab ? gradeTab.periods.map(serializePeriod) : [];
        const defaultPeriodId = gradeTab?.defaultPeriod?.id ?? null;

        const tabs = {
            grades: !!gradeTab,
            timetable: !!timetableTab,
            assignments: !!assignmentsTab
        };

        const info = session.information;

        return res.status(200).json({
            auth: {
                token: refresh.token,
                username: refresh.username,
                url: refresh.url,
                kind: refresh.kind,
                deviceUUID: uuid
            },
            periods,
            defaultPeriodId,
            tabs,
            studentName: info?.userInfo?.name ?? login,
            schoolName: info?.schoolName ?? null
        });
    } catch (err) {
        console.error("[login-webview]", err);
        return res.status(401).json({ error: err.message ?? "WebView authentication failed" });
    }
}
