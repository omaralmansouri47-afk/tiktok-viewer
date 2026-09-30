// Netlify Function: live TikTok profile lookup through Apify
// Required environment variable: APIFY_TOKEN

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const USERNAME_RE = /^[A-Za-z0-9._]{2,24}$/;

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  },
  body: JSON.stringify(payload)
});

const firstValue = (...values) =>
  values.find(
    (value) => value !== undefined && value !== null && value !== ""
  );

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
};

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};

  const raw = String(
    firstValue(params.username, params.user, "")
  ).trim();

  const username = raw.replace(/^@/, "");

  if (!USERNAME_RE.test(username)) {
    return json(400, {
      ok: false,
      error: "Invalid TikTok username"
    });
  }

  if (!APIFY_TOKEN) {
    return json(500, {
      ok: false,
      error: "APIFY_TOKEN is not configured"
    });
  }

  try {
    const response = await fetch(
      "https://api.apify.com/v2/acts/novi~tiktok-user-info-api/run-sync-get-dataset-items?token=" +
        encodeURIComponent(APIFY_TOKEN),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          usernames: [username],
          source: "tiktok"
        })
      }
    );

    if (!response.ok) {
      return json(response.status === 429 ? 429 : 502, {
        ok: false,
        error: "TikTok provider request failed",
        providerStatus: response.status
      });
    }

    const payload = await response.json();

    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

    const row =
      rows[0] ||
      payload?.profile ||
      payload?.user ||
      null;

    if (!row || typeof row !== "object") {
      return json(404, {
        ok: false,
        error: "TikTok profile not found"
      });
    }

    const source =
      row.profile ||
      row.user ||
      row.data ||
      row;

    const handle = String(
      firstValue(
        source.username,
        source.uniqueId,
        source.unique_id,
        source.userName,
        source.handle,
        username
      )
    ).replace(/^@/, "");

    if (!USERNAME_RE.test(handle)) {
      return json(404, {
        ok: false,
        error: "TikTok profile not found"
      });
    }

    const profile = {
      handle,

      name: String(
        firstValue(
          source.nickname,
          source.nickName,
          source.displayName,
          source.name,
          handle
        )
      ),

      avatar: String(
        firstValue(
          source.avatarLarger,
          source.avatar,
          source.avatarUrl,
          source.avatar_url,
          ""
        )
      ),

      following: numberOrNull(
        firstValue(
          source.following,
          source.followingCount,
          source.stats?.followingCount
        )
      ),

      followers: numberOrNull(
        firstValue(
          source.followers,
          source.followerCount,
          source.fans,
          source.stats?.followerCount
        )
      ),

      likes: numberOrNull(
        firstValue(
          source.likes,
          source.heart,
          source.heartCount,
          source.stats?.heartCount
        )
      ),

      bio: String(
        firstValue(
          source.bio,
          source.signature,
          source.description,
          ""
        )
      ),

      verified:
        source.verified === true ||
        source.verified === "true"
    };

    return json(200, {
      ok: true,
      source: "tiktok",
      profile
    });
  } catch (error) {
    return json(502, {
      ok: false,
      error: "TikTok provider unavailable"
    });
  }
};
