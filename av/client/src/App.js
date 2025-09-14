import React, { useState, useEffect, lazy, Suspense, useCallback } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
  Navigate
} from "react-router-dom";
import axios from "axios";
import { jwtDecode } from 'jwt-decode';
import { FiShoppingCart } from "react-icons/fi";
import { redeemSubscription } from "./services/rewardService";
import CustomerReferral from "./pages/customer-referral";
import './index.css';
import { secureStorage } from "./services/auth";
import Navbar from './components/Navbar';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import PageTransition from './components/PageTransition';
import PublicRouteOnly from './components/PublicRouteOnly';

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Error in lazy component:", error, info);
  }

  render() {
    return this.state.hasError
      ? <div className="p-4 text-red-500">Component failed to load</div>
      : this.props.children;
  }
}

if (typeof window !== "undefined") {
  window.performance.mark('app-start');
}

const Welcome = lazy(() => import('./pages/Welcome'));
const Signup = lazy(() => import('./pages/Signup'));
const Login = lazy(() => import('./pages/Login'));
const Home = lazy(() => import('./pages/Home'));
const Shops = lazy(() => import('./pages/Shops'));
const Cart = lazy(() => import('./pages/Cart'));
const MyShop = lazy(() => import('./pages/MyShop'));
const ShopDetails = lazy(() => import('./pages/ShopDetails'));
const Terms = lazy(() => import('./pages/Terms'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const UserSettings = lazy(() => import('./pages/UserSettings'));
const ProfileSidebar = lazy(() => import('./components/ProfileSidebar'));
const PrivateRoute = lazy(() => import('./components/PrivateRoute'));
const RewardBadge = lazy(() => import('./components/RewardBadge'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Referral = lazy(() => import('./pages/Referral'));

const SkeletonLoader = () => (
  <div className="p-4 space-y-4">
    <div className="animate-pulse bg-gray-200 h-6 w-1/2 rounded mb-4"></div>
    <div className="animate-pulse bg-gray-200 h-4 w-full rounded mb-2"></div>
    <div className="animate-pulse bg-gray-200 h-4 w-3/4 rounded"></div>
  </div>
);

function NavigationBlocker() {
  const location = useLocation();
  
  useEffect(() => {
    window.scrollTo(0, 0);
    
    if (location.state?.showReferral) {
      window.history.replaceState(
        { ...location.state }, 
        document.title
      );
    }
  }, [location.pathname]);
  return null;
}

function AuthInitializer() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = secureStorage.getItem("token");
    const currentPath = location.pathname;
    
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const role = decoded.role || "customer";
        const onboardingDone = decoded.onboardingDone ?? false;
        const hasEnteredReferral = decoded.hasEnteredReferral ?? false;
        
        sessionStorage.setItem("role", role);
        sessionStorage.setItem("onboardingDone", onboardingDone.toString());
        sessionStorage.setItem("hasEnteredReferral", hasEnteredReferral.toString());
        sessionStorage.setItem("userId", decoded.uid || "");

        // FIX: Allow showing welcome page even if token exists
        if (currentPath === "/") {
          return; // Stay on welcome page
        }

        // NEW: Prevent redirect to onboarding
        if (role === "owner" && !onboardingDone && currentPath === "/onboarding") {
          return; // Stay on onboarding
        }

        // FIX: Only redirect from auth pages (signup/login)
        if (["/signup", "/login"].includes(currentPath)) {
          if (role === "owner") {
            navigate(onboardingDone ? "/myshop" : "/onboarding", { replace: true });
          } else {
            navigate("/home", { replace: true });
          }
          return;
        }

        const validPaths = [
          "/home", "/myshop", "/cart", "/shops", "/onboarding",
          "/", "/signup", "/login", "/terms", "/settings",
          "/subscription", "/referral", "/customer-referral"
        ];
        
        const shouldRedirect = !validPaths.includes(currentPath) && 
                              !currentPath.startsWith("/shop/");
        
        if (shouldRedirect) {
          if (role === "owner" && !onboardingDone) {
            navigate("/onboarding", { replace: true });
          } else if (role === "customer" && !hasEnteredReferral) {
            navigate("/home", { state: { showReferral: true }, replace: true });
          } else {
            navigate("/home", { replace: true });
          }
        }
      } catch (error) {
        console.error("Token validation error:", error);
        secureStorage.removeItem("token");
        sessionStorage.clear();
        navigate("/login");
      }
    } else if (!["/", "/signup", "/login"].includes(currentPath)) {
      navigate("/login", { replace: true });
    }
  }, [navigate, location.pathname]);

  return null;
}

