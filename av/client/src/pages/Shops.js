import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom"; // Added useLocation

export default function Shops() {
  const [query, setQuery] = useState("");
  const [filteredShops, setFilteredShops] = useState([]);
  const [lat, setLat] = useState(null);
  const [long, setLong] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation(); // Added location hook

  // Initialize query from URL if present
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchQuery = params.get("q");
    if (searchQuery) {
      setQuery(searchQuery);
    }
  }, [location.search]);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLong(pos.coords.longitude);
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => {
    if (!query.trim() || lat === null || long === null) {
      setFilteredShops([]);
      return;
    }

    const fetchShops = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `http://localhost:8000/get-shops?product_name=${encodeURIComponent(query)}&user_lat=${lat}&user_lng=${long}&in_stock=true`
        );
        const data = await res.json();
        
        // DEBUG: Log the response data
        console.log("API Response:", data);
        
        // FIX: Properly handle the response structure
        if (data && data.shops && Array.isArray(data.shops)) {
          setFilteredShops(data.shops);
        } else {
          setFilteredShops([]);
        }
      } catch (error) {
        console.error("Error fetching shops:", error);
        setFilteredShops([]);
      } finally {
        setLoading(false);
      }
    };

    // Add debounce to prevent too many requests
    const handler = setTimeout(fetchShops, 300);
    return () => clearTimeout(handler);
  }, [query, lat, long]);

  // Update URL when query changes
  useEffect(() => {
    if (query) {
      navigate(`?q=${encodeURIComponent(query)}`, { replace: true });
    }
  }, [query, navigate]);

  return (
    <div className="p-4 pb-24">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-neutral-800">Find Local Shops</h1>
        <p className="text-neutral-500 mt-2">Search for products to see which nearby shops have them in stock.</p>
      </div>
      <div className="sticky top-4 z-10 mb-6">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            className="w-full p-4 pl-12 border border-neutral-300 rounded-xl shadow-sm focus:ring-2 focus:ring-primary transition-all"
            placeholder="Search for products like 'Apples', 'Milk'..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      
      {loading ? (
        <ShopListSkeleton />
      ) : filteredShops.length === 0 ? (
        <div className="text-center py-16 px-4">
          <svg className="h-16 w-16 text-neutral-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <h3 className="mt-4 text-xl font-semibold text-neutral-700">
            {query ? "No Shops Found" : "Search for a Product"}
          </h3>
          <p className="text-neutral-500 mt-2">
            {query ? `We couldn't find any shops selling "${query}" near you.` : "Start typing in the search bar above to find local shops."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredShops.map((shop) => (
            <ShopListItem key={shop._id} shop={shop} query={query} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShopListItem({ shop, query, navigate }) {
  return (
    <div
      onClick={() => navigate(`/shop/${shop._id}?q=${encodeURIComponent(query)}`)}
      className="bg-white p-4 rounded-2xl shadow-md border border-neutral-200 cursor-pointer transition-all duration-300 hover:shadow-xl hover:border-primary"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-neutral-800">{shop.name}</h3>
          <p className="text-sm text-neutral-500 mt-1">
            🚶‍♂️ {shop.distance ? `${shop.distance.toFixed(1)} km away` : 'Distance unavailable'}
          </p>
        </div>
        <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full flex items-center">
          ⭐ {shop.rating ? parseFloat(shop.rating).toFixed(1) : 'New'}
        </span>
      </div>
      <div className="border-t border-neutral-100 mt-3 pt-3">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold">Carries:</span> {shop.products?.join(", ") || 'Various products'}
        </p>
      </div>
    </div>
  );
}

function ShopListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white p-4 rounded-2xl shadow-md border border-neutral-200">
          <div className="flex justify-between items-start">
            <div className="flex-1 space-y-2">
              <div className="h-6 bg-neutral-200 rounded w-3/5 animate-pulse"></div>
              <div className="h-4 bg-neutral-200 rounded w-2/5 animate-pulse"></div>
            </div>
            <div className="h-6 w-12 bg-neutral-200 rounded-full animate-pulse"></div>
          </div>
          <div className="border-t border-neutral-100 mt-3 pt-3">
            <div className="h-4 bg-neutral-200 rounded w-4/5 animate-pulse"></div>
          </div>
        </div>
      ))}
    </div>
  );
}