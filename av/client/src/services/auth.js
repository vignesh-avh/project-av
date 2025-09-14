import CryptoJS from 'crypto-js';
import { jwtDecode } from 'jwt-decode';

const SECRET_KEY = process.env.REACT_APP_STORAGE_SECRET || 'default_secret_key';

export const encryptData = (data) => {
  return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
};

export const decryptData = (ciphertext) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    
    // FIX: Better handling for non-JSON values
    if (decrypted) {
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    }
    return null;
  } catch (err) {
    console.error('Failed to decrypt data', err);
    secureStorage.removeItem("token");
    return null;
  }
};

export const secureStorage = {
  setItem: (key, value) => {
    if (key === "token") {
      try {
        const decoded = jwtDecode(value);
        // FIX: Always update coins from token
        if (decoded.coins) {
          sessionStorage.setItem("rewardPoints", decoded.coins.toString());
        }
        // Store all claims in session storage
        sessionStorage.setItem("userId", decoded.sub || "");
        sessionStorage.setItem("role", decoded.role);
        sessionStorage.setItem("onboardingDone",String(decoded.onboarding_done || false));
        sessionStorage.setItem("hasEnteredReferral", String(decoded.has_entered_referral || false));
        sessionStorage.setItem("subscriptionActive", String(decoded.subscription_active ?? false));
      } catch (e) {
        console.error("Token decode error:", e);
      }
    }
    localStorage.setItem(key, encryptData(value));
  },
  getItem: (key) => {
    const encrypted = localStorage.getItem(key);
    return encrypted ? decryptData(encrypted) : null;
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    if (key === "token") {
      // Clear all session storage on logout
      sessionStorage.removeItem("userId");
      sessionStorage.removeItem("role");
      sessionStorage.removeItem("onboardingDone");
      sessionStorage.removeItem("hasEnteredReferral");
      sessionStorage.removeItem("rewardPoints");
      sessionStorage.removeItem("subscriptionActive");

      localStorage.removeItem("lastKnownLocation");
    }
  }
};