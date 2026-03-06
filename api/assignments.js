import * as pronote from "pawnote";

function serializeAssignment(a) {
    const returnInfo = a.return ? serializeReturn(a.return) : null;
    return {
        id: a.id,
        subjectName: a.subject?.name ?? "Inconnu",
        subjectId: a.subject?.id ?? null,
        description: a.description ?? null,
        deadline: a.deadline?.toISOString() ?? null,
        done: a.done ?? false,
        attachments: (a.attachments ?? []).map(att => ({
            name: att.name,
            url: att.url ?? null
        })),
        return: returnInfo,
        resourceID: a.resourceID ?? null
    };
}

function serializeReturn(ret) {
    return {
        kind: ret.kind,
        uploaded: ret.uploaded ? { url: ret.uploaded.url } : null
    };
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { auth, fromWeek, toWeek } = req.body || {};

    if (!auth?.token || !auth?.url || !auth?.username) {
        return res.status(400).json({ error: "Missing auth credentials" });
    }

    const from = parseInt(fromWeek, 10) || 1;
    const to = parseInt(toWeek, 10) || from + 3;

    try {
        const session = pronote.createSessionHandle();
        await pronote.loginToken(session, {
            url: auth.url,
            kind: auth.kind,
            username: auth.username,
            token: auth.token,
            deviceUUID: auth.deviceUUID
        });

        const assignments = await pronote.assignmentsFromWeek(session, from, to);
        const serialized = assignments.map(serializeAssignment);
        serialized.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

        return res.status(200).json({ fromWeek: from, toWeek: to, assignments: serialized });
    } catch (err) {
        console.error("[assignments]", err);
        return res.status(500).json({ error: err.message ?? "Failed to fetch assignments" });
    }
}
