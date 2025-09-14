import React, { useEffect, useState } from "react";
import { FiUser } from "react-icons/fi";
import { useLocation, useNavigate, Link } from "react-router-dom";

export default function ProfileSidebar({ isOpen, setIsOpen }) {
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState("");

  const hiddenRoutes = ["/", "/signup", "/login"];

  useEffect(() => {
    const role = sessionStorage.getItem("role") || "";
    setUserRole(role);
    setLoading(false);
  }, []);

  useEffect(() => {
    const updateRole = () => {
      const role = sessionStorage.getItem("role") || "";
      setUserRole(role);
    };
    
    window.addEventListener('userChanged', updateRole);
    return () => window.removeEventListener('userChanged', updateRole);
  }, []);

  useEffect(() => {
    if (isOpen) {
      sessionStorage.setItem("sidebarOpen", "true");
      window.dispatchEvent(new Event('sidebarOpened'));
    } else {
      sessionStorage.removeItem("sidebarOpen");
      window.dispatchEvent(new Event('sidebarClosed'));
    }
  }, [isOpen]);

  const handleLogout = () => {
    setIsOpen(false);
    sessionStorage.removeItem("sidebarOpen");
    window.dispatchEvent(new Event('sidebarClosed'));
    
    // Clear storage as per request
    localStorage.removeItem("token");
    sessionStorage.clear();
    
    // Reset history stack and reload
    navigate("/", { replace: true });
    window.location.reload(); // Ensure clean state
  };

  const handleNavigation = (path) => {
    setIsOpen(false);
    sessionStorage.removeItem("sidebarOpen");
    window.dispatchEvent(new Event('sidebarClosed'));
    navigate(path); // Remove replace:true to allow back navigation
  };

  if (loading || hiddenRoutes.includes(location.pathname)) return null;

  return (
    <>
      {/* --- Profile Icon Button --- */}
      <div className="fixed top-4 right-4 z-[60]">
        <button
          onClick={() => {
            setIsOpen(true);
            sessionStorage.setItem("sidebarOpen", "true");
            window.dispatchEvent(new Event('sidebarOpened'));
          }}
          className="text-neutral-700 h-10 w-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-neutral-200"
        >
          <FiUser className="h-5 w-5" />
        </button>
      </div>

      {/* --- Overlay --- */}
      <div
        className={`fixed inset-0 bg-black z-50 transition-opacity duration-300 ${isOpen ? 'opacity-40' : 'opacity-0 pointer-events-none'}`}
        onClick={() => {
          setIsOpen(false);
          sessionStorage.removeItem("sidebarOpen");
          window.dispatchEvent(new Event('sidebarClosed'));
        }}
      ></div>

      {/* --- Sidebar Content --- */}
      <div className={`fixed right-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col p-6 z-[70] transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-neutral-800">Menu</h2>
            <button onClick={() => {
              setIsOpen(false);
              sessionStorage.removeItem("sidebarOpen");
              window.dispatchEvent(new Event('sidebarClosed'));
            }} className="text-2xl text-neutral-500 hover:text-neutral-800">
              ✕
            </button>
          </div>
          
          <nav className="space-y-2">
            {[
              { path: '/settings', label: '⚙️ Profile Settings' },
              { path: '/subscription', label: '💰 Subscription' },
              { path: userRole === 'owner' ? '/referral' : '/customer-referral', label: '📊 Referral' },
              { path: '/terms', label: '📃 Terms & Conditions' }
            ].map(item => (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className="w-full text-left text-lg text-neutral-700 hover:text-primary hover:bg-neutral-100 p-3 rounded-lg transition-colors"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-6 border-t pt-6">
          <button
            onClick={handleLogout}
            className="w-full bg-neutral-100 text-danger font-bold py-3 rounded-lg hover:bg-red-50"
          >
            Logout
          </button>
        </div>
      </div>
    </>
  );
}