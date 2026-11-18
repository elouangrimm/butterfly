// Authenticates via the PRONOTE "QR code" flow.
// The student generates a QR code + 4-digit PIN in Pronote (mobile app section of
// the settings). The QR encodes JSON { jeton, login, url }. Pawnote exchanges
// QR data + PIN for a reusable token, exactly like login.js / login-webview.js.

import * as pronote from "pawnote";

function serializePeriod(p) {
    return { id: p.id, name: p.name, kind: p.kind };
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { qr, pin, deviceUUID } = req.body || {};

    if (
        !qr || typeof qr.jeton !== "string" || typeof qr.login !== "string" || typeof qr.url !== "string"
    ) {
        return res.status(400).json({ error: "QR code invalide (jeton, login et url requis)" });
    }
    if (!/^\d{4}$/.test(String(pin ?? ""))) {
        return res.status(400).json({ error: "Le code PIN doit contenir 4 chiffres" });
    }
    try {
        if (new URL(qr.url).protocol !== "https:") throw new Error();
    } catch {
        return res.status(400).json({ error: "URL Pronote invalide dans le QR code" });
    }

    if (typeof pronote.loginQrCode !== "function") {
        return res.status(500).json({ error: "Cette version de Pawnote ne supporte pas loginQrCode" });
    }

    const uuid = deviceUUID || crypto.randomUUID();

    try {
        const session = pronote.createSessionHandle();
        const refresh = await pronote.loginQrCode(session, {
            deviceUUID: uuid,
            pin: String(pin),
            qr: { jeton: qr.jeton, login: qr.login, url: qr.url }
        });

        const gradeTab = session.userResource.tabs.get(pronote.TabLocation.GradesOverview);
        const timetableTab = session.userResource.tabs.get(pronote.TabLocation.Timetable);
        const assignmentsTab = session.userResource.tabs.get(pronote.TabLocation.Homeworks);

        const info = session.information;

        return res.status(200).json({
            auth: {
                token: refresh.token,
                username: refresh.username,
                url: refresh.url,
                kind: refresh.kind,
                deviceUUID: uuid
            },
            periods: gradeTab ? gradeTab.periods.map(serializePeriod) : [],
            defaultPeriodId: gradeTab?.defaultPeriod?.id ?? null,
            tabs: {
                grades: !!gradeTab,
                timetable: !!timetableTab,
                assignments: !!assignmentsTab
            },
            studentName: info?.userInfo?.name ?? refresh.username,
            schoolName: info?.schoolName ?? null
        });
    } catch (err) {
        console.error("[login-qr]", err);
        return res.status(401).json({
            error: err.message ?? "Connexion par QR code échouée (QR expiré ou PIN incorrect ?)"
        });
    }
}
