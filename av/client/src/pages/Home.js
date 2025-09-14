import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getUserCoins } from "../services/rewardService";
import ReferralPopup from "../components/ReferralPopup";
import ProductCard from "../components/ProductCard";
import { useIsClient } from "../hooks/useIsClient";
import Chart from 'chart.js/auto';
import { BanknotesIcon, ShoppingBagIcon, EyeIcon, TagIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline"; // ===== ADDED BanknotesIcon =====
import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { haversine } from "../utils/distance"; // Import fixed Haversine
import { API_BASE } from "../config"; // Make sure to add this import if it's not there
import Card from "../components/Card"; // ===== ADD THIS IMPORT =====

// NEW: Coordinate validation
const isValidIndianCoordinate = (lat, lng) => {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= 6.0 && lat <= 36.0 &&  // India lat range
    lng >= 68.0 && lng <= 98.0   // India lng range
  );
};

// FIXED: Enhanced coordinate extraction (UPDATED to match given changes)
const extractShopCoordinates = (shop) => {
  // Priority 1: Direct fields
  if (shop.shop_latitude && shop.shop_longitude) {
    return {
      lat: parseFloat(shop.shop_latitude),
      lng: parseFloat(shop.shop_longitude)
    };
  }
  
  // Priority 2: GeoJSON format (UPDATED to use [0] as lat and [1] as lng)
  if (shop.location?.coordinates) {
    return {
      lat: parseFloat(shop.location.coordinates[1]),
      lng: parseFloat(shop.location.coordinates[0])
    };
  }
  
  return null;
};

