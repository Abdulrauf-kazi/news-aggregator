"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BrowserProvider } from "ethers";

// ─── Shared helpers ───────────────────────────────────────────────────────────

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
      style={{ animation: "auth_spin 0.8s linear infinite" }}>
      <style>{`@keyframes auth_spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/>
      <path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Please fill in all fields."); return; }
    
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      setError(res.error === "CredentialsSignin" ? "Invalid email or password" : res.error);
    } else {
      router.push("/");
    }
  }

  async function handleWalletLogin() {
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
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "Wallet connection failed");
    }
    setLoading(false);
  }

  const mono = "'IBM Plex Mono', monospace";

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 16px", background: "#efefec", position: "relative", overflow: "hidden" }}>

      {/* grid bg */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(#d6d3d1 0.6px, transparent 0.6px)",
        backgroundSize: "24px 24px" }}/>

      {/* glow */}
      <div aria-hidden style={{ position: "absolute", width: 600, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle,rgba(255,62,0,0.08) 0%,transparent 70%)",
        top: 0, left: "50%", transform: "translateX(-50%)", filter: "blur(60px)", pointerEvents: "none" }}/>

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>

        {/* brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
            <span style={{ fontFamily: mono, fontWeight: 900, fontSize: 22, color: "#1c1917",
              textTransform: "uppercase", letterSpacing: "-0.02em" }}>
              News<span style={{ color: "#ff3e00" }}>Monitor</span>
            </span>
          </Link>
          <h1 style={{ fontFamily: mono, fontSize: 26, fontWeight: 700, color: "#1c1917",
            margin: "0 0 6px", letterSpacing: "-0.02em" }}>Welcome back</h1>
          <p style={{ fontFamily: mono, fontSize: 12, color: "#57534e", margin: 0 }}>
            Sign in to your intelligence terminal
          </p>
        </div>

        {/* card */}
        <div style={{ background: "#ffffff", border: "1px solid #d6d3d1",
          borderRadius: 14, padding: "32px 28px",
          boxShadow: "0 16px 40px rgba(0,0,0,0.08)" }}>

          {/* oauth */}
          <button type="button" onClick={() => signIn("google", { callbackUrl: "/" })}
            style={{ display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, width: "100%", padding: "11px 16px",
            marginBottom: 10, background: "#ffffff",
            border: "1px solid #d6d3d1", borderRadius: 8, cursor: "pointer",
            fontFamily: mono, fontSize: 12, fontWeight: 600, color: "#57534e",
            letterSpacing: "0.04em", transition: "all 0.15s ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff3e00"; (e.currentTarget as HTMLButtonElement).style.color = "#1c1917"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#d6d3d1"; (e.currentTarget as HTMLButtonElement).style.color = "#57534e"; }}>
            <GoogleIcon/> Continue with Google
          </button>
          
          <button type="button" onClick={handleWalletLogin}
            style={{ display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, width: "100%", padding: "11px 16px",
            marginBottom: 10, background: "#ffffff",
            border: "1px solid #d6d3d1", borderRadius: 8, cursor: "pointer",
            fontFamily: mono, fontSize: 12, fontWeight: 600, color: "#57534e",
            letterSpacing: "0.04em", transition: "all 0.15s ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff3e00"; (e.currentTarget as HTMLButtonElement).style.color = "#1c1917"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#d6d3d1"; (e.currentTarget as HTMLButtonElement).style.color = "#57534e"; }}>
            <WalletIcon/> Continue with Wallet
          </button>

          {/* divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#e7e5e4" }}/>
            <span style={{ fontFamily: mono, fontSize: 9, color: "#a8a29e", letterSpacing: "0.1em" }}>OR</span>
            <div style={{ flex: 1, height: 1, background: "#e7e5e4" }}/>
          </div>

          {/* form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* email */}
            <Field id="si-email" label="Email">
              <input id="si-email" type="email" value={email} placeholder="you@example.com"
                autoComplete="email" onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}/>
            </Field>

            {/* password */}
            <Field id="si-password" label="Password">
              <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <input id="si-password" type={showPwd ? "text" : "password"} value={password}
                  placeholder="••••••••" autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}/>
                <button type="button" onClick={() => setShowPwd((v) => !v)}
                  style={{ background: "none", border: "none", color: "#57534e", cursor: "pointer",
                    fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                    padding: "0 4px" }}>
                  {showPwd ? "HIDE" : "SHOW"}
                </button>
              </div>
            </Field>

            <div style={{ textAlign: "right", marginTop: -8 }}>
              <Link href="#" style={{ fontFamily: mono, fontSize: 10, color: "#ff3e00",
                textDecoration: "none", letterSpacing: "0.04em" }}>
                Forgot password?
              </Link>
            </div>

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
              {loading ? <><Spinner/> AUTHENTICATING...</> : "SIGN IN →"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontFamily: mono, fontSize: 11, color: "#57534e" }}>
          No account?{" "}
          <Link href="/sign-up" style={{ color: "#ff3e00", textDecoration: "none", fontWeight: 600 }}>
            Sign up free
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
        borderRadius: 7, padding: "10px 14px", transition: "border-color 0.15s ease" }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#ff3e00")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#d6d3d1")}>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "transparent", border: "none", outline: "none", width: "100%",
  fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#1c1917",
};
