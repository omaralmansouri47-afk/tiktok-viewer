// Netlify function: obtiene datos públicos de un perfil de TikTok mediante Apify

const APIFY_TOKEN = process.env.APIFY_TOKEN;

const APIFY_URL =
  "https://api.apify.com/v2/acts/novi~tiktok-user-info-api/run-sync-get-dataset-items?token=";

function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function numberOrNull(...values) {
  const value = firstValue(...values);

  if (value === null) {
    return null;
  }

  const text = String(value)
    .replace(/,/g, "")
    .trim()
    .toUpperCase();

  if (!text) {
    return null;
  }

  let multiplier = 1;

  if (text.endsWith("K")) {
    multiplier = 1000;
  } else if (text.endsWith("M")) {
    multiplier = 1000000;
  } else if (text.endsWith("B")) {
    multiplier = 1000000000;
  }

  const number = Number(text.replace(/[KMB]$/, "")) * multiplier;

  return Number.isFinite(number) ? Math.round(number) : null;
}

function booleanValue(...values) {
  const value = firstValue(...values);

  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

function avatarUrl(profile) {
  const possibleValues = [
    profile.avatarLarger,
    profile.avatarMedium,
    profile.avatarThumb,
    profile.avatarUrl,
    profile.profilePictureUrl,
    profile.avatar,
    profile.avatar_url,
    profile.avatar_300x300,
    profile.avatar_168x168
  ];

  for (const value of possibleValues) {
    if (typeof value === "string" && value.startsWith("http")) {
      return value;
    }

    if (
      value &&
      Array.isArray(value.url_list) &&
      typeof value.url_list[0] === "string"
    ) {
      return value.url_list[0];
    }

    if (
      value &&
      Array.isArray(value.urlList) &&
      typeof value.urlList[0] === "string"
    ) {
      return value.urlList[0];
    }
  }

  return "";
}

function looksLikeProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const profileFields = [
    "username",
    "uniqueId",
    "unique_id",
    "nickname",
    "nickname",
    "uid",
    "followerCount",
    "follower_count",
    "followingCount",
    "following_count",
    "avatarLarger",
    "avatar_300x300",
    "avatar_168x168"
  ];

  return profileFields.some((field) =>
    Object.prototype.hasOwnProperty.call(value, field)
  );
}

function findProfile(value, depth = 0) {
  if (!value || depth > 8) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findProfile(item, depth + 1);

      if (result) {
        return result;
      }
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  if (looksLikeProfile(value)) {
    return value;
  }

  const priorityKeys = [
    "data",
    "items",
    "results",
    "result",
    "profile",
    "user",
    "userInfo",
    "users"
  ];

  for (const key of priorityKeys) {
    if (value[key]) {
      const result = findProfile(value[key], depth + 1);

      if (result) {
        return result;
      }
    }
  }

  for (const child of Object.values(value)) {
    const result = findProfile(child, depth + 1);

    if (result) {
      return result;
    }
  }

  return null;
}

exports.handler = async (event) => {
  const params = event?.queryStringParameters || {};

  const username = String(
    firstValue(params.username, params.user) || ""
  )
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  if (!username) {
    return reply(400, {
      ok: false,
      error: "Missing username"
    });
  }

  if (!APIFY_TOKEN) {
    return reply(500, {
      ok: false,
      error: "APIFY_TOKEN not set"
    });
  }

  try {
    const response = await fetch(
      APIFY_URL + encodeURIComponent(APIFY_TOKEN),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          usernames: [username]
        })
      }
    );

    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }

    if (!response.ok) {
      return reply(502, {
        ok: false,
        error: "Apify error " + response.status
      });
    }

    const source = findProfile(data);

    if (!source) {
      return reply(404, {
        ok: false,
        error: "Profile not found"
      });
    }

    const handle = String(
      firstValue(
        source.username,
        source.uniqueId,
        source.unique_id,
        username
      )
    ).replace(/^@/, "");

    const name = String(
      firstValue(
        source.nickname,
        source.nickName,
        source.name,
        handle
      )
    );

    const profile = {
      handle,
      name,
      avatar: avatarUrl(source),

      following: numberOrNull(
        source.following,
        source.followingCount,
        source.following_count
      ),

      followers: numberOrNull(
        source.followers,
        source.followerCount,
        source.follower_count,
        source.fans
      ),

      likes: numberOrNull(
        source.likes,
        source.likesCount,
        source.heart,
        source.heartCount,
        source.heart_count,
        source.total_favorited
      ),

      bio: String(
        firstValue(
          source.bio,
          source.signature,
          source.description,
          ""
        )
      ),

      verified: booleanValue(
        source.verified,
        source.isVerified,
        source.is_verified
      )
    };

    if (!profile.handle || !profile.name) {
      return reply(404, {
        ok: false,
        error: "Profile not found"
      });
    }

    return reply(200, {
      ok: true,

      // Es importante que diga exactamente "tiktok".
      // La página actual comprueba este valor.
      source: "tiktok",

      profile
    });
  } catch (error) {
    return reply(500, {
      ok: false,
      error: "Server error"
    });
  }
};