// FIX: Updated storeLocationInDB function as requested
const storeLocationInDB = async (lat, lng) => {
  try {
    const userId = sessionStorage.getItem("userId"); // FIXED KEY
    if (!userId) return;
    
    // FIX: Correct endpoint path
    await fetch(`${process.env.REACT_APP_API_URL}/update-owner-location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        latitude: lat,
        longitude: lng
      })
    });
  } catch (error) {
    console.error("Location storage failed:", error);
  }
};

// ===== ADDED NEW COMPONENT =====
const SmallMetricCard = ({ icon: Icon, title, value, color, unit = '' }) => {
  const colors = {
    blue: "text-blue-600 bg-blue-100",
    yellow: "text-yellow-600 bg-yellow-100",
    purple: "text-purple-600 bg-purple-100",
    green: "text-emerald-600 bg-emerald-100",
  };
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-neutral-500 truncate">{title}</p>
          <p className="text-xl font-bold text-neutral-800">{unit}{value}</p>
        </div>
      </div>
    </Card>
  );
};
// ===============================

export default function Home() {
  // --- START OF NEW NOTIFICATION LOGIC ---
  const [subscriptionNotice, setSubscriptionNotice] = useState(null);

  useEffect(() => {
    const checkSubscription = async () => {
      const userId = sessionStorage.getItem("userId");
      const role = sessionStorage.getItem("role");

      if (role === 'customer' && userId) {
        try {
          const response = await fetch(`${API_BASE}/check-subscription-status?user_id=${userId}`);
          const data = await response.json();

           if (data.status === 'grace_period_active') {
            const message = `Your subscription has expired! Renew within ${data.days_left} day(s) to maintain access.`;
            // Make this notice more urgent (e.g., different style or properties)
            setSubscriptionNotice({ message: message, type: 'urgent' });

          } else if (data.status === 'renewal_due_soon_warning') {
            const days = data.days_left;
            const message = days > 0
              ? `Your subscription renews in ${days} day(s)! You need more active coins.`
              : `Your subscription renews today! You need more active coins.`;
            setSubscriptionNotice({ message: message, type: 'warning' });
          }
        } catch (error) {
          console.error("Failed to check subscription status:", error);
        }
      }
    };
    
    // Check subscription status every time the component loads
    checkSubscription();
  }, []); // Empty array ensures this runs once on mount

  // --- END OF NEW NOTIFICATION LOGIC ---

  const [locationAllowed, setLocationAllowed] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [rewardPoints, setRewardPoints] = useState(0);
  // FIX 1: Restore referral state from location
  const [showReferralPopup, setShowReferralPopup] = useState(
    sessionStorage.getItem("hasEnteredReferral") !== "true" && 
    location.state?.showReferral
);
  const handledReferral = useRef(false);
  const [shopPerformance, setShopPerformance] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [bestPriceProducts, setBestPriceProducts] = useState([]);
  const [userRole, setUserRole] = useState("");
  const isClient = useIsClient();
  
  // CHANGE 1: Create a dedicated location state
  const [userLocation, setUserLocation] = useState(null);
  
  // NEW: Separate loading states
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingBestPrice, setLoadingBestPrice] = useState(true);
  
  // A. Add New State
  const [dealsProducts, setDealsProducts] = useState([]);
  const [loadingDeals, setLoadingDeals] = useState(true);

  // Add chart references
  const performanceChartRef = useRef(null);
  const salesChartRef = useRef(null);

  // ===== ADD THIS NEW STATE =====
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [ownerSubNotice, setOwnerSubNotice] = useState(null);
  // ==============================

  // ===== ADDED NEW STATE =====
  const [referralEarnings, setReferralEarnings] = useState(0);
  // ===========================

  // ===== ADD THIS NEW useEffect HOOK FOR OWNERS =====
  useEffect(() => {
    const checkOwnerSubscription = async () => {
      const role = sessionStorage.getItem("role");
      const userId = sessionStorage.getItem("userId");

      if (role === 'owner' && userId) {
        try {
          const response = await fetch(`${API_BASE}/owner/check-subscription?owner_id=${userId}`);
          if (!response.ok) return;

          const data = await response.json();
          if (data.status === 'expiring_soon') {
            const message = `Your subscription expires in ${data.days_left} day(s). Renew now to avoid service interruption.`;
            setOwnerSubNotice({ message: message, type: 'warning' });
          }
        } catch (error) {
          console.error("Failed to check owner subscription:", error);
        }
      }
    };

    checkOwnerSubscription();
  }, []); // Runs once on component mount
  // ======================================================

  // ===== ADDED NEW useEffect FOR REFERRAL EARNINGS =====
  useEffect(() => {
    const fetchReferralEarnings = async () => {
      const userId = sessionStorage.getItem("userId");
      if (!userId) return;
      try {
        const response = await fetch(`${API_BASE}/get-user?user_id=${userId}`);
        const data = await response.json();
        setReferralEarnings(data.referral_earnings || 0);
      } catch (error) {
        console.error("Error fetching referral earnings:", error);
      }
    };

    if (userRole === 'owner') {
      fetchReferralEarnings();
    }
  }, [userRole]);
  // =====================================================

  // FIX: Updated storeLocationInDB function as requested
  const storeLocationInDB = async (lat, lng) => {
    try {
      const userId = sessionStorage.getItem("userId"); // FIXED KEY
      if (!userId) return;
      
      // FIX: Correct endpoint path
      await fetch(`${process.env.REACT_APP_API_URL}/update-owner-location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        latitude: lat,
        longitude: lng
      })
    });
  } catch (error) {
    console.error("Location storage failed:", error);
  }
};

  // CHANGE 2: Unified location capture and storage with accuracy check
