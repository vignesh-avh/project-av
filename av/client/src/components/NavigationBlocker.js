import { useLocation } from "react-router-dom";
import { useEffect } from "react";

function NavigationBlocker() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    
    // NEW: Remove back navigation blocking logic completely
    return () => {};
  }, [location]);

  return null;
}

export default NavigationBlocker;