export const BASE_URL = "https://api.rlpp.psynet.gg/rpc";
/** Fallback when Launch.log is unavailable — keep roughly current with the live client. */
export const GAME_VERSION = "260811.1257.524913";
export const FEATURE_SET = "PrimeUpdate59_1";
export const PSY_SIG_KEY = "c338bd36fb8c42b1a431d30add939fc7";

export const PING_INTERVAL_MS = 20_000;
export const PONG_TIMEOUT_MS = 10_000;

export const EGS_USER_AGENT =
  "UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit";
export const EGS_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a";
export const EGS_CLIENT_SECRET = "daafbccc737745039dffe53d94fc76cf";
export const EGS_OAUTH_HOST = "account-public-service-prod03.ol.epicgames.com";
export const EOS_DEPLOYMENT_ID = "da32ae9c12ae40e8a112c52e1f17f3ba";
export const EOS_CLIENT_ID = "xyza7891p5D7s9R6Gm6moTHWGloerp7B";
export const EOS_SECRET = "Knh18du4NVlFs+3uQ+ZPpDCVto0WYf4yXP8+OcwVt1o";

/**
 * Fortnite Switch client — supports EG1 device_code login (activate in browser).
 * Used only to obtain an account token; lasting credentials use the iOS client below.
 */
export const EGS_DEVICE_CODE_CLIENT_ID = "98f7e42c2e3a4f86a74eb43fbb41ed39";
export const EGS_DEVICE_CODE_CLIENT_SECRET = "0a2449a2-001a-451e-afec-3e812901c4d7";

/** Fortnite iOS (new) — supports creating/using long-lived device_auth credentials. */
export const EGS_DEVICE_AUTH_CLIENT_ID = "af43dc71dd91452396fcdffbd7a8e8a9";
export const EGS_DEVICE_AUTH_CLIENT_SECRET = "4YXvSEBLFRPLh1hzGZAkfOi5mqupFohZ";