// CHANGE 2: Unified location capture and storage (Relaxed Accuracy)
// FINAL FIX: Balanced and robust location capture
  // FINAL, SIMPLIFIED FIX: A single, robust location request
  const captureAndStoreLocation = async () => {
    // 1. Always clear old session data first to prevent using stale locations
    sessionStorage.removeItem('userLocation');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        // Success Callback
        (position) => {
          console.log('Browser provided position:', position);
          
          const lat = parseFloat(position.coords.latitude.toFixed(6));
          const lng = parseFloat(position.coords.longitude.toFixed(6));

          if (!isValidIndianCoordinate(lat, lng)) {
            console.error("Coordinates are outside of India.");
            setLocationAllowed(false);
            resolve(null); // Resolve with null on failure
            return;
          }

          // Create the location data object, including accuracy
          const locationData = { 
            latitude: lat, 
            longitude: lng,
            accuracy: position.coords.accuracy 
          };

          // 2. Save the fresh, accurate location for other pages to use
          sessionStorage.setItem("userLocation", JSON.stringify(locationData));
          setUserLocation(locationData);
          setLocationAllowed(true);
          console.log('Location successfully captured and stored:', locationData);

          // Update the database for owners
          const role = sessionStorage.getItem("role");
          if (role === "owner") {
            storeLocationInDB(lat, lng);
          }
          
          resolve(locationData); // Resolve the promise with the new location
        },
        // Error Callback
        (error) => {
          console.error("Geolocation failed:", error.message);
          setLocationAllowed(false);
          setUserLocation(null);
          resolve(null); // Resolve with null on failure
        },
        // Options
        {
          enableHighAccuracy: true, // Strongly request GPS
          timeout: 10000,           // Give it 10 seconds to get a location
          maximumAge: 0             // Do not use a cached location
        }
      );
    });
  };

  useEffect(() => {
    const role = sessionStorage.getItem("role");
    setUserRole(role);
    
    // This effect runs once when the component mounts
    const initialize = async () => {
      if (role === "customer") {
        // ================== START OF CORRECTION ==================
        // This is the fix. We now `await` the location capture.
        // The `fetchData` function will only run AFTER a valid location is retrieved.
        const capturedLocation = await captureAndStoreLocation();

        // Only fetch data if the location was successfully captured
        if (capturedLocation) {
          fetchData(capturedLocation); 
        } else {
          // If location fails, stop the loading spinners and show empty sections
          setLoadingTrending(false);
          setLoadingBestPrice(false);
          setLoadingDeals(false);
        }
        // =================== END OF CORRECTION ===================
         
        // Handle referral popup logic
        if (location.state?.showReferral) { 
          setShowReferralPopup(true);
          // Clean the state from history to prevent popup on back/forward
          window.history.replaceState({}, document.title);
        }
      } else if (role === "owner") {
        // For owners, fetch their specific data (this part is unchanged)
         fetchShopPerformance();
        fetchTopProducts();
      }
    }

    initialize();
  }, []); // Empty dependency array ensures this runs only once on mount

  // ===== REPLACE THE OLD OWNER DATA-FETCHING useEffect WITH THIS =====
  useEffect(() => {
    const fetchOwnerDashboardData = async () => {
      const userId = sessionStorage.getItem("userId");
      if (!userId) return;

      try {
        const [metricsRes, performanceRes] = await Promise.all([
          fetch(`${process.env.REACT_APP_API_URL}/owner/dashboard-metrics?owner_id=${userId}`),
          fetch(`${process.env.REACT_APP_API_URL}/owner/shop-performance?owner_id=${userId}`)
        ]);

        const metricsData = await metricsRes.json();
        const performanceData = await performanceRes.json();

        setDashboardMetrics(metricsData);
        if (performanceData.performance) {
          setShopPerformance(performanceData.performance);
        }

      } catch (error) {
        console.error("Failed to fetch owner dashboard data:", error);
      }
    };

    if (userRole === "owner") {
      fetchOwnerDashboardData();
    }
  }, [userRole]);
  // =================================================================

  // Real-time product data fetching for customers
  // B. Replace the fetchData function
  const fetchData = async (currentLocation) => {
    const locationToUse = currentLocation || userLocation;
    if (!locationToUse || !locationToUse.latitude || !locationToUse.longitude) {
      setLoadingTrending(false);
      setLoadingBestPrice(false);
      setLoadingDeals(false);
      return; 
    }
    const handleResponse = (res) => res.ok ? res.json() : Promise.reject("Failed to fetch");
    const lat = locationToUse.latitude;
    const lng = locationToUse.longitude;
    const API_BASE = process.env.REACT_APP_API_URL;
    const urls = {
      trending: `${API_BASE}/products/trending?user_lat=${lat}&user_lng=${lng}`,
      bestPrice: `${API_BASE}/products/best-price?user_lat=${lat}&user_lng=${lng}`,
      deals: `${API_BASE}/products/deals?user_lat=${lat}&user_lng=${lng}`
    };
    try {
      setLoadingTrending(true); setLoadingBestPrice(true); setLoadingDeals(true);
      const [trendingRes, bestPriceRes, dealsRes] = await Promise.all([
        fetch(urls.trending).then(handleResponse),
        fetch(urls.bestPrice).then(handleResponse),
        fetch(urls.deals).then(handleResponse)
      ]);
      setTrendingProducts(trendingRes.products || []);
      setBestPriceProducts(bestPriceRes.products || []);
      setDealsProducts(dealsRes.products || []);
    } catch (error) {
      console.error("Product fetch error:", error);
    } finally {
      setLoadingTrending(false); setLoadingBestPrice(false); setLoadingDeals(false);
    }
  };

  useEffect(() => {
    if (userRole !== "customer") return;

    const interval = setInterval(() => fetchData(userLocation), 30000); // Pass current location state
    return () => clearInterval(interval);
  }, [userRole, userLocation]); // Re-run if location changes

  // Add this useEffect to refresh charts after new sales
  useEffect(() => {
    if (userRole === "owner") {
      fetchShopPerformance();
      fetchTopProducts();
    }
  }, [userRole]);

  // Add this useEffect for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (userRole === "owner") {
        fetchShopPerformance();
        fetchTopProducts();
      }
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [userRole]);

  // Refresh data after sale
  useEffect(() => {
    const handleNewSale = () => {
      if (userRole === "owner") {
        fetchShopPerformance();
        fetchTopProducts();
      }
    };

    window.addEventListener('newSaleRecorded', handleNewSale);
    
    return () => {
      window.removeEventListener('newSaleRecorded', handleNewSale);
    };
  }, [userRole]);

  useEffect(() => {
    if (location.state?.fromAuth) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // CHANGE 5: Update addDistance to accept location parameter
  const addDistance = (products, location) => {
    if (!location) return products.map(p => ({ ...p, distance: null }));
    
    const { latitude: userLat, longitude: userLng } = location;
    
    return products.map(product => {
      const coords = extractShopCoordinates(product);
      if (!coords) return { ...product, distance: null };
      
      const distance = haversine(userLat, userLng, coords.lat, coords.lng);
      return {
        ...product,
        distance,
        shopName: product.shop_name || product.shopName || "Local Store",
        shopLat: coords.lat,
        shopLng: coords.lng
      };
    });
  };

  const fetchShopPerformance = async () => {
    try {
      const userId = sessionStorage.getItem("userId");
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/owner/shop-performance?owner_id=${userId}`
      );
      const data = await response.json();
      
      // Format data for chart
      if (data.performance && data.performance.length > 0) {
        setShopPerformance(data.performance.map(item => ({
          date: item.date,
          views: item.views,
          sales: item.sales
        })));
      }
    } catch (error) {
      console.error("Performance fetch error:", error);
    }
  };

  const fetchTopProducts = async () => {
    try {
      const userId = sessionStorage.getItem("userId");
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/owner/top-products?owner_id=${userId}`
      );
      const data = await response.json();
      
      if (data.products) {
        setTopProducts(data.products);
      }
    } catch (error) {
      console.error("Top products fetch error:", error);
    }
  };

  // Initialize charts with fixed useEffect hooks
  useEffect(() => {
    if (userRole === "owner" && shopPerformance.length > 0 && isClient) {
      initPerformanceChart();
    }
  }, [shopPerformance, isClient]);

  useEffect(() => {
    if (userRole === "owner" && topProducts.length > 0 && isClient) {
      initSalesChart();
    }
  }, [topProducts, isClient]);

  const initPerformanceChart = () => {
    try {
      const ctx = document.getElementById('performanceChart');
      if (!ctx) return;
      
      ctx.height = window.innerWidth < 768 ? 200 : 256;
      
      if (performanceChartRef.current) {
        performanceChartRef.current.destroy();
      }
      
      // --- START OF UI UPGRADE ---
      // Create gradients for the fill effect
      const gradientBlue = ctx.getContext('2d').createLinearGradient(0, 0, 0, ctx.height);
      gradientBlue.addColorStop(0, 'rgba(59, 130, 246, 0.4)'); // Blue at top
      gradientBlue.addColorStop(1, 'rgba(59, 130, 246, 0)');   // Transparent at bottom

      const gradientGreen = ctx.getContext('2d').createLinearGradient(0, 0, 0, ctx.height);
      gradientGreen.addColorStop(0, 'rgba(16, 185, 129, 0.4)'); // Green at top
      gradientGreen.addColorStop(1, 'rgba(16, 185, 129, 0)');   // Transparent at bottom
      // --- END OF UI UPGRADE ---

      performanceChartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: shopPerformance.map(item => item.date),
          datasets: [
            {
              label: 'Views',
              data: shopPerformance.map(item => item.views),
              borderColor: '#3b82f6', // Blue
              borderWidth: 1.5, // Thinner line
              tension: 0.5, // Smoother curve
              fill: true, // Enable the fill
              backgroundColor: gradientBlue, // Apply the gradient
              pointRadius: 0, // Hide data points by default
              pointHoverRadius: 5 // Show points on hover
            },
            {
              label: 'Sales',
              data: shopPerformance.map(item => item.sales),
              borderColor: '#10b981', // Green
              borderWidth: 1.5, // Thinner line
              tension: 0.5, // Smoother curve
              fill: true, // Enable the fill
              backgroundColor: gradientGreen, // Apply the gradient
              pointRadius: 0, // Hide data points by default
              pointHoverRadius: 5 // Show points on hover
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top'
            }
          },
          scales: {
            x: {
               grid: { display: false },
              ticks: { maxRotation: 0, autoSkip: true }
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.05)' }
            }
          },
          animation: {
            duration: 1000,
            easing: 'easeOutQuart'
          }
        }
      });
    } catch (error) {
      console.error("Performance chart initialization failed:", error);
    }
  };

  const initSalesChart = () => {
    try {
      const ctx = document.getElementById('salesChart');
      if (!ctx) return;
      
      // Mobile-responsive sizing
      ctx.height = window.innerWidth < 768 ? 200 : 256;
      
      if (salesChartRef.current) {
        salesChartRef.current.destroy();
      }
      
      salesChartRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: topProducts.map(item => item.name),
          datasets: [{
            label: 'Units Sold',
            data: topProducts.map(item => item.sold),
            backgroundColor: [
              '#8b5cf6',
              '#ec4899',
              '#10b981'
            ],
            borderRadius: 8,
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                color: 'rgba(0, 0, 0, 0.05)'
              },
              ticks: {
                precision: 0
              }
            },
            x: {
              grid: {
                display: false
              }
            }
          }
        }
      });
    } catch (error) {
      console.error("Sales chart initialization failed:", error);
    }
  };

  return (
    <div className="space-y-8">
      {/* --- Subscription Banners (Logic is unchanged, styling is standardized) --- */}
      {ownerSubNotice && userRole === 'owner' && (
        <SubscriptionNoticeCard notice={ownerSubNotice} onDismiss={() => setOwnerSubNotice(null)} />
      )}
      {subscriptionNotice && userRole === 'customer' && (
        <SubscriptionNoticeCard notice={subscriptionNotice} onDismiss={() => setSubscriptionNotice(null)} />
      )}

      {userRole === "owner" && (
        <>
          {/* --- Owner Dashboard Header --- */}
          <div>
            <h1 className="text-3xl font-bold text-neutral-800">Dashboard</h1>
            <p className="text-neutral-500">A quick overview of your shop's performance.</p>
          </div>

          {/* --- Performance Graph & Alerts (Now at the top) --- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-3">
              <h3 className="text-lg font-semibold text-neutral-700 mb-4">Performance (Last 7 Days)</h3>
              <div className="h-80"><canvas id="performanceChart"></canvas></div>
            </Card>
          </div>

          {/* --- Redesigned Metric Cards (Now below the graph) --- */}
          <div className="grid grid-cols-2 gap-4">
            <SmallMetricCard icon={EyeIcon} title="Today's Views" value={dashboardMetrics?.todayViews || 0} color="blue" />
            <SmallMetricCard icon={ExclamationTriangleIcon} title="Low Stock Items" value={dashboardMetrics?.lowStockItems || 0} color="yellow" />
            <SmallMetricCard icon={TagIcon} title="Active Promotions" value={dashboardMetrics?.activePromotions || 0} color="purple" />
            <SmallMetricCard icon={BanknotesIcon} title="Referral Earnings" value={referralEarnings} color="green" unit="₹" />
          </div>
        </>
      )}

      {userRole === "customer" && (
        <>
          {/* --- Redesigned Customer Dashboard --- */}
          <div className="space-y-10 pb-24">
            <div>
              <h1 className="text-3xl font-bold text-neutral-800">Discover Local Products</h1>
              <p className="text-neutral-500">Find the best deals and trending items near you.</p>
            </div>

            <ProductSection title="🔥 Deals Near You" products={dealsProducts} loading={loadingDeals} />
            <ProductSection title="✨ Trending Products" products={trendingProducts} loading={loadingTrending} />
            <ProductSection title="💎 Best Value" products={bestPriceProducts} loading={loadingBestPrice} />
          </div>

          {showReferralPopup && <ReferralPopup onClose={() => setShowReferralPopup(false)} />}
        </>
      )}
    </div>
  );
}

