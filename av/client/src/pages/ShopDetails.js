import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { addReward } from "../services/rewardService";
import { FiMapPin, FiChevronLeft } from "react-icons/fi";
import { haversine } from "../utils/distance";
import Card from "../components/Card"; // <-- ADD THIS
import ProductCard from "../components/ProductCard"; // <-- ADD THIS
import ProductCardSkeleton from "../components/ProductCardSkeleton";
import toast from 'react-hot-toast';

const API_BASE = process.env.REACT_APP_API_URL;

export default function ShopDetails() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);
  const [highlightedProduct, setHighlightedProduct] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [userCoords, setUserCoords] = useState(null);
  const [distance, setDistance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cartLoading, setCartLoading] = useState(null);

  useEffect(() => {
    const storedLocation = sessionStorage.getItem("userLocation");
    if (storedLocation) {
      try {
        const parsed = JSON.parse(storedLocation);
        setUserCoords({ lat: parsed.latitude, lng: parsed.longitude });
      } catch (e) { console.error("Failed to parse user location"); }
    }

    const fetchShop = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/get-shop?id=${shopId}`);
        if (!response.ok) throw new Error("Shop not found");
        const data = await response.json();

        if (storedLocation) {
          const userLoc = JSON.parse(storedLocation);
          const dist = haversine(userLoc.latitude, userLoc.longitude, data.shop.latitude, data.shop.longitude);
          setDistance(dist);
        }

        setShop(data.shop);
      } catch (error) {
        console.error("Failed to load shop:", error);
        navigate("/shops");
      } finally {
        setLoading(false);
      }
    };
    fetchShop();
  }, [shopId, navigate]);

  useEffect(() => {
    if (location.state?.highlightProduct) {
      setHighlightedProduct(location.state.highlightProduct);
      setTimeout(() => {
        const element = document.getElementById(location.state.highlightProduct);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
          element.classList.add('bg-yellow-100');
          setTimeout(() => element.classList.remove('bg-yellow-100'), 2000);
        }
      }, 500);
    }
  }, [location.state]);

  useEffect(() => {
    const recordShopView = async () => {
      try {
        await fetch(`${API_BASE}/record-shop-view/${shopId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Failed to record shop view:", error);
      }
    };
    
    if (shopId) {
      recordShopView();
    }
  }, [shopId]);

  const getDirectionsUrl = () => {
    if (!shop) return '';
    
    let url = `https://maps.google.com/?q=${shop.latitude},${shop.longitude}`;
    
    if (userCoords) {
      url = `https://maps.google.com/?saddr=${userCoords.lat},${userCoords.lng}&daddr=${shop.latitude},${shop.longitude}`;
    }
    
    return url;
  };

  const handleAddToCart = async (product) => {
    const userId = sessionStorage.getItem("userId");
    if (!userId) {
      toast.error("Please log in to add items to your cart.");
      return;
    }
    setCartLoading(product.id);

    try {
      const response = await fetch(`${API_BASE}/cart/add-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id, user_id: userId }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to add to cart.");
      }
      const data = await response.json();
      const updatedProduct = data.product;

      setShop(currentShop => ({
        ...currentShop,
        products: currentShop.products.map(p => p.id === updatedProduct._id ? { ...p, count: updatedProduct.count } : p)
      }));

      const cartKey = `cart_${userId}`;
      const existingCart = JSON.parse(localStorage.getItem(cartKey) || "[]");
      const cartItem = { ...product, id: product.id, shop_id: shopId, quantity: 1 };
      const updatedCart = [...existingCart, cartItem];
      localStorage.setItem(cartKey, JSON.stringify(updatedCart));
      sessionStorage.setItem("cartItems", JSON.stringify(updatedCart));
      
      window.dispatchEvent(new Event('cartUpdated'));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCartLoading(null);
    }
  };

  // ===== REPLACED RETURN STATEMENT =====
  if (loading || !shop) {
    return (
      <div className="p-4 space-y-6">
        <div className="h-8 w-24 bg-neutral-200 rounded-lg animate-pulse"></div>
        <div className="bg-white p-4 rounded-2xl shadow-md border border-neutral-200">
          <div className="h-8 w-3/5 bg-neutral-200 rounded-lg animate-pulse"></div>
          <div className="h-5 w-2/5 bg-neutral-200 rounded-lg mt-2 animate-pulse"></div>
        </div>
        <div className="h-6 w-1/3 bg-neutral-200 rounded-lg animate-pulse"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 pb-24">
      <button onClick={() => navigate(-1)} className="font-semibold text-primary hover:text-primary-dark flex items-center gap-1">
        <FiChevronLeft /> Back to Shops
      </button>

      <Card className="!p-0 overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-neutral-800">{shop.name}</h1>
              <p className="text-neutral-500 mt-1">
                {distance !== null && `🚶‍♂️ ${distance.toFixed(1)} km away`}
              </p>
            </div>
            <a href={getDirectionsUrl()} target="_blank" rel="noopener noreferrer" className="bg-primary text-white px-4 py-2 rounded-lg flex items-center text-sm gap-2 font-semibold shadow-sm hover:bg-primary-dark">
              <FiMapPin /> Directions
            </a>
          </div>
        </div>
      </Card>
      
      <div>
        <h2 className="text-2xl font-bold text-neutral-800 mb-4">Products</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {shop.products.map(product => (
            <div key={product.id} className="flex flex-col justify-between">
              <ProductCard product={product} />
              <button
                onClick={() => handleAddToCart(product)}
                disabled={cartLoading === product.id || product.count === 0}
                className="w-full mt-2 bg-primary-light text-white py-2 rounded-lg text-sm font-semibold hover:bg-primary active:scale-95 transition-all disabled:bg-neutral-300 disabled:cursor-not-allowed"
              >
                {cartLoading === product.id ? (
                  <div className="h-5 w-5 border-2 border-t-transparent border-white rounded-full animate-spin mx-auto"></div>
                ) : 'Add to Cart'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  // ================================
}