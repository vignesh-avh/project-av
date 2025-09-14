import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import {  } from "../services/auth";
import { FiShoppingCart } from "react-icons/fi"; // <-- ADD THIS
import Card from "../components/Card"; // <-- ADD THIS
import Button from "../components/Button"; 
import toast from 'react-hot-toast'; // <-- ADDED IMPORT

export default function Cart() {
  const [cartItems, setCartItems] = useState([]);
  const [previousCart, setPreviousCart] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [rewardPoints, setRewardPoints] = useState(0);
  const navigate = useNavigate();

  // Initialize reward points from sessionStorage
  useEffect(() => {
    const storedPoints = sessionStorage.getItem("rewardPoints");
    if (storedPoints) {
      setRewardPoints(parseInt(storedPoints, 10));
    }
  }, []);

  // FIX: Unified cart loading from localStorage
  useEffect(() => {
    const userId = sessionStorage.getItem("userId");
    if (!userId) return;
    
    const cartKey = `cart_${userId}`;
    const rawCartData = JSON.parse(localStorage.getItem(cartKey) || "[]");

    // Group items by ID to remove duplicates and sum quantities
    const groupedCart = rawCartData.reduce((acc, item) => {
      const existingItem = acc.find(groupedItem => groupedItem.id === item.id);

      if (existingItem) {
        // If the item already exists, just increase its quantity
        existingItem.quantity += (item.quantity || 1);
      } else {
        // Otherwise, add the new item to the list
        acc.push({ ...item, quantity: item.quantity || 1 });
      }
      
      return acc;
    }, []);
    
    setCartItems(groupedCart);
  }, []);

  useEffect(() => {
    const handleCartUpdate = () => {
      const cart = JSON.parse(sessionStorage.getItem("cartItems") || "[]");
      setCartItems(cart);
    };

    window.addEventListener('cartUpdated', handleCartUpdate);
    return () => window.removeEventListener('cartUpdated', handleCartUpdate);
  }, []);

  // FIXED: Unified cart update function
  const updateCart = (items) => {
    const userId = sessionStorage.getItem("userId");
    setCartItems(items);
    
    if (userId) {
      const cartKey = `cart_${userId}`;
      localStorage.setItem(cartKey, JSON.stringify(items));
      sessionStorage.setItem("cartItems", JSON.stringify(items));
    }
    
    window.dispatchEvent(new Event('cartUpdated'));
  };

  const increaseQuantity = (id) => {
    const updated = cartItems.map(item => 
      item.id === id ? { ...item, quantity: item.quantity + 1 } : item
    );
    updateCart(updated);
  };

  const decreaseQuantity = (id) => {
    const updated = cartItems.map(item => 
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item
    );
    updateCart(updated);
  };

  const removeItem = (id) => {
    const updated = cartItems.filter(item => item.id !== id);
    updateCart(updated);
  };

  const getTotal = () => {
    return cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  const handleCheckout = async () => {
    const userId = sessionStorage.getItem("userId");
    if (!userId) {
      toast.error("User ID not found. Please log in again."); // CHANGED
      return;
    }

    try {
      const cartData = cartItems.map(item => ({
        // FIX: Use actual product ID instead of generated ID
        product_id: item.product_id,
        product_name: item.product_name,
        price: item.price,
        unit: item.unit,
        quantity: item.quantity,
        user_id: userId,
        shop_id: item.shop_id,
        timestamp: new Date().toISOString()
      }));

      const res = await fetch(`${API_BASE}/checkout-cart/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cartData),
      });
      
      if (res.ok) {
        // Clear cart
        const cartKey = `cart_${userId}`;
        localStorage.removeItem(cartKey);
        sessionStorage.removeItem("cartItems");
        setCartItems([]);
        setShowSuccess(true);
        
        // Update coins
        const newPoints = rewardPoints + 3;
        setRewardPoints(newPoints);
        sessionStorage.setItem("rewardPoints", newPoints.toString());
        // ADDED: Update localStorage for rewardPoints
        localStorage.setItem("rewardPoints", newPoints.toString());
        // Dispatch event to update entire app
        window.dispatchEvent(new Event('rewardPointsUpdated'));
      } else {
        const errorData = await res.json();
        toast.error(`Checkout failed: ${errorData.error || "Unknown error"}`); // CHANGED
      }
    } catch (error) {
      toast.error("Error during checkout. Please try again."); // CHANGED
    }
  };
  
  const fetchPreviousCart = async () => {
    const userId = sessionStorage.getItem("userId");
    if (!userId) {
      toast.error("User ID not found."); // CHANGED
      return;
    }

    try {
      // FIXED: Removed extra slash before query params
      const res = await fetch(`${API_BASE}/get-cart?user_id=${userId}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.cart)) {
        setPreviousCart(data.cart);
      } else {
        toast.error("No previous cart found."); // CHANGED
      }
    } catch (err) {
      toast.error("Error fetching previous cart."); // CHANGED
    }
  };

  return (
    <div className="p-4 pb-40">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-neutral-800">Shopping Cart</h1>
        </div>

        {showSuccess && (
          <div className="bg-success/10 border border-success/20 text-green-800 px-4 py-3 rounded-xl mb-6 text-center">
            <strong className="font-bold block">Checkout successful!</strong>
            <span className="block sm:inline mt-1"> You earned 3 reward points!</span>
          </div>
        )}

        {cartItems.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white rounded-2xl shadow-lg border border-neutral-200">
            <FiShoppingCart className="h-16 w-16 text-neutral-300 mx-auto" />
            <h3 className="mt-4 text-xl font-semibold text-neutral-700">Your Cart is Empty</h3>
            <p className="text-neutral-500 mt-2 mb-6">Looks like you haven't added any products yet.</p>
            <button
              onClick={() => navigate('/shops')}
              className="bg-primary text-white font-semibold px-6 py-3 rounded-lg hover:bg-primary-dark active:scale-95 transition-all duration-200"
            >
              Start Shopping
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {cartItems.map((item) => (
              <Card key={item.id} className="!p-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-bold text-neutral-800">{item.product_name}</p>
                  <p className="text-sm text-neutral-600 mt-1">₹{item.price} / {item.unit.replace(/_/g, ' ')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => decreaseQuantity(item.id)} className="w-8 h-8 rounded-full flex items-center justify-center bg-neutral-200 hover:bg-neutral-300 text-lg font-bold">-</button>
                  <span className="font-semibold w-6 text-center">{item.quantity}</span>
                  <button onClick={() => increaseQuantity(item.id)} className="w-8 h-8 rounded-full flex items-center justify-center bg-neutral-200 hover:bg-neutral-300 text-lg font-bold">+</button>
                </div>
                <button onClick={() => removeItem(item.id)} className="ml-4 text-neutral-400 hover:text-danger text-2xl">&times;</button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {cartItems.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-neutral-200 p-4 z-30">
          <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-medium text-neutral-600">Total:</span>
              <span className="text-2xl font-bold text-neutral-900">₹{getTotal().toFixed(2)}</span>
            </div>
            <Button onClick={handleCheckout}>Proceed to Checkout</Button>
          </div>
        </div>
      )}
    </div>
  );
}