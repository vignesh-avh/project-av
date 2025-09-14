import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

export const generateReferralCode = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const db = getFirestore();
  
  let code;
  let isUnique = false;
  let attempts = 0;
  
  while (!isUnique && attempts < 20) {
    // Generate 6-character code
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code is unique
    const q = query(collection(db, "users"), where("referralCode", "==", code));
    const querySnapshot = await getDocs(q);
    isUnique = querySnapshot.empty;
    attempts++;
  }
  
  if (!isUnique) {
    return `CUST${Date.now().toString(36).slice(-6).toUpperCase()}`;
  }
  
  return code;
};
