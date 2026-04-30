"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BrowserProvider } from "ethers";
import { registerUser } from "@/app/actions/auth";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="5" width="20" height="14" rx="3"/>
      <path d="M16 12h2"/><path d="M2 10h20"/>
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "su_spin 0.8s linear infinite" }}>
      <style>{`@keyframes su_spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/>
      <path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const strength = password.length === 0 ? 0
    : password.length < 6 ? 1
    : password.length < 10 ? 2
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4
    : 3;

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColor = ["", "#ef4444", "#f97316", "#eab308", "#22c55e"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name || !email || !password) { setError("Please fill in all fields."); return; }
    if (!agreed) { setError("You must accept the terms to continue."); return; }
    if (strength < 2) { setError("Password is too weak."); return; }
    
    setLoading(true);
    
    const formData = new FormData();
    formData.append("name", name);
    formData.append("email", email);
    formData.append("password", password);
    
    const res = await registerUser(formData);
    setLoading(false);

    if (res?.error) {
      setError(res.error);
    } else {
      setSuccess(true);
    }
  }

  async function handleWalletSignup() {
    setError("");
    setLoading(true);
    try {
      if (!(window as any).ethereum) {
        throw new Error("No crypto wallet found. Please install MetaMask.");
      }
      
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      
      const message = "Sign in to NewsMonitor";
      const signature = await signer.signMessage(message);
      
      const res = await signIn("wallet", {
        address: address,
        signature: signature,
        message: message,
        redirect: false,
      });

      if (res?.error) {
        setError(res.error);
      } else {
        router.push("/intel-feed");
      }
    } catch (err: any) {
      setError(err.message || "Wallet connection failed");
    }
    setLoading(false);
  }

  const mono = "'IBM Plex Mono', monospace";

  if (success) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#efefec", padding: "0 16px" }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%",
            background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", color: "#22c55e", fontSize: 24 }}>
            ✓
          </div>
          <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: "#1c1917",
            marginBottom: 8 }}>Account created!</h2>
          <p style={{ fontFamily: mono, fontSize: 12, color: "#57534e", marginBottom: 24 }}>
            You can now sign in to access your terminal.
          </p>
          <Link href="/sign-in" style={{ display: "inline-flex", alignItems: "center", gap: 6,
            padding: "10px 20px", background: "#1c1917",
            border: "1px solid #1c1917", borderRadius: 8, textDecoration: "none",
            fontFamily: mono, fontSize: 11, fontWeight: 700, color: "#ffffff",
            letterSpacing: "0.1em" }}>
            SIGN IN →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: "24px 16px",
      background: "#efefec", position: "relative", overflow: "hidden" }}>

      {/* grid */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(#d6d3d1 0.6px, transparent 0.6px)",
        backgroundSize: "24px 24px" }}/>

      {/* glow */}
      <div aria-hidden style={{ position: "absolute", width: 600, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle,rgba(255,62,0,0.08) 0%,transparent 70%)",
        top: -100, left: "50%", transform: "translateX(-50%)", filter: "blur(60px)",
        pointerEvents: "none" }}/>

      <div style={{ width: "100%", maxWidth: 440, position: "relative", zIndex: 1 }}>

        {/* brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: 14 }}>
            <span style={{ fontFamily: mono, fontWeight: 900, fontSize: 22, color: "#1c1917",
              textTransform: "uppercase", letterSpacing: "-0.02em" }}>
              News<span style={{ color: "#ff3e00" }}>Monitor</span>
            </span>
          </Link>
          <h1 style={{ fontFamily: mono, fontSize: 26, fontWeight: 700, color: "#1c1917",
            margin: "0 0 6px", letterSpacing: "-0.02em" }}>Create account</h1>
          <p style={{ fontFamily: mono, fontSize: 12, color: "#57534e", margin: 0 }}>
            Join the global intelligence network
          </p>
        </div>

        {/* card */}
        <div style={{ background: "#ffffff", border: "1px solid #d6d3d1",
          borderRadius: 14, padding: "32px 28px",
          boxShadow: "0 16px 40px rgba(0,0,0,0.08)" }}>

          {/* oauth */}
          <button type="button" onClick={() => signIn("google", { callbackUrl: "/intel-feed" })}
            style={{ display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, width: "100%", padding: "11px 16px",
            marginBottom: 10, background: "#ffffff",
            border: "1px solid #d6d3d1", borderRadius: 8, cursor: "pointer",
            fontFamily: mono, fontSize: 12, fontWeight: 600, color: "#57534e",
            letterSpacing: "0.04em", transition: "all 0.15s ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff3e00"; (e.currentTarget as HTMLButtonElement).style.color = "#1c1917"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#d6d3d1"; (e.currentTarget as HTMLButtonElement).style.color = "#57534e"; }}>
            <GoogleIcon/> Sign up with Google
          </button>
          
          <button type="button" onClick={handleWalletSignup}
            style={{ display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, width: "100%", padding: "11px 16px",
            marginBottom: 10, background: "#ffffff",
            border: "1px solid #d6d3d1", borderRadius: 8, cursor: "pointer",
            fontFamily: mono, fontSize: 12, fontWeight: 600, color: "#57534e",
            letterSpacing: "0.04em", transition: "all 0.15s ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff3e00"; (e.currentTarget as HTMLButtonElement).style.color = "#1c1917"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#d6d3d1"; (e.currentTarget as HTMLButtonElement).style.color = "#57534e"; }}>
            <WalletIcon/> Sign up with Wallet
          </button>

          {/* divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#e7e5e4" }}/>
            <span style={{ fontFamily: mono, fontSize: 9, color: "#a8a29e", letterSpacing: "0.1em" }}>OR</span>
            <div style={{ flex: 1, height: 1, background: "#e7e5e4" }}/>
          </div>

          {/* form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* name */}
            <Field id="su-name" label="Full Name">
              <input id="su-name" type="text" value={name} placeholder="John Doe"
                autoComplete="name" onChange={(e) => setName(e.target.value)}
                style={inputStyle}/>
            </Field>

            {/* email */}
            <Field id="su-email" label="Email">
              <input id="su-email" type="email" value={email} placeholder="you@example.com"
                autoComplete="email" onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}/>
            </Field>

            {/* password */}
            <div>
              <Field id="su-password" label="Password">
                <input id="su-password" type={showPwd ? "text" : "password"} value={password}
                  placeholder="Min. 8 characters" autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}/>
                <button type="button" onClick={() => setShowPwd((v) => !v)}
                  style={{ background: "none", border: "none", color: "#57534e", cursor: "pointer",
                    fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em" }}>
                  {showPwd ? "HIDE" : "SHOW"}
                </button>
              </Field>
              {/* strength bar */}
              {password.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    {[1,2,3,4].map((n) => (
                      <div key={n} style={{ flex: 1, height: 3, borderRadius: 2,
                        background: n <= strength ? strengthColor[strength] : "#e7e5e4",
                        transition: "background 0.2s" }}/>
                    ))}
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 9, color: strengthColor[strength],
                    letterSpacing: "0.08em" }}>
                    {strengthLabel[strength]}
                  </span>
                </div>
              )}
            </div>

            {/* terms */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10,
              cursor: "pointer", userSelect: "none" }}>
              <div onClick={() => setAgreed((v) => !v)} style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                background: agreed ? "rgba(255,62,0,0.12)" : "transparent",
                border: `1px solid ${agreed ? "rgba(255,62,0,0.45)" : "#d6d3d1"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#ff3e00", transition: "all 0.15s ease", cursor: "pointer",
              }}>
                {agreed && <CheckIcon/>}
              </div>
              <span style={{ fontFamily: mono, fontSize: 10, color: "#57534e", lineHeight: 1.5 }}>
                I agree to the{" "}
                <Link href="#" style={{ color: "#ff3e00", textDecoration: "none" }}>Terms of Service</Link>
                {" "}and{" "}
                <Link href="#" style={{ color: "#ff3e00", textDecoration: "none" }}>Privacy Policy</Link>
              </span>
            </label>

            {error && (
              <div style={{ padding: "8px 12px", borderRadius: 6, fontFamily: mono,
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                color: "#ef4444", fontSize: 10, letterSpacing: "0.03em" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "12px 20px", marginTop: 4,
                background: loading ? "#f5f5f4" : "#1c1917", border: "1px solid #1c1917",
                borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
                color: loading ? "#a8a29e" : "#ffffff", transition: "all 0.18s ease" }}>
              {loading ? <><Spinner/> CREATING ACCOUNT...</> : "CREATE ACCOUNT →"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontFamily: mono, fontSize: 11, color: "#57534e" }}>
          Already have an account?{" "}
          <Link href="/sign-in" style={{ color: "#ff3e00", textDecoration: "none", fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const mono = "'IBM Plex Mono', monospace";
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", marginBottom: 6, fontFamily: mono,
        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#57534e",
        textTransform: "uppercase" }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center",
        background: "#ffffff", border: "1px solid #d6d3d1",
        borderRadius: 7, padding: "10px 14px", transition: "border-color 0.15s" }}
        onFocus={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#ff3e00"; }}
        onBlur={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#d6d3d1"; }}>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "transparent", border: "none", outline: "none", width: "100%",
  fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#1c1917",
};
