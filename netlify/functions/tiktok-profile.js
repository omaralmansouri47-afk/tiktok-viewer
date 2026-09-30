// Netlify function: busca perfiles de TikTok directamente por username

const APIFY_TOKEN = process.env.APIFY_TOKEN;

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const cleaned = String(value).replace(/,/g, "").trim();
  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function booleanValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

function profileScore(object) {
  if (!object || typeof object !== "object") {
    return 0;
  }

  const keys = [
    "username",
    "uniqueId",
    "unique_id",
    "nickname",
    "followerCount",
    "followersCount",
    "followingCount",
    "heartCount",
    "likesCount",
    "avatarLarger",
    "avatar",
    "signature",
    "bio",
    "verified"
  ];

  return keys.reduce((score, key) => {
    return score + (
      Object.prototype.hasOwnProperty.call(object, key) ? 1 : 0
    );
  }, 0);
}

function findProfile(value, depth = 0) {
  if (!value || depth > 6) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProfile(item, depth + 1);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  if (profileScore(value) > 0) {
    return value;
  }

  const priorityKeys = [
    "userInfo",
    "profile",
    "user",
    "account",
    "result",
    "data"
  ];

  for (const key of priorityKeys) {
    if (value[key]) {
      const found = findProfile(value[key], depth + 1);

      if (found) {
        return found;
      }
    }
  }

  for (const child of Object.values(value)) {
    const found = findProfile(child, depth + 1);

    if (found) {
      return found;
    }
  }

  return null;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};

  const username = String(
    params.username || params.user || ""
  )
    .replace(/^@/, "")
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
      "https://api.apify.com/v2/acts/novi~tiktok-user-info-api/run-sync-get-dataset-items?token=" +
        encodeURIComponent(APIFY_TOKEN),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          usernames: [username]
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

    const raw = await response.json();
    const source = findProfile(raw);

    if (!source) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          ok: false,
          error: "Profile not found"
        })
      };
    }

    const handle = String(
      source.username ||
      source.uniqueId ||
      source.unique_id ||
      username
    );

    const profile = {
      handle: handle,

      name: String(
        source.nickname ||
        source.nickName ||
        source.name ||
        handle
      ),

      avatar: String(
        source.avatarLarger ||
        source.avatarMedium ||
        source.avatarThumb ||
        source.avatarUrl ||
        source.profilePictureUrl ||
        source.avatar ||
        ""
      ),

      following: numberOrNull(
        source.followingCount ??
        source.following_count ??
        source.following
      ),

      followers: numberOrNull(
        source.followerCount ??
        source.followersCount ??
        source.follower_count ??
        source.followers
      ),

      likes: numberOrNull(
        source.heartCount ??
        source.likesCount ??
        source.heart ??
        source.likes
      ),

      bio: String(
        source.signature ||
        source.bio ||
        source.description ||
        ""
      ),

      verified: booleanValue(
        source.verified ??
        source.isVerified ??
        source.is_verified
      )
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: true,
        source: "tiktok-user-info-api",
        profile: profile
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
