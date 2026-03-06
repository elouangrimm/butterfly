// Initialises a PRONOTE mobile session according to the Pawnote WebView guide:
// 1. Fetch InfoMobileApp.json to obtain the CAS jetonCAS (if any)
// 2. Build the initial cookie jar (ielang, validationAppliMobile, uuidAppliMobile)
// 3. Return the cookie jar + target mobile URL so the frontend can open the proxy

const INFO_MOBILE_ID = "0D264427-EEFC-4810-A9E9-346942A862A4";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { pronoteURL, deviceUUID } = req.body || {};

    if (!pronoteURL) {
        return res.status(400).json({ error: "pronoteURL is required" });
    }

    // Normalise trailing slash
    const base = pronoteURL.replace(/\/$/, "");
    const infoUrl = `${base}/InfoMobileApp.json?id=${INFO_MOBILE_ID}`;
    const mobileUrl = `${base}/mobile.eleve.html?fd=1`;

    try {
        const infoRes = await fetch(infoUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Mobile Safari/537.36",
                "Accept": "application/json, text/plain, */*"
            }
        });

        if (!infoRes.ok) {
            return res.status(502).json({ error: `InfoMobileApp.json responded with ${infoRes.status}` });
        }

        let infoJson = null;
        try {
            infoJson = await infoRes.json();
        } catch {
            // Non-JSON response — school might not expose this endpoint
        }

        const jetonCAS = infoJson?.CAS?.jetonCAS ?? null;
        const uuid = deviceUUID || crypto.randomUUID();

        // Build the initial cookie jar (mirrors the JS injection in the guide)
        const cookies = {
            "ielang": "1036"
        };

        if (jetonCAS) {
            cookies["validationAppliMobile"] = jetonCAS;
            cookies["uuidAppliMobile"] = uuid;
        }

        // Explicitly remove appliMobile
        cookies["appliMobile"] = "deleted";

        return res.status(200).json({
            mobileUrl,
            cookies,
            hasCAS: !!jetonCAS,
            deviceUUID: uuid
        });
    } catch (err) {
        console.error("[proxy-init]", err);
        return res.status(500).json({ error: err.message || "Proxy init failed" });
    }
}
