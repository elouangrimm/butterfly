import * as pronote from "pawnote";

function serializeLesson(lesson) {
    const base = {
        is: lesson.is,
        startDate: lesson.startDate?.toISOString() ?? null,
        endDate: lesson.endDate?.toISOString() ?? null,
        notes: lesson.notes ?? null,
        status: lesson.status ?? null
    };

    if (lesson.is === "lesson") {
        return {
            ...base,
            subjectName: lesson.subject?.name ?? null,
            subjectId: lesson.subject?.id ?? null,
            teacherNames: lesson.teacherNames ?? [],
            classrooms: lesson.classrooms ?? [],
            groupNames: lesson.groupNames ?? [],
            exempted: lesson.exempted ?? false,
            isCancelled: lesson.isCancelled ?? false,
            lessonResourceID: lesson.lessonResourceID ?? null
        };
    }

    if (lesson.is === "activity") {
        return {
            ...base,
            title: lesson.title ?? null,
            attendants: lesson.attendants ?? [],
            resourceTypeName: lesson.resourceTypeName ?? null,
            resourceValue: lesson.resourceValue ?? null
        };
    }

    if (lesson.is === "detention") {
        return {
            ...base,
            title: lesson.title ?? null
        };
    }

    return base;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { auth, week } = req.body || {};

    if (!auth?.token || !auth?.url || !auth?.username) {
        return res.status(400).json({ error: "Missing auth credentials" });
    }

    const weekNumber = parseInt(week, 10) || 1;

    try {
        const session = pronote.createSessionHandle();
        await pronote.loginToken(session, {
            url: auth.url,
            kind: auth.kind,
            username: auth.username,
            token: auth.token,
            deviceUUID: auth.deviceUUID
        });

        const raw = await pronote.timetableFromWeek(session, weekNumber);
        pronote.parseTimetable(session, raw, {
            withSuperposedCanceledClasses: false,
            withCanceledClasses: true,
            withPlannedClasses: true
        });

        const classes = raw.classes.map(serializeLesson);

        return res.status(200).json({ week: weekNumber, classes });
    } catch (err) {
        console.error("[timetable]", err);
        return res.status(500).json({ error: err.message ?? "Failed to fetch timetable" });
    }
}
