import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiShoppingCart, FiHome, FiSearch, FiShoppingBag } from "react-icons/fi";
import { secureStorage } from "../services/auth";
import { jwtDecode } from 'jwt-decode';

function Navbar() {
  const location = useLocation();
  const [userRole, setUserRole] = useState("");
  const [rewardPoints, setRewardPoints] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // List of sidebar pages where navbar should be hidden
  const sidebarPages = [
    "/settings", "/terms", "/subscription",
    "/referral", "/customer-referral"
  ];

  useEffect(() => {
    const handleSidebarEvent = () => {
      setSidebarOpen(sessionStorage.getItem("sidebarOpen") === "true");
    };
    
    window.addEventListener('sidebarOpened', handleSidebarEvent);
    window.addEventListener('sidebarClosed', handleSidebarEvent);
    
    return () => {
      window.removeEventListener('sidebarOpened', handleSidebarEvent);
      window.removeEventListener('sidebarClosed', handleSidebarEvent);
    };
  }, []);

  const fetchUserCoins = async (userId) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/get-user?user_id=${userId}`
      );
      if (!response.ok) throw new Error("Failed to fetch coins");
      
      const userData = await response.json();
      // FIX: Always get fresh coin data from backend
      const coins = Number(userData.coins) || 0;
      
      sessionStorage.setItem("rewardPoints", coins.toString());
      localStorage.setItem("rewardPoints", coins.toString());
      return coins;
    } catch (error) {
      console.error("Coin fetch error:", error);
      return 0;
    }
  };

  const updateUserState = async (forceRefresh = false) => {
    const sessionRole = sessionStorage.getItem("role");
    const cart = JSON.parse(sessionStorage.getItem("cartItems") || "[]");
    
    // FIX: Always get fresh coin data on first load
    let points = 0;
    if (forceRefresh || !sessionStorage.getItem("rewardPoints")) {
      try {
        const userId = sessionStorage.getItem("userId");
        if (userId) {
          points = await fetchUserCoins(userId);
        }
      } catch (e) {
        points = 0;
      }
    } else {
      try {
        const storedPoints = sessionStorage.getItem("rewardPoints");
        if (storedPoints) {
          points = parseInt(storedPoints, 10) || 0;
        }
      } catch (e) {
        points = 0;
      }
    }
    
    if (sessionRole) {
      setUserRole(sessionRole);
      setRewardPoints(points);
      setCartCount(cart.length);
      setLoading(false);
      return;
    }
    
    const token = secureStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const role = decoded.role || "customer";
        const userId = decoded.uid || "";
        
        // Fetch coins if not available in session
        if (!sessionStorage.getItem("rewardPoints")) {
          points = await fetchUserCoins(userId);
        }
        
        sessionStorage.setItem("role", role);
        sessionStorage.setItem("userId", userId);
        sessionStorage.setItem("rewardPoints", points.toString());
        
        setUserRole(role);
        setRewardPoints(points);
        setCartCount(cart.length);
      } catch (error) {
        console.error("Token decode error:", error);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    updateUserState(true); // Force refresh on mount
    
    const handleUpdate = () => updateUserState(true); // Refresh on events
    
    window.addEventListener('userChanged', handleUpdate);
    window.addEventListener('cartUpdated', () => {
      const cart = JSON.parse(sessionStorage.getItem("cartItems") || "[]");
      setCartCount(cart.length);
    });
    
    window.addEventListener('rewardPointsUpdated', handleUpdate);
    
    return () => {
      window.removeEventListener('userChanged', handleUpdate);
      window.removeEventListener('cartUpdated', () => {});
      window.removeEventListener('rewardPointsUpdated', handleUpdate);
    };
  }, []);

  const NavLink = ({ to, icon: Icon, label }) => {
    const isActive = location.pathname === to;
    return (
      <Link to={to} className={`flex flex-col items-center justify-center w-full transition-colors duration-200 ${isActive ? 'text-primary' : 'text-neutral-500 hover:text-primary'}`}>
        <Icon className="h-6 w-6" />
        <span className={`text-xs mt-1 font-medium ${isActive ? 'text-primary' : 'text-neutral-600'}`}>{label}</span>
      </Link>
    );
  };

  const hiddenRoutes = ["/", "/signup", "/login", "/onboarding"];
  if (hiddenRoutes.includes(location.pathname) || sidebarPages.includes(location.pathname) || sidebarOpen) {
    return null;
  }
  
  if (loading) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-neutral-200 flex justify-center items-center h-16 z-50">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Hide coins on sidebar pages, non-home routes, and during referral popup
  const showCoins = !sidebarOpen && 
                    !sidebarPages.includes(location.pathname) &&
                    location.pathname === "/home" &&
                    userRole === "customer" &&
                    !location.state?.showReferral;

  return (
    <>
      {/* Conditionally show coins */}
      {showCoins && !loading && rewardPoints > 0 && (
        <div className="fixed top-4 left-4 z-50">
          <div className="bg-yellow-400 text-black px-3 py-1 rounded-full text-sm font-semibold">
            {rewardPoints} pts
          </div>
        </div>
      )}

      {/* Bottom navbar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-neutral-200 h-16 grid grid-cols-3 z-40">
        <NavLink to="/home" icon={FiHome} label="Home" />
        <NavLink to="/shops" icon={FiSearch} label="Shops" />
        {userRole === "owner" ? (
          <NavLink to="/myshop" icon={FiShoppingBag} label="My Shop" />
        ) : (
          <Link to="/cart" className="flex flex-col items-center justify-center w-full relative text-neutral-500 hover:text-primary transition-colors duration-200">
            {location.pathname === '/cart' ? <FiShoppingCart className="h-6 w-6 text-primary" /> : <FiShoppingCart className="h-6 w-6" />}
            <span className={`text-xs mt-1 font-medium ${location.pathname === '/cart' ? 'text-primary' : 'text-neutral-600'}`}>Cart</span>
            {cartCount > 0 && (
              <span className="absolute top-1 right-[28%] bg-danger text-white text-xs rounded-full h-4 w-4 flex items-center justify-center text-[10px] font-bold">
                {cartCount}
              </span>
            )}
          </Link>
        )}
      </div>
    </>
  );
}

export default Navbar;