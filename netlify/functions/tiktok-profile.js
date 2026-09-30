// Netlify Function: consulta en vivo de perfiles públicos de TikTok mediante Apify
// La variable APIFY_TOKEN debe estar configurada en Netlify.
// Nunca escribas el token directamente aquí.

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const USERNAME_REGEX = /^[A-Za-z0-9._]{2,24}$/;

function response(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(data)
  };
}

function firstValue(...values) {
  return values.find(
    value => value !== undefined && value !== null && value !== ""
  );
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(String(value).replace(/,/g, ""));

  return Number.isFinite(number) ? number : null;
}

function booleanValue(value) {
  return value === true || value === "true" || value === 1;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: ""
    };
  }

  const params = event.queryStringParameters || {};
  const rawUsername = String(params.username || "").trim();
  const username = rawUsername.replace(/^@+/, "");

  // No transforma nombres inválidos en otros nombres.
  if (!USERNAME_REGEX.test(username)) {
    return response(400, {
      ok: false,
      error: "Invalid TikTok username"
    });
  }

  if (!APIFY_TOKEN) {
    return response(500, {
      ok: false,
      error: "APIFY_TOKEN is not configured"
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const apifyUrl =
      "https://api.apify.com/v2/acts/" +
      "novi~tiktok-user-info-api/run-sync-get-dataset-items?token=" +
      encodeURIComponent(APIFY_TOKEN);

    const providerResponse = await fetch(apifyUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        usernames: [username],
        source: "tiktok"
      })
    });

    if (!providerResponse.ok) {
      if (providerResponse.status === 429) {
        return response(429, {
          ok: false,
          error: "Too many requests"
        });
      }

      return response(502, {
        ok: false,
        error: "TikTok provider request failed",
        providerStatus: providerResponse.status
      });
    }

    const payload = await providerResponse.json();

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
      payload?.userInfo ||
      null;

    if (!row || typeof row !== "object") {
      return response(404, {
        ok: false,
        error: "TikTok profile not found"
      });
    }

    const profileData =
      row.profile ||
      row.user ||
      row.userInfo ||
      row.data ||
      row;

    const handle = String(
      firstValue(
        profileData.username,
        profileData.uniqueId,
        profileData.unique_id,
        profileData.userName,
        profileData.handle,
        username
      )
    ).replace(/^@+/, "");

    if (!USERNAME_REGEX.test(handle)) {
      return response(404, {
        ok: false,
        error: "TikTok profile not found"
      });
    }

    const profile = {
      handle,
      name: String(
        firstValue(
          profileData.nickname,
          profileData.nickName,
          profileData.displayName,
          profileData.name,
          handle
        )
      ),
      avatar: String(
        firstValue(
          profileData.avatarLarger,
          profileData.avatar,
          profileData.avatarUrl,
          profileData.avatar_url,
          ""
        )
      ),
      following: numberOrNull(
        firstValue(
          profileData.following,
          profileData.followingCount,
          profileData.stats?.followingCount
        )
      ),
      followers: numberOrNull(
        firstValue(
          profileData.followers,
          profileData.followerCount,
          profileData.fans,
          profileData.stats?.followerCount
        )
      ),
      likes: numberOrNull(
        firstValue(
          profileData.likes,
          profileData.heart,
          profileData.heartCount,
          profileData.stats?.heartCount
        )
      ),
      bio: String(
        firstValue(
          profileData.bio,
          profileData.signature,
          profileData.description,
          ""
        )
      ),
      verified: booleanValue(profileData.verified)
    };

    return response(200, {
      ok: true,
      source: "tiktok",
      profile
    });
  } catch (error) {
    if (error.name === "AbortError") {
      return response(504, {
        ok: false,
        error: "TikTok provider timeout"
      });
    }

    return response(502, {
      ok: false,
      error: "TikTok provider unavailable"
    });
  } finally {
    clearTimeout(timeout);
  }
};
