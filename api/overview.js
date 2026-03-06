import * as pronote from "pawnote";

function serializeGradeValue(val) {
    if (!val) return null;
    return {
        points: isNaN(val.points) ? null : val.points,
        kind: val.kind ?? null
    };
}

function serializeGrade(grade) {
    return {
        id: grade.id,
        subjectId: grade.subject?.id ?? null,
        subjectName: grade.subject?.name ?? "Inconnu",
        comment: grade.comment ?? null,
        date: grade.date?.toISOString() ?? null,
        value: serializeGradeValue(grade.value),
        outOf: serializeGradeValue(grade.outOf),
        average: serializeGradeValue(grade.average),
        min: serializeGradeValue(grade.min),
        max: serializeGradeValue(grade.max),
        coefficient: grade.coefficient ?? 1,
        isBonus: grade.isBonus ?? false,
        isOptional: grade.isOptional ?? false,
        isOutOf20: grade.isOutOf20 ?? false,
        commentaireSurNote: grade.commentaireSurNote ?? null
    };
}

function serializeSubjectAverage(avg) {
    return {
        subjectId: avg.subject?.id ?? null,
        subjectName: avg.subject?.name ?? "Inconnu",
        student: typeof avg.student === "number" ? avg.student : null,
        classAverage: typeof avg.class_average === "number" ? avg.class_average : null,
        max: typeof avg.max === "number" ? avg.max : null,
        min: typeof avg.min === "number" ? avg.min : null
    };
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { auth, periodId } = req.body || {};

    if (!auth?.token || !auth?.url || !auth?.username) {
        return res.status(400).json({ error: "Missing auth credentials" });
    }

    try {
        const session = pronote.createSessionHandle();
        await pronote.loginToken(session, {
            url: auth.url,
            kind: auth.kind,
            username: auth.username,
            token: auth.token,
            deviceUUID: auth.deviceUUID
        });

        const gradeTab = session.userResource.tabs.get(pronote.TabLocation.GradesOverview);
        if (!gradeTab) {
            return res.status(403).json({ error: "Grades tab not available" });
        }

        const period = periodId
            ? (gradeTab.periods.find(p => p.id === periodId) ?? gradeTab.defaultPeriod)
            : gradeTab.defaultPeriod;

        if (!period) {
            return res.status(404).json({ error: "No period found" });
        }

        const overview = await pronote.gradesOverview(session, period);

        const grades = overview.grades.map(serializeGrade);
        grades.sort((a, b) => new Date(a.date) - new Date(b.date));

        return res.status(200).json({
            period: { id: period.id, name: period.name },
            grades,
            subjectsAverages: overview.subjectsAverages.map(serializeSubjectAverage),
            overallAverage: overview.overallAverage ?? null,
            classAverage: overview.classAverage ?? null
        });
    } catch (err) {
        console.error("[overview]", err);
        return res.status(500).json({ error: err.message ?? "Failed to fetch grades" });
    }
}
