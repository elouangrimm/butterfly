import * as pronote from "pawnote";

function serializePeriod(p) {
    return { id: p.id, name: p.name, kind: p.kind };
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { pronoteURL, username, password, deviceUUID } = req.body || {};

    if (!pronoteURL || !username || !password) {
        return res.status(400).json({ error: "pronoteURL, username, and password are required" });
    }

    const uuid = deviceUUID || crypto.randomUUID();

    try {
        const session = pronote.createSessionHandle();
        const refresh = await pronote.loginCredentials(session, {
            url: pronoteURL.trim(),
            kind: pronote.AccountKind.STUDENT,
            username: username.trim(),
            password,
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
            studentName: info?.userInfo?.name ?? username,
            schoolName: info?.schoolName ?? null
        });
    } catch (err) {
        console.error("[login]", err);
        return res.status(401).json({ error: err.message ?? "Authentication failed" });
    }
}