function AppContent() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userRewardPoints, setUserRewardPoints] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [userRole, setUserRole] = useState('');
  const location = useLocation();

  const fetchUserCoins = async (userId) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/get-user?user_id=${userId}`
      );
      if (!response.ok) throw new Error("Failed to fetch coins");
      
      const userData = await response.json();
      const coins = Number(userData.coins) || 0;
      sessionStorage.setItem("rewardPoints", coins.toString());
      localStorage.setItem("rewardPoints", coins.toString());
      return coins;
    } catch (error) {
      console.error("Coin fetch error:", error);
      return 0;
    }
  };

  const handleRewardUpdate = async () => {
    const userId = sessionStorage.getItem("userId");
    if (userId) {
      const coins = await fetchUserCoins(userId);
      setUserRewardPoints(coins);
    }
  };

  useEffect(() => {
    const initialRole = sessionStorage.getItem("role");
    if (initialRole) setUserRole(initialRole);
    
    if (!initialRole) {
      const token = secureStorage.getItem("token");
      if (token) {
        try {
          const decoded = jwtDecode(token);
          const role = decoded.role || "customer";
          sessionStorage.setItem("role", role);
          setUserRole(role);
        } catch (error) {
          console.error("Token decode error:", error);
        }
      }
    }

    const handleUserChanged = () => {
      const newRole = sessionStorage.getItem("role") || '';
      setUserRole(newRole);
    };

    window.addEventListener('userChanged', handleUserChanged);
    return () => window.removeEventListener('userChanged', handleUserChanged);
  }, []);

  useEffect(() => {
    const cart = JSON.parse(sessionStorage.getItem("cartItems") || "[]");
    setCartCount(cart.length);
  }, []);

  useEffect(() => {
    const handleUserChange = () => {
      const role = sessionStorage.getItem("userRole");
      const onboarding = sessionStorage.getItem("onboardingDone");
      console.log("User changed - Role:", role, "Onboarding:", onboarding);
    };
    
    window.addEventListener('userChanged', handleUserChange);
    return () => window.removeEventListener('userChanged', handleUserChange);
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const response = await axios.post('/auth/refresh-token', {}, {
        withCredentials: true
      });
      
      const newAccessToken = response.data.access_token;
      secureStorage.setItem("token", newAccessToken);
      sessionStorage.setItem("accessToken", newAccessToken);

      axios.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
      
      return newAccessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      sessionStorage.clear();
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    const responseInterceptor = axios.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          const newAccessToken = await refreshToken();
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
          return axios(originalRequest);
        }
        return Promise.reject(error);
      }
    );
    
    return () => {
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [refreshToken]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);
  

  useEffect(() => {
    if (typeof window !== "undefined" && window.performance) {
      window.performance.mark('app-interactive');
      window.performance.measure('TTI', 'app-start', 'app-interactive');

      const ttiMeasurement = window.performance.getEntriesByName('TTI')[0];
      if (ttiMeasurement) {
        console.log('Time to Interactive:', ttiMeasurement.duration + 'ms');
      }
    }
  }, []);

  useEffect(() => {
    const token = secureStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        if (decoded.coins) {
          setUserRewardPoints(decoded.coins);
          sessionStorage.setItem("rewardPoints", decoded.coins.toString());
        }
      } catch (e) {
        console.error("Token decode error:", e);
      }
    }
    
    window.addEventListener('rewardPointsUpdated', handleRewardUpdate);
    
    return () => {
      window.removeEventListener('rewardPointsUpdated', handleRewardUpdate);
    };
  }, []);

  useEffect(() => {
    const handleCartUpdate = () => {
      const cart = JSON.parse(sessionStorage.getItem("cartItems") || "[]");
      setCartCount(cart.length);
    };

    window.addEventListener('cartUpdated', handleCartUpdate);
    return () => window.removeEventListener('cartUpdated', handleCartUpdate);
  }, []);

  useEffect(() => {
    const handleCartReset = () => setCartCount(0);
    window.addEventListener('cartReset', handleCartReset);
    return () => window.removeEventListener('cartReset', handleCartReset);
  }, []);


  useEffect(() => {
    const handleProfileUpdate = (e) => {
      const { fullName, city } = e.detail;
      sessionStorage.setItem("userFullName", fullName);
      sessionStorage.setItem("userCity", city);
    };

    window.addEventListener('profileUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('profileUpdated', handleProfileUpdate);
    };
  }, []);

  return (
    <>
      <Toaster
        position="top-center"
        reverseOrder={false}
        toastOptions={{
          duration: 3000,
          style: {
            background: '#334155',
            color: '#fff',
          },
        }}
      />
      <NavigationBlocker />
      <AuthInitializer />
      
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 p-4">
          <ErrorBoundary>
            <Suspense fallback={<SkeletonLoader />}>
              <AnimatePresence mode="wait">
                <Routes location={location} key={location.pathname}>
                  <Route path="/" element={<PublicRouteOnly><PageTransition><Welcome /></PageTransition></PublicRouteOnly>} />
              <Route path="/signup" element={<PublicRouteOnly><PageTransition><Signup /></PageTransition></PublicRouteOnly>} />
              <Route path="/login" element={<PublicRouteOnly><PageTransition><Login /></PageTransition></PublicRouteOnly>} />

              <Route path="/onboarding" element={
                <PrivateRoute requiredRole="owner">
                  <PageTransition><Onboarding /></PageTransition>
                </PrivateRoute>
              } />
                  <Route path="/home" element={
                    <PrivateRoute>
                      <PageTransition><Home /></PageTransition>
                    </PrivateRoute>
                  } />
                  <Route path="/shops" element={
                    <PrivateRoute>
                      <PageTransition><Shops /></PageTransition>
                    </PrivateRoute>
                  } />
                  <Route path="/shop/:shopId" element={
                    <PrivateRoute>
                      <PageTransition><ShopDetails /></PageTransition>
                    </PrivateRoute>
                  } />
                  <Route path="/onboarding" element={<PageTransition><Onboarding /></PageTransition>} />

                  <Route path="/myshop" element={
                    <PrivateRoute requiredRole="owner">
                      <PageTransition><MyShop /></PageTransition>
                    </PrivateRoute>
                  } />

                  <Route path="/cart" element={
                    <PrivateRoute requiredRole="customer">
                      <PageTransition><Cart /></PageTransition>
                    </PrivateRoute>
                  } />

                  <Route path="/settings" element={
                    <PrivateRoute>
                      <PageTransition><UserSettings /></PageTransition>
                    </PrivateRoute>
                  } />

                  <Route path="/terms" element={
                    <PrivateRoute>
                      <PageTransition><Terms /></PageTransition>
                    </PrivateRoute>
                  } />

                  <Route path="/subscription" element={
                    <PrivateRoute>
                      <PageTransition><Subscription /></PageTransition>
                    </PrivateRoute>
                  } />

                  <Route path="/referral" element={
                    <PrivateRoute requiredRole="owner">
                      <PageTransition><Referral /></PageTransition>
                    </PrivateRoute>
                  } />

                  <Route
                    path="/customer-referral"
                    element={
                      <PrivateRoute requiredRole="customer">
                        <PageTransition><CustomerReferral /></PageTransition>
                      </PrivateRoute>
                    }
                  />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AnimatePresence>
            </Suspense>
          </ErrorBoundary>
        </div>

        <ErrorBoundary>
          <Suspense fallback={<div>Loading...</div>}>
            <RewardBadge points={userRewardPoints} />
            <Navbar />
            <ProfileSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}