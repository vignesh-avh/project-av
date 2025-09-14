import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export default function RewardBadge({ points }) {
  const [visible, setVisible] = useState(false);
  const prevPointsRef = useRef(0);
  const location = useLocation();

  useEffect(() => {
    // Hide notification when route changes
    setVisible(false);
    
    // Only show notification when points increase
    if (points > prevPointsRef.current) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      
      prevPointsRef.current = points;
      return () => clearTimeout(timer);
    }
    
    prevPointsRef.current = points;
  }, [points, location.pathname]);

  if (!visible) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-black px-4 py-2 rounded-full shadow-lg z-50 animate-bounce">
      🪙 You earned 3 coins! Total: {points} coins
    </div>
  );
}