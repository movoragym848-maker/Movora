import { useState, useEffect } from "react";
import { generateOTP } from "../../utils/date";
import { signup, login, signupGymOwner, loginGymOwner, checkGym, getRegisteredGyms, sendPhoneOTP, verifyPhoneOTP } from "../../services/api";
import { AuthInput, authInputStyle } from "../common";

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [membershipMode, setMembershipMode] = useState(null); // 'personal' or 'gym_member'
  const [form, setForm] = useState({ name:"", email:"", password:"", phone:"", gymName:"", otp:"" });
  const [gymForm, setGymForm] = useState({ gymName:"", phone:"", email:"", password:"", city:"" });
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [pendingUser, setPendingUser] = useState(null);
  const [pendingGymOwner, setPendingGymOwner] = useState(null);
  const [shownOtp, setShownOtp] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [registeredGyms, setRegisteredGyms] = useState([]);
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // normal startup
    }
    if (mode === "membershipModeSelection") {
      getRegisteredGyms()
        .then(gyms => setRegisteredGyms(gyms))
        .catch(err => console.warn("Failed to fetch registered gyms:", err));
    }
  }, [mode]);

  // OTP Timer countdown
  useEffect(() => {
    if (otpTimer <= 0) return;
    const timer = setTimeout(() => setOtpTimer(otpTimer - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpTimer]);


  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setGym = k => e => setGymForm(f => ({ ...f, [k]: e.target.value }));
  const handleLogin = async () => {
    setError("");
    try {
      const session = await login({ email: form.email.trim(), password: form.password });
      
      // Validate session structure before proceeding
      if (!session) {
        throw new Error("No session returned from server");
      }
      
      if (session.accountType !== "gym_owner" && (!session.user || !session.user.email || !session.user.name)) {
        throw new Error("Invalid session data: missing required user fields");
      }
      
      try {
        onAuth(session);
      } catch (authErr) {
        console.error("Error in onAuth callback:", authErr);
        throw new Error(`Failed to initialize session: ${authErr.message}`);
      }
    } catch (err) {
      const errorMsg = err?.message || "Login failed.";
      console.error("Login error:", err);
      setError(errorMsg);
    }
  };

  const handleSignup = async () => {
    setError("");
    // Step 1: Validate basic info and show membership mode selection
    if (membershipMode === null) {
      // Basic info validation
      if (!form.name.trim() || !form.email.trim() || !form.password || !form.phone.trim()) return setError("All fields required.");
      if (form.password.length < 6) return setError("Password must be at least 6 characters.");
      const cleanPhone = form.phone.replace(/\D/g, "");
      if (cleanPhone.length !== 10) return setError("Phone number must be exactly 10 digits.");
      // Show membership mode selection screen
      setMode("membershipModeSelection");
      return;
    }

    // Step 2: If personal mode, proceed to OTP
    if (membershipMode === "personal") {
      setPendingUser({ name:form.name.trim(), email:form.email.trim(), password:form.password, phone:form.phone.replace(/\D/g, ""), gymName: null, userType: "personal" });
      setOtpLoading(true);
      try {
        const res = await sendPhoneOTP(form.phone.replace(/\D/g, ""));
        if (res?.mockOtp) setShownOtp(res.mockOtp);
        setOtpSent(true);
        setOtpTimer(120);
        setMode("otp");
        setForm(f => ({ ...f, otp: "" }));
        // debug removed
      } catch (otpErr) {
        setError(otpErr.message || "Failed to send OTP. Please try again.");
        // debug removed
      } finally {
        setOtpLoading(false);
      }
      return;
    }

    // Step 3: If gym_member mode, validate gym selection
    if (membershipMode === "gym_member") {
      if (!form.gymName.trim()) return setError("Please select a gym.");
      try {
        const checkRes = await checkGym(form.gymName.trim());
        const exactGymName = checkRes.gymName;
        setPendingUser({ name:form.name.trim(), email:form.email.trim(), password:form.password, phone:form.phone.replace(/\D/g, ""), gymName: exactGymName, userType: "gym_member" });
        
        setOtpLoading(true);
        try {
          const res = await sendPhoneOTP(form.phone.replace(/\D/g, ""));
          if (res?.mockOtp) setShownOtp(res.mockOtp);
          setOtpSent(true);
          setOtpTimer(120);
          setMode("otp");
          setForm(f => ({ ...f, otp: "" }));
        } catch (otpErr) {
          setError(otpErr.message || "Failed to send OTP. Please try again.");
        } finally {
          setOtpLoading(false);
        }
      } catch (err) {
        setError(err.message || "Failed to verify gym registration.");
      }
    }
  };

  const handleVerify = async () => {
    setError("");
    if (!pendingUser && !pendingGymOwner) return setError("Session expired. Please sign up again.");
    if (!form.otp.trim()) return setError("Please enter the OTP.");
    if (!/^\d{6}$/.test(form.otp.trim())) return setError("OTP must be 6 digits.");
    
    const activePhone = pendingUser?.phone || pendingGymOwner?.phone;
    
    try {
      // Verify OTP with backend
      await verifyPhoneOTP(activePhone, form.otp.trim());
      
      if (pendingGymOwner) {
        // OTP verified, now create gym owner account
        const result = await signupGymOwner({
          gymName: pendingGymOwner.gymName,
          phone: pendingGymOwner.phone,
          email: pendingGymOwner.email,
          password: pendingGymOwner.password,
          city: pendingGymOwner.city,
        });
        setPendingGymOwner(result.gymOwner);
        setMode("gymApprovalPending");
      } else {
        // OTP verified, now create member/user account
        if (!pendingUser.name || pendingUser.name.length < 2) return setError("Name must be at least 2 characters.");
        if (!pendingUser.email || !pendingUser.email.includes("@")) return setError("Valid email is required.");
        if (!pendingUser.password || pendingUser.password.length < 6) return setError("Password must be at least 6 characters.");
        const cleanPhone = pendingUser.phone.replace(/\D/g, "");
        if (!pendingUser.phone || cleanPhone.length !== 10) return setError("Phone number must be exactly 10 digits.");
        
        // Gym name is only required for gym_member mode
        if (pendingUser.userType === "gym_member" && (!pendingUser.gymName || pendingUser.gymName.length < 2)) {
          return setError("Gym name is required for gym member signup.");
        }

        const session = await signup(pendingUser);
        onAuth(session);
      }
    } catch (err) {
      const errMsg = err.message || "Verification failed.";
      if (errMsg.includes("Invalid OTP") || errMsg.includes("expired") || errMsg.includes("exceeded")) {
        setError(errMsg);
      } else if (errMsg.includes("already exists") || errMsg.includes("already registered")) {
        setError(errMsg.toLowerCase().includes("gym") ? "A gym with this name is already registered." : "Email or phone number already registered.");
      } else if (errMsg.includes("not registered")) {
        setError("Gym is not registered. Please select from the list.");
      } else {
        setError(errMsg);
      }
    }
  };

  const handleGymSignup = async () => {
    setError("");
    // Debug: confirm handler execution
    try { console.log("handleGymSignup called", { gymName: gymForm.gymName, phoneLast4: (gymForm.phone || '').slice(-4) }); } catch(e){}
    if (!gymForm.gymName.trim() || !gymForm.phone.trim() || !gymForm.email.trim() || !gymForm.password || !gymForm.city.trim()) {
      return setError("All gym owner fields required.");
    }
    if (gymForm.password.length < 6) return setError("Password must be at least 6 characters.");
    const cleanPhone = gymForm.phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) return setError("Phone number must be exactly 10 digits.");
    if (gymForm.gymName.trim().length < 2) return setError("Gym name must be at least 2 characters.");
    if (gymForm.city.trim().length < 2) return setError("City must be at least 2 characters.");
    
    const details = {
      gymName: gymForm.gymName.trim(),
      phone: cleanPhone,
      email: gymForm.email.trim().toLowerCase(),
      password: gymForm.password,
      city: gymForm.city.trim(),
    };
    
    setPendingGymOwner(details);
    setOtpLoading(true);
    try {
      const res = await sendPhoneOTP(details.phone);
      if (res?.mockOtp) setShownOtp(res.mockOtp);
      setOtpSent(true);
      setOtpTimer(120);
      setMode("otp");
      setForm(f => ({ ...f, otp: "" }));
    } catch (otpErr) {
      setError(otpErr.message || "Failed to send OTP. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleGymLogin = async () => {
    setError("");
    try {
      const session = await loginGymOwner({ email:gymForm.email.trim(), password:gymForm.password });
      onAuth(session);
    } catch (err) {
      setError(err.message || "Gym owner login failed.");
    }
  };

  const copyOtp = () => {
    setForm(f => ({ ...f, otp: shownOtp }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight:"100vh", width:"100%", display:"flex", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(135deg, #EEF4FF 0%, #DBEAFE 50%, #BFDBFE 100%)",
      padding:"max(24px, env(safe-area-inset-top)) clamp(16px, 4vw, 24px) max(24px, env(safe-area-inset-bottom))",
      fontFamily:"'Barlow',sans-serif", overflowX:"hidden", overflowY:"auto", boxSizing:"border-box", WebkitOverflowScrolling:"touch" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700;800&display=swap');
        *{box-sizing:border-box}
        input,textarea,select{font-size:16px !important;}
        
        @media (max-width: 640px) {
          .auth-card {
            width:100% !important;
            padding: 20px 16px 18px !important;
            border-radius: 16px !important;
            max-width: 100% !important;
          }
          .auth-logo {
            margin-bottom: 20px !important;
          }
          .auth-logo-icon {
            width: 32px !important;
            height: 32px !important;
            border-radius: 6px !important;
            padding: 8px 16px !important;
          }
          .auth-logo-text {
            font-size: 22px !important;
            letter-spacing: 1.5px !important;
          }
          .auth-tagline {
            font-size: 12px !important;
          }
          .auth-form-title {
            font-size: 20px !important;
            margin-bottom: 4px !important;
          }
          .auth-form-desc {
            font-size: 12px !important;
            margin-bottom: 16px !important;
          }
          .auth-button {
            font-size: 14px !important;
            padding: 11px !important;
          }
          .auth-otp-header-title {
            font-size: 20px !important;
            margin-bottom: 4px !important;
          }
          .auth-otp-display {
            font-size: 36px !important;
            letter-spacing: 8px !important;
            padding: 14px 12px !important;
          }
          .auth-otp-copy-btn {
            font-size: 12px !important;
            padding: 7px 16px !important;
          }
          .auth-input-box {
            padding: 10px 12px !important;
            border-radius: 8px !important;
          }
        }
        
        @media (max-width: 360px) {
          .auth-card {
            padding: 16px 12px 14px !important;
          }
          .auth-form-title {
            font-size: 18px !important;
          }
          .auth-otp-display {
            font-size: 32px !important;
            letter-spacing: 6px !important;
          }
        }
      `}</style>
      <div style={{ width:"100%", maxWidth:400, minWidth:0, margin:"0 auto", display:"flex", flexDirection:"column", alignItems:"center" }}>

        

        {/* Logo */}
        <div className="auth-logo" style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:"clamp(8px, 3vw, 10px)", marginBottom:8,
            background:"#fff", borderRadius:16, padding:"clamp(8px, 2vw, 10px) clamp(14px, 5vw, 20px)",
            boxShadow:"0 4px 20px rgba(59,130,246,0.15)" }}>
            <div className="auth-logo-icon" style={{ width:36, height:36, background:"#3B82F6", borderRadius:8,
              display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <rect x="2" y="10" width="4" height="4" rx="1" fill="#fff"/>
                <rect x="18" y="10" width="4" height="4" rx="1" fill="#fff"/>
                <rect x="5" y="8" width="2" height="8" rx="1" fill="#fff"/>
                <rect x="17" y="8" width="2" height="8" rx="1" fill="#fff"/>
                <rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/>
              </svg>
            </div>
            <span className="auth-logo-text" style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:"clamp(20px, 6vw, 26px)", fontWeight:800,
              color:"#1E3A5F", letterSpacing:2, whiteSpace:"nowrap" }}>MOVORA</span>
          </div>
          <p className="auth-tagline" style={{ color:"#93A8C8", fontSize:13, margin:0, fontWeight:600, letterSpacing:0.5 }}>Track. Lift. Evolve.</p>
        </div>

        {/* Card */}
        <div className="auth-card" style={{ width:"100%", maxWidth:420, background:"#fff", borderRadius:20, padding:"28px 28px 24px",
          boxShadow:"0 12px 40px rgba(59,130,246,0.14)", border:"1px solid #DBEAFE", minWidth:0 }}>

          {mode === "otp" ? (
            <form onSubmit={(e) => { e.preventDefault(); handleVerify(); }} style={{ margin: 0 }}>
              {/* OTP screen header */}
              <div style={{ textAlign:"center", marginBottom:20 }}>
                <div style={{ width:52, height:52, background:"#EEF4FF", borderRadius:14,
                  display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", fontSize:26 }}>📱</div>
                <h2 className="auth-otp-header-title" style={{ color:"#1E3A5F", margin:"0 0 6px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800 }}>Verify your phone</h2>
                <p style={{ color:"#93A8C8", fontSize:13, margin:0 }}>We sent a 6-digit code to {pendingUser?.phone || pendingGymOwner?.phone}</p>
              </div>

              {/* OTP Status Message / Mock OTP Display */}
              {otpSent && (
                <div style={{ background: shownOtp ? "#FFFBEB" : "#DCFCE7", border: shownOtp ? "1px solid #FCD34D" : "1px solid #86EFAC", borderRadius:9, padding:12, marginBottom:16, textAlign:"center" }}>
                  <div style={{ color: shownOtp ? "#D97706" : "#16A34A", fontSize:13, fontWeight:700 }}>
                    {shownOtp ? "🔑 Testing / Demo OTP Mode" : "✓ OTP sent successfully"}
                  </div>
                  {shownOtp ? (
                    <div style={{ marginTop: 6 }}>
                      <div className="auth-otp-display" style={{ fontSize:26, fontWeight:800, color:"#92400E", letterSpacing:6, fontFamily:"'Barlow Condensed',sans-serif", margin:"4px 0" }}>
                        {shownOtp}
                      </div>
                      <button type="button" onClick={copyOtp} className="auth-otp-copy-btn" style={{
                        marginTop:4, background:"#F59E0B", border:"none", borderRadius:6, color:"#fff",
                        padding:"5px 14px", fontSize:12, fontWeight:700, cursor:"pointer"
                      }}>
                        {copied ? "✓ Auto-filled!" : "Auto-fill Code"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ color:"#15803D", fontSize:12, marginTop:4 }}>Check your WhatsApp</div>
                  )}
                </div>
              )}

              {/* OTP Input */}
              <AuthInput 
                label="Enter 6-digit OTP" 
                value={form.otp} 
                onChange={set("otp")}
                placeholder="000000" 
                maxLength={6} 
                inputMode="numeric"
                style={{ ...authInputStyle, textAlign:"center", fontSize:"20px", fontWeight:700,
                  letterSpacing:8, fontFamily:"'Barlow Condensed',sans-serif" }}
              />

              {/* Resend OTP option */}
              <div style={{ textAlign:"center", marginBottom:14 }}>
                {otpTimer > 0 ? (
                  <p style={{ color:"#93A8C8", fontSize:12, margin:0 }}>Resend OTP in <span style={{ fontWeight:700, color:"#3B82F6" }}>{otpTimer}s</span></p>
                ) : (
                  <button type="button" onClick={async () => {
                    setError("");
                    setOtpLoading(true);
                    try {
                      const res = await sendPhoneOTP(pendingUser?.phone || pendingGymOwner?.phone);
                      if (res?.mockOtp) setShownOtp(res.mockOtp);
                      setOtpTimer(120);
                      setForm(f => ({ ...f, otp: "" }));
                      setError("");
                    } catch (err) {
                      setError(err.message || "Failed to resend OTP");
                    } finally {
                      setOtpLoading(false);
                    }
                  }} style={{
                    background:"none", border:"none", color:"#3B82F6", cursor:"pointer", 
                    fontSize:12, fontWeight:700, textDecoration:"underline", padding:0
                  }} disabled={otpLoading}>
                    {otpLoading ? "Sending..." : "Resend OTP"}
                  </button>
                )}
              </div>

              {error && <p style={{ color:"#EF4444", fontSize:13, margin:"-6px 0 14px" }}>{error}</p>}

              <button type="submit" className="auth-button" style={{
                width:"100%", background:"#3B82F6", border:"none", borderRadius:9,
                padding:"12px", color:"#fff", fontSize:15, fontWeight:700,
                cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase",
                letterSpacing:0.5, marginBottom:10, opacity: form.otp.length === 6 ? 1 : 0.6, 
                pointerEvents: form.otp.length === 6 ? "auto" : "none"
              }} disabled={form.otp.length !== 6}>Verify &amp; Create Account</button>
              <button type="button" onClick={() => { 
                if (pendingGymOwner) {
                  setMode("gymSignup");
                  setPendingGymOwner(null);
                } else {
                  setMode("signup");
                  setPendingUser(null);
                }
                setError(""); 
                setOtpSent(false); 
                setOtpTimer(0); 
              }} className="auth-button" style={{
                width:"100%", background:"transparent", border:"1.5px solid #DBEAFE",
                borderRadius:9, padding:"11px", color:"#93A8C8", fontSize:14, fontWeight:700,
                cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase",
              }}>← Back</button>
            </form>

          ) : mode === "gymApprovalPending" ? (
            <>
              <div style={{ textAlign:"center", marginBottom:20 }}>
                <div style={{ width:52, height:52, background:"#EEF4FF", borderRadius:14,
                  display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", fontSize:26 }}>✓</div>
                <h2 className="auth-form-title" style={{ color:"#1E3A5F", margin:"0 0 6px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800 }}>Approval pending</h2>
                <p style={{ color:"#93A8C8", fontSize:13, margin:0 }}>You will get a call within 24 hours from our team.</p>
              </div>
              {pendingGymOwner && (
                <div className="auth-input-box" style={{ background:"#EEF4FF", border:"1.5px solid #DBEAFE", borderRadius:9, padding:"13px 14px", marginBottom:16 }}>
                  <div style={{ color:"#1E3A5F", fontWeight:700, fontSize:14 }}>{pendingGymOwner.gymName}</div>
                  <div style={{ color:"#93A8C8", fontSize:12, marginTop:3 }}>{pendingGymOwner.city} · {pendingGymOwner.phone}</div>
                </div>
              )}
              <button type="button" onClick={() => { setMode("login"); setError(""); }} className="auth-button"
                style={{ width:"100%", background:"#3B82F6", border:"none", borderRadius:9,
                  padding:"12px", color:"#fff", fontSize:15, fontWeight:700,
                  cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif",
                  textTransform:"uppercase", letterSpacing:0.5 }}>Back to sign in</button>
            </>

          ) : mode === "gymSignup" ? (
            <form onSubmit={(e) => { e.preventDefault(); handleGymSignup(); }} style={{ margin: 0 }}>
              <h2 className="auth-form-title" style={{ color:"#1E3A5F", margin:"0 0 6px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800 }}>Register your GYM</h2>
              <p className="auth-form-desc" style={{ color:"#93A8C8", fontSize:13, margin:"0 0 20px" }}>Create your gym owner account</p>
              <AuthInput label="Gym name" value={gymForm.gymName} onChange={setGym("gymName")} placeholder="Movora Gym"/>
              <AuthInput label="Phone number" type="tel" value={gymForm.phone} onChange={setGym("phone")} placeholder="+91 98765 43210"/>
              <AuthInput label="Email" type="email" value={gymForm.email} onChange={setGym("email")} placeholder="owner@gym.com"/>
              <AuthInput label="Password" type="password" value={gymForm.password} onChange={setGym("password")} placeholder="••••••••"/>
              <AuthInput label="City" value={gymForm.city} onChange={setGym("city")} placeholder="Mumbai"/>
              {error && <p style={{ color:"#EF4444", fontSize:13, margin:"-6px 0 14px" }}>{error}</p>}
              <button type="submit" style={{
                width:"100%", background:"#3B82F6", border:"none", borderRadius:9,
                padding:"12px", color:"#fff", fontSize:15, fontWeight:700,
                cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif",
                textTransform:"uppercase", letterSpacing:0.5, marginBottom:12,
              }}>Create Gym Owner Account</button>
              <p style={{ textAlign:"center", color:"#93A8C8", fontSize:13, margin:"0 0 8px" }}>
                Already registered?{" "}
                <span onClick={() => { setMode("gymLogin"); setError(""); }}
                  style={{ color:"#3B82F6", cursor:"pointer", fontWeight:700 }}>Login as a gym owner</span>
              </p>
              <p style={{ textAlign:"center", color:"#93A8C8", fontSize:13, margin:0 }}>
                Member account?{" "}
                <span onClick={() => { setMode("login"); setError(""); }}
                  style={{ color:"#3B82F6", cursor:"pointer", fontWeight:700 }}>Sign in</span>
              </p>
            </form>

          ) : mode === "gymLogin" ? (
            <form onSubmit={(e) => { e.preventDefault(); handleGymLogin(); }} style={{ margin: 0 }}>
              <h2 style={{ color:"#1E3A5F", margin:"0 0 6px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800 }}>Gym owner login</h2>
              <p style={{ color:"#93A8C8", fontSize:13, margin:"0 0 20px" }}>Sign in to your gym owner account</p>
              <AuthInput label="Email" type="email" value={gymForm.email} onChange={setGym("email")} placeholder="owner@gym.com"/>
              <AuthInput label="Password" type="password" value={gymForm.password} onChange={setGym("password")} placeholder="••••••••"/>
              {error && <p style={{ color:"#EF4444", fontSize:13, margin:"-6px 0 14px" }}>{error}</p>}
              <button type="submit" style={{
                width:"100%", background:"#3B82F6", border:"none", borderRadius:9,
                padding:"12px", color:"#fff", fontSize:15, fontWeight:700,
                cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif",
                textTransform:"uppercase", letterSpacing:0.5, marginBottom:12,
              }}>Login as Gym Owner</button>
              <p style={{ textAlign:"center", color:"#93A8C8", fontSize:13, margin:"0 0 8px" }}>
                Need a gym owner account?{" "}
                <span onClick={() => { setMode("gymSignup"); setError(""); }}
                  style={{ color:"#3B82F6", cursor:"pointer", fontWeight:700 }}>Register your GYM</span>
              </p>
              <p style={{ textAlign:"center", color:"#93A8C8", fontSize:13, margin:0 }}>
                Member account?{" "}
                <span onClick={() => { setMode("login"); setError(""); }}
                  style={{ color:"#3B82F6", cursor:"pointer", fontWeight:700 }}>Sign in</span>
              </p>
            </form>

          ) : mode === "membershipModeSelection" ? (
            <form onSubmit={(e) => { e.preventDefault(); handleSignup(); }} style={{ margin: 0 }}>
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <div style={{ width:52, height:52, background:"#EEF4FF", borderRadius:14,
                  display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", fontSize:26 }}>🏋️</div>
                <h2 style={{ color:"#1E3A5F", margin:"0 0 6px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800 }}>How will you train?</h2>
                <p style={{ color:"#93A8C8", fontSize:13, margin:0 }}>Choose your training mode</p>
              </div>

              {/* Personal Mode Option */}
              <button type="button" onClick={() => { setMembershipMode("personal"); setError(""); }} style={{
                width:"100%", marginBottom:12, padding:16, borderRadius:12,
                border: membershipMode === "personal" ? "2px solid #3B82F6" : "1.5px solid #DBEAFE",
                background: membershipMode === "personal" ? "#EEF4FF" : "#fff",
                cursor:"pointer", textAlign:"left", transition:"all 0.2s"
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:40, height:40, background:"#DBEAFE", borderRadius:10, display:"flex",
                    alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>👤</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:15 }}>Personal Mode</div>
                    <div style={{ fontSize:12, color:"#93A8C8", marginTop:3 }}>Train on your own, no gym required</div>
                  </div>
                  {membershipMode === "personal" && <div style={{ fontSize:20 }}>✓</div>}
                </div>
              </button>

              {/* Join Gym Option */}
              <button type="button" onClick={() => { setMembershipMode("gym_member"); setError(""); }} style={{
                width:"100%", marginBottom:16, padding:16, borderRadius:12,
                border: membershipMode === "gym_member" ? "2px solid #3B82F6" : "1.5px solid #DBEAFE",
                background: membershipMode === "gym_member" ? "#EEF4FF" : "#fff",
                cursor:"pointer", textAlign:"left", transition:"all 0.2s"
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:40, height:40, background:"#DBEAFE", borderRadius:10, display:"flex",
                    alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>🏢</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, color:"#1E3A5F", fontSize:15 }}>Join Gym</div>
                    <div style={{ fontSize:12, color:"#93A8C8", marginTop:3 }}>Member of a registered gym</div>
                  </div>
                  {membershipMode === "gym_member" && <div style={{ fontSize:20 }}>✓</div>}
                </div>
              </button>

              {/* Show gym dropdown only if gym_member is selected */}
              {membershipMode === "gym_member" && (
                <div style={{ marginBottom:16 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#93A8C8", marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 }}>SELECT GYM</label>
                  <select value={form.gymName} onChange={set("gymName")} style={{
                    ...authInputStyle,
                    width:"100%",
                    appearance:"none",
                    backgroundImage:`url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2393A8C8' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                    backgroundRepeat:"no-repeat",
                    backgroundPosition:"right 12px center",
                    backgroundSize:"20px",
                    paddingRight:40,
                  }}>
                    <option value="" disabled>Select your gym</option>
                    {registeredGyms.map(gym => (
                      <option key={gym} value={gym}>{gym}</option>
                    ))}
                  </select>
                  <p style={{ fontSize:11, color:"#93A8C8", margin:"8px 0 0", fontStyle:"italic" }}>💡 If your gym is not registered, select <strong>Personal Mode</strong></p>
                </div>
              )}

              {error && <p style={{ color:"#EF4444", fontSize:13, margin:"-6px 0 14px" }}>{error}</p>}
              <button type="submit" style={{
                width:"100%", background:membershipMode ? "#3B82F6" : "#93A8C8", border:"none", borderRadius:9,
                padding:"12px", color:"#fff", fontSize:15, fontWeight:700,
                cursor:membershipMode ? "pointer" : "not-allowed", fontFamily:"'Barlow Condensed',sans-serif",
                textTransform:"uppercase", letterSpacing:0.5, marginBottom:16,
                opacity: otpLoading ? 0.7 : 1, pointerEvents: otpLoading || !membershipMode ? "none" : "auto"
              }} disabled={otpLoading || !membershipMode}>{otpLoading ? "Sending OTP..." : "Send OTP & Continue →"}</button>
              <button type="button" onClick={() => { setMode("signup"); setMembershipMode(null); setError(""); setForm(f => ({ ...f, gymName: "" })); }} style={{
                width:"100%", background:"transparent", border:"1.5px solid #DBEAFE",
                borderRadius:9, padding:"11px", color:"#93A8C8", fontSize:14, fontWeight:700,
                cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase",
              }}>← Back</button>
            </form>

          ) : mode === "signup" ? (
            <form onSubmit={(e) => { e.preventDefault(); handleSignup(); }} style={{ margin: 0 }}>
              <h2 style={{ color:"#1E3A5F", margin:"0 0 20px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800 }}>Create account</h2>
              <AuthInput label="Full name" value={form.name} onChange={set("name")} placeholder="Alex Johnson"/>
              <AuthInput label="Email" type="email" value={form.email} onChange={set("email")} placeholder="alex@email.com"/>
              <AuthInput label="Phone number" type="tel" value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210"/>
              <AuthInput label="Password" type="password" value={form.password} onChange={set("password")} placeholder="••••••••"/>
              {error && <p style={{ color:"#EF4444", fontSize:13, margin:"-6px 0 14px" }}>{error}</p>}
              <button type="submit" style={{
                width:"100%", background:"#3B82F6", border:"none", borderRadius:9,
                padding:"12px", color:"#fff", fontSize:15, fontWeight:700,
                cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif",
                textTransform:"uppercase", letterSpacing:0.5, marginBottom:16,
              }}>Next: Choose Training Mode →</button>
              <p style={{ textAlign:"center", color:"#93A8C8", fontSize:13, margin:0 }}>
                Already have an account?{" "}
                <span onClick={() => { setMode("login"); setError(""); }}
                  style={{ color:"#3B82F6", cursor:"pointer", fontWeight:700 }}>Sign in</span>
              </p>
            </form>

          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} style={{ margin: 0 }}>
              <h2 style={{ color:"#1E3A5F", margin:"0 0 6px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800 }}>Welcome back 👋</h2>
              <p style={{ color:"#93A8C8", fontSize:13, margin:"0 0 20px" }}>Sign in to continue your journey</p>
              <AuthInput label="Email" type="email" value={form.email} onChange={set("email")} placeholder="alex@email.com"/>
              <AuthInput label="Password" type="password" value={form.password} onChange={set("password")} placeholder="••••••••"/>
              {error && <p style={{ color:"#EF4444", fontSize:13, margin:"-6px 0 14px" }}>{error}</p>}
              <button type="submit" style={{
                width:"100%", background:"#3B82F6", border:"none", borderRadius:9,
                padding:"12px", color:"#fff", fontSize:15, fontWeight:700,
                cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif",
                textTransform:"uppercase", letterSpacing:0.5, marginBottom:16,
              }}>Sign in</button>
              <p style={{ textAlign:"center", color:"#93A8C8", fontSize:13, margin:0 }}>
                New to Movora?{" "}
                <span onClick={() => { setMode("signup"); setError(""); }}
                  style={{ color:"#3B82F6", cursor:"pointer", fontWeight:700 }}>Create account</span>
              </p>
              <div style={{ height:1, background:"#DBEAFE", margin:"16px 0 14px" }}/>
              <p style={{ textAlign:"center", color:"#93A8C8", fontSize:13, margin:"0 0 8px" }}>
                Register your GYM?{" "}
                <span onClick={() => { setMode("gymSignup"); setError(""); }}
                  style={{ color:"#3B82F6", cursor:"pointer", fontWeight:700 }}>Create gym owner account</span>
              </p>
              <p style={{ textAlign:"center", color:"#93A8C8", fontSize:13, margin:0 }}>
                Already a gym owner?{" "}
                <span onClick={() => { setMode("gymLogin"); setError(""); }}
                  style={{ color:"#3B82F6", cursor:"pointer", fontWeight:700 }}>Login as a gym owner</span>
              </p>
            </form>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign:"center", color:"#93A8C8", fontSize:12, marginTop:16 }}>
          🏋️ Movora · Your personal gym companion
        </p>
      </div>
    </div>
  );
}

// ─── LOG EXERCISE MODAL ────────────────────────────────────────────────────────
