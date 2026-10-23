const API_URL = (import.meta.env?.VITE_API_URL || "https://sincere-transformation-production-b923.up.railway.app/api").trim().replace(/\/+$/, "");
export const resolveApiUrl = path => {
  if (!path || /^(?:https?:|data:|blob:)/i.test(path)) return path;
  const apiPath = path.startsWith("/api/") ? path.slice(4) : path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${apiPath}`;
};

if (typeof window !== "undefined") {
  window.MOVORA_API_URL = API_URL;
  console.info("[API] Using API_URL=", API_URL);
}

function isNetworkError(err) {
  const msg = err?.message?.toLowerCase() || "";
  return msg.includes("failed to fetch") || msg.includes("network") || msg.includes("offline") || msg.includes("dns") || msg.includes("timeout") || msg.includes("no internet");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSessionContext(sessionType = "current") {
  const storageKey = sessionType === "gym_owner"
    ? "rs_gym_owner_session"
    : sessionType === "user"
      ? "rs_session"
      : localStorage.getItem("rs_session")
        ? "rs_session"
        : "rs_gym_owner_session";
  const storedSession = localStorage.getItem(storageKey);
  return {
    session: storedSession ? JSON.parse(storedSession) : null,
    storageKey,
    isGymOwner: storageKey === "rs_gym_owner_session",
  };
}

// Helper to show API errors
const showAPIError = (message, retry = null) => {
  if (window.handleAPIError) {
    window.handleAPIError(message, retry);
  } else {
    console.error("[API Error]", message);
  }
};

async function refreshAccessToken(sessionType = "current") {
  const { session, storageKey, isGymOwner } = getSessionContext(sessionType);
  if (!session?.refreshToken) throw new Error("No refresh token available");
  
  const endpoint = isGymOwner ? "/gym-owners/refresh" : "/auth/refresh";
  
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Token refresh failed");
    
    // Update session with new access token
    session.accessToken = data.accessToken;
    localStorage.setItem(storageKey, JSON.stringify(session));
    
    return data.accessToken;
  } catch (err) {
    if (err.message.includes("Failed to fetch") || !navigator.onLine) {
      throw new Error("Network connection lost");
    }
    throw err;
  }
}

export async function request(path, options = {}, retryCount = 0, sessionType = "current") {
  const { session, storageKey } = getSessionContext(sessionType);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  const fullUrl = /^(?:https?:)?\/\//i.test(path) ? path : `${API_URL}${path}`;
  
  try {
    // Check network connectivity
    if (!navigator.onLine) {
      throw new Error("No internet connection");
    }

    const fetchOptions = { mode: "cors", cache: "no-store", ...options, headers };
    const res = await fetch(fullUrl, fetchOptions);
    const data = await res.json().catch(() => ({}));
    
    // Handle token expiration with refresh
    if (res.status === 401 && retryCount === 0 && session?.refreshToken) {
      try {
        await refreshAccessToken(sessionType);
        return request(path, options, 1, sessionType); // Retry with new token
      } catch (err) {
        // Refresh failed, clear session
        localStorage.removeItem(storageKey);
        throw new Error("Session expired. Please log in again.");
      }
    }
    
    if (!res.ok) {
      const marketingEndpointNotFound = res.status === 404
        && fullUrl.includes("/api/v1/marketing/")
        && (!data.detail || data.detail === "Not Found");
      const marketingAuthenticationFailed = res.status === 401 && fullUrl.includes("/api/v1/marketing/");
      const message = marketingEndpointNotFound
        ? `Marketing API endpoint not found at ${fullUrl}. Check that VITE_MARKETING_API_URL points to the deployed FastAPI marketing service.`
        : marketingAuthenticationFailed
          ? "The marketing service rejected your gym-owner access token. Sign in again; if the problem continues, confirm that its JWT_ACCESS_SECRET matches the main API and VITE_MARKETING_API_URL points to the deployed FastAPI marketing service."
        : data.message || data.detail || `Request failed (${res.status})`;
      const error = new Error(message);
      error.data = data;
      error.status = res.status;
      error.url = fullUrl;
      throw error;
    }
    return data;
  } catch (err) {
    const message = err?.message || "Unknown error";
    const normalizedMessage = message.toLowerCase();
    const shouldRetry = (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("network") || normalizedMessage.includes("timeout") || normalizedMessage.includes("dns")) && retryCount === 0;

    if (shouldRetry) {
      await delay(500);
      return request(path, options, retryCount + 1, sessionType);
    }

    if (normalizedMessage.includes("no internet") || !navigator.onLine) {
      const offlineError = new Error("No internet connection. Please check your network and try again.");
      offlineError.isNetworkError = true;
      offlineError.url = fullUrl;
      throw offlineError;
    }

    if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("network") || normalizedMessage.includes("timeout") || normalizedMessage.includes("dns")) {
      const networkError = new Error(`Network error contacting ${fullUrl}. Please check your connection.`);
      networkError.isNetworkError = true;
      networkError.url = fullUrl;
      networkError.originalMessage = message;
      throw networkError;
    }

    err.url = fullUrl;
    throw err;
  }
}

async function requestBlob(path, retryCount = 0) {
  const session = JSON.parse(localStorage.getItem("rs_session") || localStorage.getItem("rs_gym_owner_session") || "null");
  const headers = session?.accessToken ? { Authorization:`Bearer ${session.accessToken}` } : {};
  const res = await fetch(`${API_URL}${path}`, { mode:"cors", cache:"no-store", headers });
  if (res.status === 401 && retryCount === 0 && session?.refreshToken) {
    await refreshAccessToken();
    return requestBlob(path, 1);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.blob();
}

export const signup = payload => request("/auth/signup", { method:"POST", body:JSON.stringify(payload) });
export const login = payload => request("/auth/login", { method:"POST", body:JSON.stringify(payload) });
export const signupGymOwner = payload => request("/gym-owners/signup", { method:"POST", body:JSON.stringify(payload) });
export const loginGymOwner = payload => request("/gym-owners/login", { method:"POST", body:JSON.stringify(payload) });
export const getGymMembers = () => request("/gym-owners/members");
const MARKETING_API_URL = (import.meta.env?.VITE_MARKETING_API_URL || "").trim().replace(/\/+$/, "");
const marketingApiOrigin = (MARKETING_API_URL || API_URL).replace(/\/api$/i, "");
const marketingEndpoint = path => `${marketingApiOrigin}/api/v1/marketing${path}`;
export const getGymCampaignPaymentOptions = () => request(marketingEndpoint("/campaigns/payment-options"), {}, 0, "gym_owner");
export const getGymCampaigns = gymId => request(marketingEndpoint(`/campaigns/gym/${encodeURIComponent(gymId)}`), {}, 0, "gym_owner");
export const createGymCampaign = (payload, paymentMode = "razorpay") => request(`${marketingEndpoint("/campaigns")}?payment_mode=${encodeURIComponent(paymentMode)}`, {
  method:"POST",
  body:JSON.stringify(payload),
}, 0, "gym_owner");
export const executeGymCampaignDemo = campaignId => request(marketingEndpoint(`/campaigns/${encodeURIComponent(campaignId)}/demo-execute`), {
  method:"POST",
}, 0, "gym_owner");
export const uploadGymCampaignCreative = file => {
  const body = new FormData();
  body.append("file", file);
  return request(marketingEndpoint("/campaigns/creative"), { method:"POST", body }, 0, "gym_owner");
};
export const executeGymCampaign = (campaignId, payment) => request(marketingEndpoint(`/campaigns/${encodeURIComponent(campaignId)}/execute`), {
  method:"POST",
  body:JSON.stringify(payment),
}, 0, "gym_owner");
export const getGymAttendance = date => request(`/gym-owners/attendance?date=${encodeURIComponent(date)}`);
export const getGymStaff = () => request("/gym-owners/staff");
export const addGymStaff = payload => request("/gym-owners/staff", { method:"POST", body:JSON.stringify(payload) });
export const deleteGymStaff = staffId => request(`/gym-owners/staff/${encodeURIComponent(staffId)}`, { method:"DELETE" });
export const sendMemberReminder = payload => request("/gym-owners/send-reminder", { method:"POST", body:JSON.stringify(payload) });
export const addGymMember = payload => request("/gym-owners/add-member", { method:"POST", body:JSON.stringify(payload) });
export const updateGymMember = payload => request("/gym-owners/update-member", { method:"PUT", body:JSON.stringify(payload) });

export const logout = refreshToken => {
  const isGymOwner = !!localStorage.getItem("rs_gym_owner_session");
  const endpoint = isGymOwner ? "/gym-owners/logout" : "/auth/logout";
  return request(endpoint, { method:"POST", body:JSON.stringify({ refreshToken }) });
};
export const hydrateUserData = () => request("/me/summary");
export const saveUserData = payload => request("/me/snapshot", { method:"PUT", body:JSON.stringify(payload) });
export const createWorkout = payload => request("/workouts", { method:"POST", body:JSON.stringify(payload) });
export const addBodyMetric = payload => request("/body/metrics", { method:"POST", body:JSON.stringify(payload) });
export const saveCalorieProfile = payload => request("/nutrition/profile", { method:"POST", body:JSON.stringify(payload) });
export const addFoodEntry = payload => request("/nutrition/food", { method:"POST", body:JSON.stringify(payload) });
export const updateGoal = payload => request("/goal", { method:"PUT", body:JSON.stringify(payload) });
export const checkGym = name => request(`/auth/check-gym?name=${encodeURIComponent(name)}`);
export const getRegisteredGyms = () => request("/auth/gyms");
export const renewGymMember = payload => request("/gym-owners/renew-membership", { method:"POST", body:JSON.stringify(payload) });
export const cancelGymMember = payload => request("/gym-owners/cancel-membership", { method:"POST", body:JSON.stringify(payload) });
export const sendPhoneOTP = phone => request("/auth/send-otp", { method:"POST", body:JSON.stringify({ phone }) });
export const verifyPhoneOTP = (phone, otp) => request("/auth/verify-otp", { method:"POST", body:JSON.stringify({ phone, otp }) });
export const checkIn = payload => request("/v1/attendance/check-in", { method:"POST", body:JSON.stringify(payload) });
export const getSocialProfile = () => request("/social/profile");
export const saveSocialProfile = payload => request("/social/profile", { method:"PUT", body:JSON.stringify(payload) });
export const getSocialNotes = () => request("/social/notes");
export const saveSocialNote = text => request("/social/notes", { method:"PUT", body:JSON.stringify({ text }) });
export const searchSocialProfiles = query => request(`/social/search?q=${encodeURIComponent(query)}`);
export const getFriendRequests = () => request("/social/requests");
export const sendFriendRequest = userId => request(`/social/users/${encodeURIComponent(userId)}/request`, { method:"POST" });
export const respondToFriendRequest = (requestId, status) => request(`/social/requests/${encodeURIComponent(requestId)}/respond`, { method:"POST", body:JSON.stringify({ status }) });
export const toggleSocialFollow = userId => request(`/social/users/${encodeURIComponent(userId)}/follow`, { method:"POST" });
export const getSocialReels = (cursor, limit = 5) => request(`/reels/feed?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
export const getSocialReelUploadLimits = () => request("/social/reels/upload-limits");
export const getSocialReel = reelId => request(`/social/reels/${encodeURIComponent(reelId)}`);
export const getMySocialReels = () => request("/social/my/reels");
export const getMyReelAnalytics = reelId => request(`/social/my/reels/${encodeURIComponent(reelId)}/analytics`);
export const updateMyReelPrivacy = (reelId, privacy) => request(`/social/my/reels/${encodeURIComponent(reelId)}/privacy`, { method:"PUT", body:JSON.stringify({ privacy }) });
export const deleteMyReel = reelId => request(`/social/my/reels/${encodeURIComponent(reelId)}`, { method:"DELETE" });
export const recordSocialReelEvent = (reelId, event) => request(`/social/reels/${encodeURIComponent(reelId)}/events`, { method:"POST", body:JSON.stringify(event) });
export const toggleSocialReelSave = reelId => request(`/social/reels/${encodeURIComponent(reelId)}/save`, { method:"POST" });
export const getSocialReelPreview = path => requestBlob(path.startsWith("/api/") ? path.slice(4) : path);
export const createSocialReel = payload => request("/social/reels", { method:"POST", body:JSON.stringify(payload) });
export const uploadSocialReel = (media, metadata) => request("/social/reels/upload", { method:"POST", body:media, headers:{
  "Content-Type":media.type,
  "X-Reel-Caption":encodeURIComponent(metadata.caption || ""),
  "X-Reel-Workout-Tag":encodeURIComponent(metadata.workoutTag || ""),
  "X-Reel-Location":encodeURIComponent(metadata.location || ""),
  "X-Reel-Privacy":metadata.privacy || "public",
} });
export const getSocialReelUploadUrl = (mediaType, fileSize) => {
  const params = new URLSearchParams({ contentType:mediaType, fileSize:String(fileSize) });
  return request(`/reels/upload-url?${params}`);
};
export const uploadReelObject = (uploadUrl, media, headers = {}, onProgress = () => {}) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open("PUT", uploadUrl);
  Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
  xhr.upload.addEventListener("progress", event => {
    if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
  });
  xhr.addEventListener("load", () => {
    if (xhr.status >= 200 && xhr.status < 300) resolve();
    else reject(new Error(`R2 upload failed (${xhr.status}). Check the bucket CORS policy and presigned URL.`));
  });
  xhr.addEventListener("error", () => reject(new Error("Network error uploading video to R2.")));
  xhr.addEventListener("abort", () => reject(new Error("Video upload was cancelled.")));
  xhr.send(media);
});
export const createSocialReelFromUpload = metadata => request("/reels", { method:"POST", body:JSON.stringify(metadata) });
export const getSocialReelOriginal = reelId => requestBlob(`/reels/${encodeURIComponent(reelId)}/original`);
export const getSocialReelMedia = reelId => requestBlob(`/social/reels/${encodeURIComponent(reelId)}/media`);
export const toggleSocialReelLike = reelId => request(`/social/reels/${encodeURIComponent(reelId)}/like`, { method:"POST" });
export const getSocialReelComments = reelId => request(`/social/reels/${encodeURIComponent(reelId)}/comments`);
export const addSocialReelComment = (reelId, body, parentCommentId) => request(`/social/reels/${encodeURIComponent(reelId)}/comments`, { method:"POST", body:JSON.stringify({ body, ...(parentCommentId ? { parentCommentId } : {}) }) });
export const setSocialReelCommentPinned = (reelId, commentId, pinned) => request(`/social/reels/${encodeURIComponent(reelId)}/comments/${encodeURIComponent(commentId)}/pin`, { method:"PUT", body:JSON.stringify({ pinned }) });
export const getSocialConversations = () => request("/social/conversations");
export const getSocialMessages = conversationId => request(`/social/conversations/${encodeURIComponent(conversationId)}/messages`);
export const getSocialMessageImage = (conversationId, messageId) => requestBlob(`/social/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/image`);
export const getSocialMessageAudio = (conversationId, messageId) => requestBlob(`/social/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/audio`);
export const getSocialTyping = conversationId => request(`/social/conversations/${encodeURIComponent(conversationId)}/typing`);
export const setSocialTyping = (userId, typing) => request(`/social/users/${encodeURIComponent(userId)}/typing`, { method:"POST", body:JSON.stringify({ typing }) });
export const sendSocialMessage = (userId, body) => request(`/social/users/${encodeURIComponent(userId)}/messages`, { method:"POST", body:JSON.stringify({ body }) });
export const sendSocialImageMessage = (userId, image, body = "") => request(`/social/users/${encodeURIComponent(userId)}/messages/image`, {
  method:"POST",
  body:image,
  headers:{
    "Content-Type":image.type,
    "X-File-Name":encodeURIComponent(image.name),
    "X-Message-Body":encodeURIComponent(body),
  },
});
export const sendSocialAudioMessage = (userId, audio, body = "") => request(`/social/users/${encodeURIComponent(userId)}/messages/audio`, {
  method:"POST",
  body:audio,
  headers:{
    "Content-Type":audio.type,
    "X-File-Name":encodeURIComponent(audio.name || "voice-note"),
    "X-Message-Body":encodeURIComponent(body),
  },
});
export const getCallSignals = since => request(`/social/calls/signals?since=${encodeURIComponent(since || new Date(0).toISOString())}`);
export const sendCallSignal = (userId, type, payload = {}) => request(`/social/users/${encodeURIComponent(userId)}/calls/signals`, { method:"POST", body:JSON.stringify({ type, payload }) });
