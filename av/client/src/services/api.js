import axios from 'axios';
import Cookies from 'universal-cookie';

const cookies = new Cookies();
const API_BASE = process.env.REACT_APP_API_URL;

export const login = async (email, password) => {
  const response = await axios.post(`${API_BASE}/auth/login`, {
    username: email,
    password,
    grant_type: 'password'
  });
  return response.data;
};

export const signup = async (userData) => {
  const response = await axios.post(`${API_BASE}/auth/signup`, userData);
  return response.data;
};

export const googleLogin = async (data) => {
  const response = await axios.post(`${API_BASE}/auth/google-auth`, data);
  return response.data;
};

export const refreshToken = async (token) => {
  const response = await axios.post(`${API_BASE}/auth/refresh-token`, { token });
  return response.data;
};

export const applyReferral = async (customer_id, referral_code) => {
  const response = await axios.post(
    `${API_BASE}/referral/apply-referral`,
    { customer_id, referral_code }
  );
  return response.data;
};

export const skipReferral = async (user_id) => {
  const response = await axios.post(
    `${API_BASE}/referral/skip-referral`,
    { user_id }
  );
  return response.data;
};

export const getUserData = async (userId) => {
  const response = await axios.get(`${API_BASE}/user/${userId}`);
  return response.data;
};

export const getUserDataFromToken = async (token) => {
  const response = await axios.get(`${API_BASE}/verify-token`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

// Add the new function here
export const updateUserLocation = async (lat, lng) => {
  const userId = sessionStorage.getItem("userId");
  try {
    await axios.post(`${API_BASE}/update-user-location`, {
      user_id: userId,
      latitude: lat,
      longitude: lng
    });
  } catch (error) {
    console.error("Location sync failed:", error);
  }
};

// Axios interceptor to attach token
axios.interceptors.request.use(config => {
  const token = cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
