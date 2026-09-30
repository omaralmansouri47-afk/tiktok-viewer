const APIFY_TOKEN = process.env.APIFY_TOKEN;

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};

  const username = String(params.username || params.user || "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .trim();

  if (!username) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        ok: false,
        error: "Missing username"
      })
    };
  }

  if (!APIFY_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "APIFY_TOKEN not set"
      })
    };
  }

  try {
    const response = await fetch(
      "https://api.apify.com/v2/acts/apidojo~tiktok-profile-scraper/run-sync-get-dataset-items?token=" +
        APIFY_TOKEN,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          usernames: [username],
          maxItems: 1
        })
      }
    );

    if (!response.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok: false,
          error: "Apify error " + response.status
        })
      };
    }

    const data = await response.json();

    const first = Array.isArray(data)
      ? data[0]
      : data && Array.isArray(data.data)
        ? data.data[0]
        : null;

    const src = (first && first.channel) || first || {};

    const numberOrNull = (value) => {
      if (value === undefined || value === null || value === "") {
        return null;
      }

      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };

    const profile = {
      handle: String(src.username || src.uniqueId || username),
      name: String(src.name || src.nickname || src.nickName || username),
      avatar: String(src.avatar || src.avatarLarger || ""),
      following: numberOrNull(src.following),
      followers: numberOrNull(src.followers || src.followerCount),
      likes: numberOrNull(src.heart || src.heartCount),
      bio: String(src.bio || src.signature || ""),
      verified: src.verified === true || src.verified === "true"
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        source: "tiktok",
        profile
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "Server error"
      })
    };
  }
};