const MetricCard = ({ icon: Icon, title, value, color }) => {
  const colors = {
    blue: "text-blue-600 bg-blue-100",
    yellow: "text-yellow-600 bg-yellow-100",
    purple: "text-purple-600 bg-purple-100",
  };
  return (
    <Card>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-neutral-500 mt-4">{title}</p>
      <p className="text-4xl font-bold text-neutral-800">{value}</p>
    </Card>
  );
};

function ProductCardSkeleton() {
  return (
    <div className="w-48 space-y-3 flex-shrink-0">
      <div className="w-full aspect-square bg-neutral-200 rounded-xl animate-pulse"></div>
      <div className="h-5 bg-neutral-200 rounded w-3/4 animate-pulse"></div>
      <div className="h-4 bg-neutral-200 rounded w-1/2 animate-pulse"></div>
    </div>
  );
}

function SubscriptionNoticeCard({ notice, onDismiss }) {
  const isUrgent = notice.type === 'urgent';
  return (
    <div className={`border-l-4 p-4 rounded-r-lg flex justify-between items-center shadow-md ${isUrgent ? 'bg-danger/10 border-danger text-red-800' : 'bg-warning/10 border-warning text-amber-800'}`}>
      <div>
        <p className="font-bold">{isUrgent ? 'Subscription Expired' : 'Subscription Alert'}</p>
        <p className="text-sm">{notice.message}</p>
      </div>
      <button onClick={onDismiss} className={`font-bold text-2xl ${isUrgent ? 'text-danger/70' : 'text-warning/70'}`} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
};

// Also, replace your existing ProductSection with this redesigned version
function ProductSection({ title, products, loading }) {
  const navigate = useNavigate();
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-neutral-800">{title}</h2>
        <button onClick={() => navigate('/shops')} className="text-sm font-semibold text-primary hover:underline flex items-center">
          See all <ChevronRightIcon className="h-4 w-4 ml-1" />
        </button>
      </div>
      {loading ? (
        <div className="flex space-x-4">
          {[...Array(3)].map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : products.length > 0 ? (
        <div className="flex overflow-x-auto pb-4 -mb-4 hide-scrollbar">
          <div className="flex space-x-4">
            {products.map(p => <div key={p._id} className="w-48 flex-shrink-0 cursor-pointer" onClick={() => navigate(`/shop/${p.shop_id}`)}><ProductCard product={p} /></div>)}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 bg-neutral-50 rounded-lg">
          <ShoppingBagIcon className="h-10 w-10 text-neutral-300 mx-auto" />
          <p className="text-neutral-500 text-sm mt-2">No products found.</p>
        </div>
      )}
    </Card>
  );
}