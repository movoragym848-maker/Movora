import { useState, useEffect } from "react";
import { getGymMembers, sendMemberReminder, renewGymMember, addGymMember } from "../../services/api";
import { MEMBERSHIP_PLANS } from "../../constants/membership";


const MEMBERSHIP_FEE = 1000; // Rs per month

const C = {
  bg: "#F3F4F6",
  card: "#FFFFFF",
  border: "#E5E7EB",
  primary: "#3B82F6",
  dark: "#1F2937",
  muted: "#9CA3AF",
  surface: "#F9FAFB",
  success: "#10B981",
  warning: "#F59E0B",
  red: "#EF4444",
};

// ========== DEMO DATA GENERATION ==========
const generateDemoMembers = () => {
  const firstNames = [
    "Raj", "Priya", "Amit", "Neha", "Vikram", "Pooja", "Arjun", "Divya", "Sanjay", "Anjali",
    "Rohan", "Kavya", "Nikhil", "Shreya", "Arun", "Ananya", "Rahul", "Diya", "Sameer", "Riya",
    "Karan", "Zara", "Aryan", "Isha", "Vivek", "Meera", "Abhishek", "Nisha", "Sachin", "Reema",
    "Varun", "Sakshi", "Deepak", "Pallavi", "Ashish", "Richa", "Manish", "Sonia", "Harish", "Tina",
    "Naveen", "Priya", "Mohan", "Swati", "Prakash", "Neeta", "Suresh", "Aarya", "Dinesh", "Kavya",
    "Rajesh", "Shruti", "Mahesh", "Aisha", "Ganesh", "Jaya", "Pranav", "Akanksha", "Prem", "Seema",
    "Hemant", "Chitra", "Jitendra", "Anushka", "Kailash", "Vandana", "Manoj", "Simran", "Nitin", "Sonika"
  ];

  const lastNames = [
    "Sharma", "Singh", "Patel", "Kumar", "Verma", "Gupta", "Mishra", "Iyer", "Reddy", "Khan",
    "Yadav", "Bhat", "Joshi", "Rao", "Nair", "Datta", "Sinha", "Sharma", "Chopra", "Malhotra",
    "Bansal", "Saxena", "Trivedi", "Kapoor", "Khanna", "Arora", "Bhatnagar", "Jain", "Desai", "Menon"
  ];

  const plans = ["1-Month", "3-Month", "6-Month", "12-Month"];
  const members = [];

  // Helper function to generate valid Indian phone number (10 digits, starting with 6-9)
  const generateValidPhone = () => {
    const firstDigit = Math.floor(Math.random() * 4) + 6; // 6-9
    const remainingDigits = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    return `${firstDigit}${remainingDigits}`;
  };

  const today = new Date();

  for (let i = 0; i < 128; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const name = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@gmail.com`;
    const phone = generateValidPhone();

    let startDate, expiryDate, status, membershipType;

    if (i < 119) {
      // Active members (119) - expiring in future
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - (Math.floor(Math.random() * 45) + 1));

      expiryDate = new Date(startDate);
      
      // 15% of members expire within 1-7 days (for testing "expiring soon" section)
      if (Math.random() < 0.15) {
        const daysUntilExpiry = Math.floor(Math.random() * 7) + 1; // 1-7 days
        expiryDate = new Date(today);
        expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);
      } else {
        // 85% expire in 3-12 months
        const planMonths = Math.floor(Math.random() * 10) + 3; // 3-12 months
        expiryDate.setMonth(expiryDate.getMonth() + planMonths);
      }

      status = "active";
      membershipType = "active";
    } else if (i < 125) {
      // Expired members (6) - expired in past
      // Start 6-10 months ago, with 1-3 month plans = guaranteed past expiry
      startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - (Math.floor(Math.random() * 5) + 6));

      expiryDate = new Date(startDate);
      const planMonths = Math.floor(Math.random() * 3) + 1; // 1-3 months
      expiryDate.setMonth(expiryDate.getMonth() + planMonths);

      status = "expired";
      membershipType = "expired";
    } else {
      // No membership (3) - no expiry date
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 30) - 5);
      expiryDate = null;
      status = "pending";
      membershipType = "no_membership";
    }

    const plan = plans[Math.floor(Math.random() * plans.length)];
    const daysRemaining = expiryDate ? Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)) : 0;

    members.push({
      user_id: `demo_user_${i}`,
      name,
      email,
      phone,
      plan: membershipType === "no_membership" ? "-" : plan,
      start_date: startDate.toISOString().split('T')[0],
      expiry_date: expiryDate ? expiryDate.toISOString().split('T')[0] : null,
      status,
      membership_type: membershipType,
      days_remaining: daysRemaining
    });
  }

  return members;
};

// Generate earnings data
const generateDemoEarnings = () => {
  const earnings = [];
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // Target amounts (exact)
  const thisMonthTarget = 72000;
  const lastMonthTarget = 68000;
  const thisYearTarget = 891600;

  // Calculate remaining for other 10 months
  // 72000 + 68000 + X = 891600
  // X = 751600
  const otherMonthsTotal = thisYearTarget - thisMonthTarget - lastMonthTarget; // 751600
  const avgPerOtherMonth = Math.floor(otherMonthsTotal / 10); // ~75160 per month

  for (let month = 0; month < 12; month++) {
    let targetForMonth;
    
    if (month === currentMonth) {
      targetForMonth = thisMonthTarget;
    } else if (month === (currentMonth === 0 ? 11 : currentMonth - 1)) {
      targetForMonth = lastMonthTarget;
    } else {
      // Distribute evenly across other 10 months with minimal variance
      targetForMonth = avgPerOtherMonth + (Math.random() * 2000 - 1000);
    }

    // Create 20-30 realistic transactions per month
    const transactionCount = 24; // Fixed for consistency
    let distributableAmount = Math.floor(targetForMonth);
    
    for (let j = 0; j < transactionCount; j++) {
      const day = Math.floor(Math.random() * 28) + 1;
      const isLastTransaction = j === transactionCount - 1;
      
      let amount;
      if (isLastTransaction) {
        // Last transaction gets remainder to hit exact target
        amount = distributableAmount;
      } else {
        const basePerTransaction = Math.floor(targetForMonth / transactionCount);
        amount = basePerTransaction + Math.floor(Math.random() * 800 - 400);
        distributableAmount -= amount;
      }

      const date = new Date(currentYear, month, day);

      earnings.push({
        id: `demo_earning_${month}_${j}`,
        memberId: `demo_user_${Math.floor(Math.random() * 128)}`,
        memberName: `Member ${j}`,
        planId: "monthly",
        planLabel: ["1-Month", "3-Month", "6-Month", "12-Month"][Math.floor(Math.random() * 4)],
        months: Math.floor(Math.random() * 3) + 1,
        amount,
        date: date.toISOString()
      });
    }
  }

  return earnings;
};

export default function GymOwnerDashboard({ gymOwner, onLogout }) {
  const [activeTab, setActiveTab] = useState("admin"); // "admin", "members", or "profile"
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState(null);
  const [reminderMessage, setReminderMessage] = useState("");
  const [reminderError, setReminderError] = useState(null);
  const [earnings, setEarnings] = useState(() => {
    const stored = localStorage.getItem(`gym_earnings_${gymOwner?.gym_id}`);
    if (stored) {
      return JSON.parse(stored);
    }
    // Generate demo earnings on first load
    return generateDemoEarnings();
  });
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewingMember, setRenewingMember] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("monthly");
  const [showAddMembershipModal, setShowAddMembershipModal] = useState(false);
  const [addingMembershipMember, setAddingMembershipMember] = useState(null);
  const [selectedAddPlan, setSelectedAddPlan] = useState("monthly");
  const [toastNotification, setToastNotification] = useState(null);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberForm, setNewMemberForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: ""
  });
  const [addingMemberError, setAddingMemberError] = useState("");
  const [submittingNewMember, setSubmittingNewMember] = useState(false);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDetailMember, setSelectedDetailMember] = useState(null);


  const fetchMembersList = async () => {
    setLoading(true);
    setError("");
    try {
      const membersData = await getGymMembers();
      // If no real members, use demo data
      if (!membersData || membersData.length === 0) {
        const demoMembers = generateDemoMembers();
        setMembers(demoMembers);
      } else {
        setMembers(membersData);
      }
    } catch (err) {
      console.error("Failed to load members", err);
      // Use demo data on error
      const demoMembers = generateDemoMembers();
      setMembers(demoMembers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembersList();

    // Save demo earnings to localStorage if not already there
    const stored = localStorage.getItem(`gym_earnings_${gymOwner?.gym_id}`);
    if (!stored) {
      const demoEarnings = generateDemoEarnings();
      localStorage.setItem(`gym_earnings_${gymOwner?.gym_id}`, JSON.stringify(demoEarnings));
      setEarnings(demoEarnings);
    }
  }, []);


  // Filter members by query
  const filteredMembers = members.filter(m => 
    m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.plan?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute stats dynamically
  const totalMembers = members.length;
  
  // Categorize members
  const today = new Date();
  const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const activeMembers = members.filter(m => {
    if (!m.expiry_date) return false;
    const expiryDate = new Date(m.expiry_date);
    return expiryDate > today;
  }).length;
  
  const expiredMembers = members.filter(m => {
    if (!m.expiry_date) return false;
    const expiryDate = new Date(m.expiry_date);
    return expiryDate <= today;
  }).length;
  
  const noMembershipMembers = members.filter(m => !m.expiry_date || m.status === "pending").length;
  
  const expiredMembersNeedRenewal = members.filter(m => {
    if (!m.expiry_date) return false;
    const expiryDate = new Date(m.expiry_date);
    return expiryDate <= today;
  });
  
  const membersExpiringSoon = members.filter(m => {
    if (!m.expiry_date) return false;
    const expiryDate = new Date(m.expiry_date);
    const daysRemaining = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    return daysRemaining > 0 && daysRemaining <= 7;
  }).map(m => ({
    ...m,
    days_remaining: Math.ceil((new Date(m.expiry_date) - today) / (1000 * 60 * 60 * 24))
  }));
  
  const noMembershipList = members.filter(m => !m.expiry_date || m.status === "pending");
  
  // Calculate earnings
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const thisMonthEarnings = earnings
    .filter(e => {
      const eDate = new Date(e.date);
      return eDate.getMonth() === currentMonth && eDate.getFullYear() === currentYear;
    })
    .reduce((sum, e) => sum + e.amount, 0);
  
  const lastMonthDate = new Date(currentYear, currentMonth - 1);
  const lastMonthEarnings = earnings
    .filter(e => {
      const eDate = new Date(e.date);
      return eDate.getMonth() === lastMonthDate.getMonth() && eDate.getFullYear() === lastMonthDate.getFullYear();
    })
    .reduce((sum, e) => sum + e.amount, 0);
  
  const thisYearEarnings = earnings
    .filter(e => {
      const eDate = new Date(e.date);
      return eDate.getFullYear() === currentYear;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  // Handle membership renewal
  const handleRenewMembership = async () => {
    if (!renewingMember || !selectedPlan) return;

    const plan = MEMBERSHIP_PLANS.find(p => p.id === selectedPlan);
    if (!plan) return;

    const amount = MEMBERSHIP_FEE * plan.months;

    try {
      const res = await renewGymMember({
        userId: renewingMember.user_id,
        planId: selectedPlan,
        planLabel: plan.label,
        months: plan.months,
        amount: amount
      });

      if (res.ok) {
        const today = new Date();
        const newExpiryDate = new Date(today);
        newExpiryDate.setMonth(newExpiryDate.getMonth() + plan.months);

        // Update member start and expiry dates
        const updatedMembers = members.map(m => {
          if (m.user_id === renewingMember.user_id) {
            const newExpiry = newExpiryDate.toISOString().split('T')[0];
            const daysLeft = Math.ceil((newExpiryDate - today) / (1000 * 60 * 60 * 24));
            return {
              ...m,
              start_date: today.toISOString().split('T')[0],
              expiry_date: newExpiry,
              plan: plan.label,
              membership_type: "active",
              status: "active",
              days_remaining: daysLeft
            };
          }
          return m;
        });
        setMembers(updatedMembers);

        // Add earning record
        const newEarning = {
          id: Date.now(),
          memberId: renewingMember.user_id,
          memberName: renewingMember.name,
          planId: selectedPlan,
          planLabel: plan.label,
          months: plan.months,
          amount: amount,
          date: new Date().toISOString()
        };
        
        const updatedEarnings = [...earnings, newEarning];
        setEarnings(updatedEarnings);
        localStorage.setItem(`gym_earnings_${gymOwner?.gym_id}`, JSON.stringify(updatedEarnings));

        const startDate = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const endDate = newExpiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        setReminderMessage(`✅ Membership renewed! Start: ${startDate} | End: ${endDate} | Added ₹${amount}`);
        setTimeout(() => setReminderMessage(""), 3000);
      }
    } catch (err) {
      console.error("Failed to renew membership", err);
      alert(err.message || "Failed to renew membership.");
    } finally {
      setShowRenewModal(false);
      setRenewingMember(null);
      setSelectedPlan("monthly");
    }
  };

  // Add membership to member without membership
  const handleAddMembership = async () => {
    if (!addingMembershipMember) return;
    
    try {
      const plan = MEMBERSHIP_PLANS.find(p => p.id === selectedAddPlan);
      if (!plan) {
        alert("Invalid plan selected");
        return;
      }
      
      const amount = MEMBERSHIP_FEE * plan.months;

      try {
        const res = await renewGymMember({
          userId: addingMembershipMember.user_id,
          planId: selectedAddPlan,
          planLabel: plan.label,
          months: plan.months,
          amount: amount
        });

        if (res.ok) {
          const today = new Date();
          const newExpiryDate = new Date(today);
          newExpiryDate.setMonth(newExpiryDate.getMonth() + plan.months);

          // Update member start and expiry dates
          const updatedMembers = members.map(m => {
            if (m.user_id === addingMembershipMember.user_id) {
              const newExpiry = newExpiryDate.toISOString().split('T')[0];
              const daysLeft = Math.ceil((newExpiryDate - today) / (1000 * 60 * 60 * 24));
              return {
                ...m,
                start_date: today.toISOString().split('T')[0],
                expiry_date: newExpiry,
                plan: plan.label,
                membership_type: "active",
                status: "active",
                days_remaining: daysLeft
              };
            }
            return m;
          });
          setMembers(updatedMembers);

          // Add earning record
          const newEarning = {
            id: Date.now(),
            memberId: addingMembershipMember.user_id,
            memberName: addingMembershipMember.name,
            planId: selectedAddPlan,
            planLabel: plan.label,
            months: plan.months,
            amount: amount,
            date: new Date().toISOString()
          };
          
          const updatedEarnings = [...earnings, newEarning];
          setEarnings(updatedEarnings);
          localStorage.setItem(`gym_earnings_${gymOwner?.gym_id}`, JSON.stringify(updatedEarnings));

          const startDate = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          const endDate = newExpiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          
          // Show success toast
          setToastNotification({
            type: 'success',
            title: '✅ Membership Added!',
            message: `${addingMembershipMember.name} now has ${plan.label} plan. Start: ${startDate} | End: ${endDate} | Added ₹${amount}`,
          });
          setTimeout(() => setToastNotification(null), 4000);
        }
      } catch (apiErr) {
        console.error("API Error:", apiErr);
        throw apiErr;
      }
    } catch (err) {
      console.error("Failed to add membership", err);
      setToastNotification({
        type: 'error',
        title: '❌ Failed to Add Membership',
        message: err.message || "Unable to add membership. Please try again.",
      });
      setTimeout(() => setToastNotification(null), 4000);
    } finally {
      setShowAddMembershipModal(false);
      setAddingMembershipMember(null);
      setSelectedAddPlan("monthly");
    }
  };

  // Send reminder to member
  // Validate Indian phone number
  const isValidPhoneNumber = (phone) => {
    if (!phone) return false;
    // Remove all non-digit characters
    const cleanPhone = phone.replace(/\D/g, '');
    // Indian phone numbers: 10 digits starting with 6-9
    return /^[6-9]\d{9}$/.test(cleanPhone);
  };

  const handleSendReminder = async (member, memberType = null) => {
    // Validate phone number first
    if (!member.phone || !isValidPhoneNumber(member.phone)) {
      setToastNotification({
        type: 'error',
        title: '📱 Invalid Phone Number',
        message: `Invalid phone number for ${member.name}. Cannot send reminder.`,
      });
      setTimeout(() => setToastNotification(null), 4000);
      return;
    }

    setSendingReminderId(member.user_id);
    setReminderMessage("");
    setReminderError(null);
    try {
      await sendMemberReminder({
        userId: member.user_id,
        memberName: member.name,
        gymName: gymOwner.gymName
      });
      setToastNotification({
        type: 'success',
        title: '✅ Message Sent Successfully!',
        message: `WhatsApp reminder sent to ${member.name}!`,
      });
      setTimeout(() => setToastNotification(null), 3000);
    } catch (err) {
      // Parse error response for specific error codes
      const errorData = err.data || {};
      const errorCode = errorData.errorCode;
      let errorMsg = "Invalid number";
      let errorType = "invalid_phone";

      if (errorCode === "PHONE_MISSING" || errorCode === "INVALID_PHONE_FORMAT") {
        errorMsg = `Invalid number for ${member.name}`;
        errorType = "invalid_phone";
      } else if (errorCode === "WHATSAPP_SERVICE_FAILED") {
        errorMsg = `Invalid number for ${member.name}`;
        errorType = "invalid_phone";
      } else if (err.message.includes("network") || err.message.includes("timeout")) {
        errorMsg = "Network error - please try again";
        errorType = "service_error";
      }

      setToastNotification({
        type: 'error',
        title: errorType === "invalid_phone" ? '📱 Invalid Phone Number' : '❌ Failed to Send Message',
        message: errorMsg,
      });
      setTimeout(() => setToastNotification(null), 4000);

      setReminderError({
        type: errorType,
        memberName: member.name,
        message: errorMsg,
        section: memberType // "no_membership" or "expired"
      });
      setTimeout(() => setReminderError(null), 4000);
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleSubmitAddMember = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setAddingMemberError("");

    const { firstName, lastName, email, phone } = newMemberForm;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setAddingMemberError("All fields are required.");
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setAddingMemberError("Invalid Indian phone number. Must be 10 digits starting with 6-9.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setAddingMemberError("Invalid email address format.");
      return;
    }

    setSubmittingNewMember(true);
    try {
      await addGymMember({
        firstName,
        lastName,
        email,
        phone: cleanPhone
      });

      setToastNotification({
        type: 'success',
        title: '✅ Member Added Successfully!',
        message: `${firstName} ${lastName} has been registered.`
      });
      setTimeout(() => setToastNotification(null), 3000);

      setShowAddMemberModal(false);
      setNewMemberForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: ""
      });

      await fetchMembersList();
    } catch (err) {
      console.error(err);
      if (err.status === 409) {
        setAddingMemberError("Member already exists. Email or Phone number is already registered.");
      } else if (err.status === 404) {
        setAddingMemberError("API endpoint not found (404). Please ensure you are running your local backend server and that VITE_API_URL in frontend/.env is pointing to it.");
      } else {
        setAddingMemberError(err.message || "Failed to add member. Email or Phone might already exist.");
      }
    } finally {
      setSubmittingNewMember(false);
    }
  };




  const formatDate = dateStr => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Barlow',sans-serif", paddingBottom:100, display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap');
        *{box-sizing:border-box}
        
        /* ─────── BASE STYLES ─────── */
        .member-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          table-layout: fixed;
        }
        .member-table th {
          padding: 8px 6px;
          color: #9CA3AF;
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 13px;
          border-bottom: 2px solid #F3F4F6;
        }
        .member-table td {
          padding: 11px 6px;
          color: #1F2937;
          font-size: 14px;
          font-weight: 500;
          border-bottom: 1px solid #F3F4F6;
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge.active {
          background: #DCFCE7;
          color: #166534;
        }
        .badge.expired {
          background: #FEE2E2;
          color: #991B1B;
        }
        .badge.cancelled {
          background: #F3F4F6;
          color: #374151;
        }
        .badge.inactive {
          background: #FEF3C7;
          color: #92400E;
        }
        .month-card {
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .month-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59,130,246,0.08);
          border-color: #3B82F6 !important;
        }
        
        /* ─────── RESPONSIVE CLASSES ─────── */
        .gym-header {
          display: flex !important;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          padding: 18px 16px 16px;
        }
        .gym-content-wrapper {
          width: 100%;
          max-width: 680px;
          margin: 0 auto;
          flex: 1;
          overflow-y: auto;
        }
        .gym-metrics-grid {
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          margin-bottom: 20px;
        }
        .gym-earnings-grid {
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
        }
        .gym-members-card {
          background: #fff;
          border: 1px solid #E5E7EB;
          border-radius: 14px;
          padding: 16px 18px;
        }
        .gym-search-container {
          display: flex !important;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        .gym-search-input {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1.5px solid #E5E7EB;
          background: #F9FAFB;
          color: #1F2937;
          outline: none;
          font-size: 13px;
          font-family: 'Barlow', sans-serif;
          width: 100%;
          max-width: 200px;
        }
        .gym-bottom-nav {
          position: fixed !important;
          bottom: 0;
          left: 0;
          right: 0;
          background: #fff;
          z-index: 100;
          display: flex !important;
          padding: 8px 0 calc(max(6px, env(safe-area-inset-bottom)));
          border-top: 1px solid #E5E7EB;
          box-shadow: 0 -2px 8px rgba(0,0,0,0.04);
          width: 100%;
          max-width: 100%;
          pointer-events: auto;
        }
        .gym-bottom-nav button {
          pointer-events: auto !important;
        }
        .clickable-name-cell {
          transition: color 0.15s ease, background-color 0.15s ease;
        }
        .clickable-name-cell:hover {
          color: #3B82F6 !important;
          text-decoration: underline;
          background-color: rgba(59, 130, 246, 0.05) !important;
        }
        
        /* ─────── MOBILE RESPONSIVE (max-width: 640px) ─────── */
        @media (max-width: 640px) {
          * { margin: 0; padding: 0; }
          body { font-size: 14px; }
          
          .gym-header {
            padding: 14px 12px 12px !important;
            gap: 8px !important;
          }
          .gym-content-wrapper {
            padding: 16px 12px !important;
            margin: 0 auto !important;
          }
          
          h1 { font-size: 20px !important; }
          h2 { font-size: 16px !important; }
          h3 { font-size: 14px !important; }
          p { font-size: 13px !important; }
          
          .gym-metrics-grid, .gym-earnings-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
            margin-bottom: 18px !important;
          }
          
          button {
            font-size: 12px !important;
            padding: 8px 10px !important;
            min-height: 40px;
            min-width: 100%;
          }
          
          .gym-bottom-nav button {
            min-width: auto !important;
            width: auto !important;
            flex: 1;
            min-height: 60px;
            padding: 8px 0 4px !important;
          }
          
          input, textarea, select {
            font-size: 14px !important;
            padding: 10px !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          
          .gym-search-input {
            max-width: 100% !important;
          }
          
          .member-table {
            font-size: 10px !important;
            table-layout: auto;
            width: 100%;
          }
          .member-table th {
            font-size: 9px !important;
            padding: 5px 2px !important;
            font-weight: 700;
          }
          .member-table td {
            padding: 6px 3px !important;
            font-size: 10px !important;
            word-break: break-word;
          }
          .member-table td:nth-child(3),
          .member-table td:nth-child(4) {
            font-size: 9px !important;
            padding: 5px 2px !important;
          }
          .member-table td:last-child {
            padding: 4px 2px !important;
            min-width: 70px;
          }
          .member-table td:last-child button {
            padding: 4px 6px !important;
            font-size: 9px !important;
            width: 100%;
            white-space: nowrap;
          }
          .member-table th:nth-child(3),
          .member-table th:nth-child(4) {
            font-size: 8px !important;
            padding: 4px 1px !important;
          }
          .member-table .badge {
            font-size: 9px !important;
            padding: 2px 5px !important;
          }
          
          .gym-members-card {
            border-radius: 8px !important;
            padding: 14px !important;
            margin-bottom: 14px !important;
          }
          
          .gym-bottom-nav {
            padding: 8px 0 calc(max(6px, env(safe-area-inset-bottom))) !important;
            height: auto;
          }
          .gym-bottom-nav button i {
            font-size: 22px !important;
          }
          .gym-bottom-nav button span {
            font-size: 10px !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          
          /* Modal/Dialog adjustments */
          .gym-bottom-nav + div, [style*="position:fixed"] {
            width: 90vw !important;
            max-width: 90vw !important;
            max-height: 90vh !important;
            overflow-y: auto !important;
          }
        }
        
        /* ─────── TABLET (641px to 1024px) ─────── */
        @media (min-width: 641px) and (max-width: 1024px) {
          h1 { font-size: 22px !important; }
          h2 { font-size: 18px !important; }
          .gym-metrics-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .gym-earnings-grid {
            grid-template-columns: repeat(3, 1fr) !important;
          }
          .gym-content-wrapper {
            max-width: 95% !important;
          }
          .member-table td, .member-table th {
            font-size: 12px !important;
            padding: 9px 5px !important;
          }
        }
        
        /* ─────── DESKTOP (min-width: 1025px) ─────── */
        @media (min-width: 1025px) {
          .gym-metrics-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
          .gym-earnings-grid {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
        
        /* ─────── EXTRA SMALL (max-width: 360px) ─────── */
        @media (max-width: 360px) {
          h1 { font-size: 18px !important; }
          h2 { font-size: 14px !important; }
          p { font-size: 12px !important; }
          button { font-size: 11px !important; }
          .member-table th, .member-table td {
            padding: 5px 2px !important;
            font-size: 9px !important;
          }
          .member-table th {
            font-size: 8px !important;
            padding: 4px 1px !important;
          }
          .member-table td:last-child button {
            padding: 3px 6px !important;
            font-size: 8px !important;
          }
          .gym-bottom-nav button span {
            font-size: 8px !important;
          }
        }
      `}</style>
      
      {/* Header */}
      <div className="gym-header" style={{ background:C.card, borderBottom:`1px solid ${C.border}`,
        position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 12px rgba(59,130,246,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
          <div style={{ width:32, height:32, background:C.primary, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <rect x="2" y="10" width="4" height="4" rx="1" fill="#fff"/>
              <rect x="18" y="10" width="4" height="4" rx="1" fill="#fff"/>
              <rect x="5" y="8" width="2" height="8" rx="1" fill="#fff"/>
              <rect x="17" y="8" width="2" height="8" rx="1" fill="#fff"/>
              <rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:"clamp(18px, 5vw, 20px)", fontWeight:800, color:C.dark, letterSpacing:1.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>MOVORA</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="gym-content-wrapper" style={{ padding:"clamp(12px, 3vw, 20px)" }}>

        {/* ── MEMBERS TAB ── */}
        {activeTab === "members" && (
          <>
            <div style={{ marginBottom:20 }}>
              <h1 style={{ color:C.dark, margin:"0 0 4px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:"clamp(22px, 6vw, 26px)", fontWeight:800 }}>
                Gym Members
              </h1>
              <p style={{ color:C.muted, margin:0, fontSize:14 }}>
                Search and view details of all members registered under <strong>{gymOwner.gymName}</strong>.
              </p>
            </div>

            <div className="gym-members-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, width: "100%" }}>
                <span style={{ color: C.dark, fontWeight: 700, fontSize: 15 }}>Members List ({filteredMembers.length})</span>
                <button 
                  onClick={() => setShowAddMemberModal(true)}
                  style={{
                    padding: "8px 14px",
                    background: C.primary,
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    minWidth: "auto",
                    width: "auto",
                    height: "auto",
                    minHeight: "auto",
                    whiteSpace: "nowrap"
                  }}
                  onMouseEnter={e => e.target.style.opacity = 0.9}
                  onMouseLeave={e => e.target.style.opacity = 1}
                >
                  Add Member
                </button>
              </div>
              
              <div className="gym-search-container" style={{ marginBottom: 16 }}>
                <input 
                  type="text" 
                  placeholder="Search name or plan..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="gym-search-input"
                  style={{ width: "100%", maxWidth: "100%" }}
                />
              </div>


              {loading ? (
                <div style={{ padding:"40px 0", textAlign:"center", color:C.muted, fontWeight:600 }}>Loading members...</div>
              ) : error ? (
                <div style={{ color:C.red, padding:"12px", background:"#FEE2E2", borderRadius:8, fontWeight:600 }}>{error}</div>
              ) : filteredMembers.length === 0 ? (
                <div style={{ padding:"40px 0", textAlign:"center", color:C.muted, fontWeight:600 }}>
                  {searchQuery ? "No matching members found." : "No members registered yet."}
                </div>
              ) : (
                <div style={{ overflowX: "auto", marginLeft: "-18px", marginRight: "-18px", paddingLeft: "18px", paddingRight: "18px" }}>
                  <table className="member-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Plan</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Days Left</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((member, idx) => {
                        const daysLeft = parseInt(member.days_remaining || 0);
                        const hasNoMembership = member.membership_type === "no_membership";
                        const isExpired = member.membership_type === "expired";
                        const isActive = member.membership_type === "active";
                        
                        return (
                          <tr key={idx} style={{ background: hasNoMembership ? "#FFFBEB" : isExpired ? "#FEF2F2" : "transparent" }}>
                            <td 
                              className="clickable-name-cell"
                              style={{ 
                                fontWeight: 700, 
                                cursor: "pointer"
                              }}
                              onClick={() => {
                                setSelectedDetailMember(member);
                                setShowDetailModal(true);
                              }}
                            >
                              {member.name}
                              {hasNoMembership && (
                                <span style={{ 
                                  marginLeft: 8, 
                                  padding: "2px 8px", 
                                  background: "#FCD34D", 
                                  color: "#92400E",
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase"
                                }}>
                                  ⚠ No Membership
                                </span>
                              )}
                            </td>
                            <td style={{ color: hasNoMembership ? "#F59E0B" : "inherit", fontWeight: hasNoMembership ? 700 : 500 }}>
                              {member.plan}
                            </td>
                            <td>{formatDate(member.start_date)}</td>
                            <td>{formatDate(member.expiry_date)}</td>
                            <td>
                              {hasNoMembership ? (
                                <span style={{ color: "#F59E0B", fontWeight: 700 }}>Pending</span>
                              ) : isExpired ? (
                                <span style={{ color: C.red, fontWeight: 700 }}>Expired</span>
                              ) : isActive && daysLeft <= 5 ? (
                                <span style={{ 
                                  color: C.warning, 
                                  fontWeight: 700 
                                }}>
                                  {daysLeft} days
                                </span>
                              ) : (
                                <span style={{ 
                                  color: C.success, 
                                  fontWeight: 700 
                                }}>
                                  {daysLeft} days
                                </span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${hasNoMembership ? "inactive" : isExpired ? "expired" : member.status}`}>
                                {hasNoMembership ? "pending" : isExpired ? "expired" : member.status}
                              </span>
                            </td>
                            <td>
                              {isExpired ? (
                                <button
                                  onClick={() => {
                                    setRenewingMember(member);
                                    setSelectedPlan("monthly");
                                    setShowRenewModal(true);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    background: C.success,
                                    color: "white",
                                    border: "none",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                    transition: "all 0.2s",
                                    minWidth: "auto",
                                    width: "auto"
                                  }}
                                >
                                  🔄 Renew
                                </button>
                              ) : hasNoMembership ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    onClick={() => handleSendReminder(member, "members_table")}
                                    disabled={sendingReminderId === member.user_id}
                                    style={{
                                      padding: "5px 10px",
                                      background: sendingReminderId === member.user_id ? C.muted : C.warning,
                                      color: "white",
                                      border: "none",
                                      borderRadius: 6,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: sendingReminderId === member.user_id ? "not-allowed" : "pointer",
                                      whiteSpace: "nowrap",
                                      transition: "all 0.2s",
                                      opacity: sendingReminderId === member.user_id ? 0.6 : 1,
                                      minWidth: "auto",
                                      width: "auto"
                                    }}
                                  >
                                    {sendingReminderId === member.user_id ? "Sending..." : "📢 Remind"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAddingMembershipMember(member);
                                      setSelectedAddPlan("monthly");
                                      setShowAddMembershipModal(true);
                                    }}
                                    style={{
                                      padding: "5px 10px",
                                      background: C.success,
                                      color: "white",
                                      border: "none",
                                      borderRadius: 6,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      whiteSpace: "nowrap",
                                      transition: "all 0.2s",
                                      minWidth: "auto",
                                      width: "auto"
                                    }}
                                  >
                                    ➕ Add Plan
                                  </button>
                                </div>
                              ) : (
                                <span style={{ color: C.muted, fontSize: 12 }}>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ⚠️ ERROR ALERT FOR MEMBERS TABLE REMIND BUTTON */}
              {reminderError && reminderError.section === "members_table" && (
                <div style={{
                  marginTop:12,
                  background: reminderError.type === "invalid_phone" ? "#FEF3C7" : "#FEE2E2",
                  border: reminderError.type === "invalid_phone" ? "2px solid #F59E0B" : "2px solid #EF4444",
                  borderRadius:12,
                  padding:"14px 16px",
                  display:"flex",
                  alignItems:"center",
                  gap:12
                }}>
                  <div style={{ fontSize:24 }}>
                    {reminderError.type === "invalid_phone" ? "📱" : "❌"}
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{
                      margin:0,
                      color: reminderError.type === "invalid_phone" ? "#92400E" : "#991B1B",
                      fontSize:13,
                      fontWeight:600
                    }}>
                      {reminderError.message}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ADMIN TAB ── */}
        {activeTab === "admin" && (
          <>
            <div style={{ marginBottom:22 }}>
              <h1 style={{ color:C.dark, margin:"0 0 4px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:26, fontWeight:800 }}>
                Hey, Gym Owner 👋
              </h1>
              <p style={{ color:C.muted, margin:0, fontSize:14 }}>
                Here is your gym management summary for <strong>{gymOwner.gymName}</strong>.
              </p>
            </div>

            {/* Metrics Row */}
            <div className="gym-metrics-grid">
              {[
                { label:"Total Members", value:totalMembers, color:C.primary, desc:"registered" },
                { label:"Active Plans", value:activeMembers, color:C.success, desc:"active" },
                { label:"Expired", value:expiredMembers, color:C.red, desc:"need renewal" },
                { label:"No Membership", value:noMembershipMembers, color:C.warning, desc:"pending signup" },
              ].map(s => (
                <div key={s.label} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"13px 14px" }}>
                  <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:1, fontWeight:600, marginBottom:5 }}>{s.label}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:"'Barlow Condensed',sans-serif" }}>{s.value}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{s.desc}</div>
                </div>
              ))}
            </div>

            {/* � EARNINGS SECTION */}
            <div style={{ marginBottom:20 }}>
              <h2 style={{ color:C.dark, margin:"0 0 12px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:800 }}>
                💰 Earnings
              </h2>
              <div className="gym-earnings-grid">
                {[
                  { label:"This Month", value:`₹${thisMonthEarnings}`, color:C.primary },
                  { label:"Last Month", value:`₹${lastMonthEarnings}`, color:C.warning },
                  { label:"This Year", value:`₹${thisYearEarnings}`, color:C.success },
                ].map(s => (
                  <div key={s.label} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"13px 14px" }}>
                    <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:1, fontWeight:600, marginBottom:5 }}>{s.label}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:s.color, fontFamily:"'Barlow Condensed',sans-serif" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* �🔄 EXPIRED MEMBERSHIPS - RENEWAL SECTION */}
            {expiredMembers > 0 && (
              <div style={{ marginBottom:22, background:"linear-gradient(135deg,#FEE2E2,#FEC2C2)", border:"1.5px solid #FECACA", borderRadius:12, padding:"16px", overflow:"hidden" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <div style={{ fontSize:20 }}>🔄</div>
                  <h2 style={{ color:"#991B1B", margin:0, fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:800 }}>
                    {expiredMembers} Membership{expiredMembers !== 1 ? "s" : ""} Expired - Renew Now
                  </h2>
                </div>
                <p style={{ color:"#991B1B", fontSize:13, margin:"0 0 12px", fontWeight:500 }}>
                  These members' gym memberships have expired. Reach out to renew their plans.
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:"250px", overflowY:"auto" }}>
                  {expiredMembersNeedRenewal.slice(0, 5).map((member, idx) => (
                    <div key={idx} style={{
                      background:"rgba(255,255,255,0.7)",
                      border:"1px solid #FECACA",
                      borderRadius:8,
                      padding:"12px",
                      display:"flex",
                      flexDirection:"column",
                      gap:10
                    }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, color:"#1F2937", fontSize:13, marginBottom:4 }}>
                          {member.name}
                        </div>
                        <div style={{ fontSize:12, color:"#6B7280" }}>
                          Expired: {formatDate(member.expiry_date)} · {member.plan}
                        </div>
                      </div>
                      <button
                        onClick={() => handleSendReminder(member, "expired")}
                        disabled={sendingReminderId === member.user_id}
                        style={{
                          background: sendingReminderId === member.user_id ? C.muted : C.warning,
                          border:"none",
                          color:"white",
                          padding:"8px 14px",
                          borderRadius:6,
                          fontWeight:700,
                          fontSize:12,
                          cursor: sendingReminderId === member.user_id ? "not-allowed" : "pointer",
                          whiteSpace:"nowrap",
                          transition:"all 0.2s",
                          opacity: sendingReminderId === member.user_id ? 0.6 : 1,
                          width:"100%"
                        }}
                        title="Send renewal reminder"
                      >
                        {sendingReminderId === member.user_id ? "Sending..." : "📢 Remind"}
                      </button>
                    </div>
                  ))}
                  {expiredMembers > 5 && (
                    <div style={{ textAlign:"center", color:"#991B1B", fontSize:12, fontWeight:600, marginTop:4 }}>
                      +{expiredMembers - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ⚠️ ERROR ALERT FOR EXPIRED MEMBERS */}
            {reminderError && reminderError.section === "expired" && (
              <div style={{
                marginBottom:22,
                background: reminderError.type === "invalid_phone" ? "#FEF3C7" : "#FEE2E2",
                border: reminderError.type === "invalid_phone" ? "2px solid #F59E0B" : "2px solid #EF4444",
                borderRadius:12,
                padding:"14px 16px",
                display:"flex",
                alignItems:"center",
                gap:12
              }}>
                <div style={{ fontSize:24 }}>
                  {reminderError.type === "invalid_phone" ? "📱" : "❌"}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{
                    margin:0,
                    color: reminderError.type === "invalid_phone" ? "#92400E" : "#991B1B",
                    fontSize:13,
                    fontWeight:600
                  }}>
                    {reminderError.message}
                  </p>
                </div>
              </div>
            )}

            {/* ⏰ Members Expiring Soon */}
            <div style={{ marginBottom:22 }}>
              <h2 style={{ color:C.dark, margin:"0 0 12px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:800 }}>
                ⏰ Expiring Soon (Next 7 Days)
              </h2>
              {reminderMessage && (
                <div style={{
                  background: reminderMessage.includes("✅") ? "#DCFCE7" : "#FEE2E2",
                  color: reminderMessage.includes("✅") ? "#166534" : "#991B1B",
                  padding:"10px 12px",
                  borderRadius:8,
                  marginBottom:12,
                  fontSize:13,
                  fontWeight:600,
                  border:`1px solid ${reminderMessage.includes("✅") ? "#86EFAC" : "#FECACA"}`
                }}>
                  {reminderMessage}
                </div>
              )}
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px", overflow:"hidden" }}>
                {membersExpiringSoon.length === 0 ? (
                  <div style={{ textAlign:"center", color:C.muted, padding:"20px 0", fontSize:14 }}>
                    No members expiring in the next 7 days
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {membersExpiringSoon.map((member, idx) => (
                      <div key={idx} style={{
                        background:C.surface,
                        border:`1px solid ${C.border}`,
                        borderRadius:10,
                        padding:"12px",
                        display:"flex",
                        flexDirection:"column",
                        gap:12,
                        overflow:"hidden"
                      }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, color:C.dark, fontSize:14, marginBottom:3 }}>
                            {member.name}
                          </div>
                          <div style={{ fontSize:12, color:C.muted }}>
                            {member.plan} Plan
                          </div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10, width:"100%" }}>
                          <div style={{
                            background: member.days_remaining <= 2 ? "#FEE2E2" : "#FEF3C7",
                            color: member.days_remaining <= 2 ? "#991B1B" : "#92400E",
                            padding:"8px 12px",
                            borderRadius:8,
                            fontWeight:700,
                            fontSize:13,
                            flexShrink:0
                          }}>
                            {member.days_remaining} day{member.days_remaining !== "1" ? "s" : ""}
                          </div>
                          <button
                            onClick={() => handleSendReminder(member, "expiring_soon")}
                            disabled={sendingReminderId === member.user_id}
                            style={{
                              padding: "8px 14px",
                              background: sendingReminderId === member.user_id ? C.muted : C.warning,
                              color: "white",
                              border: "none",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: sendingReminderId === member.user_id ? "not-allowed" : "pointer",
                              flex: 1,
                              minWidth: 0,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              opacity: sendingReminderId === member.user_id ? 0.6 : 1,
                              transition: "all 0.2s"
                            }}
                          >
                            {sendingReminderId === member.user_id ? "Sending..." : "📢 Remind"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {reminderError && reminderError.section === "expiring_soon" && (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: reminderError.type === "invalid_phone" ? "#FEF3C7" : "#FEE2E2",
                  border: reminderError.type === "invalid_phone" ? "2px solid #F59E0B" : "2px solid #EF4444",
                  borderRadius: 8,
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start"
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {reminderError.type === "invalid_phone" ? "📱" : "❌"}
                  </span>
                  <div>
                    <p style={{
                      color: reminderError.type === "invalid_phone" ? "#92400E" : "#991B1B",
                      fontWeight: 700,
                      fontSize: 13,
                      margin: "0 0 2px"
                    }}>
                      {reminderError.memberName}
                    </p>
                    <p style={{
                      color: reminderError.type === "invalid_phone" ? "#92400E" : "#991B1B",
                      fontSize: 12,
                      margin: 0
                    }}>
                      {reminderError.message}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ❌ MEMBERS WITH NO MEMBERSHIP - URGENT SECTION */}
            {noMembershipMembers > 0 && (
              <div style={{ marginBottom:22, background:"linear-gradient(135deg,#FEF3C7,#FEE2E2)", border:"1.5px solid #FCD34D", borderRadius:12, padding:"16px", overflow:"hidden" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <div style={{ fontSize:20 }}>⚠️</div>
                  <h2 style={{ color:"#92400E", margin:0, fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:800 }}>
                    {noMembershipMembers} Member{noMembershipMembers !== 1 ? "s" : ""} - No Membership Yet
                  </h2>
                </div>
                <p style={{ color:"#92400E", fontSize:13, margin:"0 0 12px", fontWeight:500 }}>
                  These members created an account but haven't purchased any gym membership plan yet. Follow up with them to complete their membership.
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:"250px", overflowY:"auto" }}>
                  {noMembershipList.slice(0, 5).map((member, idx) => (
                    <div key={idx} style={{
                      background:"rgba(255,255,255,0.7)",
                      border:"1px solid #FCD34D",
                      borderRadius:8,
                      padding:"12px",
                      display:"flex",
                      flexDirection:"column",
                      gap:10
                    }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, color:"#1F2937", fontSize:13, marginBottom:4 }}>
                          {member.name}
                        </div>
                        <div style={{ fontSize:12, color:isValidPhoneNumber(member.phone) ? "#6B7280" : "#DC2626", fontWeight: isValidPhoneNumber(member.phone) ? 400 : 600 }}>
                          {isValidPhoneNumber(member.phone) ? (member.phone || "No phone") : `📵 Invalid: ${member.phone || "No phone"}`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleSendReminder(member, "no_membership")}
                        disabled={sendingReminderId === member.user_id}
                        style={{
                          background: sendingReminderId === member.user_id ? C.muted : "#F59E0B",
                          border:"none",
                          color:"white",
                          padding:"8px 14px",
                          borderRadius:6,
                          fontWeight:700,
                          fontSize:12,
                          cursor: sendingReminderId === member.user_id ? "not-allowed" : "pointer",
                          whiteSpace:"nowrap",
                          transition:"all 0.2s",
                          opacity: sendingReminderId === member.user_id ? 0.6 : 1,
                          width:"100%"
                        }}
                        title="Send reminder to join"
                      >
                        {sendingReminderId === member.user_id ? "Sending..." : "📢 Remind"}
                      </button>
                    </div>
                  ))}
                  {noMembershipMembers > 5 && (
                    <div style={{ textAlign:"center", color:"#92400E", fontSize:12, fontWeight:600, marginTop:4 }}>
                      +{noMembershipMembers - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ⚠️ ERROR ALERT FOR NO MEMBERSHIP SECTION */}
            {reminderError && reminderError.section === "no_membership" && (
              <div style={{
                marginBottom:22,
                background: reminderError.type === "invalid_phone" ? "#FEF3C7" : "#FEE2E2",
                border: reminderError.type === "invalid_phone" ? "2px solid #F59E0B" : "2px solid #EF4444",
                borderRadius:12,
                padding:"14px 16px",
                display:"flex",
                alignItems:"center",
                gap:12
              }}>
                <div style={{ fontSize:24 }}>
                  {reminderError.type === "invalid_phone" ? "📱" : "❌"}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{
                    margin:0,
                    color: reminderError.type === "invalid_phone" ? "#92400E" : "#991B1B",
                    fontSize:13,
                    fontWeight:600
                  }}>
                    {reminderError.message}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
          <>
            <div style={{ marginBottom:22 }}>
              <h1 style={{ color:C.dark, margin:"0 0 4px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:26, fontWeight:800 }}>
                Profile
              </h1>
              <p style={{ color:C.muted, margin:0, fontSize:14 }}>
                View and manage your account.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <button 
                onClick={() => setShowAccountModal(true)}
                style={{
                  padding: "12px 18px",
                  background: "transparent",
                  color: C.success,
                  border: `2px solid ${C.success}`,
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: 0.5
                }}
                onMouseEnter={e => { e.target.style.background = C.success; e.target.style.color = "white"; }}
                onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = C.success; }}
              >
                Account Details
              </button>

              <button 
                onClick={onLogout}
                style={{
                  padding: "12px 18px",
                  background: "transparent",
                  color: C.red,
                  border: `2px solid ${C.red}`,
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: 0.5
                }}
                onMouseEnter={e => { e.target.style.background = C.red; e.target.style.color = "white"; }}
                onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = C.red; }}
              >
                Sign Out
              </button>
            </div>

            {/* Account Modal */}
            {showAccountModal && (
              <div style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: "20px"
              }}>
                <div style={{
                  width: "100%",
                  maxWidth: 400,
                  background: C.card,
                  borderRadius: 12,
                  padding: "24px",
                  border: `1px solid ${C.border}`
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ color: C.dark, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>
                      Account Details
                    </h2>
                    <button
                      onClick={() => setShowAccountModal(false)}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: 24,
                        cursor: "pointer",
                        color: C.muted,
                        padding: 0,
                        width: 28,
                        height: 28
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    {[
                      { label: "Gym Name", value: gymOwner.gymName },
                      { label: "City", value: gymOwner.city },
                      { label: "Phone", value: gymOwner.phone },
                      { label: "Email", value: gymOwner.email },
                      { label: "Status", value: gymOwner.status, isStatus: true },
                    ].map(item => (
                      <div key={item.label}>
                        <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                          {item.label}
                        </div>
                        <div style={{ color: item.isStatus ? C.success : C.dark, fontWeight: 600, fontSize: 14, textTransform: item.isStatus ? "uppercase" : "none" }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setShowAccountModal(false)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      background: "transparent",
                      color: C.primary,
                      border: `1.5px solid ${C.primary}`,
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      marginTop: 20,
                      fontFamily: "'Barlow', sans-serif",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={e => { e.target.style.background = C.primary; e.target.style.color = "white"; }}
                    onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = C.primary; }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Renewal Modal */}
      {showRenewModal && renewingMember && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <div style={{
            width: "100%",
            maxWidth: 450,
            background: C.card,
            borderRadius: 14,
            padding: "24px",
            border: `1px solid ${C.border}`,
            maxHeight: "90vh",
            overflow: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ color: C.dark, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>
                Renew Membership
              </h2>
              <button
                onClick={() => setShowRenewModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 32,
                  cursor: "pointer",
                  color: C.danger,
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                  flexShrink: 0,
                  lineHeight: 1
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ color: C.dark, fontWeight: 600, marginBottom: 4 }}>
                Member: <strong>{renewingMember.name}</strong>
              </p>
              <p style={{ color: C.muted, fontSize: 13 }}>
                Current Plan: {renewingMember.plan}
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, color: C.dark, fontWeight: 600, fontSize: 13 }}>
                Select Membership Plan:
              </label>
              <select
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  background: C.surface,
                  color: C.dark,
                  fontFamily: "'Barlow', sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none"
                }}
              >
                {MEMBERSHIP_PLANS.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.label} - ₹{MEMBERSHIP_FEE * plan.months}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ 
              background: C.surface, 
              borderRadius: 8, 
              padding: 12, 
              marginBottom: 20,
              borderLeft: `4px solid ${C.primary}`
            }}>
              <p style={{ color: C.dark, fontWeight: 700, margin: "0 0 4px" }}>
                Amount to Add: ₹{MEMBERSHIP_FEE * MEMBERSHIP_PLANS.find(p => p.id === selectedPlan)?.months}
              </p>
              <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>
                Duration: {MEMBERSHIP_PLANS.find(p => p.id === selectedPlan)?.months} month(s)
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={handleRenewMembership}
                style={{
                  flex: "1 1 auto",
                  minWidth: "120px",
                  padding: "12px 16px",
                  background: C.success,
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'Barlow', sans-serif",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={e => e.target.style.opacity = "0.9"}
                onMouseLeave={e => e.target.style.opacity = "1"}
              >
                ✅ Renew Membership
              </button>
              <button
                onClick={() => setShowRenewModal(false)}
                style={{
                  flex: "1 1 auto",
                  minWidth: "100px",
                  padding: "12px 16px",
                  background: "transparent",
                  color: C.primary,
                  border: `1.5px solid ${C.primary}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'Barlow', sans-serif",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={e => { e.target.style.background = C.primary; e.target.style.color = "white"; }}
                onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = C.primary; }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Membership Modal */}
      {showAddMembershipModal && addingMembershipMember && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <div style={{
            width: "100%",
            maxWidth: 400,
            background: C.card,
            borderRadius: 12,
            padding: "24px",
            border: `1px solid ${C.border}`,
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ color: C.dark, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>
                Add Membership Plan
              </h2>
              <button
                onClick={() => {
                  setShowAddMembershipModal(false);
                  setAddingMembershipMember(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 32,
                  cursor: "pointer",
                  color: C.red,
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                  flexShrink: 0,
                  lineHeight: 1
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ color: C.dark, fontWeight: 600, marginBottom: 4 }}>
                Member: <strong>{addingMembershipMember.name}</strong>
              </p>
              <p style={{ color: C.muted, fontSize: 13 }}>
                This member currently has no active membership
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, color: C.dark, fontWeight: 600, fontSize: 13 }}>
                Select Membership Plan:
              </label>
              <select
                value={selectedAddPlan}
                onChange={(e) => setSelectedAddPlan(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  background: C.surface,
                  color: C.dark,
                  fontFamily: "'Barlow', sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none"
                }}
              >
                {MEMBERSHIP_PLANS.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.label} - ₹{MEMBERSHIP_FEE * plan.months}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ 
              background: C.surface, 
              borderRadius: 8, 
              padding: 12, 
              marginBottom: 20,
              borderLeft: `4px solid ${C.success}`
            }}>
              <p style={{ color: C.dark, fontWeight: 700, margin: "0 0 4px" }}>
                Amount to Add: ₹{MEMBERSHIP_FEE * MEMBERSHIP_PLANS.find(p => p.id === selectedAddPlan)?.months}
              </p>
              <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>
                Duration: {MEMBERSHIP_PLANS.find(p => p.id === selectedAddPlan)?.months} month(s)
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={handleAddMembership}
                style={{
                  flex: "1 1 auto",
                  minWidth: "120px",
                  padding: "12px 16px",
                  background: C.success,
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'Barlow', sans-serif",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={e => e.target.style.opacity = "0.9"}
                onMouseLeave={e => e.target.style.opacity = "1"}
              >
                ✅ Add Membership
              </button>
              <button
                onClick={() => {
                  setShowAddMembershipModal(false);
                  setAddingMembershipMember(null);
                  setSelectedAddPlan("monthly");
                }}
                style={{
                  flex: "1 1 auto",
                  minWidth: "100px",
                  padding: "12px 16px",
                  background: "transparent",
                  color: C.primary,
                  border: `1.5px solid ${C.primary}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'Barlow', sans-serif",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={e => { e.target.style.background = C.primary; e.target.style.color = "white"; }}
                onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = C.primary; }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <div style={{
            width: "100%",
            maxWidth: 450,
            background: C.card,
            borderRadius: 14,
            padding: "24px",
            border: `1px solid ${C.border}`,
            maxHeight: "90vh",
            overflow: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ color: C.dark, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>
                ➕ Add New Member
              </h2>
              <button
                onClick={() => {
                  setShowAddMemberModal(false);
                  setAddingMemberError("");
                  setNewMemberForm({ firstName: "", lastName: "", email: "", phone: "" });
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: C.muted
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitAddMember} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {addingMemberError && (
                <div style={{
                  padding: "10px 12px",
                  background: "#FEE2E2",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  color: "#991B1B",
                  fontSize: 13,
                  fontWeight: 600
                }}>
                  ⚠️ {addingMemberError}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 6, color: C.dark, fontWeight: 600, fontSize: 13 }}>
                    First Name:
                  </label>
                  <input
                    type="text"
                    required
                    value={newMemberForm.firstName}
                    onChange={e => setNewMemberForm({ ...newMemberForm, firstName: e.target.value })}
                    placeholder="e.g. John"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: `1.5px solid ${C.border}`,
                      borderRadius: 8,
                      background: C.surface,
                      color: C.dark,
                      fontSize: 13,
                      fontFamily: "'Barlow', sans-serif",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 6, color: C.dark, fontWeight: 600, fontSize: 13 }}>
                    Last Name:
                  </label>
                  <input
                    type="text"
                    required
                    value={newMemberForm.lastName}
                    onChange={e => setNewMemberForm({ ...newMemberForm, lastName: e.target.value })}
                    placeholder="e.g. Doe"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: `1.5px solid ${C.border}`,
                      borderRadius: 8,
                      background: C.surface,
                      color: C.dark,
                      fontSize: 13,
                      fontFamily: "'Barlow', sans-serif",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, color: C.dark, fontWeight: 600, fontSize: 13 }}>
                  Phone Number:
                </label>
                <input
                  type="tel"
                  required
                  value={newMemberForm.phone}
                  onChange={e => setNewMemberForm({ ...newMemberForm, phone: e.target.value })}
                  placeholder="10-digit Indian Number"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: `1.5px solid ${C.border}`,
                    borderRadius: 8,
                    background: C.surface,
                    color: C.dark,
                    fontSize: 13,
                    fontFamily: "'Barlow', sans-serif",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, color: C.dark, fontWeight: 600, fontSize: 13 }}>
                  Email Address:
                </label>
                <input
                  type="email"
                  required
                  value={newMemberForm.email}
                  onChange={e => setNewMemberForm({ ...newMemberForm, email: e.target.value })}
                  placeholder="e.g. member@rsfitness.com"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: `1.5px solid ${C.border}`,
                    borderRadius: 8,
                    background: C.surface,
                    color: C.dark,
                    fontSize: 13,
                    fontFamily: "'Barlow', sans-serif",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 12, width: "100%" }}>
                <button
                  type="submit"
                  disabled={submittingNewMember}
                  style={{
                    flex: 1,
                    minWidth: "auto",
                    padding: "12px 16px",
                    background: C.primary,
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: submittingNewMember ? "not-allowed" : "pointer",
                    opacity: submittingNewMember ? 0.7 : 1,
                    fontFamily: "'Barlow', sans-serif"
                  }}
                >
                  {submittingNewMember ? "Adding..." : "Add Member"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMemberModal(false);
                    setAddingMemberError("");
                    setNewMemberForm({ firstName: "", lastName: "", email: "", phone: "" });
                  }}
                  style={{
                    flex: 1,
                    minWidth: "auto",
                    padding: "12px 16px",
                    background: "transparent",
                    color: C.primary,
                    border: `1.5px solid ${C.primary}`,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "'Barlow', sans-serif",
                    transition: "all 0.2s"
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Details Modal */}
      {showDetailModal && selectedDetailMember && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <div style={{
            width: "100%",
            maxWidth: 450,
            background: C.card,
            borderRadius: 14,
            padding: "24px",
            border: `1px solid ${C.border}`,
            maxHeight: "90vh",
            overflow: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ color: C.dark, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>
                Member Details
              </h2>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedDetailMember(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: C.muted
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <span style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, fontWeight: 700, display: "block", marginBottom: 4 }}>Full Name</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{selectedDetailMember.name}</span>
              </div>
              
              <div>
                <span style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, fontWeight: 700, display: "block", marginBottom: 4 }}>Phone Number</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: C.dark }}>{selectedDetailMember.phone || "-"}</span>
              </div>

              <div>
                <span style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, fontWeight: 700, display: "block", marginBottom: 4 }}>Email Address</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: C.dark }}>{selectedDetailMember.email || "-"}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, fontWeight: 700, display: "block", marginBottom: 4 }}>Current Plan</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>{selectedDetailMember.plan}</span>
                </div>
                <div>
                  <span style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, fontWeight: 700, display: "block", marginBottom: 4 }}>Status</span>
                  <span className={`badge ${selectedDetailMember.membership_type === "no_membership" ? "inactive" : selectedDetailMember.membership_type === "expired" ? "expired" : selectedDetailMember.status}`} style={{ display: "inline-block", marginTop: 2 }}>
                    {selectedDetailMember.membership_type === "no_membership" ? "pending" : selectedDetailMember.membership_type === "expired" ? "expired" : selectedDetailMember.status}
                  </span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, fontWeight: 700, display: "block", marginBottom: 4 }}>Start Date</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{formatDate(selectedDetailMember.start_date)}</span>
                </div>
                <div>
                  <span style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, fontWeight: 700, display: "block", marginBottom: 4 }}>Expiry Date</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{formatDate(selectedDetailMember.expiry_date)}</span>
                </div>
              </div>

              {selectedDetailMember.membership_type !== "no_membership" && (
                <div>
                  <span style={{ fontSize: 11, textTransform: "uppercase", color: C.muted, fontWeight: 700, display: "block", marginBottom: 4 }}>Days Remaining</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: selectedDetailMember.membership_type === "expired" ? C.red : C.success }}>
                    {selectedDetailMember.days_remaining} days
                  </span>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button
                  disabled
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "#E5E7EB",
                    color: "#9CA3AF",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6
                  }}
                >
                  📢 Remind
                </button>
                <button
                  disabled
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "#E5E7EB",
                    color: "#9CA3AF",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6
                  }}
                >
                  🔄 Renew
                </button>
              </div>
              <div style={{ textAlign: "center", fontSize: 11, color: C.muted, fontStyle: "italic", marginTop: -8 }}>
                Remind and Renew actions are disabled in this view
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastNotification && (
        <div style={{
          position: "fixed",
          bottom: "85px",
          left: "50%",
          transform: "translateX(-50%)",
          background: toastNotification.type === 'success' ? "#DCFCE7" : "#FEE2E2",
          border: toastNotification.type === 'success' ? "2px solid #86EFAC" : "2px solid #FECACA",
          borderTop: toastNotification.type === 'success' ? "3px solid #10B981" : "3px solid #EF4444",
          padding: "14px 18px",
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderRadius: "10px",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
          width: "calc(100% - 32px)",
          maxWidth: "400px",
          animation: "slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          boxSizing: "border-box"
        }}>
          <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>
            {toastNotification.type === 'success' ? '✅' : '❌'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: "0 0 2px",
              color: toastNotification.type === 'success' ? "#166534" : "#991B1B",
              fontWeight: 700,
              fontSize: 13
            }}>
              {toastNotification.title}
            </p>
            <p style={{
              margin: 0,
              color: toastNotification.type === 'success' ? "#16a34a" : "#b91c1c",
              fontSize: 12,
              fontWeight: 500
            }}>
              {toastNotification.message}
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
      `}</style>

      {/* Bottom Nav Bar */}
      <div className="gym-bottom-nav" style={{ background:C.card }}
        role="tablist"
        aria-label="Navigation"
      >
        {[
          { id:"admin", icon:"dashboard", label:"Admin" },
          { id:"members", icon:"users", label:"Members" },
          { id:"profile", icon:"user", label:"Profile" }
        ].map(({ id, icon, label }) => (
          <button 
            key={id} 
            onClick={() => setActiveTab(id)}
            role="tab"
            aria-selected={activeTab === id}
            aria-label={label}
            style={{
              flex:1, background:"none", border:"none", cursor:"pointer", padding:"8px 0",
              display:"flex", flexDirection:"column", alignItems:"center", gap:4,
              color:activeTab===id ? C.primary : C.muted, transition:"all 0.2s ease",
              outline: "none",
              touchAction: "manipulation"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = activeTab !== id ? "rgba(0,0,0,0.02)" : "transparent"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <i className={`ti ti-${icon}`} style={{ fontSize:24, lineHeight:1 }}/>
            <span style={{ fontSize:11, fontWeight:activeTab===id?700:500, fontFamily:"'Barlow',sans-serif", letterSpacing:0.3 }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
